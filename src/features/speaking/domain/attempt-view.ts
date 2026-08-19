import type { SpeakingAttemptRow, SpeakingIssueRow, SpeakingReviewRow } from "@/db/schema";
import { selectRenderableSpans, type FragmentSpan } from "@/features/writing/domain/fragments";
import { isCategory, isSeverity } from "@/features/writing/domain/review";
import type { IssueCategory, IssueSeverity } from "@/features/writing/domain/review";
import { isUsableSpeakingReview, type ContentVerdict } from "./review";

/**
 * Turning stored rows into the shape the feedback screen renders.
 *
 * Pure, and separate from the page, because this is where the decisions that
 * can go visibly wrong are made: whether a review counts as finished, which
 * issues get a highlight in the transcript, and which are shown without one.
 * Every one of those is testable here without a database or a browser.
 *
 * The span selection is Writing's, imported rather than reimplemented — the
 * question "can these highlights be drawn over this text without corrupting
 * it?" has nothing to do with whether the text was typed or spoken.
 */

export type SpeakingIssueView = {
  id: string;
  category: IssueCategory;
  label: string | null;
  severity: IssueSeverity;
  originalFragment: string;
  suggestion: string;
  explanation: string;
};

export type SpeakingHighlightView = {
  span: FragmentSpan;
  /** Index into `issues`. The link between a phrase and its explanation. */
  issueIndex: number;
  severity: IssueSeverity;
  /** Data, not a sentence: the component words it in the reader's language. */
  category: IssueCategory;
  label: string | null;
};

export type SpeakingReviewView =
  | {
      status: "completed";
      summary: string;
      improvedAnswer: string;
      content: { verdict: ContentVerdict; comment: string } | null;
      issues: SpeakingIssueView[];
      spans: SpeakingHighlightView[];
    }
  | { status: "pending" }
  | { status: "failed"; reason: string | null };

export type SpeakingAttemptView = {
  id: string;
  topicPrompt: string;
  /** Null only while transcription is running, or after it failed. */
  transcript: string | null;
  durationSeconds: number;
  status: SpeakingAttemptRow["status"];
  /** Why there is no transcript, when there is none. */
  transcriptionFailureReason: string | null;
  review: SpeakingReviewView | null;
};

export function buildAttemptView({
  attempt,
  review,
  issues,
}: {
  attempt: SpeakingAttemptRow;
  review: SpeakingReviewRow | null;
  issues: SpeakingIssueRow[];
}): SpeakingAttemptView {
  const base = {
    id: attempt.id,
    topicPrompt: attempt.topicPrompt,
    transcript: attempt.transcript,
    durationSeconds: attempt.durationSeconds,
    status: attempt.status,
    transcriptionFailureReason: attempt.status === "failed" ? attempt.failureReason : null,
  };

  if (!review) return { ...base, review: null };

  /**
   * A review only counts as completed if there is something in it — the same
   * guard Writing carries, for the same reason: a `completed` row holding
   * nothing usable would render as a confident empty screen.
   */
  if (
    review.status !== "completed" ||
    review.summary === null ||
    review.improvedAnswer === null ||
    !isUsableSpeakingReview(review.summary, review.improvedAnswer)
  ) {
    return {
      ...base,
      review:
        review.status === "pending"
          ? { status: "pending" }
          : { status: "failed", reason: review.failureReason ?? "invalid_response" },
    };
  }

  /**
   * The enum values come out of columns whose type only permits them, so these
   * guards never fire in practice. They are here because the view is what the
   * highlighting slices text against, and a surprise should cost one issue
   * rather than the page.
   */
  const usable = issues.filter((issue) => isCategory(issue.category) && isSeverity(issue.severity));

  const transcript = attempt.transcript ?? "";

  /**
   * Stored offsets are checked against the text they point into rather than
   * trusted: a span running past the end, or one overlapping another, cannot be
   * drawn without corrupting the paragraph or nesting one interactive mark
   * inside another. Anything refused is shown further down without a highlight.
   */
  const renderable = selectRenderableSpans(
    transcript,
    usable.map((issue) => ({
      span:
        issue.startOffset !== null && issue.endOffset !== null
          ? { start: issue.startOffset, end: issue.endOffset }
          : null,
    })),
  );

  const spans: SpeakingHighlightView[] = [];
  usable.forEach((issue, index) => {
    if (!renderable[index] || issue.startOffset === null || issue.endOffset === null) return;

    spans.push({
      span: { start: issue.startOffset, end: issue.endOffset },
      issueIndex: index,
      severity: issue.severity,
      category: issue.category,
      label: issue.label,
    });
  });

  return {
    ...base,
    review: {
      status: "completed",
      summary: review.summary,
      improvedAnswer: review.improvedAnswer,
      /** Both halves or neither: half a verdict is not a verdict. */
      content:
        review.contentVerdict && review.contentComment
          ? { verdict: review.contentVerdict, comment: review.contentComment }
          : null,
      issues: usable.map((issue) => ({
        id: issue.id,
        category: issue.category,
        label: issue.label,
        severity: issue.severity,
        originalFragment: issue.originalFragment,
        suggestion: issue.suggestion,
        explanation: issue.explanation,
      })),
      spans,
    },
  };
}
