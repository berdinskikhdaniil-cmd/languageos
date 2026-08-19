import { SectionHeader } from "@/components/ui/section-header";
import type { Messages } from "@/lib/i18n/messages";
import type { MistakeOverview } from "../domain/overview";
import type { MistakePeriod } from "../domain/period";

/**
 * The period in three facts, written rather than tiled.
 *
 * One figure is large and the rest is a sentence, because the large figure is
 * the only one anybody came for. Six KPI cards would turn a personal feedback
 * screen into a dashboard, and this is not one.
 *
 * Mistakes and improvement suggestions are separate lines and never a total.
 * Somebody whose writing is good should not read "twenty mistakes" because the
 * model had eleven opinions about their word choice.
 */
export function MistakeSummary({
  overview,
  period,
  messages,
}: {
  overview: MistakeOverview;
  period: MistakePeriod;
  messages: Messages;
}) {
  const reviewed = [
    overview.writingReviewed > 0 ? messages.progress.writingCount(overview.writingReviewed) : null,
    overview.speakingReviewed > 0
      ? messages.progress.speakingCount(overview.speakingReviewed)
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <section>
      <SectionHeader label={messages.progress.windows[period]} />

      <p className="mt-2 text-[2.25rem] font-bold leading-none tracking-[-0.035em]">
        {messages.progress.mistakeCount(overview.counts.mistakes)}
      </p>

      {overview.counts.suggestions > 0 ? (
        <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">
          {messages.progress.suggestionCount(overview.counts.suggestions)}
        </p>
      ) : null}

      {reviewed.length > 0 ? (
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-faint">
          {messages.progress.reviewedLine(reviewed)}
        </p>
      ) : null}
    </section>
  );
}
