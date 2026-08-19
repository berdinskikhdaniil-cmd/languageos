import type { OnboardedUser } from "@/lib/auth/current-user";
import { readAiConfig } from "@/lib/ai/config";
import { requestStructuredCompletion, type AiFailureReason } from "@/lib/ai/openrouter";
import { startOfLocalDay } from "@/lib/time";
import type { WritingEntryRow } from "@/db/schema";
import { resolveFragments } from "../domain/fragments";
import { buildReviewPrompt } from "../domain/prompt";
import { REVIEW_JSON_SCHEMA, isUsableReviewContent, parseReview } from "../domain/review";
import { dailyReviewLimit } from "../domain/writing-entry";
import { countReviewsSince } from "./entries";
import { claimReview, completeReview, failReview, readReview } from "./reviews";

/**
 * One review, from claim to stored result.
 *
 * The order here is the product rule from the outside in: the learner's text is
 * already saved before anything in this file runs, so every failure below costs
 * a review and never a draft.
 *
 * Nothing in it is exported as a server action — a caller must come through
 * features/writing/actions.ts, which resolves the user first.
 */

export type ReviewOutcome =
  | { ok: true; alreadyComplete: boolean }
  | { ok: false; reason: ReviewFailureReason };

export type ReviewFailureReason =
  | AiFailureReason
  /** Another request is reviewing this entry right now. */
  | "processing"
  /** This account has reviewed as much as it may today. */
  | "limit_reached";

export async function runReview({
  entry,
  user,
  now = new Date(),
}: {
  entry: WritingEntryRow;
  user: OnboardedUser;
  now?: Date;
}): Promise<ReviewOutcome> {
  /**
   * Configuration is checked before anything is written. A deployment with no
   * key must not leave a trail of failed review rows, and must not spend the
   * learner's daily allowance on a mistake an operator made.
   */
  const configured = readAiConfig();
  if (!configured.ok) {
    console.error("[writing] review unavailable; missing:", configured.missing.join(", "));
    return { ok: false, reason: "not_configured" };
  }

  const existing = await readReview(entry.id);
  // A completed review whose content is unusable is not a completed review; it
  // falls through to be claimed again. See claimReview.
  if (existing?.status === "completed" && isUsableReviewContent(existing.summary, existing.improvedText)) {
    return { ok: true, alreadyComplete: true };
  }

  // Only a genuinely new review counts against the day. Retrying an outage is
  // free, or a bad afternoon at the provider would lock the learner out.
  if (!existing) {
    const since = startOfLocalDay(now, user.timeZone);
    if ((await countReviewsSince(user.id, since)) >= dailyReviewLimit()) {
      return { ok: false, reason: "limit_reached" };
    }
  }

  const claim = await claimReview({ entryId: entry.id, model: configured.config.model, now });
  if (claim.status === "completed") return { ok: true, alreadyComplete: true };
  if (claim.status === "processing") return { ok: false, reason: "processing" };

  const reviewId = claim.review.id;

  /**
   * Three languages, resolved here and nowhere else: the one being learned, the
   * one the learner reads, and the canonical English of the skill labels. The
   * interface language is read at the moment of the review, so a review created
   * after switching to Russian comes back in Russian — and one created before it
   * stays exactly as it was written. Nothing regenerates an existing review.
   */
  const prompt = buildReviewPrompt({
    languageName: user.primaryLanguage.name,
    languageCode: user.primaryLanguage.code,
    type: entry.type,
    text: entry.originalText,
    feedbackLanguage: user.uiLanguage,
  });

  const completion = await requestStructuredCompletion({
    system: prompt.system,
    user: prompt.user,
    schemaName: "writing_review",
    schema: REVIEW_JSON_SCHEMA,
  });

  if (!completion.ok) {
    await failReview({ reviewId, reason: completion.reason, now: new Date() });
    return { ok: false, reason: completion.reason };
  }

  const parsed = parseReview(completion.data, entry.originalText);
  if (!parsed.ok) {
    /**
     * Enough to diagnose a provider problem, and nothing more: which field
     * broke the contract, which rows it concerns, and which model answered.
     * Never the submission, never the response body, never a credential.
     */
    console.error(
      `[writing-review] invalid provider response: ${parsed.problem}` +
        ` (entry ${entry.id}, review ${reviewId}, model ${completion.model})`,
    );
    await failReview({ reviewId, reason: "invalid_response", now: new Date() });
    return { ok: false, reason: "invalid_response" };
  }

  /**
   * Offsets are worked out here, from the text we stored — never taken from the
   * model. An issue whose fragment cannot be placed keeps everything except its
   * highlight.
   */
  const spans = resolveFragments(
    entry.originalText,
    parsed.value.issues.map((issue) => issue.originalFragment),
  );

  await completeReview({
    reviewId,
    model: completion.model,
    review: parsed.value,
    issues: parsed.value.issues.map((issue, index) => ({ ...issue, span: spans[index] })),
    usage: completion.usage,
    now: new Date(),
  });

  return { ok: true, alreadyComplete: false };
}
