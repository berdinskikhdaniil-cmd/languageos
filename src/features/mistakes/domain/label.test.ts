import { describe, expect, it } from "vitest";
import { normalizeLabel, skillDisplayName } from "./label";

describe("normalizeLabel", () => {
  it("trims, lowercases and collapses whitespace", () => {
    expect(normalizeLabel("  Past   Tense ")).toBe("past tense");
    expect(normalizeLabel("PAST TENSE")).toBe("past tense");
    expect(normalizeLabel("past\ttense")).toBe("past tense");
    expect(normalizeLabel("past\ntense")).toBe("past tense");
  });

  it("groups the same skill written three ways", () => {
    const forms = ["Past tense", "past  tense", "past tense."];
    expect(new Set(forms.map(normalizeLabel)).size).toBe(1);
  });

  it("strips punctuation at the edges only", () => {
    expect(normalizeLabel('"articles"')).toBe("articles");
    expect(normalizeLabel("(articles)")).toBe("articles");
    expect(normalizeLabel("— articles —")).toBe("articles");
    // Inside a label punctuation is part of the name.
    expect(normalizeLabel("Subject-verb agreement")).toBe("subject-verb agreement");
    expect(normalizeLabel("don't / doesn't")).toBe("don't / doesn't");
  });

  it("keeps genuinely different labels apart", () => {
    // The whole rule: overlapping skills are still different skills, and
    // nothing here may decide otherwise.
    expect(normalizeLabel("past tense")).not.toBe(normalizeLabel("irregular verb"));
    expect(normalizeLabel("article")).not.toBe(normalizeLabel("articles"));
    expect(normalizeLabel("word order")).not.toBe(normalizeLabel("word choice"));
  });

  it("answers null when there is nothing to group by", () => {
    expect(normalizeLabel(null)).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
    expect(normalizeLabel("")).toBeNull();
    expect(normalizeLabel("   ")).toBeNull();
    expect(normalizeLabel("—")).toBeNull();
  });
});

describe("skillDisplayName", () => {
  const names = { "past tense": "Прошедшее время" };

  it("uses the curated name when there is one", () => {
    expect(skillDisplayName("past tense", "Past tense", names)).toBe("Прошедшее время");
  });

  it("shows an unknown label exactly as it was stored", () => {
    expect(skillDisplayName("subjunctive mood", "subjunctive mood", names)).toBe(
      "subjunctive mood",
    );
  });
});
