import type { IssueCategory, IssueSeverity } from "@/features/writing/domain/review";

/**
 * One mistake, wherever it was made.
 *
 * Writing and Speaking store their findings in two tables, and they have to,
 * because an issue hangs off the review that produced it. But a learner does
 * not have two sets of weak points — somebody who drops articles drops them
 * both when writing and when speaking, and a mistake engine that counted those
 * separately would halve every total and hide the very thing it exists to show.
 *
 * So this is the shape both tables are read into, and it is a *type*, not a
 * third table. `writing_issues` and `speaking_issues` stay the source of truth;
 * nothing is copied anywhere for the sake of counting it. The two enums are
 * already shared at the database level (see db/schema.ts), which is what makes
 * one unified type honest rather than a merge that papers over a difference.
 *
 * Feature code above this line never learns which SQL schema a mistake came
 * from — only `source`, which is a fact about the learner's practice rather
 * than about our storage.
 */

export const MISTAKE_SOURCES = ["writing", "speaking"] as const;

export type MistakeSource = (typeof MISTAKE_SOURCES)[number];

export type MistakeOccurrence = {
  source: MistakeSource;
  /** The row in `writing_issues` or `speaking_issues`. Unique within its source. */
  issueId: string;
  /**
   * The writing entry or the speaking attempt it was found in — the thing the
   * learner can open again. Not the review: a review is machinery, and the
   * routes are keyed by the work itself.
   */
  sourceId: string;
  /** When the work was done, not when the review finished. */
  createdAt: Date;
  category: IssueCategory;
  /** The model's own short skill name, canonical English. Null when it had none. */
  label: string | null;
  severity: IssueSeverity;
  originalFragment: string;
  suggestion: string;
  explanation: string;
  /** The language being learned, as stored on `user_languages`. */
  languageCode: string;
  /** Its place within its own review. Only used to keep ordering deterministic. */
  position: number;
};

/**
 * What the headline "mistakes" figure counts.
 *
 * `error` and only `error`. A learner whose text came back with twelve
 * findings, seven of which were "this is a bit wordy", has not made twelve
 * mistakes, and telling them so would be both wrong and discouraging. The other
 * two severities are improvement suggestions and are counted under their own
 * name — see `countSeverities` in ./aggregate.
 */
export function isConcreteMistake(occurrence: MistakeOccurrence): boolean {
  return occurrence.severity === "error";
}

/** `awkward` and `style`: worth reading, never counted as a mistake. */
export function isImprovementSuggestion(occurrence: MistakeOccurrence): boolean {
  return !isConcreteMistake(occurrence);
}

/**
 * Newest first, and fully deterministic.
 *
 * Two pieces of work can share a timestamp — a speaking attempt and the review
 * of it land within a second of each other, and fixtures land within none — so
 * the order falls through to the source and then to the issue's own position in
 * its review. Without that, two renders of the same data could disagree.
 */
export function compareOccurrences(a: MistakeOccurrence, b: MistakeOccurrence): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;

  if (a.source !== b.source) return a.source === "writing" ? -1 : 1;
  if (a.position !== b.position) return a.position - b.position;
  return a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : 0;
}

export function sortOccurrences(occurrences: MistakeOccurrence[]): MistakeOccurrence[] {
  return [...occurrences].sort(compareOccurrences);
}

/**
 * Where to send somebody who taps an occurrence: the review it came from.
 *
 * The existing routes, deliberately. A mistake is a pointer into work the
 * learner already did, and the screen that explains it best is the one that
 * found it — with their whole text or transcript around it.
 */
export function occurrenceHref(occurrence: MistakeOccurrence): string {
  return occurrence.source === "writing"
    ? `/practice/writing/${occurrence.sourceId}`
    : `/practice/speaking/${occurrence.sourceId}`;
}
