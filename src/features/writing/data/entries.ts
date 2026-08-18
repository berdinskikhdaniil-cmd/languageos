import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { writingEntries, writingIssues, writingReviews } from "@/db/schema";
import type { WritingEntryRow, WritingIssueRow, WritingReviewRow } from "@/db/schema";
import type { WritingType } from "../domain/writing-entry";

/**
 * Every read and write of a writing entry.
 *
 * Nothing here takes an entry id on its own: an id always travels with the
 * owner's user id, so a URL carrying somebody else's uuid resolves to nothing
 * rather than to their writing. The language is not accepted from a caller
 * either — it comes from the authenticated user's own primary language, and the
 * composite foreign key on (user_id, user_language_id) means the database would
 * refuse it even if a code path tried.
 */

export type WritingEntryDetail = {
  entry: WritingEntryRow;
  review: WritingReviewRow | null;
  issues: WritingIssueRow[];
};

export async function createWritingEntry({
  userId,
  userLanguageId,
  type,
  originalText,
  wordCount,
}: {
  userId: string;
  userLanguageId: string;
  type: WritingType;
  originalText: string;
  wordCount: number;
}): Promise<WritingEntryRow> {
  const [created] = await db
    .insert(writingEntries)
    .values({ userId, userLanguageId, type, originalText, wordCount })
    .returning();

  return created;
}

/** The entry and everything hanging off it, or null when it is not this user's. */
export async function getWritingEntry(
  entryId: string,
  userId: string,
): Promise<WritingEntryDetail | null> {
  const [entry] = await db
    .select()
    .from(writingEntries)
    .where(and(eq(writingEntries.id, entryId), eq(writingEntries.userId, userId)))
    .limit(1);

  if (!entry) return null;

  const [review] = await db
    .select()
    .from(writingReviews)
    .where(eq(writingReviews.entryId, entry.id))
    .limit(1);

  const issues = review
    ? await db
        .select()
        .from(writingIssues)
        .where(eq(writingIssues.reviewId, review.id))
        .orderBy(writingIssues.position)
    : [];

  return { entry, review: review ?? null, issues };
}

/**
 * Stores the learner's own second attempt.
 *
 * `originalText` is never in the update: the first draft is the record the
 * review was written against, and a rewrite is a new column beside it, not a
 * replacement for it.
 */
export async function saveRewrite({
  entryId,
  userId,
  revisedText,
  now = new Date(),
}: {
  entryId: string;
  userId: string;
  revisedText: string;
  now?: Date;
}): Promise<WritingEntryRow | null> {
  const [updated] = await db
    .update(writingEntries)
    .set({ revisedText, updatedAt: now })
    .where(and(eq(writingEntries.id, entryId), eq(writingEntries.userId, userId)))
    .returning();

  return updated ?? null;
}

/**
 * How many reviews this user has had started since a given instant.
 *
 * The whole of the abuse boundary that needs state, and it needs no
 * infrastructure: reviews are rows, and counting rows is a query. A retry
 * reuses its entry's existing review row, so retrying a provider outage does
 * not eat into the allowance — the number counts pieces of writing reviewed,
 * not requests attempted.
 */
export async function countReviewsSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(writingReviews)
    .innerJoin(writingEntries, eq(writingEntries.id, writingReviews.entryId))
    .where(and(eq(writingEntries.userId, userId), gte(writingReviews.createdAt, since)));

  return row?.count ?? 0;
}
