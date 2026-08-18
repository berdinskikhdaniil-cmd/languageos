import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * The phone-shaped column every screen lives in. `--app-height` is set by
 * TelegramViewport inside Telegram and falls back to the dynamic viewport
 * height in a browser. On wide screens the column simply centres itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[var(--app-height,100dvh)] w-full max-w-[var(--app-width)] flex-col min-[33rem]:border-x min-[33rem]:border-hairline/70">
      <AppHeader />
      <main className="flex-1 px-4 pb-[calc(var(--nav-height)+var(--safe-bottom)+1.75rem)] pt-1">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
