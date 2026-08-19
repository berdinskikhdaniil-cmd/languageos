import type { SpeakingAttemptRow } from "@/db/schema";
import { resolveFragments } from "@/features/writing/domain/fragments";
import { readAiConfig } from "@/lib/ai/config";
import { requestStructuredCompletion, type AiFailureReason } from "@/lib/ai/openrouter";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { buildSpeakingReviewPrompt } from "../domain/prompt";
import {
  SPEAKING_REVIEW_JSON_SCHEMA,
  isUsableSpeakingReview,
  parseSpeakingReview,
} from "../domain/review";
import {
  claimSpeakingReview,
  completeSpeakingReview,
  failSpeakingReview,
  readSpeakingReview,
} from "./reviews";
import { completeAttempt, linkTrackerSession } from "./attempts";

/**
 * One review of one spoken answer, from claim to stored result.
 *
 * This runs *after* transcription, always, and never triggers one: the
 * transcript is already a row by the time anything here executes. That
 * separation is what makes a failed review cheap to retry — the expensive,
 * unrepeatable part (the recording, which we did not keep) is already behind
 * us, so retrying costs one completion and nothing else.
 *
 * Nothing here is exported as a server action; a caller must come through
 * features/speaking/actions.ts, which resolves the user first.
 */

export type SpeakingReviewOutcome =
  | { ok: true; alreadyComplete: boolean }
  | { ok: false; reason: SpeakingReviewFailureReason };

export type SpeakingReviewFailureReason =
  | AiFailureReason
  /** Another request is reviewing this attempt right now. */
  | "processing"
  /** There is no transcript to review — transcription failed or never ran. */
  | "no_transcript";

export async function runSpeakingReview({
  attempt,
  user,
}: {
  attempt: SpeakingAttemptRow;
  user: OnboardedUser;
}): Promise<SpeakingReviewOutcome> {
  /**
   * Configuration first, before anything is written. A deployment with no key
   * must not leave a trail of failed review rows behind.
   */
  const configured = readAiConfig();
  if (!configured.ok) {
    console.error("[speaking] review unavailable; missing:", configured.missing.join(", "));
    return { ok: false, reason: "not_configured" };
  }

  const transcript = attempt.transcript?.trim();
  if (!transcript) return { ok: false, reason: "no_transcript" };

  const existing = await readSpeakingReview(attempt.id);
  if (
    existing?.status === "completed" &&
    isUsableSpeakingReview(existing.summary, existing.improvedAnswer)
  ) {
    // Already reviewed. Still make sure the time was counted — a crash between
    // writing the review and filing the session would otherwise lose it.
    await finish({ attempt, user });
    return { ok: true, alreadyComplete: true };
  }

  const claim = await claimSpeakingReview({ attemptId: attempt.id, model: configured.config.model });
  if (claim.status === "completed") {
    await finish({ attempt, user });
    return { ok: true, alreadyComplete: true };
  }
  if (claim.status === "processing") return { ok: false, reason: "processing" };

  const reviewId = claim.review.id;

  /**
   * Three languages meet here, resolved once: the one being learned, the one
   * the learner reads, and the canonical English of the skill labels. The
   * interface language is read at the moment of the review, so switching it
   * afterwards does not rewrite work already done.
   */
  const prompt = buildSpeakingReviewPrompt({
    languageName: user.primaryLanguage.name,
    languageCode: user.primaryLanguage.code,
    topicPrompt: attempt.topicPrompt,
    transcript,
    durationSeconds: attempt.durationSeconds,
    feedbackLanguage: user.uiLanguage,
  });

  const completion = await requestStructuredCompletion({
    system: prompt.system,
    user: prompt.user,
    schemaName: "speaking_review",
    schema: SPEAKING_REVIEW_JSON_SCHEMA,
  });

  if (!completion.ok) {
    await failSpeakingReview({ reviewId, reason: completion.reason });
    return { ok: false, reason: completion.reason };
  }

  const parsed = parseSpeakingReview(completion.data, transcript);
  if (!parsed.ok) {
    /**
     * Enough to diagnose a provider problem and nothing more: which field broke
     * the contract, which rows it concerns, and which model answered. Never the
     * transcript, never the response body, never a credential.
     */
    console.error(
      `[speaking-review] invalid provider response: ${parsed.problem}` +
        ` (attempt ${attempt.id}, review ${reviewId}, model ${completion.model})`,
    );
    await failSpeakingReview({ reviewId, reason: "invalid_response" });
    return { ok: false, reason: "invalid_response" };
  }

  /**
   * Offsets are worked out here, from the transcript we stored — never taken
   * from the model. An issue whose fragment cannot be placed keeps everything
   * except its highlight.
   */
  const spans = resolveFragments(
    transcript,
    parsed.value.issues.map((issue) => issue.originalFragment),
  );

  await completeSpeakingReview({
    reviewId,
    model: completion.model,
    review: parsed.value,
    issues: parsed.value.issues.map((issue, index) => ({ ...issue, span: spans[index] })),
    usage: completion.usage,
  });

  await finish({ attempt, user });
  return { ok: true, alreadyComplete: false };
}

/**
 * Marks the attempt done and files the time it took.
 *
 * Idempotent on both counts, and safe to call for an attempt that was already
 * finished: `linkTrackerSession` refuses to create a second session, and
 * setting a completed attempt to completed changes nothing.
 */
async function finish({
  attempt,
  user,
}: {
  attempt: SpeakingAttemptRow;
  user: OnboardedUser;
}): Promise<void> {
  await linkTrackerSession({
    attemptId: attempt.id,
    userId: user.id,
    userLanguageId: attempt.userLanguageId,
  });
  await completeAttempt({ attemptId: attempt.id });
}
