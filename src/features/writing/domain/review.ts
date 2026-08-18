/**
 * What a writing review is, and what the model is allowed to return.
 *
 * The JSON Schema below is what OpenRouter enforces, and `parseReview` is what
 * we enforce afterwards. Both live here so they cannot drift apart, and a test
 * holds them to the same enums. A schema the provider promised to follow is not
 * a guarantee — some providers translate it into their own format and treat it
 * as a strong hint — so nothing reaches the database unvalidated.
 */

/**
 * Broad categories, chosen to work in any language rather than for English.
 *
 * Nine, and deliberately disjoint: the future mistake engine counts them, and a
 * weak point split across two overlapping buckets is a weak point it cannot
 * see. "vocabulary" is absent for that reason — in practice it is
 * indistinguishable from `word_choice`, and the pair would halve every count.
 * The finer detail lives in `label`.
 */
export const ISSUE_CATEGORIES = [
  /** Rules of form and structure: tense, aspect, mood, articles, case, particles. */
  "grammar",
  /** Subject–verb, gender, number, adjective endings. */
  "agreement",
  "word_order",
  /** The wrong word for the meaning, or a word that does not collocate. */
  "word_choice",
  "spelling",
  "punctuation",
  /** Correct, but not what a speaker of the language would actually say. */
  "naturalness",
  /** Register, wordiness, repetition. */
  "style",
  "other",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  grammar: "Grammar",
  agreement: "Agreement",
  word_order: "Word order",
  word_choice: "Word choice",
  spelling: "Spelling",
  punctuation: "Punctuation",
  naturalness: "Naturalness",
  style: "Style",
  other: "Other",
};

/** Three levels. Enough to sort by, few enough that the model uses them consistently. */
export const ISSUE_SEVERITIES = ["error", "awkward", "style"] as const;

export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  error: "Mistake",
  awkward: "Awkward",
  style: "Style",
};

export type ReviewIssue = {
  category: IssueCategory;
  /** The specific weak point: "articles", "past tense", "case", "collocation". */
  label: string | null;
  severity: IssueSeverity;
  /** Copied verbatim from the submission, so we can find it again ourselves. */
  originalFragment: string;
  suggestion: string;
  explanation: string;
};

export type WritingReview = {
  summary: string;
  improvedText: string;
  issues: ReviewIssue[];
};

/**
 * Caps that stop one bad response from filling a table. Generous enough that a
 * real review is never truncated.
 */
const MAX_ISSUES = 40;
const MAX_SUMMARY_CHARS = 1200;
const MAX_IMPROVED_CHARS = 24_000;
const MAX_FIELD_CHARS = 2000;

/**
 * The schema sent to the provider.
 *
 * Written for strict mode: every property is listed in `required`, optionality
 * is expressed as a nullable type rather than an absent key, and
 * `additionalProperties` is false at every level. Providers that support strict
 * JSON schema reject anything else.
 */
export const REVIEW_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "improvedText", "issues"],
  properties: {
    summary: {
      type: "string",
      description:
        "Two or three sentences addressed to the learner: what worked, and the one thing most worth fixing. No score, no level, no numbers out of ten.",
    },
    improvedText: {
      type: "string",
      description:
        "The learner's whole text rewritten correctly and naturally, keeping their meaning, voice and length.",
    },
    issues: {
      type: "array",
      description: "One entry per concrete problem, in the order they appear in the text.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "label", "severity", "originalFragment", "suggestion", "explanation"],
        properties: {
          category: { type: "string", enum: [...ISSUE_CATEGORIES] },
          label: {
            type: ["string", "null"],
            description:
              "The specific skill, in two or three words: \"articles\", \"past tense\", \"noun case\", \"collocation\". Null if nothing more specific applies.",
          },
          severity: { type: "string", enum: [...ISSUE_SEVERITIES] },
          originalFragment: {
            type: "string",
            description:
              "The exact substring from the learner's text, copied character for character. Never paraphrased, never re-spaced, and short enough to point at one problem.",
          },
          suggestion: { type: "string", description: "What that fragment should be instead." },
          explanation: {
            type: "string",
            description: "One or two sentences in English explaining why, in plain words.",
          },
        },
      },
    },
  },
};

export type ReviewParseResult =
  | { ok: true; value: WritingReview }
  /** A short, non-sensitive note for the server log. Never shown to a learner. */
  | { ok: false; problem: string };

/**
 * Turns whatever the provider sent into a review, or says why it cannot.
 *
 * Hand-written rather than delegated to a schema library: it is one shape, the
 * codebase already validates this way (see tracker/domain/manual-entry.ts), and
 * being explicit is what lets a single malformed issue be dropped without
 * throwing away a review that is otherwise fine.
 */
export function parseReview(data: unknown): ReviewParseResult {
  if (!isRecord(data)) return { ok: false, problem: "response is not an object" };

  const summary = readString(data.summary, MAX_SUMMARY_CHARS);
  if (summary === null) return { ok: false, problem: "summary is missing or not a string" };

  const improvedText = readString(data.improvedText, MAX_IMPROVED_CHARS);
  if (improvedText === null) {
    return { ok: false, problem: "improvedText is missing or not a string" };
  }

  if (!Array.isArray(data.issues)) return { ok: false, problem: "issues is not an array" };

  /**
   * A malformed issue is dropped, not fatal. The model getting one enum wrong
   * should cost the learner that line, not the whole review — but a response
   * where *everything* is malformed is a response we did not understand.
   */
  const issues: ReviewIssue[] = [];
  let rejected = 0;

  for (const candidate of data.issues.slice(0, MAX_ISSUES)) {
    const issue = parseIssue(candidate);
    if (issue) issues.push(issue);
    else rejected += 1;
  }

  if (issues.length === 0 && rejected > 0) {
    return { ok: false, problem: `all ${rejected} issues were malformed` };
  }

  return { ok: true, value: { summary, improvedText, issues } };
}

function parseIssue(candidate: unknown): ReviewIssue | null {
  if (!isRecord(candidate)) return null;

  const category = candidate.category;
  if (!isCategory(category)) return null;

  const severity = candidate.severity;
  if (!isSeverity(severity)) return null;

  const originalFragment = readString(candidate.originalFragment, MAX_FIELD_CHARS);
  const suggestion = readString(candidate.suggestion, MAX_FIELD_CHARS, { allowEmpty: true });
  const explanation = readString(candidate.explanation, MAX_FIELD_CHARS);
  if (originalFragment === null || suggestion === null || explanation === null) return null;

  const rawLabel = candidate.label;
  const label =
    typeof rawLabel === "string" && rawLabel.trim() !== ""
      ? rawLabel.trim().slice(0, 80)
      : null;

  return { category, label, severity, originalFragment, suggestion, explanation };
}

export function isCategory(value: unknown): value is IssueCategory {
  return typeof value === "string" && (ISSUE_CATEGORIES as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is IssueSeverity {
  return typeof value === "string" && (ISSUE_SEVERITIES as readonly string[]).includes(value);
}

/**
 * A string we are willing to store. Oversized values are truncated rather than
 * rejected — losing the tail of a long explanation beats losing the review.
 */
function readString(
  value: unknown,
  maxChars: number,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" && !allowEmpty) return null;
  return trimmed.slice(0, maxChars);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
