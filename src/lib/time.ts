import { TZDate } from "@date-fns/tz";
import { addDays, differenceInSeconds, startOfDay, startOfWeek } from "date-fns";

/**
 * Day and week boundaries, always computed in an explicit IANA timezone.
 *
 * The server runs in UTC and the learner does not. Every function here takes
 * the zone as an argument, so no feature code ever falls back to the server's
 * idea of "today". Returned values are plain UTC instants, ready for Postgres.
 */

export type Interval = { from: Date; to: Date };

/** Midnight that starts the local day containing `instant`. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  return new Date(startOfDay(new TZDate(instant, timeZone)).getTime());
}

/** Midnight that starts the local Monday of the week containing `instant`. */
export function startOfLocalWeek(instant: Date, timeZone: string): Date {
  return new Date(
    startOfWeek(new TZDate(instant, timeZone), { weekStartsOn: 1 }).getTime(),
  );
}

/** Half-open [from, to) covering the local day containing `instant`. */
export function localDayInterval(instant: Date, timeZone: string): Interval {
  const from = startOfLocalDay(instant, timeZone);
  return { from, to: addLocalDays(from, 1, timeZone) };
}

/** Half-open [from, to) covering the local week containing `instant`. */
export function localWeekInterval(instant: Date, timeZone: string): Interval {
  const from = startOfLocalWeek(instant, timeZone);
  return { from, to: addLocalDays(from, 7, timeZone) };
}

/**
 * Adds whole local days. Calendar arithmetic, not 24-hour arithmetic: across a
 * DST change the result is still local midnight.
 */
export function addLocalDays(instant: Date, days: number, timeZone: string): Date {
  return new Date(addDays(new TZDate(instant, timeZone), days).getTime());
}

/** "2026-08-18" for the local day containing `instant`. Stable sort/group key. */
export function localDayKey(instant: Date, timeZone: string): string {
  const zoned = new TZDate(instant, timeZone);
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${zoned.getFullYear()}-${month}-${day}`;
}

/** Local weekday name, e.g. { short: "Mon", long: "Monday" }. */
export function localWeekdayNames(
  instant: Date,
  timeZone: string,
): { short: string; long: string } {
  return {
    short: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(instant),
    long: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone }).format(instant),
  };
}

/** Parses a "YYYY-MM-DD" form value into local noon on that day. */
export function localNoonFromDayKey(dayKey: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;

  const [, year, month, day] = match;
  const zoned = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    12,
    0,
    0,
    0,
    timeZone,
  );
  const instant = new Date(zoned.getTime());
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function elapsedSeconds(from: Date, to: Date): number {
  return Math.max(0, differenceInSeconds(to, from));
}
