import { describe, expect, it } from "vitest";
import { occurrence } from "./fixtures";
import { buildMistakeOverview } from "./overview";
import { periodWindow, previousPeriodWindow } from "./period";
import type { MistakeWorkload } from "./workload";

const ZONE = "Europe/Amsterdam";
const NOW = new Date("2026-08-19T09:00:00Z");

const TODAY = new Date("2026-08-19T08:00:00Z");
const LAST_WEEK = new Date("2026-08-12T08:00:00Z");
/** Inside the 30-day window's predecessor, not inside the window itself. */
const FIFTY_DAYS_AGO = new Date("2026-06-30T08:00:00Z");

function workload(overrides: Partial<MistakeWorkload> = {}): MistakeWorkload {
  return { occurrences: [], writing: [], speaking: [], ...overrides };
}

function build(input: MistakeWorkload, period: "30d" | "90d" | "all" = "30d") {
  return buildMistakeOverview({
    workload: input,
    window: periodWindow(period, NOW, ZONE),
    previousWindow: previousPeriodWindow(period, NOW, ZONE),
  });
}

describe("period filtering", () => {
  const input = workload({
    occurrences: [
      occurrence({ issueId: "recent", createdAt: TODAY }),
      occurrence({ issueId: "older", createdAt: FIFTY_DAYS_AGO }),
    ],
    writing: [
      { entryId: "recent", createdAt: TODAY, wordCount: 200 },
      { entryId: "older", createdAt: FIFTY_DAYS_AGO, wordCount: 200 },
    ],
  });

  it("counts only what falls in the 30-day window", () => {
    const overview = build(input, "30d");
    expect(overview.counts.mistakes).toBe(1);
    expect(overview.writingReviewed).toBe(1);
  });

  it("counts both once the window is wide enough", () => {
    const overview = build(input, "90d");
    expect(overview.counts.mistakes).toBe(2);
    expect(overview.writingReviewed).toBe(2);
  });

  it("counts everything for all time, and compares against nothing", () => {
    const overview = build(input, "all");
    expect(overview.counts.mistakes).toBe(2);
    expect(overview.accuracy.previous).toBeNull();
  });
});

describe("the error rate's two windows", () => {
  it("compares this window against the one before it", () => {
    const overview = build(
      workload({
        occurrences: [
          occurrence({ issueId: "now-1", createdAt: TODAY }),
          occurrence({ issueId: "then-1", createdAt: FIFTY_DAYS_AGO }),
          occurrence({ issueId: "then-2", createdAt: FIFTY_DAYS_AGO }),
          occurrence({ issueId: "then-3", createdAt: FIFTY_DAYS_AGO }),
        ],
        writing: [
          { entryId: "now", createdAt: TODAY, wordCount: 500 },
          { entryId: "then", createdAt: FIFTY_DAYS_AGO, wordCount: 500 },
        ],
      }),
    );

    expect(overview.accuracy.current).toMatchObject({ perThousand: 2, words: 500 });
    expect(overview.accuracy.previous).toMatchObject({ perThousand: 6, words: 500 });
  });

  it("reports insufficient rather than inventing a previous period", () => {
    const overview = build(
      workload({
        occurrences: [occurrence({ issueId: "now-1", createdAt: TODAY })],
        writing: [{ entryId: "now", createdAt: TODAY, wordCount: 500 }],
      }),
    );

    expect(overview.accuracy.previous).toEqual({ status: "insufficient", words: 0 });
  });
});

describe("hasReviewedWork", () => {
  it("is false for an account that has had nothing reviewed", () => {
    expect(build(workload()).hasReviewedWork).toBe(false);
  });

  it("is true for somebody whose reviewed writing was simply clean", () => {
    const overview = build(
      workload({ writing: [{ entryId: "clean", createdAt: TODAY, wordCount: 200 }] }),
    );

    // No mistakes, but they earned that — this is not the empty state.
    expect(overview.hasReviewedWork).toBe(true);
    expect(overview.counts.mistakes).toBe(0);
  });

  it("is true when only Speaking has been reviewed", () => {
    const overview = build(
      workload({ speaking: [{ attemptId: "attempt-1", createdAt: LAST_WEEK }] }),
    );

    expect(overview.hasReviewedWork).toBe(true);
    // Speaking never contributes to the writing error rate.
    expect(overview.accuracy.current).toEqual({ status: "insufficient", words: 0 });
  });
});
