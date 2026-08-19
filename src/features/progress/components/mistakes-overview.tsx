import type { MistakeOverview } from "@/features/mistakes/domain/overview";
import type { Messages } from "@/lib/i18n/messages";
import { CategoryChart } from "./category-chart";

/**
 * What the reviews found, and of what kind.
 *
 * The counting rule is written into the layout: mistakes and improvement
 * suggestions are two figures on two lines and never a total, so somebody whose
 * writing came back with three real errors and eleven notes on word choice
 * reads "3 mistakes" first.
 *
 * The bars below rank only the concrete ones. The full list, including
 * categories that are entirely stylistic, is in the weak points further down —
 * this is the picture, and a picture is allowed to show the worst few.
 */
export function MistakesOverview({
  overview,
  messages,
}: {
  overview: MistakeOverview;
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
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.mistakesHeading}
      </h2>

      <p className="mt-2 text-[1.75rem] font-bold leading-none tracking-[-0.03em]">
        {messages.progress.mistakeCount(overview.counts.mistakes)}
      </p>

      {overview.counts.suggestions > 0 ? (
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
          {messages.progress.suggestionCount(overview.counts.suggestions)}
        </p>
      ) : null}

      {reviewed.length > 0 ? (
        <p className="mt-1 text-[0.8125rem] leading-snug text-faint">
          {messages.progress.reviewedLine(reviewed)}
        </p>
      ) : null}

      <CategoryChart items={overview.weakPoints} messages={messages} />
    </section>
  );
}
