import Link from "next/link";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Nothing has been reviewed yet.
 *
 * Typography, spacing and one way forward — no icon in a rounded tile, and
 * nothing seeded to make the screen look busy. An empty progress screen is the
 * correct answer for somebody who has not practised yet, and inventing figures
 * to fill it would make every number on this page suspect.
 */
export function MistakesEmpty({ messages }: { messages: Messages }) {
  return (
    <section className="py-6">
      <p className="max-w-[22rem] text-[1.0625rem] leading-[1.5] text-muted">
        {messages.progress.emptyBody}
      </p>

      <Link
        href="/practice"
        className="mt-6 flex h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 text-center text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed"
      >
        {messages.progress.emptyAction}
      </Link>
    </section>
  );
}
