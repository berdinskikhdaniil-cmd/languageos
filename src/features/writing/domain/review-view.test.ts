import { describe, expect, it } from "vitest";
import type { WritingEntryRow, WritingIssueRow, WritingReviewRow } from "@/db/schema";
import { buildEntryView } from "./review-view";

/**
 * How stored rows become the review screen: which issues are highlighted in the
 * text, which are shown beneath it, and that nothing is lost or shown twice.
 */

const TEXT = "Yesterday I go to the shop and I buyed some bread for my breakfast today.";

function entryRow(overrides: Partial<WritingEntryRow> = {}): WritingEntryRow {
  return {
    id: "entry-1",
    userId: "user-1",
    userLanguageId: "lang-1",
    type: "free_writing",
    originalText: TEXT,
    revisedText: null,
    wordCount: 14,
    sourceSessionId: null,
    createdAt: new Date("2026-08-18T10:00:00Z"),
    updatedAt: new Date("2026-08-18T10:00:00Z"),
    ...overrides,
  };
}

function reviewRow(overrides: Partial<WritingReviewRow> = {}): WritingReviewRow {
  return {
    id: "review-1",
    entryId: "entry-1",
    status: "completed",
    model: "test/model",
    summary: "Clear, but watch your past tenses.",
    improvedText: "Yesterday I went to the shop and I bought some bread for my breakfast.",
    inputTokens: 100,
    outputTokens: 200,
    failureReason: null,
    createdAt: new Date("2026-08-18T10:00:00Z"),
    updatedAt: new Date("2026-08-18T10:00:00Z"),
    ...overrides,
  };
}

let issueSeed = 0;
function issueRow(overrides: Partial<WritingIssueRow> = {}): WritingIssueRow {
  issueSeed += 1;
  return {
    id: `issue-${issueSeed}`,
    reviewId: "review-1",
    position: 0,
    category: "grammar",
    label: "past tense",
    severity: "error",
    originalFragment: "I go",
    suggestion: "I went",
    explanation: "Yesterday needs the past tense.",
    startOffset: null,
    endOffset: null,
    createdAt: new Date("2026-08-18T10:00:00Z"),
    ...overrides,
  };
}

/** Offsets for a fragment, the way the review runner resolves them. */
function at(fragment: string) {
  const start = TEXT.indexOf(fragment);
  return { startOffset: start, endOffset: start + fragment.length };
}

function build(issues: WritingIssueRow[], overrides: Partial<WritingReviewRow> = {}) {
  return buildEntryView({
    entry: entryRow(),
    review: reviewRow(overrides),
    issues,
    unreviewedReason: null,
  });
}

describe("issues that could be placed in the text", () => {
  it("become highlights pointing back at their own explanation", () => {
    const view = build([
      issueRow({ position: 0, originalFragment: "I go", ...at("I go") }),
      issueRow({ position: 1, originalFragment: "buyed", suggestion: "bought", ...at("buyed") }),
    ]);

    const review = view.review;
    expect(review?.status).toBe("completed");
    if (review?.status !== "completed") return;

    expect(review.spans).toHaveLength(2);
    // The link that makes tapping work: each span's index finds its own issue.
    for (const span of review.spans) {
      const issue = review.issues[span.issueIndex];
      expect(TEXT.slice(span.span.start, span.span.end)).toBe(issue.originalFragment);
    }
  });

  it("carry their severity, so the mark can be coloured by it", () => {
    const view = build([
      issueRow({ position: 0, severity: "error", originalFragment: "I go", ...at("I go") }),
      issueRow({ position: 1, severity: "style", originalFragment: "buyed", ...at("buyed") }),
    ]);

    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");
    expect(review.spans.map((span) => span.severity)).toEqual(["error", "style"]);
  });

  it("carry what the mark is about, as data rather than as a sentence", () => {
    // The phrase a screen reader hears is composed in the component, in the
    // reader's own language; the view model must not bake an English one in.
    const view = build([issueRow({ originalFragment: "I go", ...at("I go") })]);
    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");

    expect(review.spans[0].category).toBe("grammar");
    expect(review.spans[0].label).toBe("past tense");
  });

  it("are never repeated below the text", () => {
    const view = build([
      issueRow({ position: 0, originalFragment: "I go", ...at("I go") }),
      issueRow({ position: 1, originalFragment: "buyed", ...at("buyed") }),
    ]);
    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");

    const highlighted = new Set(review.spans.map((span) => span.issueIndex));
    const unplaced = review.issues.filter((_, index) => !highlighted.has(index));
    expect(unplaced).toEqual([]);
  });
});

describe("issues that could not be placed", () => {
  it("keep their place in the list, without a highlight", () => {
    const view = build([
      issueRow({ position: 0, originalFragment: "I go", ...at("I go") }),
      // Paraphrased by the model: no offsets were resolvable.
      issueRow({ position: 1, originalFragment: "was extremely tasty", suggestion: "was tasty" }),
    ]);
    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");

    expect(review.issues).toHaveLength(2);
    expect(review.spans.map((span) => span.issueIndex)).toEqual([0]);

    const highlighted = new Set(review.spans.map((span) => span.issueIndex));
    const unplaced = review.issues.filter((_, index) => !highlighted.has(index));
    expect(unplaced.map((issue) => issue.originalFragment)).toEqual(["was extremely tasty"]);
  });

  it("include a span that overlaps one already taken", () => {
    // Two marks over the same characters cannot both be drawn. The first keeps
    // its highlight; the second is shown as feedback instead of being lost.
    const view = build([
      issueRow({ position: 0, originalFragment: "I buyed some bread", ...at("I buyed some bread") }),
      issueRow({ position: 1, originalFragment: "buyed", ...at("buyed") }),
    ]);
    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");

    expect(review.spans.map((span) => span.issueIndex)).toEqual([0]);
    expect(review.issues).toHaveLength(2);
  });

  it("include a span that points past the end of the text", () => {
    const view = build([
      issueRow({ originalFragment: "somewhere", startOffset: 500, endOffset: 520 }),
    ]);
    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");

    expect(review.spans).toEqual([]);
    expect(review.issues).toHaveLength(1);
  });
});

describe("text that is not plain Latin", () => {
  it("keeps its offsets, in the units the renderer slices with", () => {
    const japanese = "私は昨日学校に行きました。とても楽しかったです。";
    const fragment = "とても楽しかった";
    const start = japanese.indexOf(fragment);

    const view = buildEntryView({
      entry: entryRow({ originalText: japanese }),
      review: reviewRow(),
      issues: [
        issueRow({
          originalFragment: fragment,
          startOffset: start,
          endOffset: start + fragment.length,
        }),
      ],
      unreviewedReason: null,
    });

    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");
    const span = review.spans[0].span;
    expect(japanese.slice(span.start, span.end)).toBe(fragment);
  });
});

describe("a review with nothing wrong in it", () => {
  it("has no issues and no highlights", () => {
    const view = build([]);
    const review = view.review;
    if (review?.status !== "completed") throw new Error("expected a completed review");

    expect(review.issues).toEqual([]);
    expect(review.spans).toEqual([]);
  });
});

describe("a review that is not usable", () => {
  it("is presented as a failure, whatever its stored status says", () => {
    const view = buildEntryView({
      entry: entryRow(),
      review: reviewRow({ improvedText: ":" }),
      issues: [],
      unreviewedReason: null,
    });

    expect(view.review).toEqual({ status: "failed", reason: "invalid_response" });
  });

  it("is presented as pending while one is running", () => {
    const view = buildEntryView({
      entry: entryRow(),
      review: reviewRow({ status: "pending", summary: null, improvedText: null }),
      issues: [],
      unreviewedReason: null,
    });

    expect(view.review).toEqual({ status: "pending" });
  });
});
