import { describe, expect, it } from "vitest";
import { speakingIssues } from "@/db/schema";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES } from "@/features/writing/domain/review";
import {
  CONTENT_VERDICTS,
  SPEAKING_REVIEW_JSON_SCHEMA,
  isUsableSpeakingReview,
  parseSpeakingReview,
} from "./review";

/**
 * What the provider is allowed to return, and what we refuse.
 *
 * The contract fails closed, exactly as Writing's does: a partly-broken
 * response quietly reduced to "nothing to fix" would tell somebody their answer
 * was clean when nobody actually checked it.
 */

const TRANSCRIPT =
  "Yesterday I go to the shop and I buyed some bread for my breakfast today, it was very nice.";

const ISSUE = {
  category: "grammar",
  label: "past tense",
  severity: "error",
  originalFragment: "I go",
  suggestion: "I went",
  explanation: "Yesterday needs the past tense.",
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Clear and easy to follow. Watch your past tenses.",
    improvedAnswer:
      "Yesterday I went to the shop and bought some bread for breakfast. It was really nice.",
    content: { verdict: "yes", comment: "You answered the topic directly." },
    issues: [ISSUE],
    ...overrides,
  };
}

describe("a well-formed review", () => {
  it("is accepted whole", () => {
    const result = parseSpeakingReview(payload(), TRANSCRIPT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.value.summary).toContain("Clear and easy to follow");
    expect(result.value.content).toEqual({
      verdict: "yes",
      comment: "You answered the topic directly.",
    });
    expect(result.value.issues).toHaveLength(1);
    expect(result.value.issues[0]).toMatchObject({ category: "grammar", label: "past tense" });
  });

  it("accepts an answer with nothing wrong with it", () => {
    // An empty list is a real finding. What must never happen is a list that
    // became empty here.
    const result = parseSpeakingReview(payload({ issues: [] }), TRANSCRIPT);
    expect(result.ok).toBe(true);
  });

  it("accepts every verdict the schema offers", () => {
    for (const verdict of CONTENT_VERDICTS) {
      const result = parseSpeakingReview(
        payload({ content: { verdict, comment: "A comment." } }),
        TRANSCRIPT,
      );
      expect(result.ok, verdict).toBe(true);
    }
  });

  it("keeps an empty suggestion, which is how 'drop this word' is expressed", () => {
    const result = parseSpeakingReview(
      payload({ issues: [{ ...ISSUE, suggestion: "" }] }),
      TRANSCRIPT,
    );
    if (!result.ok) throw new Error(result.problem);
    expect(result.value.issues[0].suggestion).toBe("");
  });

  it("normalises a blank label to null rather than storing whitespace", () => {
    const result = parseSpeakingReview(
      payload({ issues: [{ ...ISSUE, label: "   " }] }),
      TRANSCRIPT,
    );
    if (!result.ok) throw new Error(result.problem);
    expect(result.value.issues[0].label).toBeNull();
  });
});

describe("a response that breaks the contract", () => {
  it("is refused whole, never reduced to a partial review", () => {
    const result = parseSpeakingReview(
      payload({ issues: [ISSUE, { ...ISSUE, category: "made_up_category" }] }),
      TRANSCRIPT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The path is enough to diagnose it from a log; the value is not in it.
    expect(result.problem).toContain("issues[1].category");
  });

  it("refuses a summary or an improved answer with no language in it", () => {
    // The exact shape that reached production once: a schema-valid single colon.
    expect(parseSpeakingReview(payload({ summary: ":" }), TRANSCRIPT).ok).toBe(false);
    expect(parseSpeakingReview(payload({ improvedAnswer: "." }), TRANSCRIPT).ok).toBe(false);
  });

  it("refuses an improved answer far too short to be a rewrite", () => {
    const result = parseSpeakingReview(payload({ improvedAnswer: "Good." }), TRANSCRIPT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("improvedAnswer");
  });

  it("still allows a rewrite that is legitimately shorter than rambling speech", () => {
    // Tidying spontaneous speech removes false starts and repetition, so a good
    // rewrite really is shorter. The floor exists to catch a stub, not an editor.
    const rambling = `${TRANSCRIPT} ${TRANSCRIPT} ${TRANSCRIPT}`;
    const result = parseSpeakingReview(payload(), rambling);
    expect(result.ok).toBe(true);
  });

  it("refuses a missing or malformed content verdict", () => {
    for (const content of [
      undefined,
      null,
      "yes",
      { verdict: "maybe", comment: "x" },
      { verdict: "yes" },
      { verdict: "yes", comment: "  " },
    ]) {
      const result = parseSpeakingReview(payload({ content }), TRANSCRIPT);
      expect(result.ok, JSON.stringify(content)).toBe(false);
      if (!result.ok) expect(result.problem).toContain("content");
    }
  });

  it("refuses anything that is not an object, or issues that are not an array", () => {
    expect(parseSpeakingReview(null, TRANSCRIPT).ok).toBe(false);
    expect(parseSpeakingReview("a review", TRANSCRIPT).ok).toBe(false);
    expect(parseSpeakingReview(payload({ issues: "none" }), TRANSCRIPT).ok).toBe(false);
  });

  it("refuses an implausible pile of issues rather than filling a table", () => {
    const many = Array.from({ length: 41 }, () => ISSUE);
    const result = parseSpeakingReview(payload({ issues: many }), TRANSCRIPT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("41");
  });

  it("never puts the learner's words into the problem it reports", () => {
    const result = parseSpeakingReview(
      payload({ issues: [{ ...ISSUE, explanation: "" }] }),
      TRANSCRIPT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).not.toContain("shop");
  });
});

describe("whether a stored review is worth showing", () => {
  it("needs both halves, with something in them", () => {
    expect(isUsableSpeakingReview("A summary.", "An answer.")).toBe(true);
    expect(isUsableSpeakingReview(null, "An answer.")).toBe(false);
    expect(isUsableSpeakingReview("A summary.", null)).toBe(false);
    expect(isUsableSpeakingReview(":", "An answer.")).toBe(false);
    expect(isUsableSpeakingReview("A summary.", "…")).toBe(false);
  });
});

describe("the schema sent to the provider", () => {
  const properties = SPEAKING_REVIEW_JSON_SCHEMA.properties as Record<string, Record<string, unknown>>;

  it("offers exactly the taxonomy the database stores", () => {
    // One taxonomy across Writing and Speaking, so the future mistake engine
    // counts a skill once rather than twice.
    const items = properties.issues.items as Record<string, Record<string, Record<string, unknown>>>;

    expect(items.properties.category.enum).toEqual([...ISSUE_CATEGORIES]);
    expect(items.properties.severity.enum).toEqual([...ISSUE_SEVERITIES]);
    expect([...speakingIssues.category.enumValues]).toEqual([...ISSUE_CATEGORIES]);
    expect([...speakingIssues.severity.enumValues]).toEqual([...ISSUE_SEVERITIES]);
  });

  it("offers exactly the verdicts the column accepts", () => {
    const content = properties.content as { properties: Record<string, { enum?: unknown }> };
    expect(content.properties.verdict.enum).toEqual([...CONTENT_VERDICTS]);
  });

  it("is written for strict mode: every field required, nothing extra allowed", () => {
    expect(SPEAKING_REVIEW_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(SPEAKING_REVIEW_JSON_SCHEMA.required).toEqual([
      "summary",
      "improvedAnswer",
      "content",
      "issues",
    ]);
  });

  it("tells the model, in the schema itself, not to touch pronunciation", () => {
    expect(String(properties.summary.description).toLowerCase()).toContain("pronunciation");
    expect(String(properties.summary.description).toLowerCase()).toContain("cannot hear");
  });

  it("names the label as English wherever the feedback language lands", () => {
    const items = properties.issues.items as Record<string, Record<string, Record<string, unknown>>>;
    expect(String(items.properties.label.description)).toContain("always in English");
  });
});
