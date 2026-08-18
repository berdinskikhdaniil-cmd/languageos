import { addLocalDays, elapsedSeconds, localDayKey, localWeekdayNames } from "@/lib/time";
import { type ActivityGroup, type ActivityType, activityGroup } from "./activity";

/**
 * Pure aggregation over sessions. No database, no clock of its own — `now` is
 * always passed in, which is what makes every rule here testable.
 */

export type TrackedSession = {
  activityType: ActivityType;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
};

export type GroupTotals = Record<ActivityGroup, number> & { total: number };

export type DayTotal = {
  /** Local "YYYY-MM-DD". */
  dayKey: string;
  shortName: string;
  name: string;
  seconds: number;
  /** The same weekday one week earlier, for the chart's comparison bar. */
  previousSeconds: number;
  isToday: boolean;
  /** Later this week: no data yet, as opposed to a real zero. */
  isUpcoming: boolean;
};

/**
 * How long a session counts for. A finished session uses the duration the
 * server computed; a running one counts the time elapsed so far, so Today does
 * not read 0m while the learner is thirty minutes into a video.
 *
 * A session that spans midnight counts entirely toward the day it started on.
 */
export function sessionSeconds(session: TrackedSession, now: Date): number {
  if (session.endedAt) {
    return session.durationSeconds ?? elapsedSeconds(session.startedAt, session.endedAt);
  }
  return elapsedSeconds(session.startedAt, now);
}

export function totalSeconds(sessions: readonly TrackedSession[], now: Date): number {
  return sessions.reduce((sum, session) => sum + sessionSeconds(session, now), 0);
}

export function groupTotals(sessions: readonly TrackedSession[], now: Date): GroupTotals {
  const totals: GroupTotals = { input: 0, speaking: 0, writing: 0, other: 0, total: 0 };

  for (const session of sessions) {
    const seconds = sessionSeconds(session, now);
    totals[activityGroup(session.activityType)] += seconds;
    totals.total += seconds;
  }

  return totals;
}

export function sumByLocalDay(
  sessions: readonly TrackedSession[],
  timeZone: string,
  now: Date,
): Map<string, number> {
  const byDay = new Map<string, number>();

  for (const session of sessions) {
    const key = localDayKey(session.startedAt, timeZone);
    byDay.set(key, (byDay.get(key) ?? 0) + sessionSeconds(session, now));
  }

  return byDay;
}

/**
 * Seven consecutive local days starting at `weekStart`, each paired with the
 * same weekday of the previous week. Days without sessions are present with
 * zero, so the chart always has a full week of columns.
 */
export function buildWeekDays({
  sessions,
  previousWeekSessions,
  weekStart,
  timeZone,
  now,
}: {
  sessions: readonly TrackedSession[];
  previousWeekSessions: readonly TrackedSession[];
  weekStart: Date;
  timeZone: string;
  now: Date;
}): DayTotal[] {
  const byDay = sumByLocalDay(sessions, timeZone, now);
  const previousByDay = sumByLocalDay(previousWeekSessions, timeZone, now);
  const previousWeekStart = addLocalDays(weekStart, -7, timeZone);
  const todayKey = localDayKey(now, timeZone);

  return Array.from({ length: 7 }, (_, index) => {
    const dayStart = addLocalDays(weekStart, index, timeZone);
    const dayKey = localDayKey(dayStart, timeZone);
    const previousDayKey = localDayKey(
      addLocalDays(previousWeekStart, index, timeZone),
      timeZone,
    );
    const { short, long } = localWeekdayNames(dayStart, timeZone);

    return {
      dayKey,
      shortName: short,
      name: long,
      seconds: byDay.get(dayKey) ?? 0,
      previousSeconds: previousByDay.get(previousDayKey) ?? 0,
      isToday: dayKey === todayKey,
      isUpcoming: dayStart.getTime() > now.getTime() && dayKey !== todayKey,
    };
  });
}

/**
 * Change between two weeks, or null when there is nothing honest to compare
 * against. We never invent a percentage out of an empty previous week.
 */
export function weekOverWeekChange(
  currentSeconds: number,
  previousSeconds: number,
): number | null {
  if (previousSeconds <= 0) return null;
  return ((currentSeconds - previousSeconds) / previousSeconds) * 100;
}
