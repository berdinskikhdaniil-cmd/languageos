"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/locale-context";
import { NAV_ITEMS } from "@/lib/navigation";

/**
 * Routes the navigation stays out of the way of.
 *
 * Writing is a text box and a keyboard on a phone screen, and a bar fixed above
 * the keyboard would take a line of it while covering what is being typed. The
 * writing screens carry their own way back instead.
 */
function isImmersive(pathname: string): boolean {
  return pathname.startsWith("/practice/writing");
}

export function BottomNav() {
  const pathname = usePathname();
  const messages = useMessages();

  if (isImmersive(pathname)) return null;

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-[var(--app-width)] border-t border-hairline bg-bg/90 pb-[var(--safe-bottom)] backdrop-blur-xl">
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map(({ href, id, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-[var(--nav-height)] flex-col items-center justify-center gap-1 transition-colors",
                    isActive ? "text-accent" : "text-faint active:text-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-0 h-[2px] w-7 rounded-b-full bg-accent transition-opacity",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                  {/*
                    Russian labels are longer than English ones, so the word is
                    allowed to shrink into its quarter of the bar rather than
                    wrap onto a second line or push the column wider.
                  */}
                  <span className="max-w-full truncate px-0.5 text-[0.625rem] font-medium leading-none">
                    {messages.nav[id]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/**
 * Keeps the last line of a screen clear of the fixed navigation, and shrinks to
 * the safe area alone where the navigation is hidden.
 */
export function BottomNavSpacer() {
  const pathname = usePathname();

  return (
    <div
      aria-hidden
      className={
        isImmersive(pathname)
          ? "h-[calc(var(--safe-bottom)+1.5rem)]"
          : "h-[calc(var(--nav-height)+var(--safe-bottom)+1.75rem)]"
      }
    />
  );
}
