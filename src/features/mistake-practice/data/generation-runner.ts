import { readAiConfig } from "@/lib/ai/config";
import { requestStructuredCompletion, type AiFailureReason } from "@/lib/ai/openrouter";
import type { OnboardedUser } from "@/lib/auth/current-user";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import { EXERCISE_SET_JSON_SCHEMA, parseExerciseSet } from "../domain/exercise";
import { buildGenerationPrompt } from "../domain/prompt";
import { selectSourceExamples } from "../domain/source-examples";
import { fromStoredTarget } from "../domain/target";
import {
  claimGenerationWork,
  failGeneration,
  openGenerationSession,
  persistExercises,
} from "./sessions";
import { resolvePracticeTarget } from "./targets";
import { logPhaseTiming, stopwatch } from "./timings";

/**
 * Building a set of exercises, in two halves that used to be one.
 *
 * They were split because of how the one felt. Generation took about fifteen
 * seconds, all of it inside the server action behind the Practice button, and
 * the learner spent those fifteen seconds looking at a screen that had not
 * changed — long enough that the first person to try it concluded the app had
 * frozen and went to close it. The work was never the problem; being unable to
 * see it was.
 *
 * So `openPracticeSession` now does everything cheap — prove the weak point is
 * real, create the row — and returns an id in a few hundred milliseconds. The
 * learner lands on a screen that says what is happening, and *that* screen asks
 * for the exercises through `generatePendingExercises`. The waiting is the same
 * length; it is simply visible now, and interruptible, and recoverable.
 *
 * Two locks rather than one make that safe. `status = 'generating'` says a set
 * is owed for this target, so a double tap yields one session. The separate
 * `generation_claimed_at` says a provider call is in flight, so two screens on
 * that session yield one call. Neither is hopeful code; both are conditional
 * updates the database decides.
 *
 * Nothing here is exported as a server action — a caller must come through
 * features/mistake-practice/actions.ts, which resolves the user first.
 */

export type OpenSessionOutcome =
  | { ok: true; sessionId: string }
  | { ok: false; reason: OpenSessionFailure };

export type OpenSessionFailure =
  /** OPENROUTER_API_KEY or OPENROUTER_MODEL is not set. An operator problem. */
  | "not_configured"
  /** This weak point is not one the learner actually has. */
  | "no_examples";

/**
 * Proves the target, opens a session, and stops.
 *
 * No provider call, so this returns as fast as two indexed queries — which is
 * the whole reason the button can navigate immediately.
 *
 * The selection arrives from a form field and is re-derived from the database
 * before anything else happens; see ./targets. A weak point nobody has produces
 * no row and no session to open.
 */
export async function openPracticeSession({
  user,
  selection,
}: {
  user: OnboardedUser;
  selection: MistakeSelection;
}): Promise<OpenSessionOutcome> {
  /**
   * Configuration first, before a row is written. A deployment with no key must
   * not leave a trail of sessions nobody can ever fill.
   */
  const configured = readAiConfig();
  if (!configured.ok) {
    console.error(
      "[mistake-practice] generation unavailable; missing:",
      configured.missing.join(", "),
    );
    return { ok: false, reason: "not_configured" };
  }

  const target = await resolvePracticeTarget(user, selection);
  if (!target) return { ok: false, reason: "no_examples" };

  const opened = await openGenerationSession({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    target: target.selection,
    model: configured.config.model,
  });

  return { ok: true, sessionId: opened.session.id };
}

export type GenerationOutcome =
  /** The set exists now — either this call built it, or it already did. */
  | { ok: true; alreadyReady: boolean }
  | { ok: false; reason: GenerationFailureReason };

export type GenerationFailureReason =
  | AiFailureReason
  /** Another request is building this set right now. Wait for it. */
  | "processing"
  /** This weak point is not one the learner actually has. */
  | "no_examples"
  /** Not this user's session, or no such session. */
  | "unavailable";

/**
 * Fills a session that is waiting for its exercises.
 *
 * Idempotent and safe to call from anywhere: a session that already has a set
 * is reported ready without spending anything, a session somebody else is
 * mid-call on is reported as such, and only a genuinely unclaimed one is taken
 * on. That is what lets the generating screen simply *ask* on every mount —
 * including after the Mini App was closed and reopened — without anybody having
 * to reason about whether a call is already out.
 */
export async function generatePendingExercises({
  user,
  sessionId,
}: {
  user: OnboardedUser;
  sessionId: string;
}): Promise<GenerationOutcome> {
  const total = stopwatch();

  const configured = readAiConfig();
  if (!configured.ok) {
    console.error(
      "[mistake-practice] generation unavailable; missing:",
      configured.missing.join(", "),
    );
    return { ok: false, reason: "not_configured" };
  }

  const claim = await claimGenerationWork({
    sessionId,
    userId: user.id,
    model: configured.config.model,
  });

  if (claim.status === "unavailable") return { ok: false, reason: "unavailable" };
  if (claim.status === "in_flight") return { ok: false, reason: "processing" };
  if (claim.status === "settled") {
    /**
     * A settled session is not owed a set. `failed` is reported as a failure so
     * the screen offers the button; anything else already has its exercises and
     * costs nothing to report ready. The stored reason is a code we wrote, but
     * it comes back out of a text column, so it is not trusted to be one of ours.
     */
    if (claim.session.status !== "failed") return { ok: true, alreadyReady: true };
    return { ok: false, reason: asFailureReason(claim.session.failureReason) };
  }

  const selection = fromStoredTarget(claim.session.targetType, claim.session.targetKey);
  const target = selection ? await resolvePracticeTarget(user, selection) : null;
  if (!target) {
    await failGeneration({ sessionId, reason: "no_examples" });
    return { ok: false, reason: "no_examples" };
  }

  /**
   * The minimum personal context: a few of the learner's own mistakes, distinct,
   * concrete and recent. They ground the generation and they are never logged —
   * see ../domain/source-examples.
   */
  const examples = selectSourceExamples(target.occurrences);
  if (examples.length === 0) {
    await failGeneration({ sessionId, reason: "no_examples" });
    return { ok: false, reason: "no_examples" };
  }

  /**
   * Three languages, resolved here and nowhere else: the one being learned, the
   * one the learner reads, and the canonical English of the skill labels. The
   * interface language is read at the moment of generation, so a set made after
   * switching to Russian is instructed in Russian and one made before it stays
   * exactly as it was written.
   */
  const prompt = buildGenerationPrompt({
    languageName: user.primaryLanguage.name,
    languageCode: user.primaryLanguage.code,
    targetName: target.name,
    targetKind: target.selection.kind,
    examples,
    feedbackLanguage: user.uiLanguage,
  });

  const completion = await requestStructuredCompletion({
    system: prompt.system,
    user: prompt.user,
    schemaName: "mistake_practice_exercises",
    schema: EXERCISE_SET_JSON_SCHEMA,
  });

  if (!completion.ok) {
    await failGeneration({ sessionId, reason: completion.reason });
    logPhaseTiming("generation", {
      sessionId,
      model: configured.config.model,
      providerMs: completion.durationMs,
      parseMs: 0,
      totalMs: total(),
      usage: { inputTokens: null, outputTokens: null },
      examples: examples.length,
      failure: completion.reason,
    });
    return { ok: false, reason: completion.reason };
  }

  const parseTimer = stopwatch();
  const parsed = parseExerciseSet(completion.data, examples);
  const parseMs = parseTimer();

  if (!parsed.ok) {
    /**
     * Enough to diagnose a provider problem, and nothing more: which field broke
     * the contract, which row it concerns, and which model answered. Never an
     * exercise, never a learner's own sentence, never the response body.
     */
    console.error(
      `[mistake-practice] invalid generation response: ${parsed.problem}` +
        ` (session ${sessionId}, model ${completion.model})`,
    );
    await failGeneration({ sessionId, reason: "invalid_response" });
    logPhaseTiming("generation", {
      sessionId,
      model: completion.model,
      providerMs: completion.durationMs,
      parseMs,
      totalMs: total(),
      usage: completion.usage,
      examples: examples.length,
      failure: "invalid_response",
    });
    return { ok: false, reason: "invalid_response" };
  }

  await persistExercises({
    sessionId,
    model: completion.model,
    exercises: parsed.value,
    usage: completion.usage,
  });

  logPhaseTiming("generation", {
    sessionId,
    model: completion.model,
    providerMs: completion.durationMs,
    parseMs,
    totalMs: total(),
    usage: completion.usage,
    examples: examples.length,
  });

  return { ok: true, alreadyReady: false };
}

/**
 * A reason read back out of the database, narrowed to something a caller can
 * branch on. Anything unrecognised becomes the calm default rather than being
 * passed along as a string nobody has a message for.
 */
function asFailureReason(stored: string | null): GenerationFailureReason {
  const known: readonly GenerationFailureReason[] = [
    "not_configured",
    "timeout",
    "network",
    "rate_limited",
    "auth",
    "credits",
    "provider_unavailable",
    "unsupported_structured_output",
    "invalid_response",
    "bad_request",
    "no_examples",
  ];

  return known.find((reason) => reason === stored) ?? "invalid_response";
}
