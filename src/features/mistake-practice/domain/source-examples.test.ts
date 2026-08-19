import { describe, expect, it } from "vitest";
import { occurrence } from "@/features/mistakes/domain/fixtures";
import { MAX_SOURCE_EXAMPLES, selectSourceExamples } from "./source-examples";

describe("selectSourceExamples", () => {
  it("sends at most six", () => {
    const chosen = selectSourceExamples(
      Array.from({ length: 20 }, (_, index) =>
        occurrence({ issueId: `i-${index}`, originalFragment: `fragment ${index}` }),
      ),
    );

    expect(chosen).toHaveLength(MAX_SOURCE_EXAMPLES);
  });

  it("keeps concrete mistakes and drops improvement suggestions", () => {
    const chosen = selectSourceExamples([
      occurrence({ issueId: "a", originalFragment: "I go", severity: "error" }),
      occurrence({ issueId: "b", originalFragment: "somewhat wordy", severity: "style" }),
      occurrence({ issueId: "c", originalFragment: "a bit odd", severity: "awkward" }),
    ]);

    expect(chosen.map((example) => example.originalFragment)).toEqual(["I go"]);
  });

  it("never repeats the same sentence, however it was spaced", () => {
    const chosen = selectSourceExamples([
      occurrence({ issueId: "a", originalFragment: "I go home" }),
      occurrence({ issueId: "b", originalFragment: "  I  GO home. " }),
      occurrence({ issueId: "c", originalFragment: "I come home" }),
    ]);

    expect(chosen).toHaveLength(2);
  });

  it("prefers the most recent", () => {
    const chosen = selectSourceExamples([
      occurrence({
        issueId: "old",
        originalFragment: "old one",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      occurrence({
        issueId: "new",
        originalFragment: "new one",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      }),
    ]);

    expect(chosen[0].originalFragment).toBe("new one");
  });

  it("carries only what identifies the skill", () => {
    const [example] = selectSourceExamples([occurrence({ issueId: "a" })]);

    expect(Object.keys(example).sort()).toEqual([
      "category",
      "explanation",
      "label",
      "originalFragment",
      "source",
      "suggestion",
    ]);
  });

  it("says nothing when a weak point has nothing concrete behind it", () => {
    expect(selectSourceExamples([occurrence({ issueId: "a", severity: "style" })])).toEqual([]);
  });
});
