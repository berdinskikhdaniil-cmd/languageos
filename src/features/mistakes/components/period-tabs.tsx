import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";
import { progressHref } from "../domain/links";
import { MISTAKE_PERIODS, type MistakePeriod } from "../domain/period";

/**
 * Which window the screen is counting in.
 *
 * Three links, not three pills: the period lives in the URL, so the whole
 * control is server-rendered, survives a reload and can be shared. The active
 * one is carried by weight and a two-pixel accent rule, which is enough — a
 * capsule around each would be three badges on a screen that already has
 * numbers to read.
 */
export function PeriodTabs({
  current,
  messages,
}: {
  current: MistakePeriod;
  messages: Messages;
}) {
  return (
    <nav aria-label={messages.progress.periodRegion} className="border-b border-hairline">
      <ul className="flex gap-6">
        {MISTAKE_PERIODS.map((period) => {
          const isActive = period === current;

          return (
            <li key={period}>
              <Link
                href={progressHref(period)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative block py-3 text-[0.9375rem] leading-none transition-colors",
                  isActive ? "font-semibold text-fg" : "text-muted active:text-fg",
                )}
              >
                {messages.progress.periods[period]}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
