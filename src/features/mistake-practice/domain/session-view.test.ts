import { describe, expect, it } from "vitest";
import type { MistakePracticeItemRow, MistakePracticeSessionRow } from "@/db/schema";
import { MAX_ANSWER_CHARS, isCompleteAnswerSet, normalizeAnswer } from "./answers";
import { buildSessionView } from "./session-view";

/**
 * The view boundary, which is where the answer key is kept out of the browser.
 */

function session(overrides: Partial<MistakePracticeSessionRow> = {}): MistakePracticeSessionRow {
  return {
    id: "session-1",
    userId: "user-1",
    userLanguageId: "language-1",
    targetType: "skill",
    targetKey: "past tense",
    status: "ready",
    model: "some/model",
    gradingModel: null,
    generationInputTokens: null,
    generationOutputTokens: null,
    gradingInputTokens: null,
    gradingOutputTokens: null,
    failureReason: null,
    createdAt: new Date("2026-08-19T09:00:00Z"),
    updatedAt: new Date("2026-08-19T09:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

function item(
  position: number,
  overrides: Partial<MistakePracticeItemRow> = {},
): MistakePracticeItemRow {
  return {
    id: `item-${position}`,
    sessionId: "session-1",
    position,
    type: "fill_blank",
    prompt: `Yesterday we ___ (go) home. #${position}`,
    canonicalAnswer: "went",
    gradingNotes: "Irregular past simple.",
    userAnswer: null,
    verdict: null,
    correctedAnswer: null,
    explanation: null,
    createdAt: new Date("2026-08-19T09:00:00Z"),
    updatedAt: new Date("2026-08-19T09:00:00Z"),
    ...overrides,
  };
}

const FIVE = [1, 2, 3, 4, 5].map((position) => item(position));

describe("buildSessionView", () => {
  it("never carries a canonical answer or a grading note into an unfinished set", () => {
    const view = buildSessionView({ session: session(), items: FIVE });
    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("went");
    expect(serialized).not.toContain("Irregular past simple");
    expect(Object.keys(view.exercises[0]).sort()).toEqual([
      "answer",
      "position",
      "prompt",
      "type",
    ]);
  });

  it("carries answers already given, so a resumed set opens where it was left", () => {
    const view = buildSessionView({
      session: session(),
      items: [item(1, { userAnswer: "went" }), ...FIVE.slice(1)],
    });

    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(view.exercises[0].answer).toBe("went");
    expect(view.exercises[1].answer).toBeNull();
  });

  it("reads a reason on a ready session as a check that did not come back", () => {
    // Generation failure leaves the row `failed`, so a reason here can only
    // have come from grading — and the answers survived it.
    const view = buildSessionView({
      session: session({ failureReason: "timeout" }),
      items: FIVE,
    });

    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;
    expect(view.failure).toBe("timeout");
  });

  it("reports a generation failure as its own state", () => {
    const view = buildSessionView({
      session: session({ status: "failed", failureReason: "invalid_response" }),
      items: [],
    });

    expect(view.status).toBe("failed");
    if (view.status !== "failed") return;
    expect(view.failure).toBe("generationFailed");
  });

  it("shows the canonical answer only once the set has been graded", () => {
    const graded = FIVE.map((row, index) =>
      item(row.position, {
        userAnswer: "went",
        verdict: index === 4 ? "incorrect" : "correct",
        correctedAnswer: "went",
        explanation: "Past simple.",
      }),
    );

    const view = buildSessionView({
      session: session({ status: "completed", completedAt: new Date() }),
      items: graded,
    });

    expect(view.status).toBe("completed");
    if (view.status !== "completed") return;
    expect(view.results[0].canonicalAnswer).toBe("went");
    expect(view.tally).toMatchObject({ correct: 4, incorrect: 1, accepted: 4, total: 5 });
  });

  it("leaves out an item a completed session never graded, rather than half-drawing it", () => {
    const view = buildSessionView({
      session: session({ status: "completed", completedAt: new Date() }),
      items: [
        item(1, { userAnswer: "went", verdict: "correct", correctedAnswer: "went", explanation: "x" }),
        item(2, { userAnswer: "goed" }),
      ],
    });

    expect(view.status).toBe("completed");
    if (view.status !== "completed") return;
    expect(view.results).toHaveLength(1);
    expect(view.tally.total).toBe(1);
  });

  it("reads the target back, and reports an unreadable pair as null", () => {
    expect(buildSessionView({ session: session(), items: FIVE }).target).toEqual({
      kind: "skill",
      key: "past tense",
    });

    expect(
      buildSessionView({
        session: session({ targetType: "category", targetKey: "vocabulary" }),
        items: FIVE,
      }).target,
    ).toBeNull();
  });

  it("treats the two in-flight statuses as waiting", () => {
    for (const status of ["generating", "grading"] as const) {
      expect(buildSessionView({ session: session({ status }), items: [] }).status).toBe(status);
    }
  });
});

describe("answers", () => {
  it("trims, caps and reduces an empty answer to null", () => {
    expect(normalizeAnswer("  went  ")).toBe("went");
    expect(normalizeAnswer("   ")).toBeNull();
    expect(normalizeAnswer(null)).toBeNull();
    expect(normalizeAnswer(42)).toBeNull();
    expect(normalizeAnswer("x".repeat(MAX_ANSWER_CHARS + 50))).toHaveLength(MAX_ANSWER_CHARS);
  });

  it("only calls a set complete when all five have something in them", () => {
    expect(isCompleteAnswerSet(["a", "b", "c", "d", "e"])).toBe(true);
    expect(isCompleteAnswerSet(["a", "b", "c", "d", null])).toBe(false);
    expect(isCompleteAnswerSet(["a", "b", "c", "d", "  "])).toBe(false);
    expect(isCompleteAnswerSet(["a", "b", "c", "d"])).toBe(false);
  });
});
