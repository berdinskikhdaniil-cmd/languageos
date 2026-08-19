import { describe, expect, it } from "vitest";
import type { Interval } from "@/lib/time";
import { occurrence } from "./fixtures";
import {
  MIN_QUALITY_POINTS,
  buildQualitySeries,
  isPlottableSeries,
  qualityGranularityForSpan,
} from "./quality-trend";
import type { ReviewedWriting } from "./workload";

const ZONE = "Europe/Amsterdam";
const NOW = new Date("2026-08-19T09:00:00Z");

/** Four whole local weeks ending with the one today is in. */
const FOUR_WEEKS: Interval = {
  from: new Date("2026-07-26T22:00:00Z"),
  to: new Date("2026-08-23T22:00:00Z"),
};

function reviewed(createdAt: string, wordCount: number): ReviewedWriting {
  return { entryId: `entry-${createdAt}-${wordCount}`, createdAt: new Date(createdAt), wordCount };
}

function build(
  occurrences: Parameters<typeof buildQualitySeries>[0]["occurrences"],
  writing: ReviewedWriting[],
  window = FOUR_WEEKS,
) {
  return buildQualitySeries({
    occurrences,
    reviewed: writing,
    window,
    granularity: "week",
    timeZone: ZONE,
    now: NOW,
    language: "en",
  });
}

describe("qualityGranularityForSpan", () => {
  it("never goes finer than a week", () => {
    // A day rarely holds a hundred reviewed words, so daily points would almost
    // all be too thin to plot.
    expect(qualityGranularityForSpan(1)).toBe("week");
    expect(qualityGranularityForSpan(30)).toBe("week");
    expect(qualityGranularityForSpan(182)).toBe("week");
    expect(qualityGranularityForSpan(183)).toBe("month");
  });
});

describe("buildQualitySeries", () => {
  it("computes errors per 1000 words for each period", () => {
    const series = build(
      [
        occurrence({ issueId: "a", createdAt: new Date("2026-07-28T10:00:00Z") }),
        occurrence({ issueId: "b", createdAt: new Date("2026-07-28T10:00:00Z") }),
        occurrence({ issueId: "c", createdAt: new Date("2026-08-11T10:00:00Z") }),
      ],
      [reviewed("2026-07-28T10:00:00Z", 400), reviewed("2026-08-11T10:00:00Z", 500)],
    );

    expect(series.points.map((point) => point.perThousand)).toEqual([5, 2]);
    expect(series.points.map((point) => point.words)).toEqual([400, 500]);
  });

  it("leaves out a period with too little writing to divide by", () => {
    const series = build(
      [occurrence({ issueId: "a", createdAt: new Date("2026-08-11T10:00:00Z") })],
      [
        reviewed("2026-07-28T10:00:00Z", 20), // three sentences: meaningless as a rate
        reviewed("2026-08-11T10:00:00Z", 500),
      ],
    );

    expect(series.points).toHaveLength(1);
    expect(series.thinBuckets).toBe(1);
  });

  it("does not call a period with no writing at all a thin one", () => {
    const series = build([], [reviewed("2026-08-11T10:00:00Z", 500)]);

    // Three of the four weeks hold nothing; that is absence, not thin data.
    expect(series.points).toHaveLength(1);
    expect(series.thinBuckets).toBe(0);
  });

  it("counts concrete mistakes only", () => {
    const at = new Date("2026-08-11T10:00:00Z");
    const series = build(
      [
        occurrence({ issueId: "a", createdAt: at, severity: "error" }),
        occurrence({ issueId: "b", createdAt: at, severity: "awkward" }),
        occurrence({ issueId: "c", createdAt: at, severity: "style" }),
      ],
      [reviewed("2026-08-11T10:00:00Z", 1000)],
    );

    expect(series.points[0]).toMatchObject({ mistakes: 1, perThousand: 1 });
  });

  it("leaves Speaking out of a writing metric", () => {
    const at = new Date("2026-08-11T10:00:00Z");
    const series = build(
      [
        occurrence({ issueId: "w", createdAt: at }),
        occurrence({ issueId: "s1", createdAt: at, source: "speaking", sourceId: "attempt-1" }),
        occurrence({ issueId: "s2", createdAt: at, source: "speaking", sourceId: "attempt-1" }),
      ],
      [reviewed("2026-08-11T10:00:00Z", 1000)],
    );

    expect(series.points[0]).toMatchObject({ mistakes: 1, perThousand: 1 });
  });

  it("plots a clean period as a real zero", () => {
    const series = build([], [reviewed("2026-08-11T10:00:00Z", 400)]);

    expect(series.points[0]).toMatchObject({ perThousand: 0, mistakes: 0, words: 400 });
  });

  it("files writing by the learner's own local week", () => {
    // 22:30 UTC on Sunday the 9th is 00:30 on Monday the 10th in Amsterdam, so
    // it opens the following week rather than closing the previous one.
    const series = build(
      [],
      [reviewed("2026-08-09T22:30:00Z", 200), reviewed("2026-08-12T10:00:00Z", 200)],
    );

    expect(series.points).toHaveLength(1);
    expect(series.points[0].words).toBe(400);
  });

  it("labels points in the reader's language", () => {
    const english = build([], [reviewed("2026-08-11T10:00:00Z", 400)]);
    expect(english.points[0].label).toMatch(/Aug/);

    const russian = buildQualitySeries({
      occurrences: [],
      reviewed: [reviewed("2026-08-11T10:00:00Z", 400)],
      window: FOUR_WEEKS,
      granularity: "week",
      timeZone: ZONE,
      now: NOW,
      language: "ru",
    });
    expect(russian.points[0].label).toContain("авг");
  });
});

describe("isPlottableSeries", () => {
  it("needs at least two reliable points before drawing a line", () => {
    const one = build([], [reviewed("2026-08-11T10:00:00Z", 400)]);
    expect(one.points).toHaveLength(MIN_QUALITY_POINTS - 1);
    expect(isPlottableSeries(one)).toBe(false);

    const two = build(
      [],
      [reviewed("2026-08-04T10:00:00Z", 400), reviewed("2026-08-11T10:00:00Z", 400)],
    );
    expect(isPlottableSeries(two)).toBe(true);
  });

  it("refuses to draw anything from nothing", () => {
    expect(isPlottableSeries(build([], []))).toBe(false);
  });
});
