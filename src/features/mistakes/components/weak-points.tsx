import Link from "next/link";
import type { Messages } from "@/lib/i18n/messages";
import type { CategoryWeakPoint } from "../domain/aggregate";
import { mistakeDetailHref } from "../domain/links";
import type { MistakePeriod } from "../domain/period";

/**
 * Where the mistakes are, by category, worst first.
 *
 * The category names come from `writing.categories` — the dictionary Writing
 * and Speaking already read — because two translations of one taxonomy is
 * exactly the split the mistake engine exists to close.
 *
 * The rule under each row is two pixels and proportional to the worst category.
 * It is there to make four numbers comparable at a glance, not to decorate: a
 * category with nothing concrete in it gets no rule at all, because a bar of
 * zero width pretending to be a bar is worse than no bar.
 */
export function WeakPoints({
  items,
  period,
  messages,
}: {
  items: CategoryWeakPoint[];
  period: MistakePeriod;
  messages: Messages;
}) {
  const worst = Math.max(0, ...items.map((item) => item.mistakes));

  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.weakPoints}
      </h2>

      {items.length === 0 ? (
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
          {messages.progress.weakPointsEmpty}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-hairline">
          {items.map((item) => (
            <li key={item.category}>
              <Link
                href={mistakeDetailHref({ kind: "category", category: item.category }, period)}
                className="block py-3.5 transition-colors active:bg-surface"
              >
                <span className="block text-[0.9375rem] font-medium leading-snug">
                  {messages.writing.categories[item.category]}
                </span>
                <span className="mt-1 block text-[0.8125rem] leading-snug text-faint">
                  {/*
                    "0 mistakes · 2 improvement suggestions" is technically true
                    and reads as a wrong answer. A category with nothing
                    concrete in it says only what it does have.
                  */}
                  {messages.progress.breakdown(
                    [
                      item.mistakes > 0 ? messages.progress.mistakeCount(item.mistakes) : null,
                      item.suggestions > 0
                        ? messages.progress.suggestionCount(item.suggestions)
                        : null,
                    ].filter((part): part is string => part !== null),
                  )}
                </span>

                {worst > 0 && item.mistakes > 0 ? (
                  <span aria-hidden className="mt-2.5 block h-[2px] rounded-full bg-data-ghost">
                    <span
                      className="block h-full rounded-full bg-severity-error/70"
                      style={{ width: `${(item.mistakes / worst) * 100}%` }}
                    />
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
