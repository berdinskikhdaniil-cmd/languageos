"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/locale-context";
import { splitByHighlights, type FragmentSpan } from "../domain/fragments";
import type { IssueCategory, IssueSeverity } from "../domain/review";
import { HIGHLIGHT_BASE_CLASS, severityStyle } from "../domain/severity-style";

/**
 * The learner's own text, and the review's main interface.
 *
 * Every problem that could be located sits in the sentence it belongs to, and
 * tapping it opens that one explanation. Nobody should have to scroll to a list
 * and work out which entry matches the phrase they were looking at.
 *
 * The marks are `span`s rather than `button`s on purpose: a button cannot
 * reliably wrap across lines in every WebKit that Telegram runs on, and a
 * highlighted phrase is often half a sentence. `role="button"` with a tab stop
 * and Enter/Space handling gives the same keyboard behaviour without taking the
 * text apart.
 *
 * Every character of the original appears exactly once — the splitting is a
 * tested pure function, because the one thing this must never do is quietly
 * mangle what somebody wrote.
 */

export type HighlightSpan = {
  span: FragmentSpan;
  issueIndex: number;
  severity: IssueSeverity;
  /**
   * What the mark is about, as data. The screen-reader phrase is built from it
   * here, in the reader's own language — the view model carries a stored
   * category identifier and the model's canonical English skill label, not a
   * sentence somebody has to translate twice.
   */
  category: IssueCategory;
  label: string | null;
};

export function HighlightedText({
  text,
  spans,
  selectedIndex,
  onSelect,
}: {
  text: string;
  spans: HighlightSpan[];
  selectedIndex: number | null;
  onSelect: (issueIndex: number) => void;
}) {
  const messages = useMessages();
  const parts = splitByHighlights(text, spans);

  return (
    <p className="whitespace-pre-wrap break-words text-[1.0625rem] leading-[1.75]">
      {parts.map((part, index) => {
        if (part.kind === "plain") return <span key={index}>{part.text}</span>;

        const highlight = spans.find((entry) => entry.issueIndex === part.issueIndex);
        if (!highlight) return <span key={index}>{part.text}</span>;

        const selected = part.issueIndex === selectedIndex;
        const style = severityStyle(highlight.severity);

        const activate = () => onSelect(part.issueIndex);
        const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          // Space would otherwise scroll the page out from under the reader.
          event.preventDefault();
          activate();
        };

        return (
          <span
            key={index}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={messages.writing.highlightLabel(
              part.text,
              messages.writing.highlightDescription(
                [messages.writing.categories[highlight.category], highlight.label].filter(
                  (piece): piece is string => Boolean(piece),
                ),
              ),
            )}
            onClick={activate}
            onKeyDown={onKeyDown}
            className={cn(
              HIGHLIGHT_BASE_CLASS,
              selected ? style.highlightSelected : style.highlight,
            )}
          >
            {part.text}
          </span>
        );
      })}
    </p>
  );
}
