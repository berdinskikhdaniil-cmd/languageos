import type { UiLanguage } from "@/lib/i18n/locale";
import {
  bucketKey,
  bucketStartsBetween,
  localMonthLabel,
  localShortDateLabel,
  type BucketGranularity,
  type Interval,
} from "@/lib/time";
import { MIN_ACCURACY_WORDS, writingAccuracy } from "./accuracy";
import type { MistakeOccurrence } from "./occurrence";
import type { ReviewedWriting } from "./workload";

/**
 * Errors per 1000 words, over time.
 *
 * The methodology is not restated here: each point is produced by
 * `writingAccuracy`, the same function behind the single figure above the
 * chart. That is deliberate — a trend line computed a second way would sooner
 * or later disagree with the number it sits under, and the reader would have no
 * way to tell which one was lying. Speaking, unreviewed drafts, failed reviews
 * and non-`error` severities are excluded because that function excludes them.
 *
 * What is new here is only the denominator problem. Three mistakes in forty
 * words is 75 per 1000 — a number with the shape of a statistic and none of the
 * substance — and a line drawn through a fortnight of those would swing wildly
 * while telling the learner nothing. So a bucket becomes a point only once it
 * holds enough reviewed writing to divide by, and the thin ones are left out
 * and counted, so the caption can say how many.
 */

/**
 * Coarser than the activity chart, and that is the whole point.
 *
 * A day rarely holds a hundred reviewed words, so daily points would almost all
 * be too thin to plot and the line would be a handful of dots with nothing
 * between them. Weeks are the smallest period that reliably clears the floor
 * for somebody writing a few times a week.
 */
export function qualityGranularityForSpan(days: number): BucketGranularity {
  return days <= 182 ? "week" : "month";
}

export type QualityPoint = {
  key: string;
  startsAt: Date;
  /** Short, for a chart axis. Already in the reader's language. */
  label: string;
  perThousand: number;
  mistakes: number;
  words: number;
};

export type QualitySeries = {
  granularity: BucketGranularity;
  /** Only the buckets that held enough reviewed writing. Oldest first. */
  points: QualityPoint[];
  /**
   * Buckets that held some reviewed writing but not enough to divide by.
   * Reported rather than hidden: "two periods had too little writing" is a
   * different statement from "you did not write", and the caption says which.
   */
  thinBuckets: number;
};

/** Two points is the least a line can honestly be drawn through. */
export const MIN_QUALITY_POINTS = 2;

export function buildQualitySeries({
  occurrences,
  reviewed,
  window,
  granularity,
  timeZone,
  now,
  language,
}: {
  occurrences: readonly MistakeOccurrence[];
  reviewed: readonly ReviewedWriting[];
  window: Interval;
  granularity: BucketGranularity;
  timeZone: string;
  now: Date;
  language: UiLanguage;
}): QualitySeries {
  const occurrencesByBucket = groupBy(occurrences, (item) =>
    bucketKey(item.createdAt, granularity, timeZone),
  );
  const reviewedByBucket = groupBy(reviewed, (item) =>
    bucketKey(item.createdAt, granularity, timeZone),
  );

  const points: QualityPoint[] = [];
  let thinBuckets = 0;

  for (const startsAt of bucketStartsBetween({
    from: window.from,
    to: window.to,
    granularity,
    timeZone,
  })) {
    const key = bucketKey(startsAt, granularity, timeZone);
    const bucketReviewed = reviewedByBucket.get(key) ?? [];
    // A period with no reviewed writing at all is not a thin period, it is an
    // absent one. Only writing that happened and could not be divided by counts.
    if (bucketReviewed.length === 0) continue;

    const accuracy = writingAccuracy(occurrencesByBucket.get(key) ?? [], bucketReviewed);

    if (accuracy.status !== "ready") {
      thinBuckets += 1;
      continue;
    }

    points.push({
      key,
      startsAt,
      label:
        granularity === "month"
          ? localMonthLabel(startsAt, timeZone, now, language)
          : localShortDateLabel(startsAt, timeZone, now, language),
      perThousand: accuracy.perThousand,
      mistakes: accuracy.mistakes,
      words: accuracy.words,
    });
  }

  return { granularity, points, thinBuckets };
}

/** Whether there is enough to draw a line rather than a claim. */
export function isPlottableSeries(series: QualitySeries): boolean {
  return series.points.length >= MIN_QUALITY_POINTS;
}

/** Re-exported so the caption can name the floor without importing two modules. */
export { MIN_ACCURACY_WORDS };

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const bucket = groups.get(key(item));
    if (bucket) bucket.push(item);
    else groups.set(key(item), [item]);
  }

  return groups;
}
