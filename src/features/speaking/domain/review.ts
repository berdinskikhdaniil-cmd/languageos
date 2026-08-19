import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  hasMeaningfulText,
  isCategory,
  isSeverity,
  type ReviewIssue,
} from "@/features/writing/domain/review";

/**
 * What a speaking review is, and what the model is allowed to return.
 *
 * The issue taxonomy is Writing's, imported rather than copied, and that is a
 * decision rather than convenience: the mistake engine will one day count how
 * often somebody gets articles wrong, and it must see one skill whether the
 * learner typed it or said it. Two parallel enums with the same nine values
 * would halve every count for the rest of the product's life.
 *
 * What Speaking adds is the part Writing has no use for: a verdict on whether
 * the answer actually addressed the question it was asked. That is a spoken
 * exercise's other half — a grammatically flawless answer to a different
 * question is not a good answer.
 *
 * What Speaking deliberately does not add is any claim about pronunciation.
 * The transcript is text. Text cannot show how a vowel was produced, and a
 * score derived from it would be invented.
 */

/** Did the answer do what the topic asked? Three values, no number, no level. */
export const CONTENT_VERDICTS = ["yes", "partly", "no"] as const;

export type ContentVerdict = (typeof CONTENT_VERDICTS)[number];

export function isContentVerdict(value: unknown): value is ContentVerdict {
  return typeof value === "string" && (CONTENT_VERDICTS as readonly string[]).includes(value);
}

export type SpeakingReview = {
  summary: string;
  /** The learner's own answer, said well. In the language being learned. */
  improvedAnswer: string;
  content: { verdict: ContentVerdict; comment: string };
  issues: ReviewIssue[];
};

/** Caps that stop one bad response from filling a table. */
const MAX_ISSUES = 40;
const MAX_SUMMARY_CHARS = 1200;
const MAX_IMPROVED_CHARS = 24_000;
const MAX_FIELD_CHARS = 2000;

/**
 * How short an improved answer may be next to the transcript it rewrites.
 *
 * Lower than Writing's quarter, on purpose: tidying spontaneous speech
 * legitimately removes false starts, repetitions and filler, so a genuinely
 * good rewrite of a rambling answer really is shorter. This is here to catch a
 * model that gave up and returned a stub, not to argue with an editor.
 */
const MIN_IMPROVED_RATIO = 0.15;

/**
 * Whether a stored review is worth showing. Applied to rows as well as to fresh
 * responses, exactly as Writing does.
 */
export function isUsableSpeakingReview(
  summary: string | null,
  improvedAnswer: string | null,
): boolean {
  if (summary === null || improvedAnswer === null) return false;
  return hasMeaningfulText(summary) && hasMeaningfulText(improvedAnswer);
}

/**
 * The schema sent to the provider. Strict mode: every property required,
 * optionality expressed as a nullable type, `additionalProperties` false
 * throughout.
 */
export const SPEAKING_REVIEW_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "improvedAnswer", "content", "issues"],
  properties: {
    summary: {
      type: "string",
      description:
        "Two or three sentences addressed to the learner, in the feedback language named in the instructions: what worked in this spoken answer, and the one thing most worth fixing. No score, no level, no numbers out of ten, and nothing about pronunciation or accent — you are reading a transcript and cannot hear them.",
    },
    improvedAnswer: {
      type: "string",
      description:
        "The learner's whole answer as a fluent speaker would have said it, in the language being learned. Keep their meaning, their opinions and roughly their length. Natural spoken register, not an essay: contractions and ordinary spoken rhythm are right, formal written prose is not. Never a placeholder or a note about what you would change.",
    },
    content: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "comment"],
      properties: {
        verdict: {
          type: "string",
          enum: [...CONTENT_VERDICTS],
          description:
            "Whether the answer addressed the topic it was given: 'yes', 'partly', or 'no'. Judge the substance, not the language.",
        },
        comment: {
          type: "string",
          description:
            "One or two sentences, in the feedback language, on whether the answer addressed the topic and whether it was easy to follow. No score.",
        },
      },
    },
    issues: {
      type: "array",
      description:
        "One entry per concrete problem worth correcting, in the order they appear in the transcript. Spoken-language features that a fluent speaker would also produce are not problems.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "label", "severity", "originalFragment", "suggestion", "explanation"],
        properties: {
          category: { type: "string", enum: [...ISSUE_CATEGORIES] },
          label: {
            type: ["string", "null"],
            description:
              "The specific skill, in two or three words and always in English whatever language the feedback is written in: \"articles\", \"past tense\", \"collocation\". Null if nothing more specific applies.",
          },
          severity: { type: "string", enum: [...ISSUE_SEVERITIES] },
          originalFragment: {
            type: "string",
            description:
              "The exact substring from the transcript, copied character for character. Never paraphrased, never re-spaced, never tidied, and short enough to point at one problem.",
          },
          suggestion: {
            type: "string",
            description:
              "What that fragment should have been, in the language being learned — the corrected words themselves, not a description of the correction.",
          },
          explanation: {
            type: "string",
            description:
              "One or two sentences explaining why, in plain words, in the feedback language named in the instructions.",
          },
        },
      },
    },
  },
};

export type SpeakingReviewParseResult =
  | { ok: true; value: SpeakingReview }
  /** Where the response broke the contract — never the value that broke it. */
  | { ok: false; problem: string };

/**
 * Turns whatever the provider sent into a review, or refuses it whole.
 *
 * Fails closed, for the reason Writing does: a partly-broken response silently
 * reduced to "nothing to fix" tells somebody their answer was clean when
 * nobody checked. The transcript stays saved either way.
 */
export function parseSpeakingReview(
  data: unknown,
  transcript: string,
): SpeakingReviewParseResult {
  if (!isRecord(data)) return { ok: false, problem: "response: not an object" };

  const summary = readString(data.summary, MAX_SUMMARY_CHARS);
  if (summary === null) return { ok: false, problem: "summary: missing or not a string" };
  if (!hasMeaningfulText(summary)) return { ok: false, problem: "summary: no letters or digits" };

  const improvedAnswer = readString(data.improvedAnswer, MAX_IMPROVED_CHARS);
  if (improvedAnswer === null) {
    return { ok: false, problem: "improvedAnswer: missing or not a string" };
  }
  if (!hasMeaningfulText(improvedAnswer)) {
    return { ok: false, problem: "improvedAnswer: no letters or digits" };
  }

  const spoken = transcript.trim().length;
  const floor = Math.floor(spoken * MIN_IMPROVED_RATIO);
  if (improvedAnswer.length < floor) {
    // Lengths are not content, so they are safe to log.
    return {
      ok: false,
      problem: `improvedAnswer: ${improvedAnswer.length} characters rewrites ${spoken}`,
    };
  }

  const content = parseContent(data.content);
  if (!content.ok) return { ok: false, problem: `content.${content.problem}` };

  if (!Array.isArray(data.issues)) return { ok: false, problem: "issues: not an array" };
  if (data.issues.length > MAX_ISSUES) {
    return { ok: false, problem: `issues: ${data.issues.length} exceeds the ${MAX_ISSUES} allowed` };
  }

  const issues: ReviewIssue[] = [];
  for (const [index, candidate] of data.issues.entries()) {
    const parsed = parseIssue(candidate);
    if (!parsed.ok) return { ok: false, problem: `issues[${index}].${parsed.problem}` };
    issues.push(parsed.value);
  }

  return { ok: true, value: { summary, improvedAnswer, content: content.value, issues } };
}

type ContentParseResult =
  | { ok: true; value: { verdict: ContentVerdict; comment: string } }
  | { ok: false; problem: string };

function parseContent(candidate: unknown): ContentParseResult {
  if (!isRecord(candidate)) return { ok: false, problem: "not an object" };

  if (!isContentVerdict(candidate.verdict)) {
    return { ok: false, problem: "verdict: not one of yes/partly/no" };
  }

  const comment = readString(candidate.comment, MAX_FIELD_CHARS);
  if (comment === null || !hasMeaningfulText(comment)) {
    return { ok: false, problem: "comment: missing, not a string, or has no content" };
  }

  return { ok: true, value: { verdict: candidate.verdict, comment } };
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

  /** Blank is meaningful: it is how "drop this word" is expressed. */
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
