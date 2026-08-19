import type { Interval } from "@/lib/time";
import {
  balanceBySource,
  countSeverities,
  recentMistakes,
  repeatedMistakes,
  weakPointsByCategory,
  type CategoryWeakPoint,
  type RepeatedMistake,
  type SeverityCounts,
  type SourceBalance,
} from "./aggregate";
import { writingAccuracy, type WritingAccuracyTrend } from "./accuracy";
import type { MistakeOccurrence } from "./occurrence";
import { filterToWindow } from "./period";
import type { MistakeWorkload } from "./workload";

/**
 * The Progress screen, computed.
 *
 * One read reaches back to the start of the *previous* window so the trend has
 * something to compare against; splitting that set into two windows is done
 * here rather than with four more queries. Pure, so every rule the screen shows
 * is testable without a database.
 */

export type MistakeOverview = {
  counts: SeverityCounts;
  writingReviewed: number;
  speakingReviewed: number;
  weakPoints: CategoryWeakPoint[];
  repeated: RepeatedMistake[];
  recent: MistakeOccurrence[];
  balance: SourceBalance;
  accuracy: WritingAccuracyTrend;
  /**
   * Whether there is any reviewed work in the window at all.
   *
   * Not "are there mistakes": a learner who wrote three clean paragraphs has an
   * empty weak-points list and has earned it, and telling them to go and
   * practise would be wrong. The empty state is for having nothing reviewed.
   */
  hasReviewedWork: boolean;
};

export function buildMistakeOverview({
  workload,
  window,
  previousWindow,
  recentLimit = 10,
}: {
  workload: MistakeWorkload;
  /** null means all of time. */
  window: Interval | null;
  /** null when the period has nothing before it. */
  previousWindow: Interval | null;
  recentLimit?: number;
}): MistakeOverview {
  const occurrences = filterToWindow(workload.occurrences, window);
  const writing = filterToWindow(workload.writing, window);
  const speaking = filterToWindow(workload.speaking, window);

  return {
    counts: countSeverities(occurrences),
    writingReviewed: writing.length,
    speakingReviewed: speaking.length,
    weakPoints: weakPointsByCategory(occurrences),
    repeated: repeatedMistakes(occurrences),
    recent: recentMistakes(occurrences, recentLimit),
    balance: balanceBySource(occurrences),
    accuracy: {
      current: writingAccuracy(occurrences, writing),
      previous: previousWindow
        ? writingAccuracy(
            filterToWindow(workload.occurrences, previousWindow),
            filterToWindow(workload.writing, previousWindow),
          )
        : null,
    },
    hasReviewedWork: writing.length > 0 || speaking.length > 0,
  };
}
