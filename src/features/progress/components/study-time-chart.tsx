import { Card } from "@/components/ui/card";
import { BREAKDOWN_GROUPS, type ActivityGroup } from "@/features/tracker/domain/activity";
import type { ActivityBucket, ActivitySummary } from "@/features/tracker/domain/buckets";
import { formatSeconds } from "@/lib/format";
import type { UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";

/**
 * How much, when, and of what — in one column per period.
 *
 * Stacked rather than a single total bar, because the two questions a learner
 * has about their own week are "did I do anything" and "was it all YouTube",
 * and a plain height only answers the first. The segments are the tracker's own
 * three groups plus `other` in the ghost tone: `other` is language time and
 * belongs in the height, but it is not a fourth skill and does not get a hue.
 *
 * Hand-drawn from flexbox rather than a charting library. Four charts do not
 * justify a dependency, and this one is thirty lines that scale to any width by
 * construction — the columns share the row, so 30 days at 360px and 13 weeks at
 * 430px both simply fit.
 *
 * The chart itself is hidden from assistive technology: the numbers above it
 * are the same facts in text, which is the accessible version.
 */

/** Colours as CSS variables, so no utility depends on a runtime value. */
const GROUP_COLOR: Record<ActivityGroup, string> = {
  input: "var(--data-input)",
  speaking: "var(--data-speaking)",
  writing: "var(--data-writing)",
  other: "var(--data-ghost)",
};

const SEGMENTS: ActivityGroup[] = [...BREAKDOWN_GROUPS, "other"];

export function StudyTimeChart({
  buckets,
  summary,
  messages,
  language,
}: {
  buckets: ActivityBucket[];
  summary: ActivitySummary;
  messages: Messages;
  language: UiLanguage;
}) {
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.seconds));

  return (
    <Card>
      <h2 className="text-[0.8125rem] font-medium text-muted">{messages.progress.studyTime}</h2>

      <p className="mt-2 text-[2.5rem] font-bold leading-none tracking-[-0.04em]">
        {formatSeconds(summary.seconds, language)}
      </p>

      {summary.seconds === 0 ? (
        <p className="mt-2.5 text-[0.875rem] leading-snug text-muted">
          {messages.progress.nothingLogged}
        </p>
      ) : (
        <p className="mt-2.5 text-[0.875rem] leading-snug text-muted">
          {messages.progress.breakdown([
            messages.progress.activeDaysCount(summary.activeDays),
            messages.progress.averagePerActiveDay(
              formatSeconds(summary.averageSecondsPerActiveDay, language),
            ),
          ])}
        </p>
      )}

      <div aria-hidden className="mt-6 flex h-28 items-end gap-[2px]">
        {buckets.map((bucket) => (
          <div key={bucket.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            {bucket.seconds > 0 ? (
              <div
                className="flex flex-col-reverse overflow-hidden rounded-[2px]"
                // A floor of two percent so a five-minute day is a mark rather
                // than a rounding error the learner cannot see.
                style={{ height: `${Math.max(2, (bucket.seconds / peak) * 100)}%` }}
              >
                {SEGMENTS.filter((group) => bucket.byGroup[group] > 0).map((group) => (
                  <span
                    key={group}
                    style={{
                      flex: `${bucket.byGroup[group]} 1 0`,
                      backgroundColor: GROUP_COLOR[group],
                    }}
                  />
                ))}
              </div>
            ) : (
              /* A real zero, drawn as a floor mark so the axis keeps its shape. */
              <div className="h-[2px] rounded-full bg-data-ghost" />
            )}
          </div>
        ))}
      </div>

      {/*
        Three labels, not thirty. A date under every column is unreadable at any
        phone width; the ends and the middle are what an axis is actually for.
      */}
      {buckets.length > 0 ? (
        <div aria-hidden className="mt-3 flex justify-between gap-2 text-[0.6875rem] leading-none text-faint">
          <span className="truncate">{buckets[0].label}</span>
          {buckets.length > 2 ? (
            <span className="truncate">{buckets[Math.floor(buckets.length / 2)].label}</span>
          ) : null}
          {buckets.length > 1 ? (
            <span className="truncate">{buckets[buckets.length - 1].label}</span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
