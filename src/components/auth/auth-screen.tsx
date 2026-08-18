import type { ReactNode } from "react";

/**
 * The frame every pre-authentication state shares — signing in, opened outside
 * Telegram, or a failure. Keeping one frame means moving between those states
 * changes the words, not the layout.
 */
export function AuthScreen({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-[var(--app-height,100dvh)] flex-col items-center justify-center px-6 pb-[var(--safe-bottom)] pt-[var(--safe-top)] text-center">
      <p className="text-[1.375rem] font-bold tracking-[-0.025em]">
        Language <span className="text-accent">OS</span>
      </p>
      <p className="mt-3 max-w-[20rem] text-[0.9375rem] leading-[1.5] text-muted">{message}</p>
      {children}
    </main>
  );
}
