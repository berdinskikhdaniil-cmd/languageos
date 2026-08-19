import { describe, expect, it } from "vitest";
import { MIN_ACCURACY_WORDS, comparableAccuracy, writingAccuracy } from "./accuracy";
import { occurrence } from "./fixtures";
import type { ReviewedWriting } from "./workload";

function reviewed(...wordCounts: number[]): ReviewedWriting[] {
  return wordCounts.map((wordCount, index) => ({
    entryId: `entry-${index}`,
    createdAt: new Date("2026-08-19T09:00:00Z"),
    wordCount,
  }));
}

describe("writingAccuracy", () => {
  it("divides concrete writing mistakes by reviewed words", () => {
    const accuracy = writingAccuracy(
      [
        occurrence({ issueId: "a" }),
        occurrence({ issueId: "b" }),
        occurrence({ issueId: "c" }),
      ],
      reviewed(300),
    );

    expect(accuracy).toEqual({ status: "ready", perThousand: 10, mistakes: 3, words: 300 });
  });

  it("sums the word counts of every reviewed entry", () => {
    const accuracy = writingAccuracy([occurrence({ issueId: "a" })], reviewed(120, 80, 200));
    expect(accuracy).toMatchObject({ words: 400, perThousand: 3 });
  });

  it("leaves out improvement suggestions", () => {
    const accuracy = writingAccuracy(
      [
        occurrence({ issueId: "a", severity: "error" }),
        occurrence({ issueId: "b", severity: "awkward" }),
        occurrence({ issueId: "c", severity: "style" }),
      ],
      reviewed(500),
    );

    expect(accuracy).toMatchObject({ mistakes: 1, perThousand: 2 });
  });

  it("leaves out Speaking, which has its own modality and no comparable count", () => {
    const accuracy = writingAccuracy(
      [
        occurrence({ issueId: "w" }),
        occurrence({ issueId: "s1", source: "speaking", sourceId: "attempt-1" }),
        occurrence({ issueId: "s2", source: "speaking", sourceId: "attempt-1" }),
      ],
      reviewed(1000),
    );

    expect(accuracy).toMatchObject({ mistakes: 1, perThousand: 1 });
  });

  it("treats zero mistakes over enough words as a real answer, not missing data", () => {
    expect(writingAccuracy([], reviewed(400))).toEqual({
      status: "ready",
      perThousand: 0,
      mistakes: 0,
      words: 400,
    });
  });

  it("refuses to print a rate computed from too few words", () => {
    const accuracy = writingAccuracy(
      [occurrence({ issueId: "a" }), occurrence({ issueId: "b" }), occurrence({ issueId: "c" })],
      reviewed(40),
    );

    // 75 per 1000 would be a statistic in shape only.
    expect(accuracy).toEqual({ status: "insufficient", words: 40 });
  });

  it("says nothing at all when nothing has been reviewed", () => {
    expect(writingAccuracy([], [])).toEqual({ status: "insufficient", words: 0 });
  });

  it("opens up exactly at the floor", () => {
    expect(writingAccuracy([], reviewed(MIN_ACCURACY_WORDS - 1)).status).toBe("insufficient");
    expect(writingAccuracy([], reviewed(MIN_ACCURACY_WORDS)).status).toBe("ready");
  });
});

describe("comparableAccuracy", () => {
  const ready = writingAccuracy([occurrence({ issueId: "a" })], reviewed(200));
  const thin = writingAccuracy([], reviewed(10));

  it("compares two windows that both said something", () => {
    expect(comparableAccuracy({ current: ready, previous: ready })).toEqual({
      current: 5,
      previous: 5,
    });
  });

  it("draws no comparison when the period has nothing before it", () => {
    expect(comparableAccuracy({ current: ready, previous: null })).toBeNull();
  });

  it("draws no comparison against a previous window with too little in it", () => {
    expect(comparableAccuracy({ current: ready, previous: thin })).toBeNull();
  });

  it("draws no comparison when this window itself cannot say anything", () => {
    expect(comparableAccuracy({ current: thin, previous: ready })).toBeNull();
  });
});
