"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import { retryReviewAction, saveRewriteAction } from "../actions";
import type { FragmentSpan } from "../domain/fragments";
import { reviewFailureMessage } from "../domain/failures";
import { WRITING_TYPE_LABELS, MAX_WRITING_CHARS, MIN_WRITING_CHARS, type WritingType } from "../domain/writing-entry";
import { HighlightedText } from "./highlighted-text";
import { IssueList, type DisplayIssue } from "./issue-list";

/**
 * One piece of writing, and whatever has happened to it.
 *
 * Three states share the screen because they are three stages of one thing:
 * reviewed, being rewritten, and rewritten. Each is reached by a single tap and
 * none of them navigates away, so the review the learner is correcting from
 * stays a scroll away rather than a back button away.
 */

export type WritingEntryViewModel = {
  id: string;
  type: WritingType;
  originalText: string;
  revisedText: string | null;
  wordCount: number;
  /**
   * Why there is no review yet, when the database holds no failed row to
   * explain it — an installation with no AI configured, most usefully. Resolved
   * on the server, because the browser cannot see the environment.
   */
  unreviewedReason: string | null;
  review:
    | {
        status: "completed";
        summary: string;
        improvedText: string;
        issues: DisplayIssue[];
        spans: { span: FragmentSpan; issueIndex: number }[];
      }
    | { status: "pending" }
    | { status: "failed"; reason: string | null }
    | null;
};

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
          <p className="mt-3 text-[0.8125rem] leading-snug text-faint">
            Tap anything underlined to jump to what it is about.
          </p>
        ) : null}
      </section>

      {review.issues.length > 0 ? (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">
            {review.issues.length === 1 ? "One thing to fix" : `${review.issues.length} things to fix`}
          </h2>
          <div className="mt-2.5">
            <IssueList issues={review.issues} selectedIndex={selected} onSelect={setSelected} />
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-[0.8125rem] font-medium text-muted">Nothing to fix</h2>
          <p className="mt-2.5 text-[0.9375rem] leading-[1.5] text-muted">
            No concrete mistakes were found in this one.
          </p>
        </section>
      )}

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
