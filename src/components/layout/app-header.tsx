import Link from "next/link";
import { MOCK_USER } from "@/lib/mock-user";

export function AppHeader() {
  const { initials, language, daysTracked } = MOCK_USER;

  return (
    <header className="sticky top-0 z-30 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-[1.0625rem] font-bold leading-none tracking-[-0.02em]">
            Language <span className="text-accent">OS</span>
          </p>
          <p className="mt-2 truncate text-[0.8125rem] leading-none text-muted">
            {language} <span className="text-faint">· {daysTracked} days</span>
          </p>
        </div>

        <Link
          href="/settings"
          aria-label="Profile and settings"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-[0.75rem] font-semibold text-muted transition-colors active:bg-hairline"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
