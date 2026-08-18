import { describe, expect, it } from "vitest";
import { countWords } from "./word-count";

describe("a language written with spaces", () => {
  it("counts words, not gaps", () => {
    expect(countWords("Hello world", "en")).toBe(2);
    expect(countWords("  Hello   world  ", "en")).toBe(2);
  });

  it("does not count punctuation as a word", () => {
    expect(countWords("Hello, world! How are you?", "en")).toBe(5);
    expect(countWords("...", "en")).toBe(0);
    expect(countWords("— ; :", "en")).toBe(0);
  });

  it("counts nothing in an empty submission", () => {
    expect(countWords("", "en")).toBe(0);
    expect(countWords("   \n\t ", "en")).toBe(0);
  });

  it("counts numbers and accented words", () => {
    expect(countWords("Ik heb 3 boeken gelezen", "nl")).toBe(5);
    expect(countWords("Añadí más café", "es")).toBe(3);
  });
});

describe("a language written without spaces", () => {
  it("does not answer one for a whole Chinese sentence", () => {
    // The point of using the platform's word breaker: a naive split answers 1.
    const text = "我喜欢学习中文";
    expect(text.split(/\s+/).filter(Boolean)).toHaveLength(1);
    expect(countWords(text, "zh")).toBeGreaterThan(2);
  });

  it("counts several words in a Japanese sentence", () => {
    expect(countWords("私は日本語を勉強しています", "ja")).toBeGreaterThan(3);
  });

  it("counts a mixed sentence sensibly", () => {
    expect(countWords("我喜欢 React 和 TypeScript", "zh")).toBeGreaterThan(3);
  });
});

describe("without a usable locale", () => {
  /**
   * An unusable locale tag makes Intl.Segmenter throw, which is the same
   * situation as an engine that does not have it — so this exercises the
   * fallback through the public function.
   */
  const NO_SEGMENTER = "!!";

  it("still counts spaced words", () => {
    expect(countWords("Hello, world! How are you?", NO_SEGMENTER)).toBe(5);
  });

  it("keeps contractions and hyphenated words whole", () => {
    expect(countWords("It's a well-known problem", NO_SEGMENTER)).toBe(4);
  });

  it("still refuses to call a Chinese sentence one word", () => {
    expect(countWords("我喜欢学习中文", NO_SEGMENTER)).toBe(7);
  });

  it("counts nothing in punctuation", () => {
    expect(countWords("!!! ??? ...", NO_SEGMENTER)).toBe(0);
  });
});

describe("without a locale at all", () => {
  it("falls back to the platform default rather than failing", () => {
    expect(countWords("Hello world")).toBe(2);
  });
});
