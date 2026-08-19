"use client";

import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/locale-context";
import type { Messages } from "@/lib/i18n/messages";
import type { IssueCategory, IssueSeverity } from "../domain/review";
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
 *
 * Three languages sit in this block at once and each is where it belongs. The
 * quoted fragment and the correction are the language being learned, exactly as
 * the model returned them. The explanation is the language the learner reads.
 * The category is translated from a stored identifier; the skill label is the
 * model's own canonical English and is shown as it is — translating it here
 * would suggest the stored value changed with the interface, and it does not.
 */
export function IssueDetail({ issue }: { issue: DisplayIssue }) {
  const messages = useMessages();
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
        {issue.suggestion.trim() === "" ? messages.writing.removeIt : issue.suggestion}
      </p>

      <p className="mt-3.5 text-[0.9375rem] leading-[1.55] text-muted">{issue.explanation}</p>

      <p className="mt-3 text-[0.8125rem] leading-snug text-faint">{describe(issue, messages)}</p>
    </div>
  );
}

/** "Grammar · past tense · Mistake", with the empty pieces left out. */
export function describe(issue: DisplayIssue, messages: Messages): string {
  return messages.writing.issueMeta(
    [
      messages.writing.categories[issue.category],
      issue.label,
      messages.writing.severities[issue.severity],
    ].filter((part): part is string => Boolean(part)),
  );
}
