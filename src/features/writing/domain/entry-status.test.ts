import { describe, expect, it } from "vitest";
import { WRITING_ENTRY_STATUS_LABELS, writingEntryStatus } from "./entry-status";

const GOOD_REVIEW = {
  status: "completed" as const,
  summary: "Clear and easy to follow.",
  improvedText: "Yesterday I went to the shop and bought bread.",
};

describe("an entry nobody has reviewed", () => {
  it("needs review when there is no review at all", () => {
    expect(writingEntryStatus({ revisedText: null, review: null })).toBe("needs_review");
  });

  it("needs review while one is running", () => {
    expect(
      writingEntryStatus({
        revisedText: null,
        review: { status: "pending", summary: null, improvedText: null },
      }),
    ).toBe("needs_review");
  });

  it("needs review after one failed", () => {
    expect(
      writingEntryStatus({
        revisedText: null,
        review: { status: "failed", summary: null, improvedText: null },
      }),
    ).toBe("needs_review");
  });
});

describe("an entry with a real review", () => {
  it("is reviewed", () => {
    expect(writingEntryStatus({ revisedText: null, review: GOOD_REVIEW })).toBe("reviewed");
  });
});

describe("the bad review already in production", () => {
  it("reads as needing review, not as reviewed", () => {
    /**
     * Review a8babf63: completed, with a summary and an improved text of one
     * colon. Calling it "Reviewed" in a list would send somebody to a screen
     * that has nothing on it.
     */
    expect(
      writingEntryStatus({
        revisedText: null,
        review: {
          status: "completed",
          summary: "Nice simple story! The main thing to work on is past tense consistency.",
          improvedText: ":",
        },
      }),
    ).toBe("needs_review");
  });

  it("reads as needing review when a completed row lost its content entirely", () => {
    expect(
      writingEntryStatus({
        revisedText: null,
        review: { status: "completed", summary: null, improvedText: null },
      }),
    ).toBe("needs_review");
  });
});

describe("an entry the learner went back and fixed", () => {
  it("is rewritten, which outranks reviewed", () => {
    expect(
      writingEntryStatus({ revisedText: "Yesterday I went to the shop.", review: GOOD_REVIEW }),
    ).toBe("rewritten");
  });

  it("is rewritten even if its review never worked", () => {
    expect(
      writingEntryStatus({
        revisedText: "My own second attempt.",
        review: { status: "failed", summary: null, improvedText: null },
      }),
    ).toBe("rewritten");
  });
});

describe("the words shown to the learner", () => {
  it("are sentence case and say what they mean", () => {
    expect(WRITING_ENTRY_STATUS_LABELS).toEqual({
      needs_review: "Needs review",
      reviewed: "Reviewed",
      rewritten: "Rewritten",
    });
  });
});
