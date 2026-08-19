import { SectionHeader } from "@/components/ui/section-header";
import type { ActivityGroup } from "@/features/tracker/domain/activity";
import type { TodayView } from "@/features/tracker/data/overview";
import { formatSeconds } from "@/lib/format";
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Activity colours are passed as CSS variables rather than built into class
 * names, so no utility depends on a value only known at runtime.
 */
const GROUP_COLOR: Record<ActivityGroup, string> = {
  input: "var(--data-input)",
  speaking: "var(--data-speaking)",
  writing: "var(--data-writing)",
  other: "var(--data-writing)",
};

/**
 * Real tracker data. Sits directly on the background — no outer card. The
 * labels run in the same order as the bar segments, which is what ties them
 * together; there are no legend dots.
 */
export function TodayBreakdown({
  today,
  messages,
  language = DEFAULT_UI_LANGUAGE,
}: {
  today: TodayView;
  messages: Messages;
  language?: UiLanguage;
}) {
  const logged = today.breakdown.filter((item) => item.seconds > 0);
  const hasAnything = today.seconds > 0;

  return (
    <section>
      <SectionHeader label={messages.dashboard.today} />

      <p className="mt-2 text-[1.875rem] font-bold leading-none tracking-[-0.03em]">
        {formatSeconds(today.seconds, language)}
      </p>

      <div aria-hidden className="mt-4 flex h-2 gap-1">
        {hasAnything ? (
          logged.map((item) => (
            <span
              key={item.group}
              className="rounded-full"
              style={{ flex: `${item.seconds} 1 0`, backgroundColor: GROUP_COLOR[item.group] }}
            />
          ))
        ) : (
          <span className="flex-1 rounded-full bg-surface" />
        )}
      </div>

      {hasAnything ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {today.breakdown.map((item) => (
            <div key={item.group} className="min-w-0">
              {/* Russian group names are longer; they shrink rather than wrap. */}
              <dt className="truncate text-[0.8125rem] text-muted">
                {messages.tracker.activityGroups[item.group]}
              </dt>
              <dd className="mt-1.5 text-[1rem] font-semibold leading-none">
                {formatSeconds(item.seconds, language)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-[0.875rem] leading-snug text-muted">
          {messages.dashboard.nothingToday}
        </p>
      )}
    </section>
  );
}
