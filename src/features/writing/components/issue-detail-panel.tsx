"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/locale-context";
import { hidesBottomNav } from "@/lib/navigation";
import { IssueDetail, type DisplayIssue } from "./issue-detail";

/**
 * The explanation for the phrase the learner just tapped.
 *
 * Shared by writing and speaking reviews, because it is the same act in both:
 * point at your own words and read what was wrong with them.
 *
 * Deliberately not the app's modal BottomSheet. That one dims and covers the
 * screen, which is right for a form and wrong here: the text being explained is
 * the thing you want to keep looking at, and tapping a second underlined phrase
 * has to swap the explanation rather than being blocked by an overlay. So this
 * is a plain panel pinned above the bottom of the column, with no backdrop and
 * no scroll lock — the page stays exactly where it was, and closing it changes
 * nothing about the scroll position.
 *
 * Where its bottom edge sits is the whole of what this component has to get
 * right, and it is not a constant. The navigation bar is hidden on the writing
 * screens and showing on the speaking ones, so a panel pinned to the viewport
 * bottom is flush on one and clipped by the bar on the other — which is exactly
 * how it shipped. It now measures from `--bottom-chrome` when the bar is there
 * and from the viewport when it is not, and both of those resolve from the
 * Telegram and `env()` safe areas without a device-specific number anywhere.
 *
 * Its height is bounded too. A Russian explanation of a Russian mistake runs
 * long, and an unbounded panel grows off the top of the screen: the correction
 * scrolls inside the panel instead, while the close button and the phrase being
 * explained stay where they are.
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
  const messages = useMessages();
  const pathname = usePathname();

  useEffect(() => {
    if (!issue) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [issue, onClose]);

  if (!issue) return null;

  const clearOfNav = !hidesBottomNav(pathname);

  return (
    <section
      aria-label={messages.writing.correctionRegion}
      // Announced when the content swaps to a different phrase.
      aria-live="polite"
      data-testid="issue-detail-panel"
      className={cn(
        "fixed inset-x-0 z-40 mx-auto w-full max-w-[var(--app-width)] animate-sheet-in rounded-t-[24px] bg-surface-raised px-5 pt-4 shadow-[0_-12px_32px_rgba(0,0,0,0.45)]",
        clearOfNav
          ? // Sitting on the bar rather than under it. Flush, not floating: a
            // gap would show a strip of the page through it and read as a
            // mistake, and the bar's own top hairline already separates them.
            "bottom-[var(--bottom-chrome)] pb-5"
          : // No bar on this route, so the panel keeps the bottom edge and
            // reserves the device's own inset itself.
            "bottom-0 pb-[calc(var(--safe-bottom)+1.25rem)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/*
          The correction scrolls, the close button does not. `overscroll-contain`
          is what stops a flick inside the panel from chaining to the document
          and scrolling the sentence being explained out from under the reader.

          The cap is a fraction of Telegram's own stable viewport, so it shrinks
          with the window rather than assuming a phone height, with a ceiling so
          it never swallows the screen on a tall one.
        */}
        <div className="max-h-[min(calc(var(--app-height,100dvh)*0.42),20rem)] min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <IssueDetail issue={issue} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={messages.writing.closeCorrection}
          className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-faint transition-colors active:bg-hairline active:text-fg"
        >
          <X size={18} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </section>
  );
}
