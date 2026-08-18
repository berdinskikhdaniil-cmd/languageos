import { Card } from "@/components/ui/card";
import { MetricChange } from "@/components/ui/metric-change";
import type { WeekView } from "@/features/tracker/data/overview";
import { cn } from "@/lib/cn";
import { formatSeconds } from "@/lib/format";

const CHART_HEIGHT = "6.75rem";

/**
 * The week, read in one glance. Each day is two bars: last week drawn wide and
 * shaded behind, this week drawn narrow and lit on top — so a day that beat its
 * own past shows a bright core, and a day that fell short shows grey shoulders.
 * A dashed rule marks the daily goal.
 *
 * Real tracker data. When there is nothing to compare against, it says so
 * rather than inventing a percentage.
 */
export function WeekActivityCard({ week }: { week: WeekView }) {
  const { days, dailyGoalMinutes } = week;
  const goalSeconds = dailyGoalMinutes * 60;

  const peak = Math.max(
    goalSeconds,
    ...days.map((day) => Math.max(day.seconds, day.previousSeconds)),
  );
  const scale = peak * 1.14;
  const heightOf = (seconds: number) =>
    seconds <= 0 ? "0%" : `${Math.max(2.5, (seconds / scale) * 100)}%`;

  const loggedDays = days.filter((day) => !day.isUpcoming);

  return (
    <Card>
      <p className="text-[0.8125rem] font-medium text-muted">This week</p>

      <p className="mt-2 text-[3.25rem] font-bold leading-none tracking-[-0.04em]">
        {formatSeconds(week.seconds)}
      </p>

      {week.changePercent === null ? (
        <p className="mt-2.5 text-[0.875rem] leading-snug text-muted">
          {week.seconds === 0
            ? "Nothing logged this week yet."
            : "No time logged last week to compare with."}
        </p>
      ) : (
        <MetricChange
          percent={week.changePercent}
          improved={week.changePercent >= 0}
          context={`from last week’s ${formatSeconds(week.previousSeconds)}`}
          className="mt-2.5"
        />
      )}

      <div className="relative mt-7" style={{ height: CHART_HEIGHT }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-hairline"
          style={{ bottom: `${(goalSeconds / scale) * 100}%` }}
        >
          <span className="absolute -top-2.5 right-0 bg-surface pl-2 text-[0.6875rem] leading-none text-faint">
            {dailyGoalMinutes}m goal
          </span>
        </div>

        <div aria-hidden className="flex h-full items-end gap-1.5">
          {days.map((day) => (
            <div key={day.dayKey} className="relative h-full flex-1">
              <div
                className="absolute inset-x-0 bottom-0 rounded-[4px] bg-data-ghost"
                style={{ height: heightOf(day.previousSeconds) }}
              />
              {!day.isUpcoming && (
                <div
                  className={cn(
                    "absolute bottom-0 left-1/2 w-[58%] -translate-x-1/2 rounded-[4px]",
                    day.isToday ? "bg-accent" : "bg-accent/65",
                  )}
                  style={{ height: heightOf(day.seconds) }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden className="mt-3 flex gap-1.5">
        {days.map((day) => (
          <span
            key={day.dayKey}
            className={cn(
              "flex-1 text-center text-[0.6875rem] leading-none",
              day.isToday ? "font-semibold text-accent" : "text-faint",
            )}
          >
            {day.shortName}
          </span>
        ))}
      </div>

      <p className="sr-only">
        {formatSeconds(week.seconds)} this week. Daily goal {dailyGoalMinutes} minutes.{" "}
        {loggedDays
          .map((day) => `${day.name} ${Math.round(day.seconds / 60)} minutes`)
          .join(", ")}
        .
      </p>
    </Card>
  );
}
