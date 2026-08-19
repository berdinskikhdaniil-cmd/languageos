import { hasMeaningfulText } from "@/features/writing/domain/review";
import { EXERCISE_COUNT } from "./exercise";

/**
 * What a graded set is, and what the model is allowed to return.
 *
 * One request for the whole set rather than five, and that is a cost invariant
 * as much as a design one: five exercises is five completions if you grade them
 * one at a time, and the grader is better for seeing them together anyway —
 * it can tell a learner who missed the skill once from one who has not got it
 * at all.
 *
 * The three verdicts are the point of this file. Exact string comparison is not
 * an option for language: "Yesterday we went to the cinema" and "We went to the
 * cinema yesterday" are both right, and a grader that only knows correct and
 * wrong would call the second one a mistake because it is not the canonical
 * answer. `acceptable` is what stops that happening.
 */

export const PRACTICE_VERDICTS = ["correct", "acceptable", "incorrect"] as const;

export type PracticeVerdict = (typeof PRACTICE_VERDICTS)[number];

export function isPracticeVerdict(value: unknown): value is PracticeVerdict {
  return typeof value === "string" && (PRACTICE_VERDICTS as readonly string[]).includes(value);
}

/** A verdict that counts towards the "4 of 5" figure. Never a mastery claim. */
export function isAccepted(verdict: PracticeVerdict): boolean {
  return verdict !== "incorrect";
}

const MAX_CORRECTED_CHARS = 600;
const MAX_EXPLANATION_CHARS = 600;

export type GradedAnswer = {
  /** Which exercise this is about. 1-based, matching `mistake_practice_items.position`. */
  position: number;
  verdict: PracticeVerdict;
  /** The answer put right. Equal to the learner's own words when it was already right. */
  correctedAnswer: string;
  /** One to three sentences in the learner's interface language, about this skill. */
  explanation: string;
};

export const GRADING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      description: `Exactly ${EXERCISE_COUNT} results, one per exercise, identified by position.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["position", "verdict", "correctedAnswer", "explanation"],
        properties: {
          position: {
            type: "integer",
            description: "The number of the exercise this result is about, as given in the request.",
          },
          verdict: {
            type: "string",
            enum: [...PRACTICE_VERDICTS],
            description:
              "'correct' when the answer fully satisfies the exercise; 'acceptable' when it differs from the reference answer but is still correct language that does what the exercise asked; 'incorrect' only when the skill being practised is wrong, or the answer does not do what was asked.",
          },
          correctedAnswer: {
            type: "string",
            description:
              "The answer as it should read, in the language being learned. When the learner was right, repeat their own answer unchanged rather than rewriting it to taste.",
          },
          explanation: {
            type: "string",
            description:
              "One to three short sentences in the feedback language named in the instructions, about the skill this exercise practises and nothing else.",
          },
        },
      },
    },
  },
};

export type GradingParseResult =
  | { ok: true; value: GradedAnswer[] }
  /** Where the response broke the contract — never the value that broke it. */
  | { ok: false; problem: string };

/**
 * Turns whatever the provider sent into five results, or refuses the lot.
 *
 * `positions` is the set of exercises actually asked about, so a response can
 * be held to the exercises that exist rather than merely to a count. A result
 * for exercise 7, two results for exercise 3, or a missing exercise 4 are all
 * the same kind of failure: the mapping from answer to verdict is no longer
 * trustworthy, and a screen built on it would put somebody's answer next to
 * somebody else's correction.
 *
 * Fails closed, whole. The answers stay saved either way, so the cost of
 * refusing is one retry rather than an afternoon's work.
 */
export function parseGrading(
  data: unknown,
  positions: readonly number[],
): GradingParseResult {
  if (!isRecord(data)) return { ok: false, problem: "response: not an object" };

  const unexpected = unknownKeys(data, ["results"]);
  if (unexpected) return { ok: false, problem: `response: unexpected property ${unexpected}` };

  if (!Array.isArray(data.results)) return { ok: false, problem: "results: not an array" };
  if (data.results.length !== positions.length) {
    return {
      ok: false,
      problem: `results: ${data.results.length} where exactly ${positions.length} are required`,
    };
  }

  const expected = new Set(positions);
  const seen = new Set<number>();
  const graded: GradedAnswer[] = [];

  for (const [index, candidate] of data.results.entries()) {
    const parsed = parseResult(candidate);
    if (!parsed.ok) return { ok: false, problem: `results[${index}].${parsed.problem}` };

    const { position } = parsed.value;
    if (!expected.has(position)) {
      return { ok: false, problem: `results[${index}].position: ${position} is not an exercise` };
    }
    if (seen.has(position)) {
      return { ok: false, problem: `results[${index}].position: ${position} appears twice` };
    }
    seen.add(position);

    graded.push(parsed.value);
  }

  // Ordered by exercise rather than by the order the model happened to answer
  // in, so the screen never has to sort what it was handed.
  return { ok: true, value: graded.sort((a, b) => a.position - b.position) };
}

type ResultParseResult = { ok: true; value: GradedAnswer } | { ok: false; problem: string };

function parseResult(candidate: unknown): ResultParseResult {
  if (!isRecord(candidate)) return { ok: false, problem: "not an object" };

  const unexpected = unknownKeys(candidate, [
    "position",
    "verdict",
    "correctedAnswer",
    "explanation",
  ]);
  if (unexpected) return { ok: false, problem: `unexpected property ${unexpected}` };

  const position = candidate.position;
  if (typeof position !== "number" || !Number.isInteger(position)) {
    return { ok: false, problem: "position: not a whole number" };
  }

  if (!isPracticeVerdict(candidate.verdict)) {
    return { ok: false, problem: "verdict: not one of correct/acceptable/incorrect" };
  }

  const correctedAnswer = readString(candidate.correctedAnswer, MAX_CORRECTED_CHARS);
  if (correctedAnswer === null || !hasMeaningfulText(correctedAnswer)) {
    // Writing's `improvedText: ":"` again. A correction made of punctuation
    // would render as an empty line where the answer should be.
    return {
      ok: false,
      problem: "correctedAnswer: missing, not a string, or has no letters or digits",
    };
  }

  const explanation = readString(candidate.explanation, MAX_EXPLANATION_CHARS);
  if (explanation === null || !hasMeaningfulText(explanation)) {
    return {
      ok: false,
      problem: "explanation: missing, not a string, or has no letters or digits",
    };
  }

  return { ok: true, value: { position, verdict: candidate.verdict, correctedAnswer, explanation } };
}

/**
 * How a finished session reads as a number.
 *
 * Accepted over total, and it is a count of answers rather than a score. One
 * short session cannot establish that somebody has learned a skill, so nothing
 * here produces a percentage, a level or a mastery figure — see the copy in the
 * dictionary, which says "4 of 5 answers accepted" and stops.
 */
export type PracticeTally = {
  correct: number;
  acceptable: number;
  incorrect: number;
  /** correct + acceptable. The headline figure. */
  accepted: number;
  total: number;
};

export function tallyVerdicts(
  verdicts: readonly (PracticeVerdict | null)[],
): PracticeTally {
  let correct = 0;
  let acceptable = 0;
  let incorrect = 0;

  for (const verdict of verdicts) {
    if (verdict === "correct") correct += 1;
    else if (verdict === "acceptable") acceptable += 1;
    else if (verdict === "incorrect") incorrect += 1;
  }

  return {
    correct,
    acceptable,
    incorrect,
    accepted: correct + acceptable,
    total: correct + acceptable + incorrect,
  };
}

function readString(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, maxChars);
}

function unknownKeys(record: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
