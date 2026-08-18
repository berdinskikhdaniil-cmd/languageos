import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Initials from whatever Telegram gave us. Telegram guarantees a first name in
 * practice but types it as optional, so there is a last resort.
 */
function initialsFor(user: CurrentUser): string {
  const letters = [user.firstName, user.lastName]
    .map((part) => part?.trim()?.[0])
    .filter((letter): letter is string => Boolean(letter))
    .join("");

  return letters.toUpperCase() || "·";
}

/**
 * Identity, shown plainly: the learner's first name and the language they are
 * studying.
 *
 * The language can be absent — during setup, and in the moment after a database
 * failure when identity resolved but nothing else did — so the line renders
 * whichever halves exist rather than assuming both.
 *
 * The Telegram profile photo is stored on sign-in but not rendered: the URLs are
 * short-lived and would need remote-image configuration for very little gain.
 * Initials are enough to confirm who is signed in.
 */
export function AppHeader({ user }: { user: CurrentUser | null }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-[1.0625rem] font-bold leading-none tracking-[-0.02em]">
            Language <span className="text-accent">OS</span>
          </p>
          {user && (user.firstName || user.primaryLanguage) ? (
            <p className="mt-2 truncate text-[0.8125rem] leading-none text-muted">
              {user.firstName}
              {user.firstName && user.primaryLanguage ? (
                <span className="text-faint"> · {user.primaryLanguage.name}</span>
              ) : (
                user.primaryLanguage?.name
              )}
            </p>
          ) : null}
        </div>

        {user ? (
          <Link
            href="/settings"
            aria-label={`Profile and settings for ${user.firstName ?? "your account"}`}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-[0.75rem] font-semibold text-muted transition-colors active:bg-hairline"
          >
            {initialsFor(user)}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
