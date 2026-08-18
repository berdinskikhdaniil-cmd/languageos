import type { CurrentUser } from "@/lib/auth/current-user";
import { addLocalDays, elapsedSeconds, localDayInterval, localDayKey, localWeekInterval } from "@/lib/time";
import { ACTIVITY_LABELS, BREAKDOWN_GROUPS, GROUP_LABELS, type ActivityGroup, type ActivityType } from "../domain/activity";
import { buildWeekDays, groupTotals, type DayTotal, weekOverWeekChange } from "../domain/aggregate";
import { DEFAULT_DAILY_GOAL_MINUTES } from "../domain/goals";
import { getActiveSession, getSessionsInInterval } from "./sessions";

/**
 * The tracker's view of the dashboard. Everything in here comes from the
 * database — no fixtures. Demo analytics live separately in
 * features/dashboard/demo-analytics.ts and are never merged into this object.
 */

export type ActiveSessionView = {
  id: string;
  activityType: ActivityType;
  activityLabel: string;
  /** Milliseconds since the epoch, so the client can keep counting. */
  startedAtMs: number;
  /** Elapsed at the moment the server rendered, used as the client's baseline. */
  elapsedSeconds: number;
};

export type TodayView = {
  seconds: number;
  breakdown: { group: ActivityGroup; label: string; seconds: number }[];
};

export type WeekView = {
  seconds: number;
  previousSeconds: number;
  /** null when the previous week holds nothing worth comparing against. */
  changePercent: number | null;
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

export async function getTrackerOverview(
  user: CurrentUser,
  now = new Date(),
): Promise<TrackerOverview> {
  const { timeZone } = user;

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
          activityLabel: ACTIVITY_LABELS[active.activityType],
          startedAtMs: active.startedAt.getTime(),
          elapsedSeconds: elapsedSeconds(active.startedAt, now),
        }
      : null,
    today: {
      seconds: todayTotals.total,
      breakdown: BREAKDOWN_GROUPS.map((group) => ({
        group,
        label: GROUP_LABELS[group],
        seconds: todayTotals[group],
      })),
    },
    week: {
      seconds: weekTotals.total,
      previousSeconds: previousTotals.total,
      changePercent: weekOverWeekChange(weekTotals.total, previousTotals.total),
      dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
      days: buildWeekDays({
        sessions: weekSessions,
        previousWeekSessions,
        weekStart: week.from,
        timeZone,
        now,
      }),
    },
    todayDayKey: localDayKey(now, timeZone),
  };
}
