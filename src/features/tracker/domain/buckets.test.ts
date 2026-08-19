import { describe, expect, it } from "vitest";
import { localDayKey, type Interval } from "@/lib/time";
import type { ActivityType } from "./activity";
import type { TrackedSession } from "./aggregate";
import {
  bucketSessions,
  granularityForSpan,
  percentageShares,
  summarizeActivity,
} from "./buckets";

/** Amsterdam is UTC+2 in August: a local day starts at 22:00 UTC the day before. */
const ZONE = "Europe/Amsterdam";
const NOW = new Date("2026-08-19T09:00:00Z");

function session(
  startedAt: string,
  minutes: number,
  activityType: ActivityType = "video",
): TrackedSession {
  const started = new Date(startedAt);
  return {
    activityType,
    startedAt: started,
    endedAt: new Date(started.getTime() + minutes * 60_000),
    durationSeconds: minutes * 60,
  };
}

function window(from: string, to: string): Interval {
  return { from: new Date(from), to: new Date(to) };
}

/** The 30-day window Progress uses, in local terms. */
const LAST_30 = window("2026-07-20T22:00:00Z", "2026-08-19T22:00:00Z");

describe("granularityForSpan", () => {
  it("uses days for a month, weeks for a season, months beyond", () => {
    expect(granularityForSpan(1)).toBe("day");
    expect(granularityForSpan(30)).toBe("day");
    expect(granularityForSpan(31)).toBe("day");
    expect(granularityForSpan(32)).toBe("week");
    expect(granularityForSpan(90)).toBe("week");
    expect(granularityForSpan(182)).toBe("week");
    expect(granularityForSpan(183)).toBe("month");
    expect(granularityForSpan(2000)).toBe("month");
  });
});

describe("bucketSessions", () => {
  it("draws one bucket per day, including the empty ones", () => {
    const buckets = bucketSessions({
      sessions: [session("2026-08-19T08:00:00Z", 30)],
      window: LAST_30,
      granularity: "day",
      timeZone: ZONE,
      now: NOW,
      language: "en",
    });

    expect(buckets).toHaveLength(30);
    // A fortnight of silence must look like a fortnight, not like one gap.
    expect(buckets.filter((bucket) => bucket.seconds === 0)).toHaveLength(29);
    expect(buckets[buckets.length - 1].seconds).toBe(1800);
  });

  it("splits a bucket into the tracker's own groups", () => {
    const [bucket] = bucketSessions({
      sessions: [
        session("2026-08-19T08:00:00Z", 30, "video"),
        session("2026-08-19T09:00:00Z", 10, "podcast"),
        session("2026-08-19T10:00:00Z", 20, "conversation"),
        session("2026-08-19T11:00:00Z", 5, "writing"),
        session("2026-08-19T12:00:00Z", 15, "other"),
      ],
      window: window("2026-08-18T22:00:00Z", "2026-08-19T22:00:00Z"),
      granularity: "day",
      timeZone: ZONE,
      now: NOW,
      language: "en",
    });

    expect(bucket.byGroup).toEqual({
      input: 40 * 60,
      speaking: 20 * 60,
      writing: 5 * 60,
      other: 15 * 60,
    });
    // `other` is language time: the bar's height is the total, all four of them.
    expect(bucket.seconds).toBe(80 * 60);
  });

  it("files a session by the local day it started on, not the UTC one", () => {
    // 22:30 UTC is 00:30 the next day in Amsterdam.
    const lateEvening = session("2026-08-18T22:30:00Z", 20);

    const [bucket] = bucketSessions({
      sessions: [lateEvening],
      window: window("2026-08-18T22:00:00Z", "2026-08-19T22:00:00Z"),
      granularity: "day",
      timeZone: ZONE,
      now: NOW,
      language: "en",
    });

    expect(bucket.key).toBe("2026-08-19");
    expect(bucket.seconds).toBe(1200);
    expect(localDayKey(lateEvening.startedAt, ZONE)).toBe("2026-08-19");
  });

  it("counts a running session the way the tracker counts it", () => {
    const running: TrackedSession = {
      activityType: "reading",
      startedAt: new Date("2026-08-19T08:30:00Z"),
      endedAt: null,
      durationSeconds: null,
    };

    const [bucket] = bucketSessions({
      sessions: [running],
      window: window("2026-08-18T22:00:00Z", "2026-08-19T22:00:00Z"),
      granularity: "day",
      timeZone: ZONE,
      now: NOW,
      language: "en",
    });

    // Thirty minutes elapsed at `now`, not zero and not a stored duration.
    expect(bucket.seconds).toBe(1800);
  });

  it("groups into local weeks that start on Monday", () => {
    const buckets = bucketSessions({
      sessions: [
        session("2026-08-17T08:00:00Z", 30), // Monday
        session("2026-08-19T08:00:00Z", 30), // Wednesday, same week
      ],
      window: window("2026-08-16T22:00:00Z", "2026-08-23T22:00:00Z"),
      granularity: "week",
      timeZone: ZONE,
      now: NOW,
      language: "en",
    });

    expect(buckets).toHaveLength(1);
    expect(buckets[0].seconds).toBe(3600);
  });

  it("groups into calendar months", () => {
    const buckets = bucketSessions({
      sessions: [
        session("2026-06-10T08:00:00Z", 30),
        session("2026-06-25T08:00:00Z", 30),
        session("2026-08-01T08:00:00Z", 15),
      ],
      window: window("2026-05-31T22:00:00Z", "2026-08-31T22:00:00Z"),
      granularity: "month",
      timeZone: ZONE,
      now: NOW,
      language: "en",
    });

    expect(buckets.map((bucket) => bucket.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(buckets.map((bucket) => bucket.seconds)).toEqual([3600, 0, 900]);
  });

  it("labels buckets in the reader's language", () => {
    const options = {
      sessions: [],
      window: window("2026-08-18T22:00:00Z", "2026-08-19T22:00:00Z"),
      granularity: "day" as const,
      timeZone: ZONE,
      now: NOW,
    };

    expect(bucketSessions({ ...options, language: "en" })[0].label).toBe("19 Aug");
    expect(bucketSessions({ ...options, language: "ru" })[0].label).toContain("авг");
  });
});

describe("summarizeActivity", () => {
  const sessions = [
    session("2026-08-19T08:00:00Z", 30),
    session("2026-08-19T12:00:00Z", 20), // same local day
    session("2026-08-15T08:00:00Z", 40),
  ];

  it("counts local days with study time, never sessions", () => {
    const summary = summarizeActivity({ sessions, window: LAST_30, timeZone: ZONE, now: NOW });

    expect(summary.activeDays).toBe(2);
    expect(summary.seconds).toBe(90 * 60);
    expect(summary.totalDays).toBe(30);
  });

  it("averages over active days rather than over the window", () => {
    const summary = summarizeActivity({ sessions, window: LAST_30, timeZone: ZONE, now: NOW });
    // 90 minutes over two days studied, not over thirty days in the window.
    expect(summary.averageSecondsPerActiveDay).toBe(45 * 60);
  });

  it("answers zero rather than dividing by no days at all", () => {
    const summary = summarizeActivity({
      sessions: [],
      window: LAST_30,
      timeZone: ZONE,
      now: NOW,
    });

    expect(summary).toMatchObject({ seconds: 0, activeDays: 0, averageSecondsPerActiveDay: 0 });
  });

  it("counts a late-evening session towards the learner's own day", () => {
    const summary = summarizeActivity({
      sessions: [session("2026-08-18T22:30:00Z", 20), session("2026-08-19T08:00:00Z", 20)],
      window: LAST_30,
      timeZone: ZONE,
      now: NOW,
    });

    // Both are the 19th locally, so this is one active day and not two.
    expect(summary.activeDays).toBe(1);
  });
});

describe("percentageShares", () => {
  it("adds up to a hundred where naive rounding would not", () => {
    const shares = percentageShares([1, 1, 1]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it("keeps the proportions", () => {
    expect(percentageShares([6300, 2200, 1500])).toEqual([63, 22, 15]);
  });

  it("gives zeroes rather than inventing shares of nothing", () => {
    expect(percentageShares([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("is deterministic when remainders tie", () => {
    expect(percentageShares([1, 1, 1])).toEqual(percentageShares([1, 1, 1]));
  });
});
