import type { OnboardedUser } from "@/lib/auth/current-user";
import { addLocalDays, elapsedSeconds, localDayInterval, localDayKey, localWeekInterval } from "@/lib/time";
import { BREAKDOWN_GROUPS, type ActivityGroup, type ActivityType } from "../domain/activity";
import { buildWeekDays, groupTotals, type DayTotal, weekOverWeekChange } from "../domain/aggregate";
import { getActiveSession, getSessionsInInterval } from "./sessions";

/**
 * The tracker's view of the dashboard. Everything in here comes from the
 * database — no fixtures. Demo analytics live separately in
 * features/dashboard/demo-analytics.ts and are never merged into this object.
 *
 * The view model carries identifiers and numbers, not sentences: an activity is
 * `video` here and becomes "Video" or "Видео" in the component that draws it.
 * The one exception is the weekday names on the chart, which are produced by
 * `Intl` from the learner's zone and language together and have nowhere else to
 * be computed.
 */

export type ActiveSessionView = {
  id: string;
  activityType: ActivityType;
  /** Milliseconds since the epoch, so the client can keep counting. */
  startedAtMs: number;
  /** Elapsed at the moment the server rendered, used as the client's baseline. */
  elapsedSeconds: number;
};

export type TodayView = {
  seconds: number;
  breakdown: { group: ActivityGroup; seconds: number }[];
};

export type WeekView = {
  seconds: number;
  previousSeconds: number;
  /** null when the previous week holds nothing worth comparing against. */
  changePercent: number | null;
  /** The learner's own target for their primary language. Never a default. */
  dailyGoalMinutes: number;
  days: DayTotal[];
};

export type TrackerOverview = {
  activeSession: ActiveSessionView | null;
  today: TodayView;
  week: WeekView;
  /** Local "YYYY-MM-DD", for defaulting the manual-entry date field. */
  todayDayKey: string;
};

/**
 * Takes an OnboardedUser, not a CurrentUser: every number below is computed in
 * the learner's own timezone and drawn against the learner's own goal, and
 * neither exists until onboarding has run.
 */
export async function getTrackerOverview(
  user: OnboardedUser,
  now = new Date(),
): Promise<TrackerOverview> {
  const { timeZone, uiLanguage } = user;

  const day = localDayInterval(now, timeZone);
  const week = localWeekInterval(now, timeZone);
  const previousWeek = {
    from: addLocalDays(week.from, -7, timeZone),
    to: week.from,
  };

  const [active, todaySessions, weekSessions, previousWeekSessions] = await Promise.all([
    getActiveSession(user.id),
    getSessionsInInterval(user.id, day.from, day.to),
    getSessionsInInterval(user.id, week.from, week.to),
    getSessionsInInterval(user.id, previousWeek.from, previousWeek.to),
  ]);

  const todayTotals = groupTotals(todaySessions, now);
  const weekTotals = groupTotals(weekSessions, now);
  const previousTotals = groupTotals(previousWeekSessions, now);

  return {
    activeSession: active
      ? {
          id: active.id,
          activityType: active.activityType,
          startedAtMs: active.startedAt.getTime(),
          elapsedSeconds: elapsedSeconds(active.startedAt, now),
        }
      : null,
    today: {
      seconds: todayTotals.total,
      breakdown: BREAKDOWN_GROUPS.map((group) => ({
        group,
        seconds: todayTotals[group],
      })),
    },
    week: {
      seconds: weekTotals.total,
      previousSeconds: previousTotals.total,
      changePercent: weekOverWeekChange(weekTotals.total, previousTotals.total),
      dailyGoalMinutes: user.primaryLanguage.dailyGoalMinutes,
      days: buildWeekDays({
        sessions: weekSessions,
        previousWeekSessions,
        weekStart: week.from,
        timeZone,
        now,
        language: uiLanguage,
      }),
    },
    todayDayKey: localDayKey(now, timeZone),
  };
}
