import type { ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/current-user";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * The phone-shaped column every screen lives in. `--app-height` follows
 * Telegram's stable viewport height and falls back to the browser's dynamic
 * viewport. On wide screens the column simply centres itself.
 */
export function AppShell({ user, children }: { user: CurrentUser | null; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[var(--app-height,100dvh)] w-full max-w-[var(--app-width)] flex-col min-[33rem]:border-x min-[33rem]:border-hairline/70">
      <AppHeader user={user} />
      <main className="flex-1 px-4 pb-[calc(var(--nav-height)+var(--safe-bottom)+1.75rem)] pt-1">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
