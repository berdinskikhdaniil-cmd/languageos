import { describe, expect, it } from "vitest";
import type { SpeakingAttemptRow, SpeakingIssueRow, SpeakingReviewRow } from "@/db/schema";
import { buildAttemptView } from "./attempt-view";

/**
 * Rows into the shape the feedback screen renders.
 *
 * The decisions worth testing are the ones that go visibly wrong: whether a
 * review counts as finished, and which issues may be drawn over the transcript
 * without corrupting it.
 */

const TRANSCRIPT =
  "Yesterday I go to the shop and I buyed some bread for my breakfast today.";

function at(fragment: string) {
  const start = TRANSCRIPT.indexOf(fragment);
  return { startOffset: start, endOffset: start + fragment.length };
}

function attemptRow(overrides: Partial<SpeakingAttemptRow> = {}): SpeakingAttemptRow {
  return {
    id: "attempt-1",
    userId: "user-1",
    userLanguageId: "lang-1",
    clientRequestId: "req-1",
    topicKey: "yesterday",
    topicPrompt: "Describe what you did yesterday.",
    status: "completed",
    durationSeconds: 42,
    audioFormat: "webm",
    audioBytes: 120_000,
    transcript: TRANSCRIPT,
    sttModel: "openai/whisper-large-v3",
    sttSeconds: 42.4,
    sttCostUsd: 0.0003,
    failureReason: null,
    trackerSessionId: "session-1",
    createdAt: new Date("2026-08-19T10:00:00Z"),
    updatedAt: new Date("2026-08-19T10:00:30Z"),
    ...overrides,
  };
}

function reviewRow(overrides: Partial<SpeakingReviewRow> = {}): SpeakingReviewRow {
  return {
    id: "review-1",
    attemptId: "attempt-1",
    status: "completed",
    model: "test/model",
    summary: "Clear, but watch your past tenses.",
    improvedAnswer: "Yesterday I went to the shop and bought some bread for breakfast.",
    contentVerdict: "yes",
    contentComment: "You answered the topic directly.",
    inputTokens: 100,
    outputTokens: 200,
    failureReason: null,
    createdAt: new Date("2026-08-19T10:00:10Z"),
    updatedAt: new Date("2026-08-19T10:00:30Z"),
    ...overrides,
  };
}

function issueRow(overrides: Partial<SpeakingIssueRow> = {}): SpeakingIssueRow {
  return {
    id: `issue-${overrides.position ?? 0}`,
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
    createdAt: new Date("2026-08-19T10:00:30Z"),
    ...overrides,
  };
}

const build = (issues: SpeakingIssueRow[], review = reviewRow(), attempt = attemptRow()) =>
  buildAttemptView({ attempt, review, issues });

describe("a finished review", () => {
  it("carries the summary, the rewrite and the content verdict", () => {
    const view = build([]);
    if (view.review?.status !== "completed") throw new Error("expected a completed review");

    expect(view.review.summary).toContain("past tenses");
    expect(view.review.improvedAnswer).toContain("I went");
    expect(view.review.content).toEqual({
      verdict: "yes",
      comment: "You answered the topic directly.",
    });
  });

  it("drops the content section rather than showing half a verdict", () => {
    const view = build([], reviewRow({ contentComment: null }));
    if (view.review?.status !== "completed") throw new Error("expected a completed review");
    expect(view.review.content).toBeNull();
  });

  it("keeps the topic and the duration on the attempt itself", () => {
    const view = build([]);
    expect(view.topicPrompt).toBe("Describe what you did yesterday.");
    expect(view.durationSeconds).toBe(42);
  });
});

describe("highlights over the transcript", () => {
  it("point at exactly the words the issue quoted", () => {
    const view = build([
      issueRow({ position: 0, originalFragment: "I go", ...at("I go") }),
      issueRow({ position: 1, originalFragment: "buyed", ...at("buyed") }),
    ]);
    if (view.review?.status !== "completed") throw new Error("expected a completed review");

    for (const span of view.review.spans) {
      const issue = view.review.issues[span.issueIndex];
      expect(TRANSCRIPT.slice(span.span.start, span.span.end)).toBe(issue.originalFragment);
    }
  });

  it("carry what the mark is about as data, not as a sentence", () => {
    // The phrase a screen reader hears is composed in the component, in the
    // reader's own language.
    const view = build([issueRow({ originalFragment: "I go", ...at("I go") })]);
    if (view.review?.status !== "completed") throw new Error("expected a completed review");

    expect(view.review.spans[0]).toMatchObject({ category: "grammar", label: "past tense" });
  });

  it("leave an issue without offsets out of the text, and keep it in the list", () => {
    const view = build([issueRow({ startOffset: null, endOffset: null })]);
    if (view.review?.status !== "completed") throw new Error("expected a completed review");

    expect(view.review.spans).toHaveLength(0);
    expect(view.review.issues).toHaveLength(1);
  });

  it("refuse a span that runs past the end of the transcript", () => {
    const view = build([issueRow({ startOffset: 0, endOffset: TRANSCRIPT.length + 40 })]);
    if (view.review?.status !== "completed") throw new Error("expected a completed review");

    expect(view.review.spans).toHaveLength(0);
    expect(view.review.issues).toHaveLength(1);
  });

  it("refuse the second of two overlapping spans", () => {
    // Two marks over the same characters cannot both be drawn, and nesting
    // them would mangle the paragraph.
    const view = build([
      issueRow({ position: 0, originalFragment: "I go to the shop", ...at("I go to the shop") }),
      issueRow({ position: 1, originalFragment: "to the shop", ...at("to the shop") }),
    ]);
    if (view.review?.status !== "completed") throw new Error("expected a completed review");

    expect(view.review.spans).toHaveLength(1);
    expect(view.review.spans[0].issueIndex).toBe(0);
    expect(view.review.issues).toHaveLength(2);
  });
});

describe("an attempt that is not finished", () => {
  it("reports a review that is still running", () => {
    const view = build([], reviewRow({ status: "pending", summary: null, improvedAnswer: null }));
    expect(view.review).toEqual({ status: "pending" });
  });

  it("reports a review that failed, with its stored reason", () => {
    const view = build([], reviewRow({ status: "failed", summary: null, improvedAnswer: null, failureReason: "timeout" }));
    expect(view.review).toEqual({ status: "failed", reason: "timeout" });
  });

  it("treats a completed row holding nothing usable as a failure", () => {
    // The shape that reached production in Writing once: `completed`, non-null,
    // and holding nothing a learner can read.
    const view = build([], reviewRow({ summary: ":", improvedAnswer: "." }));
    expect(view.review).toMatchObject({ status: "failed" });
  });

  it("keeps the transcript when only the review failed", () => {
    const view = build([], reviewRow({ status: "failed", summary: null, improvedAnswer: null }));
    expect(view.transcript).toBe(TRANSCRIPT);
  });

  it("reports no transcript and its reason when transcription itself failed", () => {
    const view = buildAttemptView({
      attempt: attemptRow({ status: "failed", transcript: null, failureReason: "empty_transcript" }),
      review: null,
      issues: [],
    });

    expect(view.transcript).toBeNull();
    expect(view.review).toBeNull();
    expect(view.transcriptionFailureReason).toBe("empty_transcript");
  });

  it("does not report a transcription reason for an attempt that has a transcript", () => {
    const view = build([]);
    expect(view.transcriptionFailureReason).toBeNull();
  });
});

describe("text that is not plain ASCII", () => {
  it("slices spans in the same units the offsets were stored in", () => {
    const spoken = "Вчера я идти в магазин и купить хлеб.";
    const start = spoken.indexOf("я идти");

    const view = buildAttemptView({
      attempt: attemptRow({ transcript: spoken }),
      review: reviewRow({ improvedAnswer: "Вчера я ходил в магазин и купил хлеб." }),
      issues: [
        issueRow({
          originalFragment: "я идти",
          startOffset: start,
          endOffset: start + "я идти".length,
        }),
      ],
    });

    if (view.review?.status !== "completed") throw new Error("expected a completed review");
    const span = view.review.spans[0];
    expect(spoken.slice(span.span.start, span.span.end)).toBe("я идти");
  });

  it("handles a fragment containing characters outside the basic plane", () => {
    const spoken = "I went to the shop 🛒 and it was fine.";
    const start = spoken.indexOf("🛒 and");

    const view = buildAttemptView({
      attempt: attemptRow({ transcript: spoken }),
      review: reviewRow({ improvedAnswer: "I went to the shop and it was fine." }),
      issues: [
        issueRow({
          originalFragment: "🛒 and",
          startOffset: start,
          endOffset: start + "🛒 and".length,
        }),
      ],
    });

    if (view.review?.status !== "completed") throw new Error("expected a completed review");
    const span = view.review.spans[0];
    expect(spoken.slice(span.span.start, span.span.end)).toBe("🛒 and");
  });
});
