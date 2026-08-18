import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { writingIssues, writingReviews } from "@/db/schema";
import type { WritingReviewRow } from "@/db/schema";
import type { FragmentSpan } from "../domain/fragments";
import { isUsableReviewContent, type ReviewIssue, type WritingReview } from "../domain/review";

/**
 * The review's lifecycle, and the lock that keeps it from happening twice.
 *
 * A review row is created *before* the provider is called, with status
 * `pending`, and the unique constraint on `entry_id` is what makes that row a
 * claim. Two taps race to insert; one wins and calls the provider, the other
 * finds the existing row and waits. No queue, no scheduler, no second service —
 * the constraint the schema already needed does the whole job.
 */

/** A pending row older than this is assumed abandoned: the function that owned
 *  it died mid-call, and the learner should be able to try again. */
const STALE_PENDING_MS = 3 * 60 * 1000;

export type ReviewClaim =
  /** This caller owns the attempt and must finish or fail it. */
  | { status: "claimed"; review: WritingReviewRow }
  /** Somebody already reviewed this entry; nothing more to spend. */
  | { status: "completed"; review: WritingReviewRow }
  /** Another request is mid-call right now. */
  | { status: "processing"; review: WritingReviewRow };

/**
 * Takes ownership of reviewing an entry, or explains who has it.
 *
 * Three outcomes and no fourth: a failed attempt can be retaken, an abandoned
 * one can be retaken once it is stale, and a completed one is never redone.
 */
export async function claimReview({
  entryId,
  model,
  now = new Date(),
}: {
  entryId: string;
  model: string;
  now?: Date;
}): Promise<ReviewClaim> {
  const [inserted] = await db
    .insert(writingReviews)
    .values({ entryId, model, status: "pending", createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: writingReviews.entryId })
    .returning();

  if (inserted) return { status: "claimed", review: inserted };

  const existing = await readReview(entryId);
  if (!existing) {
    // The row vanished between the insert and the read — the entry was deleted.
    throw new Error("The review could not be claimed.");
  }

  /**
   * A finished review is only finished if there is something in it.
   *
   * Rows written before the response contract was tightened can be `completed`
   * and still hold nothing worth reading — the production review that exposed
   * this held a single colon. Rather than migrating over them, which would
   * quietly rewrite somebody's history, the app recognises them for what they
   * are and lets their author ask again.
   */
  const usable = isUsableReviewContent(existing.summary, existing.improvedText);
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
   * The status we read is the lock.
   *
   * Two requests that both decided to retake issue the same update; the first
   * moves the row to `pending`, the second no longer matches and is told the
   * work is under way. Deliberately not a timestamp comparison: Postgres keeps
   * microseconds and a JavaScript Date does not, so a row whose `updated_at`
   * came from a column default would never match itself again.
   *
   * The residual race is a review that completes properly between our read and
   * our update, which we would then redo. It costs one extra call and cannot
   * corrupt anything, and it needs a window of microseconds to happen at all.
   */
  const [retaken] = await db
    .update(writingReviews)
    .set({ status: "pending", model, failureReason: null, updatedAt: now })
    .where(
      existing.status === "pending"
        ? and(
            eq(writingReviews.id, existing.id),
            eq(writingReviews.status, "pending"),
            lt(writingReviews.updatedAt, new Date(now.getTime() - STALE_PENDING_MS)),
          )
        : and(eq(writingReviews.id, existing.id), eq(writingReviews.status, existing.status)),
    )
    .returning();

  if (retaken) return { status: "claimed", review: retaken };

  return { status: "processing", review: existing };
}

export async function readReview(entryId: string): Promise<WritingReviewRow | null> {
  const [review] = await db
    .select()
    .from(writingReviews)
    .where(eq(writingReviews.entryId, entryId))
    .limit(1);

  return review ?? null;
}

export type ResolvedIssue = ReviewIssue & { span: FragmentSpan | null };

/**
 * Writes the finished review and its issues together.
 *
 * One transaction, so an entry is never left showing a summary with no issues
 * beneath it because the second insert failed. Existing issues are cleared
 * first: only the claim holder gets here, but a retry that reused a row must
 * not stack two sets of findings on top of each other.
 */
export async function completeReview({
  reviewId,
  model,
  review,
  issues,
  usage,
  now = new Date(),
}: {
  reviewId: string;
  model: string;
  review: WritingReview;
  issues: ResolvedIssue[];
  usage: { inputTokens: number | null; outputTokens: number | null };
  now?: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(writingIssues).where(eq(writingIssues.reviewId, reviewId));

    if (issues.length > 0) {
      await tx.insert(writingIssues).values(
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
      .update(writingReviews)
      .set({
        status: "completed",
        model,
        summary: review.summary,
        improvedText: review.improvedText,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(writingReviews.id, reviewId));
  });
}

/**
 * Records that an attempt did not work.
 *
 * `reason` is an internal code — "timeout", "rate_limited" — kept for whoever
 * reads the logs. The learner is told one calm sentence and offered the button
 * again; they never see this string.
 */
export async function failReview({
  reviewId,
  reason,
  now = new Date(),
}: {
  reviewId: string;
  reason: string;
  now?: Date;
}): Promise<void> {
  await db
    .update(writingReviews)
    .set({ status: "failed", failureReason: reason, updatedAt: now })
    .where(eq(writingReviews.id, reviewId));
}

/** Only used by tests, to age a pending claim without waiting three minutes. */
export async function ageReviewForTesting(reviewId: string, updatedAt: Date): Promise<void> {
  await db.update(writingReviews).set({ updatedAt }).where(eq(writingReviews.id, reviewId));
}
