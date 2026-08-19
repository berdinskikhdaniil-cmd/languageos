import { describe, expect, it } from "vitest";
import { mistakeDetailHref, parseMistakeSelection, progressHref } from "./links";

describe("progressHref", () => {
  it("leaves the default period out of the URL", () => {
    expect(progressHref("30d")).toBe("/progress");
    expect(progressHref("90d")).toBe("/progress?period=90d");
    expect(progressHref("all")).toBe("/progress?period=all");
  });
});

describe("mistakeDetailHref", () => {
  it("carries a category and the period", () => {
    expect(mistakeDetailHref({ kind: "category", category: "word_order" }, "90d")).toBe(
      "/progress/mistakes?category=word_order&period=90d",
    );
  });

  it("encodes a skill label whatever the model wrote in it", () => {
    const href = mistakeDetailHref({ kind: "skill", key: "past tense" }, "30d");
    expect(href).toBe("/progress/mistakes?skill=past+tense");

    // A label can hold anything — the reason this is a query string and not a
    // path segment.
    const awkward = mistakeDetailHref({ kind: "skill", key: "either/or" }, "30d");
    expect(awkward).toBe("/progress/mistakes?skill=either%2For");
    expect(new URL(awkward, "https://example.test").searchParams.get("skill")).toBe("either/or");
  });
});

describe("parseMistakeSelection", () => {
  it("reads a known category", () => {
    expect(parseMistakeSelection({ category: "grammar" })).toEqual({
      kind: "category",
      category: "grammar",
    });
  });

  it("refuses a category that is not one of ours", () => {
    expect(parseMistakeSelection({ category: "vocabulary" })).toBeNull();
  });

  it("normalises a hand-typed skill so it finds the same weak point", () => {
    expect(parseMistakeSelection({ skill: "Past  Tense" })).toEqual({
      kind: "skill",
      key: "past tense",
    });
  });

  it("answers null for a URL asking for nothing usable", () => {
    expect(parseMistakeSelection({})).toBeNull();
    expect(parseMistakeSelection({ skill: "  " })).toBeNull();
    expect(parseMistakeSelection({ period: "90d" })).toBeNull();
  });

  it("prefers the category when both are somehow present", () => {
    expect(parseMistakeSelection({ category: "spelling", skill: "articles" })).toEqual({
      kind: "category",
      category: "spelling",
    });
  });
});
