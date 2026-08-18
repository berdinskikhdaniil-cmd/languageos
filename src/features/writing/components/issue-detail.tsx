import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, SEVERITY_LABELS, type IssueCategory, type IssueSeverity } from "../domain/review";
import { severityStyle } from "../domain/severity-style";

export type DisplayIssue = {
  id: string;
  category: IssueCategory;
  label: string | null;
  severity: IssueSeverity;
  originalFragment: string;
  suggestion: string;
  explanation: string;
};

/**
 * One problem, explained.
 *
 * The same component in both places it is needed — the panel that opens from a
 * highlighted phrase, and the short list of feedback that could not be attached
 * to one. Two renderings of the same three facts would drift apart.
 *
 * What you wrote and what it should be lead, because that is the answer. The
 * reason follows. The category and the skill come last in faint type: they are
 * a note about the finding, not a label on it, so there is no capsule, no dot
 * and no icon.
 */
export function IssueDetail({ issue }: { issue: DisplayIssue }) {
  const style = severityStyle(issue.severity);

  return (
    <div>
      <p
        className={cn(
          "break-words text-[1.0625rem] leading-[1.45] line-through decoration-1",
          style.quote,
        )}
      >
        {issue.originalFragment}
      </p>
      <p className="mt-1.5 break-words text-[1.25rem] font-bold leading-[1.35] tracking-[-0.015em] text-accent">
        {issue.suggestion.trim() === "" ? "Remove it" : issue.suggestion}
      </p>

      <p className="mt-3.5 text-[0.9375rem] leading-[1.55] text-muted">{issue.explanation}</p>

      <p className="mt-3 text-[0.8125rem] text-faint">{describe(issue)}</p>
    </div>
  );
}

/** "Grammar · past tense · Mistake", with the empty pieces left out. */
export function describe(issue: DisplayIssue): string {
  return [CATEGORY_LABELS[issue.category], issue.label, SEVERITY_LABELS[issue.severity]]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
