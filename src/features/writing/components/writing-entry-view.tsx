"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import { useMessages } from "@/lib/i18n/locale-context";
import { retryReviewAction, saveRewriteAction } from "../actions";
import { reviewFailureKey } from "../domain/failures";
import { MAX_WRITING_CHARS, MIN_WRITING_CHARS } from "../domain/writing-entry";
import type { WritingEntryView as WritingEntryViewModel } from "../domain/review-view";
import { HighlightedText } from "./highlighted-text";
import { IssueDetail } from "./issue-detail";
import { IssueDetailPanel } from "./issue-detail-panel";

/**
 * One piece of writing, and whatever has happened to it.
 *
 * Three states share the screen because they are three stages of one thing:
 * reviewed, being rewritten, and rewritten. Each is reached by a single tap and
 * none of them navigates away, so the review the learner is correcting from
 * stays a scroll away rather than a back button away.
 *
 * Every heading and control here follows the interface language. The review's
 * own words do not: a summary and its explanations were written in whatever
 * language the learner read at the time, and they stay as they were. Switching
 * to Russian does not retranslate work already done — it changes the next
 * review, not the last one.
 */

export function WritingEntryView({ entry }: { entry: WritingEntryViewModel }) {
  const messages = useMessages();
  const [rewriting, setRewriting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  if (rewriting) {
    return (
      <RewriteEditor
        entry={entry}
        onCancel={() => setRewriting(false)}
        onSaved={() => {
          setRewriting(false);
          setJustSaved(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8 pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.writing.types[entry.type]}
        </h1>
        <p className="mt-2 text-[0.8125rem] text-faint">
          {messages.writing.wordCount(entry.wordCount)}
        </p>
      </header>

      {entry.review?.status === "completed" ? (
        <CompletedReview
          entry={entry}
          review={entry.review}
          justSaved={justSaved}
          onRewrite={() => {
            setJustSaved(false);
            setRewriting(true);
          }}
        />
      ) : (
        <UnreviewedEntry entry={entry} />
      )}
    </div>
  );
}

function CompletedReview({
  entry,
  review,
  justSaved,
  onRewrite,
}: {
  entry: WritingEntryViewModel;
  review: Extract<WritingEntryViewModel["review"], { status: "completed" }>;
  justSaved: boolean;
  onRewrite: () => void;
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
        <h2 className="text-[0.8125rem] font-medium text-muted">{messages.writing.feedback}</h2>
        <p className="mt-2.5 text-[1.0625rem] leading-[1.55]">{review.summary}</p>
      </section>

      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">{messages.writing.yourWriting}</h2>
        <div className="mt-2.5">
          <HighlightedText
            text={entry.originalText}
            spans={review.spans}
            selectedIndex={selected}
            onSelect={setSelected}
          />
        </div>

        {review.spans.length > 0 ? (
          <p className="mt-3.5 text-[0.8125rem] leading-snug text-faint">
            {messages.writing.tapHighlight}
          </p>
        ) : null}
      </section>

      {unplaced.length > 0 ? (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">
            {messages.writing.otherFeedback}
          </h2>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-faint">
            {messages.writing.unplacedNote(unplaced.length)}
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
            {messages.writing.nothingToFix}
          </h2>
          <p className="mt-2.5 text-[0.9375rem] leading-[1.5] text-muted">
            {messages.writing.nothingToFixBody}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">
          {messages.writing.betterVersion}
        </h2>
        <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7] text-muted">
          {review.improvedText}
        </p>
      </section>

      {entry.revisedText ? (
        <Rewritten entry={entry} justSaved={justSaved} onRewrite={onRewrite} />
      ) : (
        <section>
          <button
            type="button"
            onClick={onRewrite}
            className="h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed"
          >
            {messages.writing.rewriteIt}
          </button>
          <p className="mt-3 text-[0.8125rem] leading-snug text-faint">
            {messages.writing.rewriteInvitation}
          </p>
        </section>
      )}

      {/*
        Room to scroll the last control clear of the panel. Only while it is
        open, and only below everything else, so nothing above it ever moves.
      */}
      {selectedIssue ? <div aria-hidden className="h-56" /> : null}

      <IssueDetailPanel issue={selectedIssue} onClose={() => setSelected(null)} />
    </>
  );
}

function Rewritten({
  entry,
  justSaved,
  onRewrite,
}: {
  entry: WritingEntryViewModel;
  justSaved: boolean;
  onRewrite: () => void;
}) {
  const messages = useMessages();

  return (
    <section>
      <h2 className="text-[0.8125rem] font-medium text-muted">
        {justSaved ? messages.writing.savedYourRewrite : messages.writing.yourRewrite}
      </h2>
      <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7]">
        {entry.revisedText}
      </p>
      <button
        type="button"
        onClick={onRewrite}
        className="mt-4 h-12 rounded-[var(--radius-control)] bg-surface px-5 text-[0.9375rem] font-semibold transition-colors active:bg-surface-raised"
      >
        {messages.writing.editRewrite}
      </button>
    </section>
  );
}

/**
 * Saved, but not reviewed: the provider failed, or nobody has asked yet.
 *
 * The text is shown in full first. Whatever went wrong, the learner's writing
 * is the thing on the screen, and the failure is a line underneath it.
 */
function UnreviewedEntry({ entry }: { entry: WritingEntryViewModel }) {
  const router = useRouter();
  const messages = useMessages();
  const [attempt, setAttempt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const retry = () => {
    setAttempt(null);
    startTransition(async () => {
      const result = await retryReviewAction(entry.id);
      if (result.ok) {
        router.refresh();
        return;
      }
      // A retry fails either because the review did not happen — its own set of
      // reasons — or because the request itself was refused.
      setAttempt(
        "failure" in result
          ? messages.writing.failures[result.failure]
          : messages.errors[result.code],
      );
    });
  };

  const stored =
    entry.review?.status === "failed"
      ? entry.review.reason
      : entry.review
        ? "processing"
        : entry.unreviewedReason;

  return (
    <>
      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">{messages.writing.yourWriting}</h2>
        <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7]">
          {entry.originalText}
        </p>
      </section>

      <section>
        <p className="text-[0.9375rem] leading-[1.5] text-muted">
          {attempt ?? messages.writing.failures[reviewFailureKey(stored)]}
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={pending}
          className="mt-4 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
        >
          {pending ? messages.writing.reviewing : messages.writing.tryReviewAgain}
        </button>
        <Link
          href="/practice/writing"
          className="mt-3 flex h-10 items-center justify-center text-center text-[0.875rem] font-medium leading-tight text-muted transition-colors active:text-fg"
        >
          {messages.writing.writeSomethingElse}
        </Link>
      </section>
    </>
  );
}

/**
 * The rewrite editor.
 *
 * Seeded with the learner's ORIGINAL text, never the corrected one. Handing
 * back the model's version would turn the exercise into pressing Save.
 */
function RewriteEditor({
  entry,
  onCancel,
  onSaved,
}: {
  entry: WritingEntryViewModel;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const messages = useMessages();
  const [text, setText] = useState(entry.revisedText ?? entry.originalText);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await saveRewriteAction({ entryId: entry.id, text });
      if (!result.ok) {
        setFailure("code" in result ? messages.errors[result.code] : null);
        return;
      }
      onSaved();
      router.refresh();
    });
  };

  const tooShort = text.trim().length < MIN_WRITING_CHARS;

  return (
    <div className="flex flex-col pt-3">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">
          {messages.writing.rewriteTitle}
        </h1>
        <p className="mt-2 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          {messages.writing.rewriteIntro}
        </p>
      </header>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, MAX_WRITING_CHARS))}
        autoFocus
        rows={12}
        aria-label={messages.writing.rewriteField}
        className="mt-6 min-h-[14rem] w-full resize-y rounded-[var(--radius-card)] bg-surface p-4 text-[1rem] leading-[1.6] text-fg"
      />

      <button
        type="button"
        onClick={save}
        disabled={pending || tooShort}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
      >
        {pending ? messages.common.saving : messages.writing.saveRewrite}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="mt-3 h-10 text-[0.875rem] font-medium leading-tight text-muted transition-colors active:text-fg"
      >
        {messages.writing.backToReview}
      </button>

      <FieldError message={failure} />
    </div>
  );
}
