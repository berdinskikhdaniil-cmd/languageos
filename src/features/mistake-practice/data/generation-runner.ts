import { readAiConfig } from "@/lib/ai/config";
import { requestStructuredCompletion, type AiFailureReason } from "@/lib/ai/openrouter";
import type { OnboardedUser } from "@/lib/auth/current-user";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import { EXERCISE_SET_JSON_SCHEMA, parseExerciseSet } from "../domain/exercise";
import { buildGenerationPrompt } from "../domain/prompt";
import { selectSourceExamples } from "../domain/source-examples";
import { fromStoredTarget } from "../domain/target";
import {
  failGeneration,
  persistExercises,
  reclaimGeneration,
  startGeneration,
  type GenerationClaim,
} from "./sessions";
import { resolvePracticeTarget, type ResolvedTarget } from "./targets";

/**
 * One set of exercises, from claim to stored result.
 *
 * The order here is the product rule from the outside in. The target is proved
 * against the learner's real mistakes before a row exists; the row is created
 * before the provider is called, which is what makes it a claim as well as a
 * record; and a call that does not come back leaves a `failed` session with a
 * retry on it rather than a `ready` one holding nothing. There is no state in
 * which the screen says "here are your exercises" and there are none.
 *
 * Nothing here is exported as a server action — a caller must come through
 * features/mistake-practice/actions.ts, which resolves the user first.
 */

export type GenerationOutcome =
  | { ok: true; sessionId: string }
  | { ok: false; sessionId: string | null; reason: GenerationFailureReason };

export type GenerationFailureReason =
  | AiFailureReason
  /** Another request is generating for this target right now. */
  | "processing"
  /** This weak point is not one the learner actually has. */
  | "no_examples";

/**
 * Starts a session for a target the learner has, and fills it.
 *
 * The selection arrives from a form field and is re-derived from the database
 * before anything else happens — see ./targets. A target nobody has produces no
 * row, no provider call and no session to open.
 */
export async function runGeneration({
  user,
  selection,
}: {
  user: OnboardedUser;
  selection: MistakeSelection;
}): Promise<GenerationOutcome> {
  /**
   * Configuration first, before a row is written. A deployment with no key must
   * not leave a trail of failed sessions behind an operator's typo.
   */
  const configured = readAiConfig();
  if (!configured.ok) {
    console.error("[mistake-practice] generation unavailable; missing:", configured.missing.join(", "));
    return { ok: false, sessionId: null, reason: "not_configured" };
  }

  const target = await resolvePracticeTarget(user, selection);
  if (!target) return { ok: false, sessionId: null, reason: "no_examples" };

  const claim = await startGeneration({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    target: target.selection,
    model: configured.config.model,
  });

  return generateInto({ claim, target, user });
}

/**
 * Asks for a failed session's exercises again, in place.
 *
 * The same row and the same target, re-proved against the database on the way
 * through: a retry is not a shortcut past the check that a weak point is real.
 * Returns null when the session is not this user's.
 */
export async function retryGeneration({
  user,
  sessionId,
}: {
  user: OnboardedUser;
  sessionId: string;
}): Promise<GenerationOutcome | null> {
  const configured = readAiConfig();
  if (!configured.ok) {
    console.error("[mistake-practice] generation unavailable; missing:", configured.missing.join(", "));
    return { ok: false, sessionId, reason: "not_configured" };
  }

  const claim = await reclaimGeneration({
    sessionId,
    userId: user.id,
    model: configured.config.model,
  });
  if (!claim) return null;

  if (claim.status === "processing") {
    return { ok: false, sessionId, reason: "processing" };
  }

  const selection = fromStoredTarget(claim.session.targetType, claim.session.targetKey);
  if (!selection) {
    await failGeneration({ sessionId, reason: "no_examples" });
    return { ok: false, sessionId, reason: "no_examples" };
  }

  const target = await resolvePracticeTarget(user, selection);
  if (!target) {
    await failGeneration({ sessionId, reason: "no_examples" });
    return { ok: false, sessionId, reason: "no_examples" };
  }

  return generateInto({ claim, target, user });
}

async function generateInto({
  claim,
  target,
  user,
}: {
  claim: GenerationClaim;
  target: ResolvedTarget;
  user: OnboardedUser;
}): Promise<GenerationOutcome> {
  const sessionId = claim.session.id;

  /**
   * Somebody else is already paying for this. Their session is the one to open,
   * which is why the id comes back with the refusal rather than instead of it.
   */
  if (claim.status === "processing") {
    return { ok: false, sessionId, reason: "processing" };
  }

  /**
   * The minimum personal context: at most six of the learner's own mistakes,
   * distinct, concrete and recent. They ground the generation and they are
   * never logged — see ../domain/source-examples.
   */
  const examples = selectSourceExamples(target.occurrences);
  if (examples.length === 0) {
    await failGeneration({ sessionId, reason: "no_examples" });
    return { ok: false, sessionId, reason: "no_examples" };
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
    return { ok: false, sessionId, reason: completion.reason };
  }

  const parsed = parseExerciseSet(completion.data, examples);
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
    return { ok: false, sessionId, reason: "invalid_response" };
  }

  await persistExercises({
    sessionId,
    model: completion.model,
    exercises: parsed.value,
    usage: completion.usage,
  });

  return { ok: true, sessionId };
}
