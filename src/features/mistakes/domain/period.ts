import { addLocalDays, startOfLocalDay, type Interval } from "@/lib/time";

/**
 * The three windows the mistake engine counts in.
 *
 * Every boundary is a local midnight in the learner's own zone, because a day
 * is a thing only their zone can define — a mistake made at 23:40 in Amsterdam
 * belongs to that day, not to the UTC one the server happens to be in.
 *
 * The windows are inclusive of today: "last 30 days" is today plus the previous
 * twenty-nine local days, which is what somebody means when they say it.
 */

export const MISTAKE_PERIODS = ["30d", "90d", "all"] as const;

export type MistakePeriod = (typeof MISTAKE_PERIODS)[number];

export const DEFAULT_MISTAKE_PERIOD: MistakePeriod = "30d";

/** null for "all time", which has no length and therefore no boundary. */
export function periodDays(period: MistakePeriod): number | null {
  return period === "30d" ? 30 : period === "90d" ? 90 : null;
}

/**
 * A URL is a string somebody can type. Anything unrecognised falls back to the
 * default rather than erroring — a bad query parameter is not a broken page.
 */
export function parseMistakePeriod(value: string | string[] | undefined): MistakePeriod {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (MISTAKE_PERIODS as readonly string[]).includes(candidate ?? "")
    ? (candidate as MistakePeriod)
    : DEFAULT_MISTAKE_PERIOD;
}

/**
 * Half-open [from, to) over local days, or null when the period is all of time.
 *
 * `to` is the start of tomorrow rather than `now`, so everything logged today
 * is inside the window regardless of what time it is.
 */
export function periodWindow(
  period: MistakePeriod,
  now: Date,
  timeZone: string,
): Interval | null {
  const days = periodDays(period);
  if (days === null) return null;

  const startOfToday = startOfLocalDay(now, timeZone);

  return {
    from: addLocalDays(startOfToday, -(days - 1), timeZone),
    to: addLocalDays(startOfToday, 1, timeZone),
  };
}

/**
 * The same length again, immediately before the window — what a trend is
 * compared against. Null for all time, which has nothing before it.
 */
export function previousPeriodWindow(
  period: MistakePeriod,
  now: Date,
  timeZone: string,
): Interval | null {
  const days = periodDays(period);
  const window = periodWindow(period, now, timeZone);
  if (days === null || window === null) return null;

  return { from: addLocalDays(window.from, -days, timeZone), to: window.from };
}

/**
 * The earliest instant a query has to reach back to in order to answer
 * everything on the screen: the start of the *previous* window, because the
 * trend needs it. Null means "no lower bound".
 *
 * One number, so one read serves the page. Splitting a fetched set by date in
 * the domain is cheaper and easier to test than four more round trips.
 */
export function earliestInstantToLoad(
  period: MistakePeriod,
  now: Date,
  timeZone: string,
): Date | null {
  return previousPeriodWindow(period, now, timeZone)?.from ?? null;
}

/** Whether an instant falls inside a window. A null window is all of time. */
export function withinWindow(instant: Date, window: Interval | null): boolean {
  if (!window) return true;
  const time = instant.getTime();
  return time >= window.from.getTime() && time < window.to.getTime();
}

export function filterToWindow<T extends { createdAt: Date }>(
  items: readonly T[],
  window: Interval | null,
): T[] {
  return items.filter((item) => withinWindow(item.createdAt, window));
}
