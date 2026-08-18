import type { ReactNode } from "react";

/**
 * The column first-run setup lives in.
 *
 * Deliberately not AppShell: no header, no bottom navigation, no glimpse of a
 * dashboard that has no data behind it yet. The same phone-shaped column and
 * the same safe areas, and nothing else — an account that is not set up has
 * exactly one thing it can do.
 *
 * Safe-area padding is left to the step itself, which needs the top inset above
 * its progress rule and the bottom inset under its primary action.
 */
export function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[var(--app-height,100dvh)] w-full max-w-[var(--app-width)] flex-col min-[33rem]:border-x min-[33rem]:border-hairline/70">
      {children}
    </div>
  );
}
