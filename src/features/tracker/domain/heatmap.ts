import { addLocalDays, localDayKey, startOfLocalWeek } from "@/lib/time";
import { sessionSeconds, type TrackedSession } from "./aggregate";

/**
 * Twelve weeks of local days, shaded by how long was studied on each.
 *
 * The one chart on the screen that is about the *shape* of a habit rather than
 * its size: a fortnight of silence next to a fortnight of daily practice is
 * obvious here and invisible in a total. It is deliberately small — twelve
 * weeks, not a year — because a year is 365 cells and a phone is 360 points
 * wide, and the desktop version of this idea is unreadable when squeezed onto
 * one.
 *
 * Every boundary is a local day in the learner's own zone. A session logged at
 * 23:40 belongs to that evening, and the server's idea of the date is not
 * consulted anywhere.
 */

/** What fits legibly across a phone, at seven rows of one week each. */
export const HEATMAP_WEEKS = 12;

/** How many shades a day can take, ignoring "nothing at all". */
export const HEATMAP_LEVELS = 4;

export type HeatmapDay = {
  /** Local "YYYY-MM-DD". */
  dayKey: string;
  startsAt: Date;
  seconds: number;
  /** 0 for a day with nothing on it, then 1–4. */
  level: number;
  /** A day later this week: no data yet, as opposed to a real zero. */
  isFuture: boolean;
  isToday: boolean;
};

export type HeatmapView = {
  /** Twelve weeks, Monday first, oldest first. Each is seven days. */
  weeks: HeatmapDay[][];
  /** Days with any study time on them, inside the grid and not in the future. */
  activeDays: number;
  /** Days the grid actually covers so far — the honest denominator. */
  observedDays: number;
  from: Date;
  /** Exclusive: local midnight after the last day drawn. */
  to: Date;
};

/**
 * Shade thresholds, as a fraction of the learner's own daily goal.
 *
 * Relative to the goal rather than to their busiest day, so the scale means the
 * same thing every time it is drawn. Scaling to the maximum would repaint the
 * whole grid because of one long Sunday, and a day that was "dark green" last
 * week would be pale this week without the learner having done anything
 * differently.
 */
const LEVEL_THRESHOLDS = [0.25, 0.6, 1];

export function heatmapLevel(seconds: number, dailyGoalMinutes: number): number {
  if (seconds <= 0) return 0;

  const goalSeconds = Math.max(1, dailyGoalMinutes * 60);
  const ratio = seconds / goalSeconds;

  for (const [index, threshold] of LEVEL_THRESHOLDS.entries()) {
    if (ratio < threshold) return index + 1;
  }

  return HEATMAP_LEVELS;
}

export function buildHeatmap({
  sessions,
  timeZone,
  now,
  dailyGoalMinutes,
  weeks = HEATMAP_WEEKS,
}: {
  sessions: readonly TrackedSession[];
  timeZone: string;
  now: Date;
  dailyGoalMinutes: number;
  weeks?: number;
}): HeatmapView {
  const byDay = new Map<string, number>();

  for (const session of sessions) {
    const seconds = sessionSeconds(session, now);
    if (seconds <= 0) continue;

    const key = localDayKey(session.startedAt, timeZone);
    byDay.set(key, (byDay.get(key) ?? 0) + seconds);
  }

  // Whole weeks, ending with the one today is in, so the last column is the
  // current week and the grid never starts mid-week.
  const from = addLocalDays(startOfLocalWeek(now, timeZone), -(weeks - 1) * 7, timeZone);
  const todayKey = localDayKey(now, timeZone);

  let activeDays = 0;
  let observedDays = 0;

  const grid = Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday): HeatmapDay => {
      const startsAt = addLocalDays(from, week * 7 + weekday, timeZone);
      const dayKey = localDayKey(startsAt, timeZone);
      const seconds = byDay.get(dayKey) ?? 0;
      const isToday = dayKey === todayKey;
      const isFuture = startsAt.getTime() > now.getTime() && !isToday;

      if (!isFuture) {
        observedDays += 1;
        if (seconds > 0) activeDays += 1;
      }

      return {
        dayKey,
        startsAt,
        seconds,
        level: isFuture ? 0 : heatmapLevel(seconds, dailyGoalMinutes),
        isFuture,
        isToday,
      };
    }),
  );

  return {
    weeks: grid,
    activeDays,
    observedDays,
    from,
    to: addLocalDays(from, weeks * 7, timeZone),
  };
}
