import { describe, expect, it } from "vitest";
import { localDayKey } from "@/lib/time";
import type { ActivityType } from "./activity";
import type { TrackedSession } from "./aggregate";
import { HEATMAP_WEEKS, buildHeatmap, heatmapLevel } from "./heatmap";

const ZONE = "Europe/Amsterdam";
/** A Wednesday. */
const NOW = new Date("2026-08-19T09:00:00Z");
const GOAL = 45;

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

function build(sessions: TrackedSession[], now = NOW) {
  return buildHeatmap({ sessions, timeZone: ZONE, now, dailyGoalMinutes: GOAL });
}

function dayAt(view: ReturnType<typeof build>, dayKey: string) {
  return view.weeks.flat().find((day) => day.dayKey === dayKey);
}

describe("heatmapLevel", () => {
  it("keeps zero apart from the faintest shade", () => {
    expect(heatmapLevel(0, GOAL)).toBe(0);
    expect(heatmapLevel(60, GOAL)).toBe(1);
  });

  it("climbs through four shades against the learner's own goal", () => {
    const goalSeconds = GOAL * 60;

    expect(heatmapLevel(goalSeconds * 0.1, GOAL)).toBe(1);
    expect(heatmapLevel(goalSeconds * 0.4, GOAL)).toBe(2);
    expect(heatmapLevel(goalSeconds * 0.8, GOAL)).toBe(3);
    expect(heatmapLevel(goalSeconds, GOAL)).toBe(4);
    expect(heatmapLevel(goalSeconds * 5, GOAL)).toBe(4);
  });

  it("does not move when somebody else has a long day", () => {
    // The scale is the goal, not the maximum, so one huge Sunday cannot repaint
    // every other cell in the grid.
    const before = heatmapLevel(20 * 60, GOAL);
    const after = heatmapLevel(20 * 60, GOAL);
    expect(before).toBe(after);
    expect(before).toBe(2);
  });

  it("survives a goal it should never see", () => {
    expect(heatmapLevel(600, 0)).toBe(4);
  });
});

describe("buildHeatmap", () => {
  it("draws twelve whole weeks of seven days", () => {
    const view = build([]);

    expect(view.weeks).toHaveLength(HEATMAP_WEEKS);
    expect(view.weeks.every((week) => week.length === 7)).toBe(true);
    expect(view.weeks.flat()).toHaveLength(HEATMAP_WEEKS * 7);
  });

  it("ends with the week today is in, and marks today", () => {
    const view = build([]);
    const last = view.weeks[view.weeks.length - 1];

    expect(last.filter((day) => day.isToday)).toHaveLength(1);
    expect(view.weeks.flat().filter((day) => day.isToday)).toHaveLength(1);
  });

  it("counts a day as active from its study time, not its session count", () => {
    const view = build([
      session("2026-08-19T08:00:00Z", 10),
      session("2026-08-19T12:00:00Z", 10),
      session("2026-08-18T08:00:00Z", 10),
    ]);

    expect(view.activeDays).toBe(2);
  });

  it("assigns a late-evening session to the learner's own day", () => {
    // 22:30 UTC is 00:30 the next morning in Amsterdam.
    const view = build([session("2026-08-18T22:30:00Z", 30)]);

    expect(dayAt(view, "2026-08-19")?.seconds).toBe(1800);
    expect(dayAt(view, "2026-08-18")?.seconds).toBe(0);
    expect(view.activeDays).toBe(1);
  });

  it("keeps day boundaries across a daylight-saving change", () => {
    // The Netherlands moved to winter time on 25 October 2026; the local day
    // that follows is 25 hours long and must still be exactly one cell.
    const dstNow = new Date("2026-11-04T09:00:00Z");
    const view = build(
      [
        // 23:30 UTC on the 24th is 01:30 on the 25th local (still summer time).
        session("2026-10-24T23:30:00Z", 20),
        // 23:30 UTC on the 25th is 00:30 on the 26th local (now winter time).
        session("2026-10-25T23:30:00Z", 20),
      ],
      dstNow,
    );

    expect(dayAt(view, "2026-10-25")?.seconds).toBe(1200);
    expect(dayAt(view, "2026-10-26")?.seconds).toBe(1200);
    expect(dayAt(view, "2026-10-24")?.seconds).toBe(0);
    expect(view.weeks.flat().filter((day) => day.dayKey === "2026-10-25")).toHaveLength(1);
  });

  it("does not call days that have not happened empty", () => {
    const view = build([]);
    const future = view.weeks.flat().filter((day) => day.isFuture);

    // Wednesday: Thursday to Sunday are still ahead.
    expect(future).toHaveLength(4);
    expect(view.observedDays).toBe(HEATMAP_WEEKS * 7 - 4);
    expect(future.every((day) => day.level === 0)).toBe(true);
  });

  it("shades several days at their own intensity", () => {
    const view = build([
      session("2026-08-19T08:00:00Z", 5),
      session("2026-08-18T08:00:00Z", 25),
      session("2026-08-17T08:00:00Z", 60),
    ]);

    expect(dayAt(view, "2026-08-19")?.level).toBe(1);
    expect(dayAt(view, "2026-08-18")?.level).toBe(2);
    expect(dayAt(view, "2026-08-17")?.level).toBe(4);
    expect(dayAt(view, "2026-08-16")?.level).toBe(0);
  });

  it("ignores sessions from before the grid begins", () => {
    const view = build([session("2025-01-01T08:00:00Z", 60)]);

    expect(view.activeDays).toBe(0);
    expect(localDayKey(view.from, ZONE) <= "2026-06-01").toBe(true);
  });
});
