import { readAiConfig } from "@/lib/ai/config";
import { requestStructuredCompletion, type AiFailureReason } from "@/lib/ai/openrouter";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { normalizeAnswer } from "../domain/answers";
import { GRADING_JSON_SCHEMA, parseGrading } from "../domain/grading";
import { buildGradingPrompt } from "../domain/prompt";
import { fromStoredTarget } from "../domain/target";
import { claimGrading, completeGrading, failGrading } from "./sessions";

/**
 * One check of one set of answers, from claim to stored verdicts.
 *
 * A single provider call for all five, which is the cost invariant of the whole
 * feature: a completed practice session is two calls, not six. It is also the
 * better grading — seeing the set together is how the model can tell a slip from
 * a skill somebody has not got at all.
 *
 * Everything before this line has already been paid for. The exercises exist,
 * the answers are already rows, and that is what makes a failed check cheap: it
 * costs one completion to retry and never a single exercise, let alone five
 * minutes of somebody's work.
 *
 * Nothing here is exported as a server action — a caller must come through
 * features/mistake-practice/actions.ts, which resolves the user first.
 */

export type GradingOutcome =
  | { ok: true; alreadyComplete: boolean }
  | { ok: false; reason: GradingFailureReason };

export type GradingFailureReason =
  | AiFailureReason
  /** Another request is checking this set right now. */
  | "processing"
  /** Not this user's session, or not in a state that can be checked. */
  | "unavailable"
  /** At least one exercise has no answer. Nothing is sent. */
  | "incomplete";

export async function runGrading({
  user,
  sessionId,
}: {
  user: OnboardedUser;
  sessionId: string;
}): Promise<GradingOutcome> {
  const configured = readAiConfig();
  if (!configured.ok) {
    console.error("[mistake-practice] grading unavailable; missing:", configured.missing.join(", "));
    return { ok: false, reason: "not_configured" };
  }

  const claim = await claimGrading({
    sessionId,
    userId: user.id,
    model: configured.config.model,
  });

  if (claim.status === "completed") return { ok: true, alreadyComplete: true };
  if (claim.status === "processing") return { ok: false, reason: "processing" };
  if (claim.status === "unavailable") return { ok: false, reason: "unavailable" };

  const { session, items } = claim.detail;

  /**
   * The set is checked here, from the rows, and not from what a client said it
   * had saved. A missing answer is not something to send the grader — it would
   * have to invent a verdict for an answer that does not exist — so the claim is
   * released and the screen asks for the rest.
   */
  const answers = items.flatMap((item) => {
    const userAnswer = normalizeAnswer(item.userAnswer);
    return userAnswer === null
      ? []
      : [
          {
            position: item.position,
            type: item.type,
            prompt: item.prompt,
            canonicalAnswer: item.canonicalAnswer,
            gradingNotes: item.gradingNotes,
            userAnswer,
          },
        ];
  });

  if (answers.length !== items.length || items.length === 0) {
    await failGrading({ sessionId, reason: "incomplete" });
    return { ok: false, reason: "incomplete" };
  }

  const selection = fromStoredTarget(session.targetType, session.targetKey);
  const targetName =
    selection?.kind === "category" ? selection.category : (selection?.key ?? session.targetKey);

  const prompt = buildGradingPrompt({
    languageName: user.primaryLanguage.name,
    languageCode: user.primaryLanguage.code,
    targetName,
    targetKind: selection?.kind ?? "skill",
    answers,
    feedbackLanguage: user.uiLanguage,
  });

  const completion = await requestStructuredCompletion({
    system: prompt.system,
    user: prompt.user,
    schemaName: "mistake_practice_grading",
    schema: GRADING_JSON_SCHEMA,
  });

  if (!completion.ok) {
    await failGrading({ sessionId, reason: completion.reason });
    return { ok: false, reason: completion.reason };
  }

  const parsed = parseGrading(
    completion.data,
    answers.map((answer) => answer.position),
  );

  if (!parsed.ok) {
    /**
     * Enough to diagnose a provider problem and nothing more. Never an answer,
     * never an explanation, never the response body — the whole failure mode
     * this guards against is a verdict landing beside the wrong answer, and the
     * log must not become the place where those two are finally paired up.
     */
    console.error(
      `[mistake-practice] invalid grading response: ${parsed.problem}` +
        ` (session ${sessionId}, model ${completion.model})`,
    );
    await failGrading({ sessionId, reason: "invalid_response" });
    return { ok: false, reason: "invalid_response" };
  }

  await completeGrading({
    sessionId,
    model: completion.model,
    results: parsed.value,
    usage: completion.usage,
  });

  return { ok: true, alreadyComplete: false };
}
