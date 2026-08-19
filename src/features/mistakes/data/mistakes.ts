import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  speakingAttempts,
  speakingIssues,
  speakingReviews,
  writingEntries,
  writingIssues,
  writingReviews,
} from "@/db/schema";
import { isUsableSpeakingReview } from "@/features/speaking/domain/review";
import { isUsableReviewContent } from "@/features/writing/domain/review";
import type { OnboardedUser } from "@/lib/auth/current-user";
import { occurrencesFor, type MistakeSelection } from "../domain/aggregate";
import type { MistakeOccurrence, MistakeSource } from "../domain/occurrence";
import { sortOccurrences } from "../domain/occurrence";
import { buildMistakeOverview, type MistakeOverview } from "../domain/overview";
import {
  earliestInstantToLoad,
  filterToWindow,
  periodWindow,
  previousPeriodWindow,
  type MistakePeriod,
} from "../domain/period";
import type { MistakeWorkload, ReviewedSpeaking, ReviewedWriting } from "../domain/workload";

/**
 * The mistake engine's one read.
 *
 * It is a read model over `writing_issues` and `speaking_issues` and nothing
 * else — no third table, no copy of an issue kept for counting. Those two
 * already share the `writing_issue_category` and `writing_issue_severity`
 * enums (see db/schema.ts), so merging them is a union of rows rather than a
 * translation between two taxonomies.
 *
 * Scoping is doubled, exactly as Writing and Speaking scope their own reads:
 * to the authenticated user, and to the language they are currently studying.
 * Neither id is ever accepted from a client — both come from the server's own
 * user context — and the composite foreign keys on (user_id, user_language_id)
 * mean the database would refuse a mismatched pair even if a code path tried.
 *
 * Only *usable completed* reviews contribute. A pending or failed review is
 * missing data, not a clean piece of work, and the difference matters most in
 * the denominator of the error rate.
 */

export async function loadMistakeWorkload({
  userId,
  userLanguageId,
  languageCode,
  /** The earliest instant worth reading. null loads everything. */
  from = null,
}: {
  userId: string;
  userLanguageId: string;
  languageCode: string;
  from?: Date | null;
}): Promise<MistakeWorkload> {
  const [writing, speaking] = await Promise.all([
    loadReviewedWriting({ userId, userLanguageId, from }),
    loadReviewedSpeaking({ userId, userLanguageId, from }),
  ]);

  const [writingOccurrences, speakingOccurrences] = await Promise.all([
    loadWritingOccurrences(writing, languageCode),
    loadSpeakingOccurrences(speaking, languageCode),
  ]);

  return {
    occurrences: sortOccurrences([...writingOccurrences, ...speakingOccurrences]),
    writing: writing.map(({ entryId, createdAt, wordCount }) => ({
      entryId,
      createdAt,
      wordCount,
    })),
    speaking: speaking.map(({ attemptId, createdAt }) => ({ attemptId, createdAt })),
  };
}

/**
 * Reviewed writing, with the review that reviewed it.
 *
 * `status = 'completed'` is not quite enough on its own. Rows written before
 * the response contract was tightened can be completed and still hold nothing a
 * learner could use — there is one such review in production — so the same
 * predicate the review screen applies is applied here. The alternative, a regex
 * in SQL, would be a second definition of "usable" that could drift from the
 * first.
 *
 * The date used throughout is the *work's* timestamp, not the review's: the
 * learner wrote it on Tuesday, and which day that was is a fact about them
 * rather than about when our provider answered.
 */
type ReviewedWritingRow = ReviewedWriting & { reviewId: string };

async function loadReviewedWriting({
  userId,
  userLanguageId,
  from,
}: {
  userId: string;
  userLanguageId: string;
  from: Date | null;
}): Promise<ReviewedWritingRow[]> {
  const rows = await db
    .select({
      reviewId: writingReviews.id,
      entryId: writingEntries.id,
      createdAt: writingEntries.createdAt,
      wordCount: writingEntries.wordCount,
      summary: writingReviews.summary,
      improvedText: writingReviews.improvedText,
    })
    .from(writingReviews)
    .innerJoin(writingEntries, eq(writingEntries.id, writingReviews.entryId))
    .where(
      and(
        eq(writingEntries.userId, userId),
        eq(writingEntries.userLanguageId, userLanguageId),
        eq(writingReviews.status, "completed"),
        from ? gte(writingEntries.createdAt, from) : undefined,
      ),
    )
    .orderBy(desc(writingEntries.createdAt));

  return rows
    .filter((row) => isUsableReviewContent(row.summary, row.improvedText))
    .map(({ reviewId, entryId, createdAt, wordCount }) => ({
      reviewId,
      entryId,
      createdAt,
      wordCount,
    }));
}

type ReviewedSpeakingRow = ReviewedSpeaking & { reviewId: string };

async function loadReviewedSpeaking({
  userId,
  userLanguageId,
  from,
}: {
  userId: string;
  userLanguageId: string;
  from: Date | null;
}): Promise<ReviewedSpeakingRow[]> {
  const rows = await db
    .select({
      reviewId: speakingReviews.id,
      attemptId: speakingAttempts.id,
      createdAt: speakingAttempts.createdAt,
      summary: speakingReviews.summary,
      improvedAnswer: speakingReviews.improvedAnswer,
    })
    .from(speakingReviews)
    .innerJoin(speakingAttempts, eq(speakingAttempts.id, speakingReviews.attemptId))
    .where(
      and(
        eq(speakingAttempts.userId, userId),
        eq(speakingAttempts.userLanguageId, userLanguageId),
        eq(speakingReviews.status, "completed"),
        from ? gte(speakingAttempts.createdAt, from) : undefined,
      ),
    )
    .orderBy(desc(speakingAttempts.createdAt));

  return rows
    .filter((row) => isUsableSpeakingReview(row.summary, row.improvedAnswer))
    .map(({ reviewId, attemptId, createdAt }) => ({ reviewId, attemptId, createdAt }));
}

async function loadWritingOccurrences(
  reviewed: ReviewedWritingRow[],
  languageCode: string,
): Promise<MistakeOccurrence[]> {
  if (reviewed.length === 0) return [];

  const rows = await db
    .select({
      id: writingIssues.id,
      reviewId: writingIssues.reviewId,
      position: writingIssues.position,
      category: writingIssues.category,
      label: writingIssues.label,
      severity: writingIssues.severity,
      originalFragment: writingIssues.originalFragment,
      suggestion: writingIssues.suggestion,
      explanation: writingIssues.explanation,
    })
    .from(writingIssues)
    .where(
      inArray(
        writingIssues.reviewId,
        reviewed.map((row) => row.reviewId),
      ),
    );

  return attachToWork(rows, reviewed, "writing", (row) => row.entryId, languageCode);
}

async function loadSpeakingOccurrences(
  reviewed: ReviewedSpeakingRow[],
  languageCode: string,
): Promise<MistakeOccurrence[]> {
  if (reviewed.length === 0) return [];

  const rows = await db
    .select({
      id: speakingIssues.id,
      reviewId: speakingIssues.reviewId,
      position: speakingIssues.position,
      category: speakingIssues.category,
      label: speakingIssues.label,
      severity: speakingIssues.severity,
      originalFragment: speakingIssues.originalFragment,
      suggestion: speakingIssues.suggestion,
      explanation: speakingIssues.explanation,
    })
    .from(speakingIssues)
    .where(
      inArray(
        speakingIssues.reviewId,
        reviewed.map((row) => row.reviewId),
      ),
    );

  return attachToWork(rows, reviewed, "speaking", (row) => row.attemptId, languageCode);
}

/**
 * Hangs each issue back onto the work it was found in, so an occurrence knows
 * its date and where a tap should lead. Issues whose review is not in the set
 * cannot occur — the query asked for those review ids — but a missing parent
 * costs its own issue rather than the screen.
 */
function attachToWork<
  Issue extends {
    id: string;
    reviewId: string;
    position: number;
    category: MistakeOccurrence["category"];
    label: string | null;
    severity: MistakeOccurrence["severity"];
    originalFragment: string;
    suggestion: string;
    explanation: string;
  },
  Work extends { reviewId: string; createdAt: Date },
>(
  issues: Issue[],
  work: Work[],
  source: MistakeSource,
  sourceId: (work: Work) => string,
  languageCode: string,
): MistakeOccurrence[] {
  const byReview = new Map(work.map((item) => [item.reviewId, item]));

  return issues.flatMap((issue) => {
    const parent = byReview.get(issue.reviewId);
    if (!parent) return [];

    return [
      {
        source,
        issueId: issue.id,
        sourceId: sourceId(parent),
        createdAt: parent.createdAt,
        category: issue.category,
        label: issue.label,
        severity: issue.severity,
        originalFragment: issue.originalFragment,
        suggestion: issue.suggestion,
        explanation: issue.explanation,
        languageCode,
        position: issue.position,
      },
    ];
  });
}

/**
 * Everything the Progress screen shows, for one period.
 *
 * One read, then pure aggregation. The read reaches back to the start of the
 * *previous* window because the error rate is compared against it; splitting
 * that set by date in the domain is cheaper than four more round trips and it
 * is the half that can be tested without a database.
 */
export async function getMistakeOverview(
  user: OnboardedUser,
  period: MistakePeriod,
  now = new Date(),
): Promise<MistakeOverview> {
  const { timeZone } = user;

  const workload = await loadMistakeWorkload({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    languageCode: user.primaryLanguage.code,
    from: earliestInstantToLoad(period, now, timeZone),
  });

  return buildMistakeOverview({
    workload,
    window: periodWindow(period, now, timeZone),
    previousWindow: previousPeriodWindow(period, now, timeZone),
  });
}

/**
 * Everything filed under one weak point, for the detail screen.
 *
 * Only the selected window is read — a detail screen has no trend, so it has no
 * reason to reach into the period before it.
 */
export async function getMistakeOccurrences(
  user: OnboardedUser,
  period: MistakePeriod,
  selection: MistakeSelection,
  now = new Date(),
): Promise<MistakeOccurrence[]> {
  const { timeZone } = user;
  const window = periodWindow(period, now, timeZone);

  const workload = await loadMistakeWorkload({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    languageCode: user.primaryLanguage.code,
    from: window?.from ?? null,
  });

  return occurrencesFor(filterToWindow(workload.occurrences, window), selection);
}
