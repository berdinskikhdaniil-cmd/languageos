"use client";

import { cn } from "@/lib/cn";
import { splitByHighlights, type FragmentSpan } from "../domain/fragments";

/**
 * The learner's own text, with the resolved issues marked in it.
 *
 * The treatment is a tinted underline rather than a coloured block: a paragraph
 * with six red boxes in it reads as a failure, and the point of this screen is
 * that the text is theirs and mostly fine. Selecting one lifts it and opens its
 * explanation below.
 *
 * Every character of the original appears exactly once — the splitting is done
 * by a tested pure function, because the one thing this component must never do
 * is quietly mangle what somebody wrote.
 */
export function HighlightedText({
  text,
  spans,
  selectedIndex,
  onSelect,
}: {
  text: string;
  spans: { span: FragmentSpan; issueIndex: number }[];
  selectedIndex: number | null;
  onSelect: (issueIndex: number | null) => void;
}) {
  const parts = splitByHighlights(text, spans);

  return (
    <p className="whitespace-pre-wrap break-words text-[1rem] leading-[1.7]">
      {parts.map((part, index) => {
        if (part.kind === "plain") return <span key={index}>{part.text}</span>;

        const selected = part.issueIndex === selectedIndex;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(selected ? null : part.issueIndex)}
            aria-pressed={selected}
            className={cn(
              "rounded-[3px] text-left underline decoration-2 underline-offset-4 transition-colors",
              selected
                ? "bg-accent/20 decoration-accent text-fg"
                : "decoration-accent/45 text-fg active:bg-accent/10",
            )}
          >
            {part.text}
          </button>
        );
      })}
    </p>
  );
}
