import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { speakingIssues, speakingReviews } from "@/db/schema";
import type { SpeakingReviewRow } from "@/db/schema";
import type { FragmentSpan } from "@/features/writing/domain/fragments";
import type { ReviewIssue } from "@/features/writing/domain/review";
import { isUsableSpeakingReview, type SpeakingReview } from "../domain/review";

/**
 * The review's lifecycle, and the lock that keeps it from happening twice.
 *
 * Deliberately the same shape as Writing's, because the problem is the same
 * one: a row is created *before* the provider is called, and the unique
 * constraint on `attempt_id` is what makes that row a claim. Two taps race to
 * insert; one wins and calls the provider, the other is told the work is under
 * way. No queue, no scheduler, no second service.
 *
 * It is a second copy rather than a shared abstraction on purpose. The two are
 * seventy lines each, they differ in their tables and in what "usable content"
 * means, and a generic review-lifecycle module parameterised over both would be
 * harder to read than either.
 */

/** A pending row older than this is assumed abandoned: the function that owned
 *  it died mid-call, and the learner should be able to try again. */
const STALE_PENDING_MS = 3 * 60 * 1000;

export type SpeakingReviewClaim =
  | { status: "claimed"; review: SpeakingReviewRow }
  | { status: "completed"; review: SpeakingReviewRow }
  | { status: "processing"; review: SpeakingReviewRow };

export async function claimSpeakingReview({
  attemptId,
  model,
  now = new Date(),
}: {
  attemptId: string;
  model: string;
  now?: Date;
}): Promise<SpeakingReviewClaim> {
  const [inserted] = await db
    .insert(speakingReviews)
    .values({ attemptId, model, status: "pending", createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: speakingReviews.attemptId })
    .returning();

  if (inserted) return { status: "claimed", review: inserted };

  const existing = await readSpeakingReview(attemptId);
  if (!existing) {
    // The row vanished between the insert and the read — the attempt was deleted.
    throw new Error("The review could not be claimed.");
  }

  const usable = isUsableSpeakingReview(existing.summary, existing.improvedAnswer);
  if (existing.status === "completed" && usable) {
    return { status: "completed", review: existing };
  }

  const stale = existing.updatedAt.getTime() < now.getTime() - STALE_PENDING_MS;
  const retakeable =
    existing.status === "failed" ||
    (existing.status === "pending" && stale) ||
    (existing.status === "completed" && !usable);

  if (!retakeable) return { status: "processing", review: existing };

  /**
   * The status we read is the lock. Two requests that both decided to retake
   * issue the same update; the first moves the row to `pending`, the second no
   * longer matches and is told the work is under way.
   */
  const [retaken] = await db
    .update(speakingReviews)
    .set({ status: "pending", model, failureReason: null, updatedAt: now })
    .where(
      existing.status === "pending"
        ? and(
            eq(speakingReviews.id, existing.id),
            eq(speakingReviews.status, "pending"),
            lt(speakingReviews.updatedAt, new Date(now.getTime() - STALE_PENDING_MS)),
          )
        : and(eq(speakingReviews.id, existing.id), eq(speakingReviews.status, existing.status)),
    )
    .returning();

  if (retaken) return { status: "claimed", review: retaken };

  return { status: "processing", review: existing };
}

export async function readSpeakingReview(attemptId: string): Promise<SpeakingReviewRow | null> {
  const [review] = await db
    .select()
    .from(speakingReviews)
    .where(eq(speakingReviews.attemptId, attemptId))
    .limit(1);

  return review ?? null;
}

export type ResolvedSpeakingIssue = ReviewIssue & { span: FragmentSpan | null };

/**
 * Writes the finished review and its issues together.
 *
 * One transaction, so an attempt is never left showing a summary with no issues
 * beneath it. Existing issues are cleared first: only the claim holder gets
 * here, but a retry that reused a row must not stack two sets of findings.
 */
export async function completeSpeakingReview({
  reviewId,
  model,
  review,
  issues,
  usage,
  now = new Date(),
}: {
  reviewId: string;
  model: string;
  review: SpeakingReview;
  issues: ResolvedSpeakingIssue[];
  usage: { inputTokens: number | null; outputTokens: number | null };
  now?: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(speakingIssues).where(eq(speakingIssues.reviewId, reviewId));

    if (issues.length > 0) {
      await tx.insert(speakingIssues).values(
        issues.map((issue, position) => ({
          reviewId,
          position,
          category: issue.category,
          label: issue.label,
          severity: issue.severity,
          originalFragment: issue.originalFragment,
          suggestion: issue.suggestion,
          explanation: issue.explanation,
          startOffset: issue.span?.start ?? null,
          endOffset: issue.span?.end ?? null,
        })),
      );
    }

    await tx
      .update(speakingReviews)
      .set({
        status: "completed",
        model,
        summary: review.summary,
        improvedAnswer: review.improvedAnswer,
        contentVerdict: review.content.verdict,
        contentComment: review.content.comment,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(speakingReviews.id, reviewId));
  });
}

export async function failSpeakingReview({
  reviewId,
  reason,
  now = new Date(),
}: {
  reviewId: string;
  reason: string;
  now?: Date;
}): Promise<void> {
  await db
    .update(speakingReviews)
    .set({ status: "failed", failureReason: reason, updatedAt: now })
    .where(eq(speakingReviews.id, reviewId));
}

/** Only used by tests, to age a pending claim without waiting three minutes. */
export async function ageSpeakingReviewForTesting(
  reviewId: string,
  updatedAt: Date,
): Promise<void> {
  await db.update(speakingReviews).set({ updatedAt }).where(eq(speakingReviews.id, reviewId));
}
