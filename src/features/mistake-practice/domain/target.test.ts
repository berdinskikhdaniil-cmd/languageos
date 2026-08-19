import { describe, expect, it } from "vitest";
import { fromStoredTarget, practiceSessionHref, toStoredTarget } from "./target";

describe("toStoredTarget", () => {
  it("stores a category under its canonical identifier", () => {
    expect(toStoredTarget({ kind: "category", category: "grammar" })).toEqual({
      type: "category",
      key: "grammar",
    });
  });

  it("stores a skill under its normalised label", () => {
    expect(toStoredTarget({ kind: "skill", key: "past tense" })).toEqual({
      type: "skill",
      key: "past tense",
    });
  });
});

describe("fromStoredTarget", () => {
  it("round-trips both kinds", () => {
    for (const selection of [
      { kind: "category", category: "word_order" },
      { kind: "skill", key: "irregular verb" },
    ] as const) {
      const stored = toStoredTarget(selection);
      expect(fromStoredTarget(stored.type, stored.key)).toEqual(selection);
    }
  });

  it("normalises a skill key that arrived un-normalised", () => {
    // A hand-typed link should find the same weak point the product links to.
    expect(fromStoredTarget("skill", "  Past  Tense. ")).toEqual({
      kind: "skill",
      key: "past tense",
    });
  });

  it("refuses a category that is not one of the nine", () => {
    expect(fromStoredTarget("category", "vocabulary")).toBeNull();
    expect(fromStoredTarget("category", "")).toBeNull();
  });

  it("refuses a skill key with nothing left after normalisation", () => {
    expect(fromStoredTarget("skill", "   ")).toBeNull();
    expect(fromStoredTarget("skill", "…")).toBeNull();
  });

  it("refuses an unknown target type, however it is spelled", () => {
    expect(fromStoredTarget("Skill", "past tense")).toBeNull();
    expect(fromStoredTarget("topic", "past tense")).toBeNull();
    expect(fromStoredTarget(null, "past tense")).toBeNull();
    expect(fromStoredTarget("skill", null)).toBeNull();
  });

  it("never turns a category key into a skill by accident", () => {
    // "grammar" is a real category identifier, and a client sending it as a
    // skill is asking for a different thing entirely.
    expect(fromStoredTarget("skill", "grammar")).toEqual({ kind: "skill", key: "grammar" });
    expect(fromStoredTarget("category", "grammar")).toEqual({
      kind: "category",
      category: "grammar",
    });
  });
});

describe("practiceSessionHref", () => {
  it("points at the session's own route", () => {
    expect(practiceSessionHref("abc")).toBe("/practice/mistakes/abc");
  });
});
