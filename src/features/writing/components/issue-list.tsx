import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, SEVERITY_LABELS, type IssueCategory, type IssueSeverity } from "../domain/review";

export type DisplayIssue = {
  id: string;
  category: IssueCategory;
  label: string | null;
  severity: IssueSeverity;
  originalFragment: string;
  suggestion: string;
  explanation: string;
  /** Whether this one could be placed in the text and is underlined there. */
  highlighted: boolean;
};

/**
 * The findings, one after another.
 *
 * Each is the same three lines: what you wrote, what it should be, and why.
 * The category and skill sit at the end in muted text — no capsule, no dot, no
 * icon — because they are a note about the finding, not the finding itself.
 */
export function IssueList({
  issues,
  selectedIndex,
  onSelect,
}: {
  issues: DisplayIssue[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue, index) => {
        const selected = index === selectedIndex;
        return (
          <li key={issue.id}>
            <button
              type="button"
              onClick={() => onSelect(selected ? null : index)}
              className={cn(
                "w-full rounded-[var(--radius-tile)] px-4 py-4 text-left transition-colors",
                selected ? "bg-surface-raised" : "bg-surface active:bg-surface-raised",
              )}
            >
              <p className="break-words text-[0.9375rem] leading-[1.5] text-muted line-through decoration-negative/60">
                {issue.originalFragment}
              </p>
              <p className="mt-1.5 break-words text-[1rem] font-semibold leading-[1.5] text-accent">
                {issue.suggestion || "— remove it —"}
              </p>
              <p className="mt-2.5 text-[0.875rem] leading-[1.55] text-muted">
                {issue.explanation}
              </p>
              <p className="mt-2.5 text-[0.8125rem] text-faint">
                {describe(issue)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "Grammar · past tense · mistake", with the empty pieces left out. */
function describe(issue: DisplayIssue): string {
  return [CATEGORY_LABELS[issue.category], issue.label, SEVERITY_LABELS[issue.severity]]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
