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

/** The submission every payload below is a review *of*. */
const SUBMISSION =
  "Yesterday I go to the city center with my girlfriend. We buyed two breads and decided walk in the park. The weather was nice and I am very happy.";

const VALID = {
  summary: "Clear and easy to follow. Watch your past tenses.",
  improvedText:
    "Yesterday I went to the city centre with my girlfriend. We bought two loaves of bread and decided to walk in the park. The weather was nice and I was very happy.",
  issues: [VALID_ISSUE],
};

/** Shorthand: every payload is validated against the same submission. */
const check = (data: unknown) => parseReview(data, SUBMISSION);

describe("a well-formed response", () => {
  it("is accepted whole", () => {
    const result = check(VALID);

    expect(result).toEqual({
      ok: true,
      value: {
        summary: VALID.summary,
        improvedText: VALID.improvedText,
        issues: [VALID_ISSUE],
      },
    });
  });

  it("accepts a review with nothing to fix", () => {
    const result = check({ ...VALID, issues: [] });
    expect(result).toMatchObject({ ok: true, value: { issues: [] } });
  });

  it("accepts a null label", () => {
    const result = check({ ...VALID, issues: [{ ...VALID_ISSUE, label: null }] });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.issues[0].label).toBeNull();
  });

  it("treats a blank label as no label rather than an empty one", () => {
    const result = check({ ...VALID, issues: [{ ...VALID_ISSUE, label: "   " }] });
    expect(result.ok && result.value.issues[0].label).toBeNull();
  });
});

describe("a response missing what the screen needs", () => {
  it("is rejected without a summary", () => {
    expect(check({ ...VALID, summary: undefined })).toMatchObject({ ok: false });
    expect(check({ ...VALID, summary: "" })).toMatchObject({ ok: false });
    expect(check({ ...VALID, summary: 42 })).toMatchObject({ ok: false });
  });

  it("is rejected without an improved version", () => {
    expect(check({ ...VALID, improvedText: undefined })).toMatchObject({ ok: false });
    expect(check({ ...VALID, improvedText: null })).toMatchObject({ ok: false });
  });

  it("is rejected when issues is not a list", () => {
    expect(check({ ...VALID, issues: "none" })).toMatchObject({ ok: false });
    expect(check({ ...VALID, issues: undefined })).toMatchObject({ ok: false });
  });

  it("is rejected when it is not an object at all", () => {
    for (const value of [null, undefined, "text", 7, [], true]) {
      expect(check(value)).toMatchObject({ ok: false });
    }
  });
});

describe("an invalid issue", () => {
  it("takes the whole review down with it", () => {
    /**
     * The behaviour this replaces dropped the bad issue and kept the rest,
     * which let a partly-broken response arrive on screen as a finished
     * review. Being told your writing is clean when nobody checked it is
     * worse than being told the review failed.
     */
    const result = check({
      ...VALID,
      issues: [{ ...VALID_ISSUE, category: "articles" }, VALID_ISSUE],
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.problem).toBe("issues[0].category: not a known category");
  });

  it("is refused even when every other issue is perfect", () => {
    const result = check({
      ...VALID,
      issues: [VALID_ISSUE, VALID_ISSUE, { ...VALID_ISSUE, severity: "critical" }],
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.problem).toBe("issues[2].severity: not a known severity");
  });

  it("names the field that broke, and never the value that broke it", () => {
    const cases: [unknown, string][] = [
      [{ ...VALID_ISSUE, category: "articles" }, "issues[0].category: not a known category"],
      [{ ...VALID_ISSUE, severity: 3 }, "issues[0].severity: not a known severity"],
      [
        { ...VALID_ISSUE, originalFragment: "   " },
        "issues[0].originalFragment: missing, not a string, or has no content",
      ],
      [{ ...VALID_ISSUE, suggestion: null }, "issues[0].suggestion: not a string"],
      [
        { ...VALID_ISSUE, explanation: ":" },
        "issues[0].explanation: missing, not a string, or has no content",
      ],
      [{ ...VALID_ISSUE, label: 7 }, "issues[0].label: neither a string nor null"],
      ["not an object", "issues[0].not an object"],
    ];

    for (const [issue, problem] of cases) {
      const result = check({ ...VALID, issues: [issue] });
      expect(result).toMatchObject({ ok: false, problem });
    }
  });

  it("never lets a rejected issue turn into an empty list", () => {
    // The false-success state, stated directly.
    const result = check({ ...VALID, issues: [{ nonsense: true }] });
    expect(result.ok).toBe(false);
  });
});

describe("no issues at all", () => {
  it("is accepted when the provider genuinely said so", () => {
    const result = check({ ...VALID, issues: [] });
    expect(result).toMatchObject({ ok: true, value: { issues: [] } });
  });
});

describe("unexpected extras", () => {
  it("ignores fields we did not ask for", () => {
    const result = check({
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
    const result = check({ ...VALID, issues: [{ ...VALID_ISSUE, suggestion: "" }] });
    expect(result.ok && result.value.issues[0].suggestion).toBe("");
  });
});

describe("the production failure of 18 August 2026", () => {
  /**
   * Reconstructed from the row itself: entry 72bb3fb4, review a8babf63,
   * status completed, 72 output tokens, improved_text one byte long (0x3a),
   * zero issue rows. The model wrote a summary that named a past-tense
   * problem and then gave up, and every layer waved it through — the schema
   * has no minimum length, the validator only asked for a non-empty string,
   * and the column only required non-null. The screen said "Nothing to fix".
   */
  const PRODUCTION_PAYLOAD = {
    summary:
      "Nice simple story! The main thing to work on is past tense consistency throughout.",
    improvedText: ":",
    issues: [],
  };

  it("is refused now, so it can never become a completed review again", () => {
    const result = check(PRODUCTION_PAYLOAD);

    expect(result).toMatchObject({
      ok: false,
      problem: "improvedText: no letters or digits",
    });
  });

  it("would have been accepted before the fix", () => {
    // The shape is schema-valid: object, three keys, right types, right names.
    // Nothing but a content rule can catch it.
    expect(typeof PRODUCTION_PAYLOAD.summary).toBe("string");
    expect(typeof PRODUCTION_PAYLOAD.improvedText).toBe("string");
    expect(PRODUCTION_PAYLOAD.improvedText.length).toBeGreaterThan(0);
    expect(Array.isArray(PRODUCTION_PAYLOAD.issues)).toBe(true);
  });

  it("is refused in every other punctuation-only shape too", () => {
    for (const improvedText of [":", ".", "-", "—", "   ", "...", "!?", "\n\t", "***"]) {
      expect(check({ ...VALID, improvedText })).toMatchObject({ ok: false });
    }
  });

  it("is refused when the model gives up with a short stub instead", () => {
    // A stub with letters passes the meaningfulness rule, so length relative
    // to the submission is what catches this one.
    const result = check({ ...VALID, improvedText: "Good.", issues: [] });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.problem).toContain("improvedText:");
  });

  it("refuses a punctuation-only summary for the same reason", () => {
    expect(check({ ...VALID, summary: "—" })).toMatchObject({
      ok: false,
      problem: "summary: no letters or digits",
    });
  });
});

describe("a rewrite in a language without a Latin alphabet", () => {
  it("is accepted — the content rule is Unicode-aware, not English-only", () => {
    const submissions: [string, string][] = [
      ["私は昨日学校に行きました。とても楽しかったです。", "私は昨日学校へ行きました。とても楽しかったです。"],
      ["我昨天去了商店，买了面包和奶酪。", "我昨天去了商店，买了面包和奶酪。"],
      ["أنا أذهب إلى المدرسة كل يوم مع أختي.", "أنا أذهب إلى المدرسة كل يوم مع أختي."],
      ["Εγώ πηγαίνω στο σχολείο κάθε μέρα.", "Εγώ πηγαίνω στο σχολείο κάθε μέρα."],
      ["Вчера я ходил в магазин и купил хлеб.", "Вчера я ходил в магазин и купил хлеб."],
    ];

    for (const [submission, improvedText] of submissions) {
      const result = parseReview({ summary: "良い文章です。", improvedText, issues: [] }, submission);
      expect(result).toMatchObject({ ok: true });
    }
  });

  it("accepts a rewrite whose only content is digits", () => {
    expect(check({ ...VALID, improvedText: "1234567890123456789012345678901234567890" })).toMatchObject({
      ok: true,
    });
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
