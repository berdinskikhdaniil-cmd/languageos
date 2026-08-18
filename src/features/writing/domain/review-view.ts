import type { WritingEntryRow, WritingIssueRow, WritingReviewRow } from "@/db/schema";
import { selectRenderableSpans, type FragmentSpan } from "./fragments";
import { CATEGORY_LABELS, isCategory, isSeverity, isUsableReviewContent } from "./review";
import type { IssueCategory, IssueSeverity } from "./review";
import type { WritingType } from "./writing-entry";

/**
 * Turning stored rows into the shape the review screen renders.
 *
 * Pure, and separate from the page, because this is where the decisions that
 * can go visibly wrong are made: whether a review counts as finished, which
 * issues get a highlight in the text, and which are shown as feedback without
 * one. Every one of those is testable here without a database or a browser.
 */

export type ReviewIssueView = {
  id: string;
  category: IssueCategory;
  label: string | null;
  severity: IssueSeverity;
  originalFragment: string;
  suggestion: string;
  explanation: string;
};

export type HighlightView = {
  span: FragmentSpan;
  /** Index into `issues`. This is the link between a phrase and its explanation. */
  issueIndex: number;
  severity: IssueSeverity;
  /** What a screen reader announces in place of the bare phrase. */
  label: string;
};

export type ReviewView =
  | {
      status: "completed";
      summary: string;
      improvedText: string;
      issues: ReviewIssueView[];
      spans: HighlightView[];
    }
  | { status: "pending" }
  | { status: "failed"; reason: string | null };

export type WritingEntryView = {
  id: string;
  type: WritingType;
  originalText: string;
  revisedText: string | null;
  wordCount: number;
  unreviewedReason: string | null;
  review: ReviewView | null;
};

export function buildEntryView({
  entry,
  review,
  issues,
  unreviewedReason,
}: {
  entry: WritingEntryRow;
  review: WritingReviewRow | null;
  issues: WritingIssueRow[];
  unreviewedReason: string | null;
}): WritingEntryView {
  const base = {
    id: entry.id,
    type: entry.type,
    originalText: entry.originalText,
    revisedText: entry.revisedText,
    wordCount: entry.wordCount,
    unreviewedReason,
  };

  if (!review) return { ...base, review: null };

  /**
   * A review only counts as completed if there is something in it. The last
   * condition covers rows written before the response contract was tightened:
   * completed, non-null, and holding nothing a learner can use.
   */
  if (
    review.status !== "completed" ||
    review.summary === null ||
    review.improvedText === null ||
    !isUsableReviewContent(review.summary, review.improvedText)
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

  /**
   * Which issues get a highlight.
   *
   * Stored offsets are checked against the text they point into rather than
   * trusted: a span running past the end, or one overlapping another, cannot be
   * drawn without corrupting the paragraph or nesting one interactive mark
   * inside another. Anything refused is shown further down as feedback without
   * a highlight — no issue is lost, and none appears in both places.
   */
  const renderable = selectRenderableSpans(
    entry.originalText,
    usable.map((issue) => ({
      span:
        issue.startOffset !== null && issue.endOffset !== null
          ? { start: issue.startOffset, end: issue.endOffset }
          : null,
    })),
  );

  const spans: HighlightView[] = [];
  usable.forEach((issue, index) => {
    if (!renderable[index] || issue.startOffset === null || issue.endOffset === null) return;

    spans.push({
      span: { start: issue.startOffset, end: issue.endOffset },
      issueIndex: index,
      severity: issue.severity,
      label: [CATEGORY_LABELS[issue.category], issue.label].filter(Boolean).join(", "),
    });
  });

  return {
    ...base,
    review: {
      status: "completed",
      summary: review.summary,
      improvedText: review.improvedText,
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
