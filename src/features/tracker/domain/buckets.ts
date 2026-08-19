import type { UiLanguage } from "@/lib/i18n/locale";
import {
  bucketKey,
  bucketStartsBetween,
  localDayKey,
  localMonthLabel,
  localShortDateLabel,
  type BucketGranularity,
  type Interval,
} from "@/lib/time";
import { ACTIVITY_GROUPS, activityGroup, type ActivityGroup } from "./activity";
import { sessionSeconds, type TrackedSession } from "./aggregate";

/**
 * Study time cut into periods a chart can draw.
 *
 * Pure, and separate from the queries, because everything that can go quietly
 * wrong here is arithmetic: which local day a session belongs to, whether an
 * empty period is a real zero, and how a running timer is counted. All of it is
 * testable without a database or a browser.
 *
 * Nothing here re-derives the activity grouping — it calls `activityGroup`, the
 * one place that mapping lives — and nothing re-implements how long a session
 * counts for: `sessionSeconds` is the tracker's own rule, so a bar on Progress
 * and the number on the dashboard can never disagree about the same session.
 */

export type ActivityBucket = {
  /** Local "2026-08-19" / "2026-08-17" (week start) / "2026-08". */
  key: string;
  /** Local midnight the period opens on. */
  startsAt: Date;
  /** Short, for a chart axis. Already in the reader's language. */
  label: string;
  seconds: number;
  /**
   * Every group, `other` included. The bar's height is total language time, so
   * leaving `other` out would draw a column shorter than the figure above it —
   * and promoting it to a fourth headline bucket is exactly what the tracker's
   * own invariant forbids. It is in the total and it is not one of the three.
   */
  byGroup: Record<ActivityGroup, number>;
};

/**
 * How coarse the buckets should be for a span of days.
 *
 * Chosen so a phone never has to draw a hundred columns three pixels wide. Days
 * up to about a month, then weeks, then months — the same progression a person
 * would use describing the same stretch of time out loud.
 */
export function granularityForSpan(days: number): BucketGranularity {
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

/**
 * Sessions laid out over consecutive periods.
 *
 * A session is filed by when it *started*, which is the tracker's existing rule
 * for one that crosses midnight, applied here so a chart and a daily total
 * never split the same session differently.
 */
export function bucketSessions({
  sessions,
  window,
  granularity,
  timeZone,
  now,
  language,
}: {
  sessions: readonly TrackedSession[];
  window: Interval;
  granularity: BucketGranularity;
  timeZone: string;
  now: Date;
  language: UiLanguage;
}): ActivityBucket[] {
  const totals = new Map<string, { seconds: number; byGroup: Record<ActivityGroup, number> }>();

  for (const session of sessions) {
    const key = bucketKey(session.startedAt, granularity, timeZone);
    const entry = totals.get(key) ?? { seconds: 0, byGroup: emptyGroups() };
    const seconds = sessionSeconds(session, now);

    entry.seconds += seconds;
    entry.byGroup[activityGroup(session.activityType)] += seconds;
    totals.set(key, entry);
  }

  return bucketStartsBetween({ from: window.from, to: window.to, granularity, timeZone }).map(
    (startsAt) => {
      const key = bucketKey(startsAt, granularity, timeZone);
      const entry = totals.get(key);

      return {
        key,
        startsAt,
        label:
          granularity === "month"
            ? localMonthLabel(startsAt, timeZone, now, language)
            : localShortDateLabel(startsAt, timeZone, now, language),
        seconds: entry?.seconds ?? 0,
        byGroup: entry?.byGroup ?? emptyGroups(),
      };
    },
  );
}

export type ActivitySummary = {
  seconds: number;
  /** Local days with any study time on them. Never a count of sessions. */
  activeDays: number;
  /** Days in the window, so "8 of 30" can be written honestly. */
  totalDays: number;
  /** Mean over *active* days, not over the window. 0 when there are none. */
  averageSecondsPerActiveDay: number;
};

/**
 * The three real numbers above the chart.
 *
 * The average is per active day rather than per day in the window, because the
 * other reading answers a question nobody asked: somebody who studies hard on
 * three days a week is not doing "twelve minutes a day", and telling them so
 * would make their own effort unrecognisable to them.
 */
export function summarizeActivity({
  sessions,
  window,
  timeZone,
  now,
}: {
  sessions: readonly TrackedSession[];
  window: Interval;
  timeZone: string;
  now: Date;
}): ActivitySummary {
  const byDay = new Map<string, number>();
  let seconds = 0;

  for (const session of sessions) {
    const value = sessionSeconds(session, now);
    if (value <= 0) continue;

    seconds += value;
    const key = localDayKey(session.startedAt, timeZone);
    byDay.set(key, (byDay.get(key) ?? 0) + value);
  }

  const activeDays = byDay.size;

  return {
    seconds,
    activeDays,
    totalDays: bucketStartsBetween({
      from: window.from,
      to: window.to,
      granularity: "day",
      timeZone,
      // Ten years of local midnights, which "all time" can genuinely reach.
      limit: 3660,
    }).length,
    averageSecondsPerActiveDay: activeDays === 0 ? 0 : Math.round(seconds / activeDays),
  };
}

/**
 * Whole-percent shares that add up to a hundred.
 *
 * Rounding each share on its own gives 33 + 33 + 33, and a reader who adds them
 * up is right to distrust the screen after that. Largest remainder puts the
 * missing points back where the most was rounded away, which is the standard
 * fix and is deterministic — equal remainders break on the original order.
 */
export function percentageShares(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values.map(() => 0);

  const exact = values.map((value) => (Math.max(0, value) / total) * 100);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const shares = [...floors];
  for (const { index } of order) {
    if (remaining <= 0) break;
    shares[index] += 1;
    remaining -= 1;
  }

  return shares;
}

function emptyGroups(): Record<ActivityGroup, number> {
  return Object.fromEntries(ACTIVITY_GROUPS.map((group) => [group, 0])) as Record<
    ActivityGroup,
    number
  >;
}
