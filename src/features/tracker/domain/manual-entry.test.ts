import { describe, expect, it } from "vitest";
import { localDayKey } from "@/lib/time";
import {
  completedDurationSeconds,
  MAX_MANUAL_DURATION_SECONDS,
  resolveManualWindow,
  validateManualEntry,
  type ManualEntryRaw,
} from "./manual-entry";

const MOSCOW = "Europe/Moscow";
const NOW = new Date("2026-08-18T09:00:00Z"); // Tuesday 12:00 Moscow
const CONTEXT = { timeZone: MOSCOW, now: NOW };

function raw(overrides: Partial<ManualEntryRaw> = {}): ManualEntryRaw {
  return {
    activityType: "reading",
    hours: "0",
    minutes: "20",
    date: "2026-08-18",
    sourceTitle: null,
    note: null,
    ...overrides,
  };
}

describe("validateManualEntry", () => {
  it("accepts a well-formed entry", () => {
    const result = validateManualEntry(raw(), CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.activityType).toBe("reading");
    expect(result.value.durationSeconds).toBe(1200);
  });

  it("combines hours and minutes", () => {
    const result = validateManualEntry(raw({ hours: "1", minutes: "30" }), CONTEXT);
    expect(result.ok && result.value.durationSeconds).toBe(5400);
  });

  it("treats a blank field as zero", () => {
    const result = validateManualEntry(raw({ hours: "", minutes: "45" }), CONTEXT);
    expect(result.ok && result.value.durationSeconds).toBe(2700);
  });

  it("rejects a zero duration", () => {
    const result = validateManualEntry(raw({ hours: "0", minutes: "0" }), CONTEXT);
    expect(result).toMatchObject({ ok: false, field: "duration" });
  });

  it("rejects negative and fractional durations", () => {
    expect(validateManualEntry(raw({ minutes: "-5" }), CONTEXT)).toMatchObject({
      ok: false,
      field: "duration",
    });
    expect(validateManualEntry(raw({ minutes: "12.5" }), CONTEXT)).toMatchObject({
      ok: false,
      field: "duration",
    });
    expect(validateManualEntry(raw({ minutes: "abc" }), CONTEXT)).toMatchObject({
      ok: false,
      field: "duration",
    });
  });

  it("rejects a duration longer than a day", () => {
    const result = validateManualEntry(raw({ hours: "25", minutes: "0" }), CONTEXT);
    expect(result).toMatchObject({ ok: false, field: "duration" });
    expect(MAX_MANUAL_DURATION_SECONDS).toBe(86_400);
  });

  it("rejects an unknown activity", () => {
    expect(validateManualEntry(raw({ activityType: "napping" }), CONTEXT)).toMatchObject({
      ok: false,
      field: "activityType",
    });
  });

  it("rejects a future day in the user's own timezone", () => {
    expect(validateManualEntry(raw({ date: "2026-08-19" }), CONTEXT)).toMatchObject({
      ok: false,
      field: "date",
    });
  });

  it("rejects a malformed date", () => {
    expect(validateManualEntry(raw({ date: "18-08-2026" }), CONTEXT)).toMatchObject({
      ok: false,
      field: "date",
    });
  });

  it("trims optional text and stores blanks as null", () => {
    const result = validateManualEntry(
      raw({ sourceTitle: "  Easy German  ", note: "   " }),
      CONTEXT,
    );
    expect(result.ok && result.value.sourceTitle).toBe("Easy German");
    expect(result.ok && result.value.note).toBeNull();
  });
});

describe("resolveManualWindow", () => {
  it("anchors today's entry to now, so it reads as time just spent", () => {
    const window = resolveManualWindow({
      date: "2026-08-18",
      durationSeconds: 1200,
      timeZone: MOSCOW,
      now: NOW,
    });

    expect(window?.endedAt.toISOString()).toBe(NOW.toISOString());
    expect(window?.startedAt.toISOString()).toBe("2026-08-18T08:40:00.000Z");
  });

  it("anchors an earlier day to local noon so it stays inside that day", () => {
    const window = resolveManualWindow({
      date: "2026-08-14",
      durationSeconds: 3600,
      timeZone: MOSCOW,
      now: NOW,
    });

    expect(window?.startedAt.toISOString()).toBe("2026-08-14T09:00:00.000Z");
    expect(localDayKey(window!.startedAt, MOSCOW)).toBe("2026-08-14");
    expect(localDayKey(window!.endedAt, MOSCOW)).toBe("2026-08-14");
  });

  it("keeps a long entry for an earlier day within that local day", () => {
    const window = resolveManualWindow({
      date: "2026-08-14",
      durationSeconds: 8 * 3600,
      timeZone: "America/Los_Angeles",
      now: NOW,
    });

    expect(localDayKey(window!.startedAt, "America/Los_Angeles")).toBe("2026-08-14");
    expect(localDayKey(window!.endedAt, "America/Los_Angeles")).toBe("2026-08-14");
  });
});

describe("completedDurationSeconds", () => {
  it("derives duration from timestamps rather than trusting a client", () => {
    expect(
      completedDurationSeconds(
        new Date("2026-08-18T08:00:00Z"),
        new Date("2026-08-18T08:42:30Z"),
      ),
    ).toBe(2550);
  });

  it("clamps a reversed pair to zero instead of going negative", () => {
    expect(
      completedDurationSeconds(
        new Date("2026-08-18T09:00:00Z"),
        new Date("2026-08-18T08:00:00Z"),
      ),
    ).toBe(0);
  });
});
