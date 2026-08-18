"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { IssueDetail, type DisplayIssue } from "./issue-detail";

/**
 * The explanation for the phrase the learner just tapped.
 *
 * Deliberately not the app's modal BottomSheet. That one dims and covers the
 * screen, which is right for a form and wrong here: the text being explained is
 * the thing you want to keep looking at, and tapping a second underlined phrase
 * has to swap the explanation rather than being blocked by an overlay. So this
 * is a plain panel pinned to the bottom of the column, with no backdrop and no
 * scroll lock — the page stays exactly where it was, and closing it changes
 * nothing about the scroll position.
 *
 * Focus is left where the reader put it, on the phrase itself, so Escape closes
 * and Tab carries on from the same place.
 */
export function IssueDetailPanel({
  issue,
  onClose,
}: {
  issue: DisplayIssue | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!issue) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [issue, onClose]);

  if (!issue) return null;

  return (
    <section
      aria-label="Correction"
      // Announced when the content swaps to a different phrase.
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-width)] animate-sheet-in rounded-t-[24px] bg-surface-raised px-5 pb-[calc(var(--safe-bottom)+1.25rem)] pt-4 shadow-[0_-12px_32px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <IssueDetail issue={issue} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close correction"
          className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-faint transition-colors active:bg-hairline active:text-fg"
        >
          <X size={18} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </section>
  );
}
