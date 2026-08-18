"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import { retryReviewAction, saveRewriteAction } from "../actions";
import { reviewFailureMessage } from "../domain/failures";
import { WRITING_TYPE_LABELS, MAX_WRITING_CHARS, MIN_WRITING_CHARS } from "../domain/writing-entry";
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
 */

export function WritingEntryView({ entry }: { entry: WritingEntryViewModel }) {
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
          {WRITING_TYPE_LABELS[entry.type]}
        </h1>
        <p className="mt-2 text-[0.8125rem] text-faint">{entry.wordCount} words</p>
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
        <h2 className="text-[0.8125rem] font-medium text-muted">Feedback</h2>
        <p className="mt-2.5 text-[1.0625rem] leading-[1.55]">{review.summary}</p>
      </section>

      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">Your writing</h2>
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
            Tap a highlighted phrase to see the correction.
          </p>
        ) : null}
      </section>

      {unplaced.length > 0 ? (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">Other feedback</h2>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-faint">
            {unplaced.length === 1 ? "This one" : "These"} could not be pinned to an exact phrase.
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
          <h2 className="text-[0.8125rem] font-medium text-muted">Nothing to fix</h2>
          <p className="mt-2.5 text-[0.9375rem] leading-[1.5] text-muted">
            No concrete mistakes were found in this one.
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="text-[0.8125rem] font-medium text-muted">Better version</h2>
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
            className="h-14 w-full rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed"
          >
            Rewrite it
          </button>
          <p className="mt-3 text-[0.8125rem] leading-snug text-faint">
            You get your own text back, not the corrected one. Fixing it yourself is the part
            that sticks.
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
  return (
    <section>
      <h2 className="text-[0.8125rem] font-medium text-muted">
        {justSaved ? "Saved · your rewrite" : "Your rewrite"}
      </h2>
      <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7]">
        {entry.revisedText}
      </p>
      <button
        type="button"
        onClick={onRewrite}
        className="mt-4 h-12 rounded-[var(--radius-control)] bg-surface px-5 text-[0.9375rem] font-semibold transition-colors active:bg-surface-raised"
      >
        Edit the rewrite
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const retry = () => {
    setError(null);
    startTransition(async () => {
      const result = await retryReviewAction(entry.id);
      if (result.ok) router.refresh();
      else setError(result.error);
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
        <h2 className="text-[0.8125rem] font-medium text-muted">Your writing</h2>
        <p className="mt-2.5 whitespace-pre-wrap break-words text-[1rem] leading-[1.7]">
          {entry.originalText}
        </p>
      </section>

      <section>
        <p className="text-[0.9375rem] leading-[1.5] text-muted">
          {error ?? reviewFailureMessage(stored)}
        </p>
        <button
          type="button"
          onClick={retry}
          disabled={pending}
          className="mt-4 h-14 w-full rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
        >
          {pending ? "Reviewing…" : "Try review again"}
        </button>
        <Link
          href="/practice/writing"
          className="mt-3 flex h-10 items-center justify-center text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
        >
          Write something else
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
  const [text, setText] = useState(entry.revisedText ?? entry.originalText);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveRewriteAction({ entryId: entry.id, text });
      if (!result.ok) {
        setError(result.error);
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
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">Rewrite it</h1>
        <p className="mt-2 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
          Your own text, as you wrote it. Fix what the review pointed at.
        </p>
      </header>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, MAX_WRITING_CHARS))}
        autoFocus
        rows={12}
        aria-label="Your rewrite"
        className="mt-6 min-h-[14rem] w-full resize-y rounded-[var(--radius-card)] bg-surface p-4 text-[1rem] leading-[1.6] text-fg"
      />

      <button
        type="button"
        onClick={save}
        disabled={pending || tooShort}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save rewrite"}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="mt-3 h-10 text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
      >
        Back to the review
      </button>

      <FieldError message={error} />
    </div>
  );
}
