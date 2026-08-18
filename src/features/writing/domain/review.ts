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
 * Whether a string carries actual language, as opposed to punctuation.
 *
 * Unicode-aware on purpose: the product is used in Japanese, Chinese, Arabic
 * and Greek, so "does it contain a letter" cannot mean "does it contain a–z".
 * `\p{L}` covers every script's letters and `\p{N}` every script's digits.
 *
 * This exists because of a real production review: the model returned a valid,
 * schema-conforming object whose improved text was a single colon, and every
 * layer accepted it — the schema had no minimum length, the validator only
 * checked for a non-empty string, and the column only required non-null.
 */
const MEANINGFUL_CHARACTER = /[\p{L}\p{N}]/u;

export function hasMeaningfulText(value: string): boolean {
  return MEANINGFUL_CHARACTER.test(value);
}

/**
 * How short an improved version may be next to the text it rewrites.
 *
 * A rewrite keeps the learner's meaning and length, so anything under a quarter
 * of the original is not a rewrite — it is a model that gave up and emitted a
 * stub. Deliberately generous: the check is here to catch abandonment, not to
 * second-guess an editor who tightened somebody's prose.
 */
const MIN_IMPROVED_RATIO = 0.25;

/**
 * Whether a stored review is worth showing.
 *
 * Applied to rows as well as to fresh responses, because reviews written before
 * this check existed are still in the database. One of them is the production
 * review that prompted all of this: it stays as it is until its author asks for
 * it again, and until then the app treats it as the failure it always was.
 */
export function isUsableReviewContent(
  summary: string | null,
  improvedText: string | null,
): boolean {
  if (summary === null || improvedText === null) return false;
  return hasMeaningfulText(summary) && hasMeaningfulText(improvedText);
}

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
        "The learner's whole text rewritten correctly and naturally, keeping their meaning, voice and length. The complete text, roughly as long as the original — never a placeholder, a single character, or a note about what you would change.",
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
  /**
   * Where the response broke the contract — "issues[2].category", not the
   * value that broke it. The path is enough to diagnose a provider problem
   * from a log, and it cannot carry a learner's sentence into one.
   */
  | { ok: false; problem: string };

/**
 * Turns whatever the provider sent into a review, or refuses it.
 *
 * This fails closed, and that is the whole point of it.
 *
 * It used to be forgiving: an issue that broke the schema was dropped and the
 * rest was presented as a finished review. That turned a partly-broken response
 * into a confident "Nothing to fix", which is worse than no review at all — the
 * learner is told their writing is clean when nobody actually checked it. A
 * response that does not hold together is now refused whole, the entry stays
 * saved, and they are offered the button again.
 *
 * `originalText` is the submission being reviewed. It is needed because some of
 * the contract is relational: an improved version is a rewrite of a specific
 * text, and "a quarter the length of it" is a thing only this function can see.
 */
export function parseReview(data: unknown, originalText: string): ReviewParseResult {
  if (!isRecord(data)) return { ok: false, problem: "response: not an object" };

  const summary = readString(data.summary, MAX_SUMMARY_CHARS);
  if (summary === null) return { ok: false, problem: "summary: missing or not a string" };
  if (!hasMeaningfulText(summary)) {
    return { ok: false, problem: "summary: no letters or digits" };
  }

  const improvedText = readString(data.improvedText, MAX_IMPROVED_CHARS);
  if (improvedText === null) {
    return { ok: false, problem: "improvedText: missing or not a string" };
  }
  if (!hasMeaningfulText(improvedText)) {
    // The exact production failure: a schema-valid single colon.
    return { ok: false, problem: "improvedText: no letters or digits" };
  }

  const floor = Math.floor(originalText.trim().length * MIN_IMPROVED_RATIO);
  if (improvedText.length < floor) {
    // Lengths are not content, so they are safe to log.
    return {
      ok: false,
      problem: `improvedText: ${improvedText.length} characters rewrites ${originalText.trim().length}`,
    };
  }

  if (!Array.isArray(data.issues)) return { ok: false, problem: "issues: not an array" };
  if (data.issues.length > MAX_ISSUES) {
    return { ok: false, problem: `issues: ${data.issues.length} exceeds the ${MAX_ISSUES} allowed` };
  }

  /**
   * Every issue, or none of them.
   *
   * An empty array is a perfectly good answer — some writing has nothing
   * concrete wrong with it. What must never happen is an array becoming empty
   * *here*, because then "Nothing to fix" would mean "we threw the findings
   * away", and the two are indistinguishable on screen.
   */
  const issues: ReviewIssue[] = [];

  for (const [index, candidate] of data.issues.entries()) {
    const parsed = parseIssue(candidate);
    if (!parsed.ok) return { ok: false, problem: `issues[${index}].${parsed.problem}` };
    issues.push(parsed.value);
  }

  return { ok: true, value: { summary, improvedText, issues } };
}

type IssueParseResult = { ok: true; value: ReviewIssue } | { ok: false; problem: string };

function parseIssue(candidate: unknown): IssueParseResult {
  if (!isRecord(candidate)) return { ok: false, problem: "not an object" };

  const category = candidate.category;
  if (!isCategory(category)) return { ok: false, problem: "category: not a known category" };

  const severity = candidate.severity;
  if (!isSeverity(severity)) return { ok: false, problem: "severity: not a known severity" };

  const originalFragment = readString(candidate.originalFragment, MAX_FIELD_CHARS);
  if (originalFragment === null || !hasMeaningfulText(originalFragment)) {
    return { ok: false, problem: "originalFragment: missing, not a string, or has no content" };
  }

  /**
   * An empty suggestion is meaningful: it is how "delete this word" is
   * expressed. It is the only field allowed to be blank.
   */
  const suggestion = readString(candidate.suggestion, MAX_FIELD_CHARS, { allowEmpty: true });
  if (suggestion === null) return { ok: false, problem: "suggestion: not a string" };

  const explanation = readString(candidate.explanation, MAX_FIELD_CHARS);
  if (explanation === null || !hasMeaningfulText(explanation)) {
    return { ok: false, problem: "explanation: missing, not a string, or has no content" };
  }

  const rawLabel = candidate.label;
  if (rawLabel !== null && rawLabel !== undefined && typeof rawLabel !== "string") {
    return { ok: false, problem: "label: neither a string nor null" };
  }

  const label =
    typeof rawLabel === "string" && rawLabel.trim() !== "" ? rawLabel.trim().slice(0, 80) : null;

  return {
    ok: true,
    value: { category, label, severity, originalFragment, suggestion, explanation },
  };
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
