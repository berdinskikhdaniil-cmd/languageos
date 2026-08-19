import { describe, expect, it } from "vitest";
import { occurrence } from "@/features/mistakes/domain/fixtures";
import { selectWeakSpots } from "./weak-spots";

describe("selectWeakSpots", () => {
  it("offers a repeated skill before a category", () => {
    const spots = selectWeakSpots([
      occurrence({ issueId: "a", label: "past tense" }),
      occurrence({ issueId: "b", label: "past tense" }),
      occurrence({ issueId: "c", label: "articles", category: "word_choice" }),
    ]);

    expect(spots[0].target).toEqual({ kind: "skill", key: "past tense" });
    expect(spots[0].mistakes).toBe(2);
  });

  it("falls back to categories when no skill has come up twice", () => {
    const spots = selectWeakSpots([
      occurrence({ issueId: "a", label: "articles", category: "grammar" }),
      occurrence({ issueId: "b", label: "collocation", category: "word_choice" }),
    ]);

    expect(spots.every((spot) => spot.target.kind === "category")).toBe(true);
    expect(spots.map((spot) => spot.target)).toContainEqual({
      kind: "category",
      category: "grammar",
    });
  });

  it("never offers more than three", () => {
    const spots = selectWeakSpots(
      ["past tense", "articles", "word order", "collocation", "plural"].flatMap((label, index) => [
        occurrence({ issueId: `${label}-1`, label, position: index }),
        occurrence({ issueId: `${label}-2`, label, position: index }),
      ]),
    );

    expect(spots).toHaveLength(3);
  });

  it("leaves out a weak point made entirely of improvement suggestions", () => {
    /**
     * A note that a sentence was wordy is not a mistake, and a drill built on
     * one would teach that a matter of taste was an error.
     */
    const spots = selectWeakSpots([
      occurrence({ issueId: "a", severity: "style", category: "style", label: "wordiness" }),
      occurrence({ issueId: "b", severity: "style", category: "style", label: "wordiness" }),
      occurrence({ issueId: "c", severity: "awkward", category: "naturalness", label: null }),
    ]);

    expect(spots).toEqual([]);
  });

  it("counts only concrete mistakes beside a skill", () => {
    const spots = selectWeakSpots([
      occurrence({ issueId: "a", label: "past tense" }),
      occurrence({ issueId: "b", label: "past tense" }),
      occurrence({ issueId: "c", label: "past tense", severity: "style" }),
    ]);

    expect(spots[0].mistakes).toBe(2);
  });

  it("says nothing when there is nothing behind it", () => {
    expect(selectWeakSpots([])).toEqual([]);
  });

  it("carries the stored spelling of a skill for a label we have no name for", () => {
    const spots = selectWeakSpots([
      occurrence({ issueId: "a", label: "Conditional Mood" }),
      occurrence({ issueId: "b", label: "conditional mood" }),
    ]);

    expect(spots[0].target).toEqual({ kind: "skill", key: "conditional mood" });
    expect(spots[0].label).not.toBeNull();
  });
});
