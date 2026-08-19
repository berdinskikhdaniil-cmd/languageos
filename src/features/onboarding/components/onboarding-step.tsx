"use client";

import type { ReactNode } from "react";
import { useMessages } from "@/lib/i18n/locale-context";

/**
 * The frame all three steps share: the same heading position, the same footer,
 * the same scroll behaviour. Only the words and the choices change between
 * them, which is what makes the flow feel like one screen answering three
 * questions rather than three screens.
 *
 * No card, no progress ring, no illustration. Typography and space carry it.
 *
 * The step scrolls in the page rather than in an inner pane, and the action
 * sticks to the bottom edge. That is what keeps the button reachable when an
 * on-screen keyboard shrinks the Telegram viewport under a search field.
 */
export function OnboardingStep({
  step,
  totalSteps,
  title,
  description,
  onBack,
  footer,
  children,
}: {
  step: number;
  totalSteps: number;
  title: string;
  description?: string;
  onBack?: () => void;
  /** The primary action, pinned above the safe area. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const messages = useMessages();

  return (
    <div className="flex min-h-[var(--app-height,100dvh)] flex-col pt-[var(--safe-top)]">
      <div className="flex items-center gap-4 px-5 pb-1 pt-4">
        <div
          aria-hidden
          className="h-[3px] flex-1 overflow-hidden rounded-full bg-hairline"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
        <p className="shrink-0 text-[0.75rem] leading-none text-faint">
          {messages.onboarding.stepOf(step, totalSteps)}
        </p>
      </div>

      <div className="flex-1 px-5 pb-4 pt-7">
        <h1 className="text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em]">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-[24rem] text-[0.9375rem] leading-[1.5] text-muted">
            {description}
          </p>
        ) : null}

        <div className="mt-7">{children}</div>
      </div>

      {footer ? (
        <div className="sticky bottom-0 bg-bg px-5 pb-[calc(var(--safe-bottom)+1.25rem)] pt-3">
          {footer}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mt-3 h-10 w-full text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
            >
              {messages.common.back}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The one filled button per step. Dark ink on green, never white. */
export function PrimaryAction({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-14 w-full rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
