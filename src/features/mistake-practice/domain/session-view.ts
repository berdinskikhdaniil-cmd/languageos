import type { MistakePracticeItemRow, MistakePracticeSessionRow } from "@/db/schema";
import type { MistakeSelection } from "@/features/mistakes/domain/aggregate";
import type { PracticeFailureKey } from "@/lib/i18n/messages";
import type { ExerciseType } from "./exercise";
import { generationFailureKey, gradingFailureKey } from "./failures";
import { tallyVerdicts, type PracticeTally, type PracticeVerdict } from "./grading";
import { fromStoredTarget } from "./target";

/**
 * What the practice screen is allowed to see.
 *
 * This is a boundary, not a convenience. An unfinished session must not carry
 * its own answers to the browser: a canonical answer or a grading note in the
 * page payload is the answer key, and anybody who opened the network tab — or
 * simply looked — would be practising recognition instead of recall. So the
 * `ready` view has prompts and the learner's own words and nothing else, and
 * the canonical answers only appear once the set has actually been graded.
 *
 * The five states are the row's five statuses read as screens. `grading` and
 * `generating` are transient and look like waiting; `failed` is generation's
 * failure and offers a fresh set; a grading failure is *not* a state, because
 * the answers survived it — it comes back as a `ready` view with a reason
 * attached, which is exactly what the learner should see.
 */

export type PracticeExerciseView = {
  position: number;
  type: ExerciseType;
  prompt: string;
  /** What the learner has typed so far, saved as they went. Null if untouched. */
  answer: string | null;
};

export type PracticeResultView = PracticeExerciseView & {
  verdict: PracticeVerdict;
  correctedAnswer: string;
  explanation: string;
  /** Only ever shown after grading. */
  canonicalAnswer: string;
};

export type PracticeSessionView = {
  sessionId: string;
  /** Null when the stored pair is not one this version recognises. */
  target: MistakeSelection | null;
  /** The skill label as some review stored it, for a skill we have no name for. */
  targetLabel: string | null;
} & (
  | { status: "generating" }
  | { status: "failed"; failure: PracticeFailureKey }
  | {
      status: "ready";
      exercises: PracticeExerciseView[];
      /** Set when a check was attempted and did not come back. Answers are safe. */
      failure: PracticeFailureKey | null;
    }
  | { status: "grading" }
  | { status: "completed"; results: PracticeResultView[]; tally: PracticeTally }
);

export function buildSessionView({
  session,
  items,
  targetLabel,
}: {
  session: MistakePracticeSessionRow;
  /** In position order. */
  items: MistakePracticeItemRow[];
  /** The stored spelling of a skill label, when there is one to fall back to. */
  targetLabel?: string | null;
}): PracticeSessionView {
  const base = {
    sessionId: session.id,
    target: fromStoredTarget(session.targetType, session.targetKey),
    targetLabel: targetLabel ?? null,
  };

  if (session.status === "generating") return { ...base, status: "generating" };
  if (session.status === "grading") return { ...base, status: "grading" };

  if (session.status === "failed") {
    return { ...base, status: "failed", failure: generationFailureKey(session.failureReason) };
  }

  if (session.status === "completed") {
    const results = items.flatMap((item) => toResult(item));
    return {
      ...base,
      status: "completed",
      results,
      tally: tallyVerdicts(results.map((result) => result.verdict)),
    };
  }

  return {
    ...base,
    status: "ready",
    exercises: items.map(toExercise),
    /**
     * A reason on a `ready` row can only have come from a grading attempt: a
     * generation that failed left the row `failed` instead. So it is safe to
     * read it as "your answers are saved, the check did not come back".
     */
    failure: session.failureReason ? gradingFailureKey(session.failureReason) : null,
  };
}

function toExercise(item: MistakePracticeItemRow): PracticeExerciseView {
  return {
    position: item.position,
    type: item.type,
    prompt: item.prompt,
    answer: item.userAnswer,
  };
}

/**
 * A graded exercise, or nothing.
 *
 * An item with no verdict on a completed session is damage rather than a state
 * to render around — grading writes all five inside one transaction — so it is
 * left out instead of drawn as a half-empty row. The tally counts what is
 * actually there, so the figure on screen can never claim more than it has.
 */
function toResult(item: MistakePracticeItemRow): PracticeResultView[] {
  if (item.verdict === null || item.correctedAnswer === null || item.explanation === null) {
    return [];
  }

  return [
    {
      ...toExercise(item),
      verdict: item.verdict,
      correctedAnswer: item.correctedAnswer,
      explanation: item.explanation,
      canonicalAnswer: item.canonicalAnswer,
    },
  ];
}
