import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_WRITING_CHARS,
  MIN_WRITING_CHARS,
  dailyReviewLimit,
  isWritingType,
  validateWritingText,
} from "./writing-entry";

afterEach(() => {
  vi.unstubAllEnvs();
});

const SENTENCE = "Yesterday I go to the shop and I buyed some bread for my breakfast.";

describe("a submission worth reviewing", () => {
  it("is accepted, with its word count", () => {
    const result = validateWritingText(SENTENCE, "en");
    expect(result).toEqual({ ok: true, value: { text: SENTENCE, wordCount: 14 } });
  });

  it("is trimmed at the edges and untouched inside", () => {
    const withBreaks = "First paragraph here.\n\nSecond paragraph here, a bit longer.";
    const result = validateWritingText(`  \n${withBreaks}\n  `, "en");

    // Paragraph breaks are the learner's, and the stored text has to match the
    // fragments a review will quote out of it.
    expect(result).toMatchObject({ ok: true, value: { text: withBreaks } });
  });
});

describe("a submission that is too short", () => {
  it("is refused", () => {
    expect(validateWritingText("Hi.", "en")).toMatchObject({ ok: false, field: "text" });
    expect(validateWritingText("a".repeat(MIN_WRITING_CHARS - 1), "en")).toMatchObject({
      ok: false,
    });
  });

  it("is refused when it is only whitespace", () => {
    expect(validateWritingText("   \n\n   ", "en")).toMatchObject({ ok: false });
  });

  it("is accepted at exactly the minimum", () => {
    expect(validateWritingText("a".repeat(MIN_WRITING_CHARS), "en")).toMatchObject({ ok: true });
  });
});

describe("a submission that is too long", () => {
  it("is refused, because the request would be expensive", () => {
    const result = validateWritingText("a".repeat(MAX_WRITING_CHARS + 1), "en");
    expect(result).toMatchObject({ ok: false, field: "text" });
  });

  it("is accepted at exactly the maximum", () => {
    expect(validateWritingText("a".repeat(MAX_WRITING_CHARS), "en")).toMatchObject({ ok: true });
  });

  it("measures the trimmed text, not the padding around it", () => {
    const text = `${" ".repeat(500)}${"a".repeat(MAX_WRITING_CHARS)}${" ".repeat(500)}`;
    expect(validateWritingText(text, "en")).toMatchObject({ ok: true });
  });
});

describe("something that is not a submission", () => {
  it("is refused rather than coerced", () => {
    for (const value of [null, undefined, 42, {}, ["text"], true]) {
      expect(validateWritingText(value, "en")).toMatchObject({ ok: false, field: "text" });
    }
  });
});

describe("the writing type", () => {
  it("accepts only the two kinds that exist", () => {
    expect(isWritingType("free_writing")).toBe(true);
    expect(isWritingType("retelling")).toBe(true);
    for (const value of ["essay", "", null, 1, "Free writing"]) {
      expect(isWritingType(value)).toBe(false);
    }
  });
});

describe("the daily review allowance", () => {
  it("has a sane default", () => {
    vi.stubEnv("WRITING_DAILY_REVIEW_LIMIT", undefined);
    expect(dailyReviewLimit()).toBe(20);
  });

  it("can be raised by an operator", () => {
    vi.stubEnv("WRITING_DAILY_REVIEW_LIMIT", "100");
    expect(dailyReviewLimit()).toBe(100);
  });

  it("ignores nonsense rather than switching the guard off", () => {
    for (const value of ["0", "-5", "abc", "1.5", ""]) {
      vi.stubEnv("WRITING_DAILY_REVIEW_LIMIT", value);
      expect(dailyReviewLimit()).toBe(20);
    }
  });
});
