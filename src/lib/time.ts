import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInSeconds, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { DEFAULT_UI_LANGUAGE, intlLocale, type UiLanguage } from "./i18n/locale";
import { getMessages } from "./i18n/messages";

/**
 * Day and week boundaries, always computed in an explicit IANA timezone.
 *
 * The server runs in UTC and the learner does not. Every function here takes
 * the zone as an argument, so no feature code ever falls back to the server's
 * idea of "today". Returned values are plain UTC instants, ready for Postgres.
 *
 * The two functions that produce words rather than instants take the interface
 * language as well. A zone and a language are separate questions — somebody in
 * Amsterdam may read Russian — so neither is ever inferred from the other.
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

/** Local midnight on the first of the month containing `instant`. */
export function startOfLocalMonth(instant: Date, timeZone: string): Date {
  return new Date(startOfMonth(new TZDate(instant, timeZone)).getTime());
}

/** Calendar months, so the result is still local midnight on a first. */
export function addLocalMonths(instant: Date, months: number, timeZone: string): Date {
  return new Date(addMonths(new TZDate(instant, timeZone), months).getTime());
}

/** "2026-08" for the local month containing `instant`. Stable group key. */
export function localMonthKey(instant: Date, timeZone: string): string {
  const zoned = new TZDate(instant, timeZone);
  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A short month for a chart axis: "Aug" / "авг.", with the year added only when
 * it is not the current one — the same rule `localDateLabel` follows, and for
 * the same reason: the common case should stay short enough to fit under a bar.
 */
export function localMonthLabel(
  instant: Date,
  timeZone: string,
  now: Date,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): string {
  const sameYear =
    localMonthKey(instant, timeZone).slice(0, 4) === localMonthKey(now, timeZone).slice(0, 4);

  return new Intl.DateTimeFormat(intlLocale(language), {
    month: "short",
    timeZone,
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(instant);
}

/**
 * A short day for a chart axis: "19 Aug" / "19 авг." — the date without the
 * relative words `localDateLabel` uses. An axis label saying "Today" under a
 * column would be read as a category rather than as a date.
 */
export function localShortDateLabel(
  instant: Date,
  timeZone: string,
  now: Date,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): string {
  const sameYear = localDayKey(instant, timeZone).slice(0, 4) === localDayKey(now, timeZone).slice(0, 4);

  return new Intl.DateTimeFormat(intlLocale(language), {
    day: "numeric",
    month: "short",
    timeZone,
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(instant);
}

/** "2026-08-18" for the local day containing `instant`. Stable sort/group key. */
export function localDayKey(instant: Date, timeZone: string): string {
  const zoned = new TZDate(instant, timeZone);
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${zoned.getFullYear()}-${month}-${day}`;
}

/**
 * Local weekday name: `{ short: "Mon", long: "Monday" }`, or `{ short: "пн",
 * long: "понедельник" }`.
 *
 * Both come from `Intl`, so the abbreviation is the one the language actually
 * uses rather than the first three letters of the long form.
 */
export function localWeekdayNames(
  instant: Date,
  timeZone: string,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): { short: string; long: string } {
  const locale = intlLocale(language);

  return {
    short: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(instant),
    long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(instant),
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

/**
 * A short, human date for a list: "Today", "Yesterday", "17 Aug", "3 Sept 2025"
 * — or "Сегодня", "Вчера", "17 авг.", "3 сент. 2025 г.".
 *
 * Timezone-dependent, so it lives here rather than in lib/format: whether
 * something happened "today" is a question only the learner's own zone can
 * answer, and the server's is not it. The year appears only when it differs
 * from the current one, which keeps the common case short.
 *
 * The two relative words come from the dictionary; everything else comes from
 * `Intl`, including where the day sits relative to the month and whether the
 * language writes a marker after the year.
 */
export function localDateLabel(
  instant: Date,
  timeZone: string,
  now: Date,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): string {
  const key = localDayKey(instant, timeZone);
  const todayKey = localDayKey(now, timeZone);
  const { dates } = getMessages(language);

  if (key === todayKey) return dates.today;
  if (key === localDayKey(addLocalDays(now, -1, timeZone), timeZone)) return dates.yesterday;

  return new Intl.DateTimeFormat(intlLocale(language), {
    day: "numeric",
    month: "short",
    timeZone,
    ...(key.slice(0, 4) === todayKey.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(instant);
}

/**
 * How a stretch of time is cut up for a chart.
 *
 * The three periods a person would actually use describing the same span out
 * loud. Which one a given chart picks is a product decision and lives with the
 * chart; turning an instant into the period that contains it is timezone
 * arithmetic and lives here, with everything else that must never be computed
 * in the server's own zone.
 */
export const BUCKET_GRANULARITIES = ["day", "week", "month"] as const;

export type BucketGranularity = (typeof BUCKET_GRANULARITIES)[number];

/** Local midnight the period containing `instant` opens on. */
export function bucketStart(
  instant: Date,
  granularity: BucketGranularity,
  timeZone: string,
): Date {
  if (granularity === "day") return startOfLocalDay(instant, timeZone);
  if (granularity === "week") return startOfLocalWeek(instant, timeZone);
  return startOfLocalMonth(instant, timeZone);
}

/** A stable group key for the period containing `instant`. */
export function bucketKey(
  instant: Date,
  granularity: BucketGranularity,
  timeZone: string,
): string {
  if (granularity === "month") return localMonthKey(instant, timeZone);
  return localDayKey(bucketStart(instant, granularity, timeZone), timeZone);
}

/** The next period along. Calendar arithmetic, so DST never shifts a boundary. */
export function nextBucketStart(
  start: Date,
  granularity: BucketGranularity,
  timeZone: string,
): Date {
  if (granularity === "day") return addLocalDays(start, 1, timeZone);
  if (granularity === "week") return addLocalDays(start, 7, timeZone);
  return addLocalMonths(start, 1, timeZone);
}

/**
 * Every period start between two instants, including the empty ones.
 *
 * The empty ones are the point. A chart drawn only from periods that have
 * something in them would space a fortnight's silence exactly like a single day
 * off, which is the opposite of what somebody looking at their own consistency
 * needs to see.
 *
 * Bounded rather than open-ended: running away here would mean a chart with
 * thousands of columns, so the sequence stops at `limit` and callers choose a
 * granularity that keeps them well inside it.
 */
export function bucketStartsBetween({
  from,
  to,
  granularity,
  timeZone,
  limit = 400,
}: {
  from: Date;
  to: Date;
  granularity: BucketGranularity;
  timeZone: string;
  limit?: number;
}): Date[] {
  const starts: Date[] = [];
  let cursor = bucketStart(from, granularity, timeZone);

  while (cursor.getTime() < to.getTime() && starts.length < limit) {
    starts.push(cursor);
    cursor = nextBucketStart(cursor, granularity, timeZone);
  }

  return starts;
}

export function elapsedSeconds(from: Date, to: Date): number {
  return Math.max(0, differenceInSeconds(to, from));
}
