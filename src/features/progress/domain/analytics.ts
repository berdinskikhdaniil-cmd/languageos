import {
  buildMistakeOverview,
  type MistakeOverview,
} from "@/features/mistakes/domain/overview";
import {
  buildQualitySeries,
  qualityGranularityForSpan,
  type QualitySeries,
} from "@/features/mistakes/domain/quality-trend";
import { filterToWindow, type MistakePeriod } from "@/features/mistakes/domain/period";
import type { MistakeWorkload } from "@/features/mistakes/domain/workload";
import { BREAKDOWN_GROUPS, type ActivityGroup } from "@/features/tracker/domain/activity";
import { groupTotals, type TrackedSession } from "@/features/tracker/domain/aggregate";
import {
  bucketSessions,
  granularityForSpan,
  percentageShares,
  summarizeActivity,
  type ActivityBucket,
  type ActivitySummary,
} from "@/features/tracker/domain/buckets";
import { buildHeatmap, type HeatmapView } from "@/features/tracker/domain/heatmap";
import type { UiLanguage } from "@/lib/i18n/locale";
import {
  addLocalDays,
  startOfLocalDay,
  type BucketGranularity,
  type Interval,
} from "@/lib/time";

/**
 * The whole Progress screen, computed from rows that already exist.
 *
 * Two reads feed it — the tracker's sessions and the mistake engine's workload
 * — and everything below is arithmetic over them. No third table, no stored
 * aggregate, and nothing on the screen that is not in the database: a period
 * with no study time draws no bar, and a period with too little reviewed
 * writing to divide by is left out of the quality line rather than smoothed
 * over.
 *
 * Pure on purpose. The queries live in ../data; every rule that decides what a
 * learner is told about their own progress is testable here without one.
 */

export type BalanceShare = {
  group: ActivityGroup;
  seconds: number;
  /** Whole percent of total language time. The shown shares add up to 100. */
  percent: number;
};

export type ProgressAnalytics = {
  period: MistakePeriod;
  /** The window every section is drawn over. Derived from data for all time. */
  window: Interval;
  granularity: BucketGranularity;
  activity: { buckets: ActivityBucket[]; summary: ActivitySummary };
  balance: { shares: BalanceShare[]; totalSeconds: number };
  quality: QualitySeries;
  consistency: HeatmapView;
  mistakes: MistakeOverview;
  /** Whether anything at all has been logged or reviewed in this window. */
  hasAnything: boolean;
};

export function buildProgressAnalytics({
  period,
  window,
  previousWindow,
  sessions,
  workload,
  timeZone,
  now,
  language,
  dailyGoalMinutes,
}: {
  period: MistakePeriod;
  /**
   * The selected window, or null for all time — which has no boundaries and so
   * takes them from the data instead.
   */
  window: Interval | null;
  previousWindow: Interval | null;
  /** Everything read; filtered to the window here rather than in SQL. */
  sessions: readonly TrackedSession[];
  workload: MistakeWorkload;
  timeZone: string;
  now: Date;
  language: UiLanguage;
  dailyGoalMinutes: number;
}): ProgressAnalytics {
  const effective = window ?? allTimeWindow({ sessions, workload, timeZone, now });
  const windowSessions = sessionsWithin(sessions, effective);
  const spanDays = spanInDays(effective);

  const mistakes = buildMistakeOverview({ workload, window, previousWindow });

  const totals = groupTotals(windowSessions, now);
  /**
   * `other` earns a row only when there is some. It is language time and
   * belongs in the total — the tracker's own invariant — but it is not one of
   * the three skills, and a permanent "Other 0%" would imply it were.
   */
  const shownGroups: ActivityGroup[] =
    totals.other > 0 ? [...BREAKDOWN_GROUPS, "other"] : [...BREAKDOWN_GROUPS];
  const percents = percentageShares(shownGroups.map((group) => totals[group]));

  return {
    period,
    window: effective,
    granularity: granularityForSpan(spanDays),
    activity: {
      buckets: bucketSessions({
        sessions: windowSessions,
        window: effective,
        granularity: granularityForSpan(spanDays),
        timeZone,
        now,
        language,
      }),
      summary: summarizeActivity({
        sessions: windowSessions,
        window: effective,
        timeZone,
        now,
      }),
    },
    balance: {
      shares: shownGroups.map((group, index) => ({
        group,
        seconds: totals[group],
        percent: percents[index],
      })),
      totalSeconds: totals.total,
    },
    quality: buildQualitySeries({
      // Filtered to the window first, so a bucket never quietly borrows words
      // from the period before the one the screen says it is showing.
      occurrences: filterToWindow(workload.occurrences, window),
      reviewed: filterToWindow(workload.writing, window),
      window: effective,
      granularity: qualityGranularityForSpan(spanDays),
      timeZone,
      now,
      language,
    }),
    /**
     * Deliberately not the selected period. Consistency is about the shape of a
     * habit, and twelve weeks is what shows one on a phone — a 30-day grid is
     * four columns and a five-year grid is unreadable. The caption on screen
     * says which stretch it covers, so the two are never confused.
     */
    consistency: buildHeatmap({ sessions, timeZone, now, dailyGoalMinutes }),
    mistakes,
    hasAnything: totals.total > 0 || mistakes.hasReviewedWork,
  };
}

/**
 * What "all time" means, in days.
 *
 * The earliest thing the learner actually has, back to today — not the epoch,
 * which would draw fifty-six years of empty months. With nothing at all, it is
 * today, and every section reports itself empty.
 */
function allTimeWindow({
  sessions,
  workload,
  timeZone,
  now,
}: {
  sessions: readonly TrackedSession[];
  workload: MistakeWorkload;
  timeZone: string;
  now: Date;
}): Interval {
  const candidates = [
    ...sessions.map((session) => session.startedAt.getTime()),
    ...workload.writing.map((entry) => entry.createdAt.getTime()),
    ...workload.speaking.map((attempt) => attempt.createdAt.getTime()),
  ];

  const earliest = candidates.length > 0 ? new Date(Math.min(...candidates)) : now;

  return {
    from: startOfLocalDay(earliest, timeZone),
    to: addLocalDays(startOfLocalDay(now, timeZone), 1, timeZone),
  };
}

function sessionsWithin(
  sessions: readonly TrackedSession[],
  window: Interval,
): TrackedSession[] {
  return sessions.filter(
    (session) =>
      session.startedAt.getTime() >= window.from.getTime() &&
      session.startedAt.getTime() < window.to.getTime(),
  );
}

/** Whole days the window covers, at least one. Drives the granularity choice. */
function spanInDays(window: Interval): number {
  return Math.max(1, Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000));
}
