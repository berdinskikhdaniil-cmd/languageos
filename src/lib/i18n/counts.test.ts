import { describe, expect, it } from "vitest";
import { formatDuration, formatPercentWorded, formatSeconds } from "@/lib/format";
import { getMessages } from "./messages";
import { pluralForm, pluralize } from "./plural";

/**
 * Counted things, in a language that has three plural forms and one that has
 * two.
 *
 * The forms come from `Intl.PluralRules` rather than from arithmetic of our
 * own, which is why 21 behaves like 1 and 11 does not — that rule is not
 * "ends in one", and writing it by hand is how it gets written wrong.
 */

const words = (count: number, language: "en" | "ru") =>
  getMessages(language).writing.wordCount(count);

describe("a word count in English", () => {
  it("is singular only at one", () => {
    expect(words(0, "en")).toBe("0 words");
    expect(words(1, "en")).toBe("1 word");
    expect(words(2, "en")).toBe("2 words");
    expect(words(29, "en")).toBe("29 words");
    expect(words(21, "en")).toBe("21 words");
  });
});

describe("a word count in Russian", () => {
  it("uses the nominative singular for one, and for anything ending in one", () => {
    expect(words(1, "ru")).toBe("1 слово");
    expect(words(21, "ru")).toBe("21 слово");
    expect(words(101, "ru")).toBe("101 слово");
  });

  it("uses the few form for two, three and four", () => {
    expect(words(2, "ru")).toBe("2 слова");
    expect(words(3, "ru")).toBe("3 слова");
    expect(words(4, "ru")).toBe("4 слова");
    expect(words(22, "ru")).toBe("22 слова");
  });

  it("uses the many form for five and up, and for the teens", () => {
    expect(words(5, "ru")).toBe("5 слов");
    expect(words(11, "ru")).toBe("11 слов");
    expect(words(12, "ru")).toBe("12 слов");
    expect(words(25, "ru")).toBe("25 слов");
    expect(words(100, "ru")).toBe("100 слов");
  });

  it("counts nothing as the many form, not the singular", () => {
    expect(words(0, "ru")).toBe("0 слов");
  });
});

describe("the plural helper itself", () => {
  it("falls back to `other` for a category the caller did not supply", () => {
    // Russian's `few` is missing here; the genitive plural has to cover it.
    expect(pluralForm("ru", 3, { one: "слово", other: "слов" })).toBe("слов");
  });

  it("joins the number to the word it counts", () => {
    expect(pluralize("en", 3, { one: "hour", other: "hours" })).toBe("3 hours");
  });
});

describe("a duration", () => {
  it("is written the way each language writes one", () => {
    expect(formatDuration(272, "en")).toBe("4h 32m");
    expect(formatDuration(272, "ru")).toBe("4 ч 32 мин");

    expect(formatDuration(60, "en")).toBe("1h");
    expect(formatDuration(60, "ru")).toBe("1 ч");

    expect(formatDuration(42, "en")).toBe("42m");
    expect(formatDuration(42, "ru")).toBe("42 мин");
  });

  it("defaults to English when no language is given", () => {
    expect(formatDuration(272)).toBe("4h 32m");
  });

  it("says a session has started rather than reading zero, in both", () => {
    expect(formatSeconds(5, "en")).toBe("<1m");
    expect(formatSeconds(5, "ru")).toBe("<1 мин");
  });
});

describe("a change written as a sentence", () => {
  it("opens with a verb in each language", () => {
    expect(formatPercentWorded(18, "en")).toBe("Up 18%");
    expect(formatPercentWorded(-22, "en")).toBe("Down 22%");
    expect(formatPercentWorded(0, "en")).toBe("No change");

    expect(formatPercentWorded(18, "ru")).toBe("Больше на 18%");
    expect(formatPercentWorded(-22, "ru")).toBe("Меньше на 22%");
    expect(formatPercentWorded(0, "ru")).toBe("Без изменений");
  });
});
