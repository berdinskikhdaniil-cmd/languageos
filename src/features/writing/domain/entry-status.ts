import { isUsableReviewContent } from "./review";

/**
 * Where a piece of writing has got to in the loop.
 *
 * Three states, because the loop has three steps worth distinguishing in a
 * list: it has not been reviewed, it has, and the learner has been back and
 * fixed it themselves. Rewritten wins over reviewed — it is further along, and
 * it is the step the whole feature exists to produce.
 *
 * Pure, so the mapping can be tested without a database and cannot drift
 * between the list and whatever shows it next.
 */

export const WRITING_ENTRY_STATUSES = ["needs_review", "reviewed", "rewritten"] as const;

export type WritingEntryStatus = (typeof WRITING_ENTRY_STATUSES)[number];

export function writingEntryStatus({
  revisedText,
  review,
}: {
  revisedText: string | null;
  review: {
    status: "pending" | "completed" | "failed";
    summary: string | null;
    improvedText: string | null;
  } | null;
}): WritingEntryStatus {
  if (revisedText !== null) return "rewritten";

  /**
   * "Reviewed" has to mean there is a review worth opening. A row that is
   * `completed` but holds nothing usable — the shape that reached production
   * once — reads as needing review, which is both true and what the entry
   * screen will offer when it is opened.
   */
  if (review?.status === "completed" && isUsableReviewContent(review.summary, review.improvedText)) {
    return "reviewed";
  }

  return "needs_review";
}
