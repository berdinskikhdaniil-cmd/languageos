import { HEATMAP_WEEKS, type HeatmapView } from "@/features/tracker/domain/heatmap";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Twelve weeks of days, shaded by how long was studied on each.
 *
 * The one thing on this screen that shows the *shape* of a habit: a fortnight
 * of silence beside a fortnight of daily practice is obvious here and invisible
 * in any total. Twelve weeks rather than a year, because a year is 365 cells
 * and a phone is 360 points wide — the desktop version of this idea does not
 * survive being squeezed onto one.
 *
 * Shade comes from the learner's own daily goal, so the scale means the same
 * thing every time it is drawn. Scaling to their busiest day would repaint the
 * whole grid because of one long Sunday, and a day that was dark last week
 * would be pale this week without anything having changed.
 *
 * No tap targets. The cells do nothing, and 84 focusable elements that do
 * nothing is a worse experience for somebody using a keyboard than no grid at
 * all — the summary sentence underneath is the accessible version.
 */

/** Level 0 is "nothing at all" and takes the ghost tone, not a pale accent. */
const LEVEL_CLASS = [
  "bg-data-ghost",
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
];

export function ConsistencyHeatmap({
  view,
  messages,
}: {
  view: HeatmapView;
  messages: Messages;
}) {
  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.consistency}
      </h2>
      {/*
        The heatmap keeps its own stretch of time whatever period is selected,
        so it says so plainly rather than leaving the reader to assume it
        follows the tabs at the top.
      */}
      <p className="mt-1 text-[0.8125rem] leading-snug text-faint">
        {messages.progress.consistencyWindow(HEATMAP_WEEKS)}
      </p>

      <div aria-hidden className="mt-4 flex gap-[3px]">
        {view.weeks.map((week, index) => (
          <div key={index} className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {week.map((day) => (
              <span
                key={day.dayKey}
                className={cn(
                  "aspect-square w-full rounded-[2px]",
                  // A day that has not happened is not a day with nothing on
                  // it, so it is drawn fainter than a real zero rather than the
                  // same as one.
                  day.isFuture ? "bg-data-ghost/40" : LEVEL_CLASS[day.level],
                  day.isToday && "ring-1 ring-inset ring-accent/60",
                )}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[0.8125rem] leading-snug text-muted">
          {messages.progress.consistencySummary(
            messages.progress.activeDaysCount(view.activeDays),
            view.observedDays,
          )}
        </p>

        <div aria-hidden className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-faint">
          <span>{messages.progress.consistencyLess}</span>
          {LEVEL_CLASS.map((tone, level) => (
            <span key={level} className={cn("h-2 w-2 rounded-[2px]", tone)} />
          ))}
          <span>{messages.progress.consistencyMore}</span>
        </div>
      </div>
    </section>
  );
}
