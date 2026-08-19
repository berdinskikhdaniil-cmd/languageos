import type { ActivityGroup } from "@/features/tracker/domain/activity";
import type { BalanceShare } from "@/features/progress/domain/analytics";
import { formatSeconds } from "@/lib/format";
import type { UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";

/**
 * What the time went on, as one bar and three lines.
 *
 * Deliberately without a verdict. There is no established ratio of listening to
 * speaking to writing that this product can defend, so it says what the learner
 * did and stops — "you are not speaking enough" is a recommendation, and a
 * recommendation needs a method behind it that does not exist yet.
 *
 * One stacked bar rather than a donut: two dimensions of ink for one dimension
 * of data, and the percentages are written underneath anyway.
 */

const GROUP_COLOR: Record<ActivityGroup, string> = {
  input: "var(--data-input)",
  speaking: "var(--data-speaking)",
  writing: "var(--data-writing)",
  other: "var(--data-ghost)",
};

export function PracticeBalance({
  shares,
  totalSeconds,
  messages,
  language,
}: {
  shares: BalanceShare[];
  totalSeconds: number;
  messages: Messages;
  language: UiLanguage;
}) {
  // No time means no percentages. A bar of four equal grey thirds would be an
  // invented answer to a question the data cannot answer.
  if (totalSeconds <= 0) return null;

  const filled = shares.filter((share) => share.seconds > 0);

  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.practiceBalance}
      </h2>

      <div aria-hidden className="mt-4 flex h-2.5 gap-1">
        {filled.map((share) => (
          <span
            key={share.group}
            className="rounded-full"
            style={{ flex: `${share.seconds} 1 0`, backgroundColor: GROUP_COLOR[share.group] }}
          />
        ))}
      </div>

      <dl className="mt-4 divide-y divide-hairline">
        {shares.map((share) => (
          <div key={share.group} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 text-[0.9375rem] leading-snug">
              {messages.tracker.activityGroups[share.group]}
            </dt>
            <dd className="shrink-0 text-[0.875rem] leading-snug text-muted">
              {messages.progress.balanceShare(
                share.percent,
                formatSeconds(share.seconds, language),
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
