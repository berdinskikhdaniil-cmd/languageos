"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * A sheet that rises from the bottom of the phone. Deliberately not a centred
 * desktop dialog: on a phone the bottom edge is where the thumb already is.
 *
 * It sits above the bottom navigation, caps its own height and scrolls
 * internally, so an open keyboard shrinks the sheet instead of pushing the
 * layout around.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/70"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-[var(--app-width)] animate-sheet-in flex-col rounded-t-[24px] bg-surface outline-none"
      >
        <div className="shrink-0 px-5 pb-1 pt-3">
          <div aria-hidden className="mx-auto h-1 w-9 rounded-full bg-hairline" />
          <h2 id={titleId} className="mt-4 text-[1.25rem] font-bold tracking-[-0.025em]">
            {title}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--safe-bottom)+1.25rem)] pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
