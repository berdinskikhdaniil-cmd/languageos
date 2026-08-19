"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HighlightedText } from "@/features/writing/components/highlighted-text";
import { IssueDetail } from "@/features/writing/components/issue-detail";
import { IssueDetailPanel } from "@/features/writing/components/issue-detail-panel";
import { formatElapsed } from "@/lib/format";
import { useMessages } from "@/lib/i18n/locale-context";
import { reviewSpeakingAttemptAction } from "../actions";
import { speakingReviewFailureKey, transcriptionFailureKey } from "../domain/failures";
import type { SpeakingAttemptView } from "../domain/attempt-view";

/**
 * One spoken answer, and whatever has happened to it.
 *
 * The interaction is Writing's, reused rather than reinvented: the mistakes are
 * marked in the learner's own words and tapping one opens its explanation
 * beside the phrase, instead of a numbered list somewhere below that has to be
 * matched back up by eye. The components are imported from Writing outright —
 * the question "show this text with these spans marked" has nothing to do with
 * whether the text was typed or spoken.
 *
 * What is different is what the text *is*. This is a machine transcription of
 * speech, so it is labelled as one and never presented as something the learner
 * wrote. And nothing on this screen says anything about pronunciation, because
 * a transcript cannot support a claim about it — there is one quiet line saying
 * so, which is better than leaving somebody to assume otherwise.
 */
export function SpeakingAttemptView({ attempt }: { attempt: SpeakingAttemptView }) {
  const messages = useMessages();

  return (
    <div className="flex flex-col gap-8 pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.speaking.title}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-[1.45] text-muted">{attempt.topicPrompt}</p>
        <p className="mt-2 text-[0.8125rem] text-faint">
          {formatElapsed(attempt.durationSeconds)}
        </p>
      </header>

      {attempt.transcript && attempt.review?.status === "completed" ? (
        <CompletedReview attempt={attempt} review={attempt.review} />
      ) : (
        <Unfinished attempt={attempt} />
      )}
    </div>
  );
}

function CompletedReview({
  attempt,
  review,
}: {
  attempt: SpeakingAttemptView;
  review: Extract<SpeakingAttemptView["review"], { status: "completed" }>;
}) {
  const messages = useMessages();
  const [selected, setSelected] = useState<number | null>(null);

  const highlighted = new Set(review.spans.map((span) => span.issueIndex));
  /**
   * Everything that could not be attached to a phrase: a fragment the model
   * paraphrased, one that appears twice, one that would have overlapped
   * another. Still real feedback, so it is shown — just not inline.
   */
  const unplaced = review.issues.filter((_, index) => !highlighted.has(index));
  const selectedIssue = selected === null ? null : (review.issues[selected] ?? null);

  return (
    <>
      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">
          {messages.speaking.feedbackHeading}
        </h2>
        <p className="mt-2.5 text-[1.0625rem] leading-[1.55]">{review.summary}</p>
        {/* Said once, plainly, so nobody infers a judgement we did not make. */}
        <p className="mt-3 text-[0.8125rem] leading-snug text-faint">
          {messages.speaking.notPronunciation}
        </p>
      </section>

      {review.content ? (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">
            {messages.speaking.contentHeading}
          </h2>
          {/* A verdict in words, never a number and never a level. */}
          <p className="mt-2 text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em]">
            {messages.speaking.verdicts[review.content.verdict]}
          </p>
          <p className="mt-1.5 text-[0.9375rem] leading-[1.5] text-muted">
            {review.content.comment}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">
          {messages.speaking.transcriptHeading}
        </h2>
        <div className="mt-2.5">
          <HighlightedText
            text={attempt.transcript ?? ""}
            spans={review.spans}
            selectedIndex={selected}
            onSelect={setSelected}
          />
        </div>

        {review.spans.length > 0 ? (
          <p className="mt-3.5 text-[0.8125rem] leading-snug text-faint">
            {messages.speaking.tapHighlight}
          </p>
        ) : null}
      </section>

      {unplaced.length > 0 ? (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">
            {messages.speaking.otherFeedback}
          </h2>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-faint">
            {messages.speaking.unplacedNote(unplaced.length)}
          </p>
          <ul className="mt-4 flex flex-col gap-5">
            {unplaced.map((issue) => (
              <li key={issue.id}>
                <IssueDetail issue={issue} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.issues.length === 0 ? (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">
            {messages.speaking.nothingToFix}
          </h2>
          <p className="mt-2.5 text-[0.9375rem] leading-[1.5] text-muted">
            {messages.speaking.nothingToFixBody}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">
          {messages.speaking.betterAnswer}
        </h2>
        <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7] text-muted">
          {review.improvedAnswer}
        </p>
      </section>

      <RecordAnother />

      {/*
        Room to scroll the last control clear of the panel. Only while it is
        open, and only below everything else, so nothing above it ever moves.
      */}
      {selectedIssue ? <div aria-hidden className="h-56" /> : null}

      <IssueDetailPanel issue={selectedIssue} onClose={() => setSelected(null)} />
    </>
  );
}

/**
 * Everything that is not a finished review.
 *
 * Two shapes, and the difference is what the learner can do next. If there is a
 * transcript, their words survived and only the review is missing — that is
 * retryable in place, for the cost of one completion. If there is not, the
 * recording never became text and we did not keep the audio, so the only way
 * forward is to record again. Saying "try again" in both cases would send half
 * of them to press a button that cannot work.
 */
function Unfinished({ attempt }: { attempt: SpeakingAttemptView }) {
  const router = useRouter();
  const messages = useMessages();
  const [attemptFailure, setAttemptFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const retry = () => {
    setAttemptFailure(null);
    startTransition(async () => {
      const result = await reviewSpeakingAttemptAction(attempt.id);
      if (result.ok) {
        router.refresh();
        return;
      }
      setAttemptFailure(
        "failure" in result
          ? messages.speaking.failures[result.failure]
          : messages.errors[result.code],
      );
    });
  };

  if (!attempt.transcript) {
    // No transcript, and no audio to try again with. Recording again is the
    // only honest offer.
    return (
      <section>
        <p className="text-[0.9375rem] leading-[1.5] text-muted">
          {messages.speaking.failures[transcriptionFailureKey(attempt.transcriptionFailureReason)]}
        </p>
        <Link
          href="/practice/speaking"
          className="mt-5 flex h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 text-center text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed"
        >
          {messages.speaking.recordAnother}
        </Link>
      </section>
    );
  }

  const stored =
    attempt.review?.status === "failed"
      ? attempt.review.reason
      : attempt.review
        ? "processing"
        : null;

  return (
    <>
      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">
          {messages.speaking.transcriptHeading}
        </h2>
        <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7]">
          {attempt.transcript}
        </p>
      </section>

      <section>
        <p className="text-[0.9375rem] leading-[1.5] text-muted">
          {attemptFailure ?? messages.speaking.failures[speakingReviewFailureKey(stored)]}
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={pending}
          className="mt-4 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
        >
          {pending ? messages.speaking.reviewing : messages.speaking.retryReview}
        </button>
      </section>

      <RecordAnother />
    </>
  );
}

function RecordAnother() {
  const messages = useMessages();

  return (
    <section>
      <Link
        href="/practice/speaking"
        className="flex h-12 items-center justify-center rounded-[var(--radius-control)] bg-surface px-4 text-center text-[0.9375rem] font-semibold leading-tight transition-colors active:bg-surface-raised"
      >
        {messages.speaking.recordAnother}
      </Link>
    </section>
  );
}
