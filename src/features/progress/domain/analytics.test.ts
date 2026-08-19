import { describe, expect, it } from "vitest";
import { occurrence } from "@/features/mistakes/domain/fixtures";
import {
  periodWindow,
  previousPeriodWindow,
  type MistakePeriod,
} from "@/features/mistakes/domain/period";
import type { MistakeWorkload } from "@/features/mistakes/domain/workload";
import type { ActivityType } from "@/features/tracker/domain/activity";
import type { TrackedSession } from "@/features/tracker/domain/aggregate";
import { buildProgressAnalytics } from "./analytics";

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

function build({
  period = "30d" as MistakePeriod,
  sessions = [] as TrackedSession[],
  workload = { occurrences: [], writing: [], speaking: [] } as MistakeWorkload,
} = {}) {
  return buildProgressAnalytics({
    period,
    window: periodWindow(period, NOW, ZONE),
    previousWindow: previousPeriodWindow(period, NOW, ZONE),
    sessions,
    workload,
    timeZone: ZONE,
    now: NOW,
    language: "en",
    dailyGoalMinutes: 45,
  });
}

describe("the selected period drives every section", () => {
  const sessions = [
    session("2026-08-18T08:00:00Z", 30),
    session("2026-06-01T08:00:00Z", 60), // outside 30 days, inside 90
  ];

  it("counts only the window's own sessions", () => {
    expect(build({ period: "30d", sessions }).activity.summary.seconds).toBe(30 * 60);
    expect(build({ period: "90d", sessions }).activity.summary.seconds).toBe(90 * 60);
    expect(build({ period: "all", sessions }).activity.summary.seconds).toBe(90 * 60);
  });

  it("changes granularity with the window rather than drawing a hundred bars", () => {
    expect(build({ period: "30d", sessions }).granularity).toBe("day");
    expect(build({ period: "30d", sessions }).activity.buckets).toHaveLength(30);
    expect(build({ period: "90d", sessions }).granularity).toBe("week");
    expect(build({ period: "90d", sessions }).activity.buckets.length).toBeLessThanOrEqual(14);
  });
});

describe("all time", () => {
  it("starts at the learner's own first day, not at the epoch", () => {
    const analytics = build({
      period: "all",
      sessions: [session("2026-05-04T08:00:00Z", 30)],
    });

    // May to August is a season, so weeks — and a bounded number of them.
    expect(analytics.window.from.toISOString()).toBe("2026-05-03T22:00:00.000Z");
    expect(analytics.activity.buckets.length).toBeLessThan(40);
  });

  it("is a single empty day when there is nothing at all", () => {
    const analytics = build({ period: "all" });

    expect(analytics.hasAnything).toBe(false);
    expect(analytics.activity.buckets).toHaveLength(1);
    expect(analytics.activity.summary.seconds).toBe(0);
  });

  it("takes its start from reviewed work when that came first", () => {
    const analytics = build({
      period: "all",
      sessions: [session("2026-08-18T08:00:00Z", 30)],
      workload: {
        occurrences: [],
        writing: [
          { entryId: "old", createdAt: new Date("2026-07-01T10:00:00Z"), wordCount: 200 },
        ],
        speaking: [],
      },
    });

    expect(analytics.window.from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
});

describe("practice balance", () => {
  it("splits real time into shares that add up to a hundred", () => {
    const analytics = build({
      sessions: [
        session("2026-08-18T08:00:00Z", 63, "video"),
        session("2026-08-18T10:00:00Z", 22, "conversation"),
        session("2026-08-18T12:00:00Z", 15, "writing"),
      ],
    });

    expect(analytics.balance.shares.map((share) => share.percent)).toEqual([63, 22, 15]);
    expect(analytics.balance.shares.map((share) => share.group)).toEqual([
      "input",
      "speaking",
      "writing",
    ]);
    expect(analytics.balance.totalSeconds).toBe(100 * 60);
  });

  it("gives `other` a row only when there is some of it", () => {
    const withoutOther = build({ sessions: [session("2026-08-18T08:00:00Z", 30, "video")] });
    expect(withoutOther.balance.shares).toHaveLength(3);

    const withOther = build({
      sessions: [
        session("2026-08-18T08:00:00Z", 30, "video"),
        session("2026-08-18T10:00:00Z", 10, "other"),
      ],
    });
    expect(withOther.balance.shares).toHaveLength(4);
    // It is language time, so it is in the total and in the shares.
    expect(withOther.balance.totalSeconds).toBe(40 * 60);
    expect(withOther.balance.shares.reduce((sum, share) => sum + share.percent, 0)).toBe(100);
  });

  it("invents no percentages out of an empty period", () => {
    const analytics = build();
    expect(analytics.balance.totalSeconds).toBe(0);
    expect(analytics.balance.shares.every((share) => share.percent === 0)).toBe(true);
  });
});

describe("the quality series", () => {
  it("never borrows writing from before the window it claims to show", () => {
    const analytics = build({
      period: "30d",
      workload: {
        occurrences: [],
        writing: [
          // Inside the window.
          { entryId: "in", createdAt: new Date("2026-08-11T10:00:00Z"), wordCount: 400 },
          // In the week before the window opened — the workload holds it for
          // the previous-period comparison, and the chart must not draw it.
          { entryId: "out", createdAt: new Date("2026-07-06T10:00:00Z"), wordCount: 400 },
        ],
        speaking: [],
      },
    });

    expect(analytics.quality.points).toHaveLength(1);
    expect(analytics.quality.points[0].words).toBe(400);
  });
});

describe("hasAnything", () => {
  it("is true for study time with nothing reviewed", () => {
    expect(build({ sessions: [session("2026-08-18T08:00:00Z", 30)] }).hasAnything).toBe(true);
  });

  it("is true for reviewed work with no time logged", () => {
    const analytics = build({
      workload: {
        occurrences: [occurrence({ issueId: "a", createdAt: new Date("2026-08-18T10:00:00Z") })],
        writing: [
          { entryId: "a", createdAt: new Date("2026-08-18T10:00:00Z"), wordCount: 200 },
        ],
        speaking: [],
      },
    });

    expect(analytics.hasAnything).toBe(true);
  });

  it("is false for an account that has done neither", () => {
    expect(build().hasAnything).toBe(false);
  });
});

describe("consistency", () => {
  it("keeps its own twelve weeks whatever period is selected", () => {
    const sessions = [session("2026-08-18T08:00:00Z", 30)];

    for (const period of ["30d", "90d", "all"] as MistakePeriod[]) {
      const analytics = build({ period, sessions });
      expect(analytics.consistency.weeks).toHaveLength(12);
      expect(analytics.consistency.activeDays).toBe(1);
    }
  });
});
