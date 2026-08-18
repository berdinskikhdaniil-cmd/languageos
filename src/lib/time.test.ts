import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDayInterval,
  localDayKey,
  localNoonFromDayKey,
  localWeekInterval,
  startOfLocalWeek,
} from "./time";

const MOSCOW = "Europe/Moscow"; // UTC+3, no DST
const LOS_ANGELES = "America/Los_Angeles"; // UTC-7/-8, has DST

describe("localDayKey", () => {
  it("uses the zone, not the server clock", () => {
    // 22:30 UTC is already the next day in Moscow, still the same day in LA.
    const instant = new Date("2026-08-17T22:30:00Z");
    expect(localDayKey(instant, MOSCOW)).toBe("2026-08-18");
    expect(localDayKey(instant, LOS_ANGELES)).toBe("2026-08-17");
    expect(localDayKey(instant, "UTC")).toBe("2026-08-17");
  });
});

describe("localDayInterval", () => {
  it("covers exactly the local day", () => {
    const { from, to } = localDayInterval(new Date("2026-08-18T09:00:00Z"), MOSCOW);
    expect(from.toISOString()).toBe("2026-08-17T21:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-18T21:00:00.000Z");
  });

  it("is half-open, so midnight belongs to the following day", () => {
    const { to } = localDayInterval(new Date("2026-08-18T09:00:00Z"), MOSCOW);
    const next = localDayInterval(to, MOSCOW);
    expect(next.from.getTime()).toBe(to.getTime());
  });
});

describe("startOfLocalWeek", () => {
  it("starts on Monday", () => {
    // 2026-08-18 is a Tuesday.
    const weekStart = startOfLocalWeek(new Date("2026-08-18T09:00:00Z"), MOSCOW);
    expect(localDayKey(weekStart, MOSCOW)).toBe("2026-08-17");
  });

  it("does not roll back a week when it is already Monday", () => {
    const weekStart = startOfLocalWeek(new Date("2026-08-17T09:00:00Z"), MOSCOW);
    expect(localDayKey(weekStart, MOSCOW)).toBe("2026-08-17");
  });
});

describe("localWeekInterval", () => {
  it("spans seven local days", () => {
    const { from, to } = localWeekInterval(new Date("2026-08-18T09:00:00Z"), MOSCOW);
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("addLocalDays", () => {
  it("keeps local midnight across a DST change", () => {
    // US DST ends on 2026-11-01; that local day is 25 hours long.
    const before = new Date("2026-10-31T07:00:00Z"); // local midnight in LA
    expect(localDayKey(before, LOS_ANGELES)).toBe("2026-10-31");

    const twoDaysLater = addLocalDays(before, 2, LOS_ANGELES);
    expect(localDayKey(twoDaysLater, LOS_ANGELES)).toBe("2026-11-02");
    // Not simply 48 hours: the extra hour is real.
    expect(twoDaysLater.getTime() - before.getTime()).toBe(49 * 60 * 60 * 1000);
  });
});

describe("localNoonFromDayKey", () => {
  it("resolves a form date to local noon", () => {
    const noon = localNoonFromDayKey("2026-08-14", MOSCOW);
    expect(noon?.toISOString()).toBe("2026-08-14T09:00:00.000Z");
    expect(localDayKey(noon!, MOSCOW)).toBe("2026-08-14");
  });

  it("rejects malformed input", () => {
    expect(localNoonFromDayKey("14/08/2026", MOSCOW)).toBeNull();
    expect(localNoonFromDayKey("", MOSCOW)).toBeNull();
  });
});
