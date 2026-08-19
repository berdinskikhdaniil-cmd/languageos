import { describe, expect, it } from "vitest";
import {
  balanceBySource,
  countSeverities,
  occurrencesFor,
  recentMistakes,
  repeatedMistakes,
  weakPointsByCategory,
} from "./aggregate";
import { occurrence } from "./fixtures";
import { sortOccurrences } from "./occurrence";

describe("merging Writing and Speaking", () => {
  it("orders both sources by when the work was done, newest first", () => {
    const merged = sortOccurrences([
      occurrence({ issueId: "old-writing", createdAt: new Date("2026-08-01T10:00:00Z") }),
      occurrence({
        issueId: "new-speaking",
        source: "speaking",
        sourceId: "attempt-1",
        createdAt: new Date("2026-08-18T10:00:00Z"),
      }),
      occurrence({ issueId: "middle-writing", createdAt: new Date("2026-08-10T10:00:00Z") }),
    ]);

    expect(merged.map((item) => item.issueId)).toEqual([
      "new-speaking",
      "middle-writing",
      "old-writing",
    ]);
  });

  it("stays deterministic when two pieces of work share a timestamp", () => {
    const sameMoment = new Date("2026-08-18T10:00:00Z");
    const input = [
      occurrence({ issueId: "s1", source: "speaking", createdAt: sameMoment, position: 1 }),
      occurrence({ issueId: "w2", createdAt: sameMoment, position: 1 }),
      occurrence({ issueId: "w1", createdAt: sameMoment, position: 0 }),
    ];

    const once = sortOccurrences(input).map((item) => item.issueId);
    const twice = sortOccurrences([...input].reverse()).map((item) => item.issueId);

    expect(once).toEqual(["w1", "w2", "s1"]);
    expect(twice).toEqual(once);
  });
});

describe("countSeverities", () => {
  it("counts only `error` as a mistake", () => {
    const counts = countSeverities([
      occurrence({ issueId: "a", severity: "error" }),
      occurrence({ issueId: "b", severity: "error" }),
      occurrence({ issueId: "c", severity: "awkward" }),
      occurrence({ issueId: "d", severity: "style" }),
    ]);

    expect(counts).toEqual({ mistakes: 2, suggestions: 2 });
  });

  it("never folds stylistic notes into the headline figure", () => {
    // The exact case this rule exists for: good writing, many opinions.
    const counts = countSeverities([
      occurrence({ issueId: "a", severity: "error" }),
      ...Array.from({ length: 19 }, (_, index) =>
        occurrence({ issueId: `s${index}`, severity: "style" }),
      ),
    ]);

    expect(counts.mistakes).toBe(1);
    expect(counts.suggestions).toBe(19);
  });
});

describe("weakPointsByCategory", () => {
  it("reports both severities per category and keeps them apart", () => {
    const points = weakPointsByCategory([
      occurrence({ issueId: "a", category: "grammar", severity: "error" }),
      occurrence({ issueId: "b", category: "grammar", severity: "style" }),
      occurrence({ issueId: "c", category: "word_choice", severity: "error" }),
    ]);

    expect(points).toEqual([
      { category: "grammar", mistakes: 1, suggestions: 1, total: 2 },
      { category: "word_choice", mistakes: 1, suggestions: 0, total: 1 },
    ]);
  });

  it("sorts by concrete mistakes before anything else", () => {
    const points = weakPointsByCategory([
      ...Array.from({ length: 8 }, (_, index) =>
        occurrence({ issueId: `style${index}`, category: "style", severity: "style" }),
      ),
      occurrence({ issueId: "g1", category: "grammar", severity: "error" }),
      occurrence({ issueId: "g2", category: "grammar", severity: "error" }),
      occurrence({ issueId: "g3", category: "grammar", severity: "error" }),
    ]);

    expect(points.map((point) => point.category)).toEqual(["grammar", "style"]);
  });

  it("leaves out categories with nothing in them", () => {
    const points = weakPointsByCategory([occurrence({ issueId: "a", category: "spelling" })]);
    expect(points).toHaveLength(1);
  });
});

describe("repeatedMistakes", () => {
  it("needs two occurrences before calling anything repeated", () => {
    const repeated = repeatedMistakes([
      occurrence({ issueId: "a", label: "past tense" }),
      occurrence({ issueId: "b", label: "past tense" }),
      occurrence({ issueId: "c", label: "articles" }),
    ]);

    expect(repeated.map((item) => item.key)).toEqual(["past tense"]);
    expect(repeated[0].mistakes).toBe(2);
  });

  it("groups labels that differ only by case, spacing or a full stop", () => {
    const repeated = repeatedMistakes([
      occurrence({ issueId: "a", label: "Past tense" }),
      occurrence({ issueId: "b", label: "past  tense" }),
      occurrence({ issueId: "c", label: "past tense." }),
    ]);

    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({ key: "past tense", mistakes: 3 });
  });

  it("keeps different labels apart even when they overlap in meaning", () => {
    const repeated = repeatedMistakes([
      occurrence({ issueId: "a", label: "past tense" }),
      occurrence({ issueId: "b", label: "past tense" }),
      occurrence({ issueId: "c", label: "irregular verb" }),
      occurrence({ issueId: "d", label: "irregular verb" }),
    ]);

    expect(repeated.map((item) => item.key).sort()).toEqual(["irregular verb", "past tense"]);
  });

  it("counts concrete mistakes only, so a recurring style note is not one", () => {
    const repeated = repeatedMistakes([
      occurrence({ issueId: "a", label: "wordiness", severity: "style" }),
      occurrence({ issueId: "b", label: "wordiness", severity: "style" }),
      occurrence({ issueId: "c", label: "articles", severity: "error" }),
      occurrence({ issueId: "d", label: "articles", severity: "awkward" }),
    ]);

    expect(repeated).toEqual([]);
  });

  it("counts a skill across both Writing and Speaking as one weak point", () => {
    const repeated = repeatedMistakes([
      occurrence({ issueId: "a", label: "articles" }),
      occurrence({ issueId: "b", label: "articles", source: "speaking", sourceId: "attempt-1" }),
    ]);

    expect(repeated).toHaveLength(1);
    expect(repeated[0].bySource).toEqual({ writing: 1, speaking: 1 });
  });

  it("ignores occurrences the model gave no label to", () => {
    const repeated = repeatedMistakes([
      occurrence({ issueId: "a", label: null }),
      occurrence({ issueId: "b", label: null }),
    ]);

    expect(repeated).toEqual([]);
  });

  it("falls back to the most recent spelling of an unknown label", () => {
    const repeated = repeatedMistakes([
      occurrence({
        issueId: "a",
        label: "Subjunctive Mood",
        createdAt: new Date("2026-08-01T10:00:00Z"),
      }),
      occurrence({
        issueId: "b",
        label: "subjunctive mood",
        createdAt: new Date("2026-08-18T10:00:00Z"),
      }),
    ]);

    expect(repeated[0].label).toBe("subjunctive mood");
  });
});

describe("balanceBySource", () => {
  it("counts concrete mistakes on each side", () => {
    const balance = balanceBySource([
      occurrence({ issueId: "a" }),
      occurrence({ issueId: "b", source: "speaking" }),
      occurrence({ issueId: "c", source: "speaking" }),
      occurrence({ issueId: "d", source: "speaking", severity: "style" }),
    ]);

    expect(balance).toEqual({ writing: 1, speaking: 2 });
  });
});

describe("recentMistakes", () => {
  it("takes concrete mistakes only, newest first, up to the limit", () => {
    const recent = recentMistakes(
      [
        occurrence({ issueId: "a", createdAt: new Date("2026-08-01T10:00:00Z") }),
        occurrence({
          issueId: "style",
          severity: "style",
          createdAt: new Date("2026-08-18T10:00:00Z"),
        }),
        occurrence({ issueId: "b", createdAt: new Date("2026-08-10T10:00:00Z") }),
      ],
      2,
    );

    expect(recent.map((item) => item.issueId)).toEqual(["b", "a"]);
  });
});

describe("occurrencesFor", () => {
  const occurrences = [
    occurrence({ issueId: "a", category: "grammar", label: "past tense" }),
    occurrence({ issueId: "b", category: "grammar", label: "Past Tense", severity: "awkward" }),
    occurrence({ issueId: "c", category: "spelling", label: null }),
  ];

  it("lists a category with both severities, so the history is complete", () => {
    const listed = occurrencesFor(occurrences, { kind: "category", category: "grammar" });
    expect(listed.map((item) => item.issueId).sort()).toEqual(["a", "b"]);
  });

  it("matches a skill on its normalised label", () => {
    const listed = occurrencesFor(occurrences, { kind: "skill", key: "past tense" });
    expect(listed.map((item) => item.issueId).sort()).toEqual(["a", "b"]);
  });

  it("finds nothing for a skill nobody has", () => {
    expect(occurrencesFor(occurrences, { kind: "skill", key: "gerund" })).toEqual([]);
  });
});
