import { isConcreteMistake, type MistakeOccurrence } from "./occurrence";
import type { ReviewedWriting } from "./workload";

/**
 * Mistakes per 1000 words, over reviewed writing.
 *
 * The one trend in the product that is arithmetic rather than a feeling, and it
 * is deliberately narrow, because the denominator is the whole difficulty. Four
 * things are excluded and each for its own reason:
 *
 * - **Speaking.** A transcript is a different modality with a speech-recogniser
 *   between the learner and the text, so its word count is not comparable with
 *   a typed one and dividing by both would produce a number that means nothing.
 *   A spoken metric can exist later; it is not this one.
 * - **Unreviewed drafts and failed reviews.** Nobody looked at those words, so
 *   including them would count clean writing that was never checked.
 * - **`awkward` and `style`.** Improvement suggestions, not mistakes. Mixing
 *   them in would make a well-written text look worse than a sloppy one that
 *   the model happened to have fewer opinions about.
 *
 * And one thing is refused outright: a confident-looking rate computed from a
 * handful of words. Three mistakes in forty words is 75 per 1000, which is a
 * statistic in shape only. Below the floor the answer is "not enough data yet",
 * which is true and useful, rather than a precise-looking number that will
 * lurch about for weeks.
 */

/**
 * How many reviewed words the figure needs before it is worth printing.
 *
 * Roughly one decent piece of writing. Low enough to appear in a learner's
 * first week, high enough that a single sentence cannot define the rate.
 */
export const MIN_ACCURACY_WORDS = 100;

export type WritingAccuracy =
  /** Not enough reviewed writing to say anything. `words` is what there is. */
  | { status: "insufficient"; words: number }
  | { status: "ready"; perThousand: number; mistakes: number; words: number };

export function writingAccuracy(
  occurrences: readonly MistakeOccurrence[],
  reviewed: readonly ReviewedWriting[],
): WritingAccuracy {
  const words = reviewed.reduce((total, entry) => total + entry.wordCount, 0);
  if (words < MIN_ACCURACY_WORDS) return { status: "insufficient", words };

  const mistakes = occurrences.filter(
    (occurrence) => occurrence.source === "writing" && isConcreteMistake(occurrence),
  ).length;

  return {
    status: "ready",
    // Zero mistakes over enough words is a real, correct answer — not an
    // absence of data — and it is the best thing this metric can ever say.
    perThousand: Math.round((mistakes / words) * 1000),
    mistakes,
    words,
  };
}

export type WritingAccuracyTrend = {
  current: WritingAccuracy;
  /**
   * The window before this one, and null when there is no such window — "all
   * time" has nothing before it. `insufficient` here is also a real answer and
   * means the same thing it means above: the comparison is not drawn.
   *
   * Nothing invents a previous period. A first-week learner sees a number with
   * no comparison, which is honest, rather than a made-up improvement.
   */
  previous: WritingAccuracy | null;
};

/** Whether a change can be drawn: both windows have to have said something. */
export function comparableAccuracy(
  trend: WritingAccuracyTrend,
): { current: number; previous: number } | null {
  if (trend.current.status !== "ready") return null;
  if (!trend.previous || trend.previous.status !== "ready") return null;

  return { current: trend.current.perThousand, previous: trend.previous.perThousand };
}
