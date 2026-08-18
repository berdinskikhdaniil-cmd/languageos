import { describe, expect, it } from "vitest";
import {
  writingIssueCategoryEnum,
  writingIssueSeverityEnum,
} from "@/db/schema";
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  REVIEW_JSON_SCHEMA,
  parseReview,
} from "./review";

const VALID_ISSUE = {
  category: "grammar",
  label: "past tense",
  severity: "error",
  originalFragment: "I go yesterday",
  suggestion: "I went yesterday",
  explanation: "Yesterday needs the past tense.",
};

const VALID = {
  summary: "Clear and easy to follow. Watch your past tenses.",
  improvedText: "I went to the shop yesterday.",
  issues: [VALID_ISSUE],
};

describe("a well-formed response", () => {
  it("is accepted whole", () => {
    const result = parseReview(VALID);

    expect(result).toEqual({
      ok: true,
      value: {
        summary: "Clear and easy to follow. Watch your past tenses.",
        improvedText: "I went to the shop yesterday.",
        issues: [VALID_ISSUE],
      },
    });
  });

  it("accepts a review with nothing to fix", () => {
    const result = parseReview({ ...VALID, issues: [] });
    expect(result).toMatchObject({ ok: true, value: { issues: [] } });
  });

  it("accepts a null label", () => {
    const result = parseReview({ ...VALID, issues: [{ ...VALID_ISSUE, label: null }] });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.issues[0].label).toBeNull();
  });

  it("treats a blank label as no label rather than an empty one", () => {
    const result = parseReview({ ...VALID, issues: [{ ...VALID_ISSUE, label: "   " }] });
    expect(result.ok && result.value.issues[0].label).toBeNull();
  });
});

describe("a response missing what the screen needs", () => {
  it("is rejected without a summary", () => {
    expect(parseReview({ ...VALID, summary: undefined })).toMatchObject({ ok: false });
    expect(parseReview({ ...VALID, summary: "" })).toMatchObject({ ok: false });
    expect(parseReview({ ...VALID, summary: 42 })).toMatchObject({ ok: false });
  });

  it("is rejected without an improved version", () => {
    expect(parseReview({ ...VALID, improvedText: undefined })).toMatchObject({ ok: false });
    expect(parseReview({ ...VALID, improvedText: null })).toMatchObject({ ok: false });
  });

  it("is rejected when issues is not a list", () => {
    expect(parseReview({ ...VALID, issues: "none" })).toMatchObject({ ok: false });
    expect(parseReview({ ...VALID, issues: undefined })).toMatchObject({ ok: false });
  });

  it("is rejected when it is not an object at all", () => {
    for (const value of [null, undefined, "text", 7, [], true]) {
      expect(parseReview(value)).toMatchObject({ ok: false });
    }
  });
});

describe("an invalid enum", () => {
  it("drops that issue rather than the review", () => {
    const result = parseReview({
      ...VALID,
      issues: [{ ...VALID_ISSUE, category: "articles" }, VALID_ISSUE],
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.issues).toHaveLength(1);
  });

  it("drops an unknown severity too", () => {
    const result = parseReview({
      ...VALID,
      issues: [{ ...VALID_ISSUE, severity: "critical" }, VALID_ISSUE],
    });
    expect(result.ok && result.value.issues).toHaveLength(1);
  });

  it("gives up when every single issue is malformed", () => {
    // A response where nothing parsed is a response we did not understand,
    // and pretending it was a clean review would be a lie.
    const result = parseReview({
      ...VALID,
      issues: [{ ...VALID_ISSUE, category: "nope" }, { nonsense: true }],
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("unexpected extras", () => {
  it("ignores fields we did not ask for", () => {
    const result = parseReview({
      ...VALID,
      score: 72,
      cefr: "B1",
      issues: [{ ...VALID_ISSUE, confidence: 0.9, offset: 3 }],
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && Object.keys(result.value)).toEqual([
      "summary",
      "improvedText",
      "issues",
    ]);
    expect(result.ok && Object.keys(result.value.issues[0])).toEqual([
      "category",
      "label",
      "severity",
      "originalFragment",
      "suggestion",
      "explanation",
    ]);
  });

  it("keeps an issue whose suggestion is empty — deleting a word is a suggestion", () => {
    const result = parseReview({ ...VALID, issues: [{ ...VALID_ISSUE, suggestion: "" }] });
    expect(result.ok && result.value.issues[0].suggestion).toBe("");
  });
});

describe("the schema sent to the provider", () => {
  it("declares the same categories and severities the parser accepts", () => {
    const issue = ((REVIEW_JSON_SCHEMA.properties as Record<string, { items?: unknown }>).issues
      .items ?? {}) as { properties: Record<string, { enum?: string[] }> };

    expect(issue.properties.category.enum).toEqual([...ISSUE_CATEGORIES]);
    expect(issue.properties.severity.enum).toEqual([...ISSUE_SEVERITIES]);
  });

  it("is strict all the way down, as strict mode requires", () => {
    const root = REVIEW_JSON_SCHEMA as {
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { items?: { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> } }>;
    };

    expect(root.additionalProperties).toBe(false);
    expect(root.required).toEqual(["summary", "improvedText", "issues"]);

    const issue = root.properties.issues.items;
    expect(issue?.additionalProperties).toBe(false);
    // Strict mode requires every declared property to be required; optionality
    // is expressed as a nullable type, not an absent key.
    expect(issue?.required.sort()).toEqual(Object.keys(issue?.properties ?? {}).sort());
  });

  it("asks for no score and no level anywhere", () => {
    const serialised = JSON.stringify(REVIEW_JSON_SCHEMA).toLowerCase();
    expect(serialised).not.toContain("cefr");
    expect(serialised).not.toContain('"score"');
  });
});

describe("the columns these values are stored in", () => {
  it("accept exactly the categories the domain defines", () => {
    // A mismatch here is not a type error anywhere — it is an insert that
    // fails at runtime, after the provider has already been paid.
    expect([...writingIssueCategoryEnum.enumValues]).toEqual([...ISSUE_CATEGORIES]);
  });

  it("accept exactly the severities the domain defines", () => {
    expect([...writingIssueSeverityEnum.enumValues]).toEqual([...ISSUE_SEVERITIES]);
  });
});
