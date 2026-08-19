import type { CategoryWeakPoint } from "@/features/mistakes/domain/aggregate";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Which kinds of mistake come up, worst first.
 *
 * Concrete errors only. Improvement suggestions are counted elsewhere and are
 * not added into these bars, because a category that is entirely "this is a bit
 * wordy" would otherwise draw the longest bar on the screen.
 *
 * A rank rather than a survey: the worst few, with the full list a tap away in
 * the weak points below. Nothing is dropped from the aggregation — only from
 * the picture, which is the only place a top-N belongs.
 *
 * The name and the number are ordinary text beside the bar, so the chart is
 * never the only carrier of the information.
 */

/** As many rows as read at a glance. Beyond this it is a table, not a chart. */
const VISIBLE_CATEGORIES = 6;

export function CategoryChart({
  items,
  messages,
}: {
  items: CategoryWeakPoint[];
  messages: Messages;
}) {
  const ranked = items.filter((item) => item.mistakes > 0).slice(0, VISIBLE_CATEGORIES);
  if (ranked.length === 0) return null;

  const worst = Math.max(...ranked.map((item) => item.mistakes));

  return (
    <div className="mt-4">
      <h3 className="text-[0.8125rem] font-medium text-muted">
        {messages.progress.mistakesByCategory}
      </h3>

      <ul className="mt-3 flex flex-col gap-3">
        {ranked.map((item) => (
          <li key={item.category}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-[0.9375rem] leading-snug">
                {messages.writing.categories[item.category]}
              </span>
              <span className="shrink-0 text-[0.9375rem] font-semibold leading-snug">
                {item.mistakes}
              </span>
            </div>
            <div aria-hidden className="mt-1.5 h-[3px] rounded-full bg-data-ghost">
              <div
                className="h-full rounded-full bg-severity-error/70"
                style={{ width: `${(item.mistakes / worst) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
