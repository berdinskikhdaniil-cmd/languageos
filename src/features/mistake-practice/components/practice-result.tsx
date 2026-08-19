import Link from "next/link";
import type { Messages } from "@/lib/i18n/messages";
import { type PracticeTally } from "../domain/grading";
import type { PracticeResultView } from "../domain/session-view";
import type { StoredTarget } from "../domain/target";
import { verdictClass } from "../domain/verdict-style";
import { StartPracticeButton } from "./start-practice-button";

/**
 * What the set came to.
 *
 * A count of answers, and nothing that sounds like a score. "4 of 5 answers
 * accepted" is exactly as much as five exercises can establish: not that a
 * skill is mastered, not that anything improved by a percentage, not that a
 * weak point is closed. The learner's history of mistakes is unchanged by
 * having practised, and Progress will say the same numbers it said before.
 *
 * The three verdicts are kept apart rather than folded into right-and-wrong,
 * because "you wrote it differently and you were still right" is the single most
 * useful thing a grader can tell somebody learning a language, and rolling it
 * into "correct" would throw it away.
 */
export function PracticeResult({
  results,
  tally,
  target,
  messages,
}: {
  results: PracticeResultView[];
  tally: PracticeTally;
  /** For the "another five" button. Null when the stored pair is unreadable. */
  target: StoredTarget | null;
  messages: Messages;
}) {
  const breakdown = [
    tally.correct > 0 ? messages.mistakePractice.correctCount(tally.correct) : null,
    tally.acceptable > 0 ? messages.mistakePractice.acceptableCount(tally.acceptable) : null,
    tally.incorrect > 0 ? messages.mistakePractice.incorrectCount(tally.incorrect) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="flex flex-col">
      <section className="mt-7">
        <p className="text-[0.8125rem] font-medium text-muted">
          {messages.mistakePractice.resultTitle}
        </p>
        <p className="mt-1.5 text-[2.5rem] font-bold leading-none tracking-[-0.04em]">
          {messages.mistakePractice.score(tally.accepted, tally.total)}
        </p>
        {breakdown.length > 0 ? (
          <p className="mt-2.5 text-[0.875rem] leading-snug text-muted">
            {messages.progress.breakdown(breakdown)}
          </p>
        ) : null}
      </section>

      <ul className="mt-8 divide-y divide-hairline border-t border-hairline">
        {results.map((result) => (
          <li key={result.position} className="py-5">
            <p className="whitespace-pre-wrap break-words text-[1rem] font-semibold leading-[1.45]">
              {result.prompt}
            </p>

            <p className={`mt-2.5 text-[0.8125rem] font-semibold ${verdictClass(result.verdict)}`}>
              {messages.mistakePractice.verdicts[result.verdict]}
            </p>

            <p className="mt-2 text-[0.8125rem] text-faint">
              {messages.mistakePractice.yourAnswer}
            </p>
            <p className="mt-0.5 break-words text-[0.9375rem] leading-snug">
              {result.answer ?? ""}
            </p>

            {/*
              The correction only appears when it is actually a correction. An
              answer the grader accepted does not need its own words repeated
              back under a heading that implies they were wrong.
            */}
            {result.verdict === "incorrect" ? (
              <>
                <p className="mt-3 text-[0.8125rem] text-faint">
                  {messages.mistakePractice.shouldBe}
                </p>
                <p className="mt-0.5 break-words text-[0.9375rem] font-medium leading-snug">
                  {result.correctedAnswer}
                </p>
              </>
            ) : null}

            <p className="mt-3 text-[0.9375rem] leading-[1.5] text-muted">{result.explanation}</p>
          </li>
        ))}
      </ul>

      {/*
        Another five, not these five again. A fresh session with fresh contexts
        is the only honest "practise it again" — repeating a set somebody has
        just seen the answers to tests memory, not the skill.
      */}
      {target ? (
        <StartPracticeButton target={target} label={messages.mistakePractice.practiceAgain} />
      ) : null}

      <Link
        href="/practice"
        className="mt-3 flex h-11 items-center justify-center px-4 text-center text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
      >
        {messages.mistakePractice.backToPractice}
      </Link>
    </div>
  );
}
