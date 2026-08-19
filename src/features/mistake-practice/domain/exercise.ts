import { hasMeaningfulText } from "@/features/writing/domain/review";

/**
 * What a generated exercise set is, and what the model is allowed to return.
 *
 * The JSON Schema below is what OpenRouter enforces and `parseExerciseSet` is
 * what we enforce afterwards, exactly as Writing splits the two. A schema a
 * provider promised to follow is not a guarantee — some translate it into their
 * own format and treat it as a strong hint — so nothing reaches the database
 * unvalidated.
 *
 * This one fails closed harder than a review does, and for a different reason.
 * A review with one bad issue could in principle be shown without it; a practice
 * set with one bad exercise cannot be shown as four, because "five exercises" is
 * the whole shape of the screen and quietly delivering four would be a product
 * decision made by a malformed response. A set that does not hold together is
 * refused whole and the learner is offered the button again.
 */

/**
 * Two shapes, both of which ask the learner to *produce* language.
 *
 * There is deliberately no multiple choice. Recognising the right answer among
 * four is a different skill from recalling it, and it is the easier one — a
 * learner who keeps getting the past tense wrong needs to write "went", not to
 * spot it in a list.
 */
export const EXERCISE_TYPES = ["fill_blank", "rewrite"] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export function isExerciseType(value: unknown): value is ExerciseType {
  return typeof value === "string" && (EXERCISE_TYPES as readonly string[]).includes(value);
}

/**
 * Five, and exactly five.
 *
 * A short session that fits between two other things is the point. Twenty
 * exercises is homework, and homework is what the learner already avoids.
 */
export const EXERCISE_COUNT = 5;

/** The one blank marker. Everything reads and writes this and nothing else. */
export const BLANK_MARKER = "___";

/** Caps that stop one bad response from filling a table. Mirrored by CHECKs. */
const MAX_PROMPT_CHARS = 600;
const MAX_ANSWER_CHARS = 600;
const MAX_NOTES_CHARS = 600;

export type GeneratedExercise = {
  type: ExerciseType;
  /** What the learner reads. In the language being learned, or an instruction plus it. */
  prompt: string;
  /** One correct answer. Not the only one — see ./grading. */
  canonicalAnswer: string;
  /** Server-only context for the grader. Never sent to the browser before checking. */
  gradingNotes: string | null;
};

export const EXERCISE_SET_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["exercises"],
  properties: {
    exercises: {
      type: "array",
      description: `Exactly ${EXERCISE_COUNT} exercises, each training the same weak skill in a new context.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "canonicalAnswer", "gradingNotes"],
        properties: {
          type: {
            type: "string",
            enum: [...EXERCISE_TYPES],
            description:
              "'fill_blank' for a sentence with one gap to complete; 'rewrite' for a sentence the learner must say again in a different form.",
          },
          prompt: {
            type: "string",
            description: `What the learner reads. For 'fill_blank': one short sentence in the language being learned containing exactly one gap written as ${BLANK_MARKER}, optionally with a cue in brackets. For 'rewrite': a one-line instruction followed by the sentence to rewrite, in quotation marks. Never a question about grammar, never an explanation, and never a copy of anything from the learner's own past mistakes.`,
          },
          canonicalAnswer: {
            type: "string",
            description:
              "One correct answer, in the language being learned. For 'fill_blank' just the words that belong in the gap; for 'rewrite' the whole rewritten sentence. Other correct answers may exist — this is the reference, not the only one.",
          },
          gradingNotes: {
            type: ["string", "null"],
            description:
              "One short English note for the grader: what this exercise is actually testing and which other answers would also be right. Never shown to the learner. Null if there is nothing to add.",
          },
        },
      },
    },
  },
};

export type ExerciseSetParseResult =
  | { ok: true; value: GeneratedExercise[] }
  /**
   * Where the response broke the contract — "exercises[2].prompt", not the
   * value that broke it. Enough to diagnose a provider problem from a log, and
   * incapable of carrying a learner's sentence into one.
   */
  | { ok: false; problem: string };

/**
 * Text the learner's own mistakes are compared against, so a "new" exercise
 * cannot turn out to be their old sentence with the same words in it.
 */
export type SourceText = {
  originalFragment: string;
  suggestion: string;
};

/**
 * Turns whatever the provider sent into five exercises, or refuses the lot.
 *
 * `sources` are the learner's real occurrences that grounded the generation.
 * They are here because part of the contract is relational: "do not reproduce
 * one of these verbatim" is a rule only this function can check, and a model
 * that echoes the sentence somebody already got wrong has produced a memory
 * test rather than practice.
 */
export function parseExerciseSet(
  data: unknown,
  sources: readonly SourceText[] = [],
): ExerciseSetParseResult {
  if (!isRecord(data)) return { ok: false, problem: "response: not an object" };

  const unexpected = unknownKeys(data, ["exercises"]);
  if (unexpected) return { ok: false, problem: `response: unexpected property ${unexpected}` };

  if (!Array.isArray(data.exercises)) return { ok: false, problem: "exercises: not an array" };
  if (data.exercises.length !== EXERCISE_COUNT) {
    return {
      ok: false,
      problem: `exercises: ${data.exercises.length} where exactly ${EXERCISE_COUNT} are required`,
    };
  }

  const forbidden = new Set<string>();
  for (const source of sources) {
    for (const text of [source.originalFragment, source.suggestion]) {
      const key = comparisonKey(text);
      if (key !== "") forbidden.add(key);
    }
  }

  const exercises: GeneratedExercise[] = [];
  const seenPrompts = new Set<string>();

  for (const [index, candidate] of data.exercises.entries()) {
    const parsed = parseExercise(candidate);
    if (!parsed.ok) return { ok: false, problem: `exercises[${index}].${parsed.problem}` };

    const promptKey = comparisonKey(parsed.value.prompt);
    if (seenPrompts.has(promptKey)) {
      return { ok: false, problem: `exercises[${index}].prompt: repeats an earlier prompt` };
    }
    seenPrompts.add(promptKey);

    /**
     * The deterministic half of "do not copy the old sentence".
     *
     * Both the prompt as written and the prompt with its gap filled in are
     * compared, because "Yesterday we ___ to the cinema" is a copy of the
     * learner's own sentence the moment the answer is put back into it. This is
     * a verbatim check and nothing more — there is no semantic plagiarism
     * detector here, and the real work of inventing fresh contexts is done by
     * the prompt in ./prompt.ts.
     */
    for (const form of [parsed.value.prompt, filledForm(parsed.value)]) {
      const key = comparisonKey(form);
      if (key !== "" && forbidden.has(key)) {
        return {
          ok: false,
          problem: `exercises[${index}].prompt: reproduces one of the learner's own sentences`,
        };
      }
    }

    exercises.push(parsed.value);
  }

  return { ok: true, value: exercises };
}

type ExerciseParseResult =
  | { ok: true; value: GeneratedExercise }
  | { ok: false; problem: string };

function parseExercise(candidate: unknown): ExerciseParseResult {
  if (!isRecord(candidate)) return { ok: false, problem: "not an object" };

  const unexpected = unknownKeys(candidate, [
    "type",
    "prompt",
    "canonicalAnswer",
    "gradingNotes",
  ]);
  if (unexpected) return { ok: false, problem: `unexpected property ${unexpected}` };

  const type = candidate.type;
  if (!isExerciseType(type)) return { ok: false, problem: "type: not a supported exercise type" };

  const rawPrompt = readString(candidate.prompt, MAX_PROMPT_CHARS);
  if (rawPrompt === null || !hasMeaningfulText(rawPrompt)) {
    return { ok: false, problem: "prompt: missing, not a string, or has no letters or digits" };
  }

  const canonicalAnswer = readString(candidate.canonicalAnswer, MAX_ANSWER_CHARS);
  if (canonicalAnswer === null || !hasMeaningfulText(canonicalAnswer)) {
    // The lesson from Writing's `improvedText: ":"`: schema-valid, non-empty,
    // and completely useless. A punctuation-only answer is not an answer.
    return {
      ok: false,
      problem: "canonicalAnswer: missing, not a string, or has no letters or digits",
    };
  }

  let prompt = rawPrompt;

  if (type === "fill_blank") {
    const normalized = normalizeBlank(rawPrompt);
    if (!normalized.ok) return { ok: false, problem: `prompt: ${normalized.problem}` };
    prompt = normalized.value;
  }

  const rawNotes = candidate.gradingNotes;
  if (rawNotes !== null && rawNotes !== undefined && typeof rawNotes !== "string") {
    return { ok: false, problem: "gradingNotes: neither a string nor null" };
  }
  const notes = readString(rawNotes, MAX_NOTES_CHARS);

  return {
    ok: true,
    value: {
      type,
      prompt,
      canonicalAnswer,
      gradingNotes: notes !== null && hasMeaningfulText(notes) ? notes : null,
    },
  };
}

type BlankResult = { ok: true; value: string } | { ok: false; problem: string };

/**
 * Exactly one gap, written the one way.
 *
 * The *count* is strict and the *spelling* is not: a run of underscores is a
 * gap however many of them the model typed, and normalising "____" to the
 * marker keeps a near-miss from costing five exercises. Two separate runs is a
 * different thing entirely — a sentence with two gaps tests two skills at once,
 * which is the exact fault this feature is supposed to avoid — so that is
 * refused rather than repaired.
 */
function normalizeBlank(prompt: string): BlankResult {
  const runs = prompt.match(/_{2,}/gu) ?? [];

  if (runs.length === 0) {
    return { ok: false, problem: `a fill-in exercise with no ${BLANK_MARKER} gap` };
  }
  if (runs.length > 1) {
    return { ok: false, problem: `${runs.length} gaps where one is allowed` };
  }

  return { ok: true, value: prompt.replace(/_{2,}/u, BLANK_MARKER) };
}

/** The exercise as a finished sentence: the gap closed with its own answer. */
function filledForm(exercise: GeneratedExercise): string {
  return exercise.type === "fill_blank"
    ? exercise.prompt.replace(BLANK_MARKER, exercise.canonicalAnswer)
    : exercise.canonicalAnswer;
}

/**
 * How two pieces of text are compared for "the same".
 *
 * Case, whitespace and edge punctuation, and nothing cleverer — the same small
 * normalisation the mistake engine applies to skill labels, for the same
 * reason. It catches a verbatim copy dressed in different spacing; it does not
 * and must not decide that two different sentences mean the same thing.
 */
export function comparisonKey(value: string): string {
  return value
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function readString(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, maxChars);
}

/** The first property we did not ask for, or null. Strict mode, checked twice. */
function unknownKeys(record: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
