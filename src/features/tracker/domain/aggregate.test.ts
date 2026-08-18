import { describe, expect, it } from "vitest";
import type { ActivityType } from "./activity";
import {
  buildWeekDays,
  groupTotals,
  sessionSeconds,
  sumByLocalDay,
  totalSeconds,
  weekOverWeekChange,
  type TrackedSession,
} from "./aggregate";

const MOSCOW = "Europe/Moscow";
const NOW = new Date("2026-08-18T09:00:00Z"); // Tuesday 12:00 Moscow

function finished(
  activityType: ActivityType,
  startedAtIso: string,
  minutes: number,
): TrackedSession {
  const startedAt = new Date(startedAtIso);
  return {
    activityType,
    startedAt,
    endedAt: new Date(startedAt.getTime() + minutes * 60_000),
    durationSeconds: minutes * 60,
  };
}

function running(activityType: ActivityType, startedAtIso: string): TrackedSession {
  return {
    activityType,
    startedAt: new Date(startedAtIso),
    endedAt: null,
    durationSeconds: null,
  };
}

describe("sessionSeconds", () => {
  it("uses the stored duration for a finished session", () => {
    expect(sessionSeconds(finished("video", "2026-08-18T06:00:00Z", 30), NOW)).toBe(1800);
  });

  it("falls back to the timestamps when duration is missing", () => {
    expect(
      sessionSeconds(
        {
          activityType: "video",
          startedAt: new Date("2026-08-18T06:00:00Z"),
          endedAt: new Date("2026-08-18T06:25:00Z"),
          durationSeconds: null,
        },
        NOW,
      ),
    ).toBe(1500);
  });

  it("counts a running session up to now", () => {
    expect(sessionSeconds(running("reading", "2026-08-18T08:30:00Z"), NOW)).toBe(1800);
  });

  it("never returns a negative duration for a session starting in the future", () => {
    expect(sessionSeconds(running("reading", "2026-08-18T10:00:00Z"), NOW)).toBe(0);
  });
});

describe("totalSeconds", () => {
  it("sums finished and running sessions", () => {
    const total = totalSeconds(
      [
        finished("video", "2026-08-18T05:00:00Z", 20),
        finished("writing", "2026-08-18T06:00:00Z", 10),
        running("podcast", "2026-08-18T08:45:00Z"),
      ],
      NOW,
    );
    expect(total).toBe((20 + 10 + 15) * 60);
  });

  it("is zero for no sessions", () => {
    expect(totalSeconds([], NOW)).toBe(0);
  });
});

describe("groupTotals", () => {
  it("aggregates into the display buckets and a total", () => {
    const totals = groupTotals(
      [
        finished("video", "2026-08-18T05:00:00Z", 20),
        finished("reading", "2026-08-18T05:30:00Z", 7),
        finished("conversation", "2026-08-18T06:00:00Z", 6),
        finished("speaking", "2026-08-18T06:30:00Z", 4),
        finished("writing", "2026-08-18T07:00:00Z", 5),
        finished("other", "2026-08-18T07:30:00Z", 3),
      ],
      NOW,
    );

    expect(totals.input).toBe(27 * 60);
    expect(totals.speaking).toBe(10 * 60);
    expect(totals.writing).toBe(5 * 60);
    expect(totals.other).toBe(3 * 60);
    // "other" is excluded from the three buckets but not from total time.
    expect(totals.total).toBe(45 * 60);
  });

  it("returns zeros rather than gaps when there is nothing", () => {
    expect(groupTotals([], NOW)).toEqual({
      input: 0,
      speaking: 0,
      writing: 0,
      other: 0,
      total: 0,
    });
  });
});

describe("sumByLocalDay", () => {
  it("attributes a session to its local start day, not the UTC one", () => {
    // 21:30 UTC on the 17th is 00:30 on the 18th in Moscow.
    const byDay = sumByLocalDay([finished("video", "2026-08-17T21:30:00Z", 30)], MOSCOW, NOW);
    expect(byDay.get("2026-08-18")).toBe(1800);
    expect(byDay.has("2026-08-17")).toBe(false);
  });
});

describe("buildWeekDays", () => {
  const weekStart = new Date("2026-08-16T21:00:00Z"); // Monday 2026-08-17 in Moscow

  it("always returns seven days, Monday first", () => {
    const days = buildWeekDays({
      sessions: [],
      previousWeekSessions: [],
      weekStart,
      timeZone: MOSCOW,
      now: NOW,
    });

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.shortName)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(days.map((day) => day.dayKey)[0]).toBe("2026-08-17");
  });

  it("fills days without sessions with zero", () => {
    const days = buildWeekDays({
      sessions: [finished("video", "2026-08-17T07:00:00Z", 40)],
      previousWeekSessions: [],
      weekStart,
      timeZone: MOSCOW,
      now: NOW,
    });

    expect(days[0].seconds).toBe(2400);
    expect(days[1].seconds).toBe(0);
    expect(days[6].seconds).toBe(0);
  });

  it("marks today and distinguishes upcoming days from real zeroes", () => {
    const days = buildWeekDays({
      sessions: [],
      previousWeekSessions: [],
      weekStart,
      timeZone: MOSCOW,
      now: NOW,
    });

    expect(days.filter((day) => day.isToday).map((day) => day.dayKey)).toEqual(["2026-08-18"]);
    expect(days[0].isUpcoming).toBe(false); // yesterday: a true zero
    expect(days[1].isUpcoming).toBe(false); // today
    expect(days[2].isUpcoming).toBe(true); // rest of the week
    expect(days[6].isUpcoming).toBe(true);
  });

  it("aligns each day with the same weekday of the previous week", () => {
    const days = buildWeekDays({
      sessions: [finished("video", "2026-08-18T07:00:00Z", 20)],
      previousWeekSessions: [
        finished("video", "2026-08-11T07:00:00Z", 50), // previous Tuesday
        finished("video", "2026-08-10T07:00:00Z", 15), // previous Monday
      ],
      weekStart,
      timeZone: MOSCOW,
      now: NOW,
    });

    expect(days[0].previousSeconds).toBe(15 * 60);
    expect(days[1].seconds).toBe(20 * 60);
    expect(days[1].previousSeconds).toBe(50 * 60);
    expect(days[2].previousSeconds).toBe(0);
  });
});

describe("weekOverWeekChange", () => {
  it("computes a percentage when both weeks have time", () => {
    expect(weekOverWeekChange(272 * 60, 230 * 60)).toBeCloseTo(18.26, 1);
    expect(weekOverWeekChange(100, 200)).toBe(-50);
  });

  it("refuses to invent a comparison against an empty previous week", () => {
    expect(weekOverWeekChange(3600, 0)).toBeNull();
    expect(weekOverWeekChange(0, 0)).toBeNull();
  });
});
