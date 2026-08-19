import type { Messages } from "@/lib/i18n/messages";
import type { CategoryWeakPoint } from "../domain/aggregate";
import { mistakeDetailHref } from "../domain/links";
import type { MistakePeriod } from "../domain/period";
import { MistakeRow } from "./mistake-row";
import { sourceBreakdown } from "./source-breakdown";

/**
 * Where the mistakes are, by category, worst first.
 *
 * The category names come from `writing.categories` — the dictionary Writing
 * and Speaking already read — because two translations of one taxonomy is
 * exactly the split the mistake engine exists to close.
 *
 * Each row opens the history behind it, so each row looks like something that
 * opens; the hint under the heading says so once, in words, rather than being
 * repeated as a caption on every line.
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
        <>
          <p className="mt-1 text-[0.8125rem] leading-snug text-faint">
            {messages.progress.weakPointsHint}
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item) => (
              <MistakeRow
                key={item.category}
                href={mistakeDetailHref({ kind: "category", category: item.category }, period)}
                title={messages.writing.categories[item.category]}
                detail={messages.progress.breakdown(
                  [
                    // "0 mistakes · 2 improvement suggestions" is technically
                    // true and reads as a wrong answer. A category with nothing
                    // concrete in it says only what it does have.
                    item.mistakes > 0 ? messages.progress.mistakeCount(item.mistakes) : null,
                    item.suggestions > 0
                      ? messages.progress.suggestionCount(item.suggestions)
                      : null,
                  ].filter((part): part is string => part !== null),
                )}
                meta={sourceBreakdown(item.bySource, messages)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
