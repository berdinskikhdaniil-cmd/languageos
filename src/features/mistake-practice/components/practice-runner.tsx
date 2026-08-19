"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import type { Messages, PracticeFailureKey } from "@/lib/i18n/messages";
import { gradePracticeSessionAction, savePracticeAnswerAction } from "../actions";
import { MAX_ANSWER_CHARS, isCompleteAnswerSet } from "../domain/answers";
import type { PracticeExerciseView } from "../domain/session-view";

/**
 * Five exercises, one at a time, then one check.
 *
 * One route rather than five, because this is one continuous act — a page
 * transition between question three and question four would be the slowest
 * thing in the whole exercise.
 *
 * Nothing correct is shown until the learner has finished. No canonical answer
 * reaches this component at all (see ../domain/session-view), and no per-item
 * verdict appears as they go, because a correction shown after question one
 * changes how question two is answered. They work through the set on their own,
 * and then the whole set is checked at once.
 *
 * Moving backwards is allowed and editing an earlier answer is allowed, right up
 * until the check. Afterwards the set is immutable — the server refuses a write
 * to a graded session, so a stale tab cannot put an answer out of step with the
 * verdict beside it.
 */
export function PracticeRunner({
  sessionId,
  exercises,
  /** Set when a previous check did not come back. The answers survived it. */
  initialFailure,
}: {
  sessionId: string;
  exercises: PracticeExerciseView[];
  initialFailure: PracticeFailureKey | null;
}) {
  const router = useRouter();
  const messages = useMessages();

  const [index, setIndex] = useState(() => firstUnanswered(exercises));
  const [answers, setAnswers] = useState(() => exercises.map((exercise) => exercise.answer ?? ""));
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<PracticeFailureKey | AppErrorCode | null>(
    initialFailure,
  );

  const exercise = exercises[index];
  const total = exercises.length;
  const onLast = index === total - 1;
  const complete = isCompleteAnswerSet(answers.map((answer) => answer.trim() || null));

  /**
   * Saved as they move, so a Mini App that gets closed mid-set leaves the work
   * behind. Deliberately not awaited: the step forward should be instant, and
   * the grading request sends every answer again anyway, so a save that never
   * landed costs at most a slightly stale resume.
   */
  const persist = (position: number, answer: string) => {
    void savePracticeAnswerAction({ sessionId, position, answer });
  };

  const goTo = (next: number) => {
    persist(exercise.position, answers[index]);
    setFailure(null);
    setIndex(next);
  };

  const check = async () => {
    if (checking) return;

    if (!complete) {
      setFailure("answerAll");
      return;
    }

    setFailure(null);
    setChecking(true);

    const result = await gradePracticeSessionAction({
      sessionId,
      answers: exercises.map((item, position) => ({
        position: item.position,
        answer: answers[position],
      })),
    });

    if (result.ok) {
      // The result screen is this same route, re-rendered from the rows the
      // check just wrote. Nothing has to survive the transition.
      router.refresh();
      return;
    }

    setChecking(false);
    setFailure("failure" in result ? result.failure : result.code);
  };

  if (checking) {
    return (
      <div className="flex min-h-[60vh] flex-col justify-center pt-3">
        <p className="text-[1.25rem] font-semibold leading-snug tracking-[-0.02em]">
          {messages.mistakePractice.checking}
        </p>
        <p className="mt-2.5 max-w-[22rem] text-[0.9375rem] leading-[1.5] text-muted">
          {messages.mistakePractice.preparingNote}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <StepIndicator current={index + 1} total={total} messages={messages} />

      <section className="mt-7">
        {exercise.type === "fill_blank" ? (
          <p className="text-[0.8125rem] font-medium text-muted">
            {messages.mistakePractice.fillTheGap}
          </p>
        ) : null}
        {/*
          The largest thing on the screen, and the only thing competing for
          attention with the input under it. The sentence being worked on is in
          the language being learned, whatever the interface is set to.
        */}
        <p
          className={`${exercise.type === "fill_blank" ? "mt-2" : ""} whitespace-pre-wrap break-words text-[1.25rem] font-semibold leading-[1.45] tracking-[-0.02em]`}
        >
          {exercise.prompt}
        </p>
      </section>

      <textarea
        // Remounts between exercises, so the box is never left holding the
        // previous answer's cursor position or scroll offset.
        key={exercise.position}
        value={answers[index]}
        onChange={(event) => {
          const value = event.target.value.slice(0, MAX_ANSWER_CHARS);
          setAnswers((current) =>
            current.map((answer, position) => (position === index ? value : answer)),
          );
        }}
        rows={2}
        autoFocus
        aria-label={messages.mistakePractice.answerLabel(exercise.position)}
        placeholder={messages.mistakePractice.answerPlaceholder}
        className="mt-6 w-full resize-y rounded-[var(--radius-card)] bg-surface p-4 text-[1rem] leading-[1.6] text-fg placeholder:text-faint"
      />

      <button
        type="button"
        onClick={() => (onLast ? void check() : goTo(index + 1))}
        disabled={answers[index].trim() === ""}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
      >
        {onLast ? messages.mistakePractice.check : messages.mistakePractice.next}
      </button>

      {index > 0 ? (
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          className="mt-3 h-11 self-center px-4 text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
        >
          {messages.mistakePractice.previous}
        </button>
      ) : null}

      <FieldError message={failure ? failureMessage(failure, messages) : null} />
    </div>
  );
}

/**
 * Where they are in the set.
 *
 * A thin rule and a sentence. Five circles would be five more things to look at
 * on a screen whose whole job is to hold attention on one sentence, and a
 * percentage would be a score where there is not one yet.
 */
function StepIndicator({
  current,
  total,
  messages,
}: {
  current: number;
  total: number;
  messages: Messages;
}) {
  return (
    <div>
      <p className="text-[0.8125rem] text-faint">
        {messages.mistakePractice.step(current, total)}
      </p>
      <div
        role="progressbar"
        aria-label={messages.mistakePractice.stepRegion}
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-data-ghost"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** The exercise to open on, so a resumed set does not restart at question one. */
function firstUnanswered(exercises: readonly PracticeExerciseView[]): number {
  const index = exercises.findIndex((exercise) => (exercise.answer ?? "").trim() === "");
  return index === -1 ? Math.max(0, exercises.length - 1) : index;
}

function failureMessage(
  key: PracticeFailureKey | AppErrorCode,
  messages: Messages,
): string {
  return key in messages.mistakePractice.failures
    ? messages.mistakePractice.failures[key as PracticeFailureKey]
    : messages.errors[key as AppErrorCode];
}
