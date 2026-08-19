import type { MistakeOccurrence } from "./occurrence";

/**
 * What one read of the mistake engine returns.
 *
 * The occurrences are the point, but the two lists beside them are not
 * decoration: they are the denominator. "How many mistakes" means nothing
 * without "out of how much reviewed work", and the errors-per-1000-words figure
 * is arithmetic over exactly these word counts.
 *
 * Both lists hold *reviewed* work only — an entry whose review failed, or which
 * was never reviewed at all, is absent. That is not a detail: a failed review is
 * missing data, not a clean piece of writing, and counting its words would
 * quietly improve the learner's error rate for the crime of our provider timing
 * out. The filtering happens in ../data, once, so nothing downstream can forget.
 */

export type ReviewedWriting = {
  entryId: string;
  createdAt: Date;
  /** Of the original text, as stored at submission. */
  wordCount: number;
};

export type ReviewedSpeaking = {
  attemptId: string;
  createdAt: Date;
};

export type MistakeWorkload = {
  /** Newest first. Both sources, already merged. */
  occurrences: MistakeOccurrence[];
  writing: ReviewedWriting[];
  speaking: ReviewedSpeaking[];
};

export const EMPTY_WORKLOAD: MistakeWorkload = { occurrences: [], writing: [], speaking: [] };
