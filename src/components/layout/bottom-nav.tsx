"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/lib/navigation";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-[var(--app-width)] border-t border-hairline bg-bg/90 pb-[var(--safe-bottom)] backdrop-blur-xl">
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
                  <span className="text-[0.625rem] font-medium leading-none">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
