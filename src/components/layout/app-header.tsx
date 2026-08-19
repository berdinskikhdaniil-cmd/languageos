import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/current-user";
import { displayLanguageName } from "@/lib/i18n/language-names";
import { getMessages } from "@/lib/i18n/messages";

/**
 * Initials from whatever Telegram gave us. Telegram guarantees a first name in
 * practice but types it as optional, so there is a last resort.
 */
function initialsFor(user: CurrentUser): string {
  const letters = [user.firstName, user.lastName]
    .map((part) => part?.trim()?.[0])
    .filter((letter): letter is string => Boolean(letter))
    .join("");

  return letters.toLocaleUpperCase() || "·";
}

/**
 * Identity, shown plainly: the learner's first name and the language they are
 * studying.
 *
 * "Language OS" is the product's name and stays as it is in every locale. The
 * learner's own name is theirs and is never transliterated. The language being
 * studied is the one thing here that does change: an English interface says
 * "German", a Russian one "Немецкий", and the row underneath still stores `de`.
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
  const messages = getMessages(user?.uiLanguage);

  const languageName = user?.primaryLanguage
    ? displayLanguageName(
        user.primaryLanguage.code,
        user.primaryLanguage.name,
        user.uiLanguage,
      )
    : null;

  return (
    <header className="sticky top-0 z-30 bg-bg/85 pt-[var(--safe-top)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-[1.0625rem] font-bold leading-none tracking-[-0.02em]">
            Language <span className="text-accent">OS</span>
          </p>
          {user && (user.firstName || languageName) ? (
            <p className="mt-2 truncate text-[0.8125rem] leading-none text-muted">
              {user.firstName}
              {user.firstName && languageName ? (
                <span className="text-faint"> · {languageName}</span>
              ) : (
                languageName
              )}
            </p>
          ) : null}
        </div>

        {user ? (
          <Link
            href="/settings"
            aria-label={messages.header.settingsFor(user.firstName)}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-[0.75rem] font-semibold text-muted transition-colors active:bg-hairline"
          >
            {initialsFor(user)}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
