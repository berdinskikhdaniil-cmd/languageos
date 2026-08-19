import type { AppErrorCode } from "@/lib/errors";
import { elapsedSeconds, localDayKey, localNoonFromDayKey } from "@/lib/time";
import { type ActivityType, isActivityType } from "./activity";

/**
 * Validation and timestamp derivation for a manually logged session.
 *
 * Pure: it takes the raw strings a form produces plus the user's timezone and
 * the current instant, and returns either a ready-to-insert record or the code
 * for what is wrong, next to the field it is wrong in.
 *
 * A code and not a sentence. This function has no idea which language the
 * person filling the form reads, and the sheet that shows the answer does.
 */

export const MAX_MANUAL_DURATION_SECONDS = 24 * 60 * 60;

export type ManualEntryRaw = {
  activityType: string | null;
  hours: string | null;
  minutes: string | null;
  date: string | null;
  sourceTitle: string | null;
  note: string | null;
};

export type ManualEntry = {
  activityType: ActivityType;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  sourceTitle: string | null;
  note: string | null;
};

export type ManualEntryField = "activityType" | "duration" | "date";

export type ManualEntryResult =
  | { ok: true; value: ManualEntry }
  | { ok: false; field: ManualEntryField; code: AppErrorCode };

function parseCount(value: string | null): number | null {
  if (value === null || value.trim() === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function trimToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Where a manual entry sits on the clock.
 *
 * Logging time for today anchors to now, so it reads as "the half hour I just
 * spent". Logging an earlier day anchors to local noon, which keeps the session
 * safely inside that local day whatever the timezone offset does.
 */
export function resolveManualWindow({
  date,
  durationSeconds,
  timeZone,
  now,
}: {
  date: string;
  durationSeconds: number;
  timeZone: string;
  now: Date;
}): { startedAt: Date; endedAt: Date } | null {
  if (date === localDayKey(now, timeZone)) {
    return { startedAt: new Date(now.getTime() - durationSeconds * 1000), endedAt: now };
  }

  const noon = localNoonFromDayKey(date, timeZone);
  if (!noon) return null;

  return { startedAt: noon, endedAt: new Date(noon.getTime() + durationSeconds * 1000) };
}

export function validateManualEntry(
  raw: ManualEntryRaw,
  { timeZone, now }: { timeZone: string; now: Date },
): ManualEntryResult {
  if (!isActivityType(raw.activityType)) {
    return { ok: false, field: "activityType", code: "ACTIVITY_REQUIRED" };
  }

  const hours = parseCount(raw.hours);
  const minutes = parseCount(raw.minutes);
  if (hours === null || minutes === null) {
    return { ok: false, field: "duration", code: "DURATION_NOT_WHOLE" };
  }

  const durationSeconds = hours * 3600 + minutes * 60;
  if (durationSeconds <= 0) {
    return { ok: false, field: "duration", code: "DURATION_REQUIRED" };
  }
  if (durationSeconds > MAX_MANUAL_DURATION_SECONDS) {
    return { ok: false, field: "duration", code: "DURATION_TOO_LONG" };
  }

  const date = raw.date?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, field: "date", code: "DATE_REQUIRED" };
  }
  if (date > localDayKey(now, timeZone)) {
    return { ok: false, field: "date", code: "DATE_IN_FUTURE" };
  }

  const window = resolveManualWindow({ date, durationSeconds, timeZone, now });
  if (!window) {
    return { ok: false, field: "date", code: "DATE_REQUIRED" };
  }

  return {
    ok: true,
    value: {
      activityType: raw.activityType,
      startedAt: window.startedAt,
      endedAt: window.endedAt,
      durationSeconds,
      sourceTitle: trimToNull(raw.sourceTitle),
      note: trimToNull(raw.note),
    },
  };
}

/** Duration of a finished session, always recomputed from its timestamps. */
export function completedDurationSeconds(startedAt: Date, endedAt: Date): number {
  return elapsedSeconds(startedAt, endedAt);
}
