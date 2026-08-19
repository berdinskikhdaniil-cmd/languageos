import { EXERCISE_COUNT } from "./exercise";

/**
 * What a learner is allowed to type, decided once.
 *
 * One place rather than three, because the browser, the server action and the
 * column's own CHECK all have to agree about the same number — and the moment
 * they do not, the browser accepts something the database refuses and the
 * learner loses an answer they already wrote.
 *
 * The cap is generous next to the exercises: a rewrite is one sentence, so 1000
 * characters is far beyond any honest answer. It is here to bound what reaches
 * the grader's prompt, not to argue with somebody who was thorough.
 */
export const MAX_ANSWER_CHARS = 1000;

/** Trimmed, capped, and reduced to null when there is nothing in it. */
export function normalizeAnswer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_ANSWER_CHARS);
}

/**
 * Whether a set is ready to be checked.
 *
 * Grading is one call over all five, so a set with a gap in it cannot be sent:
 * the grader would have to invent a verdict for an answer that does not exist.
 * The screen says so before the request, and the server decides it again from
 * the rows rather than trusting that it did.
 */
export function isCompleteAnswerSet(answers: readonly (string | null)[]): boolean {
  return (
    answers.length === EXERCISE_COUNT && answers.every((answer) => normalizeAnswer(answer) !== null)
  );
}
