import { percentageShares } from "@/features/tracker/domain/buckets";
import type { Messages } from "@/lib/i18n/messages";
import type { SourceBalance as SourceBalanceCounts } from "../domain/aggregate";
import { MISTAKE_SOURCES } from "../domain/occurrence";

/**
 * Whether the mistakes were found in writing or in speech.
 *
 * Two numbers and one bar. Not a chart of quality: a transcript reaches us
 * through a speech recogniser and is a different kind of text from a typed
 * paragraph, so "more mistakes in speaking" is not evidence that the learner
 * speaks worse than they write. The note under the bar says so, because without
 * it the block makes exactly that claim by implication.
 *
 * Concrete mistakes only, so the pair adds up to the headline figure above
 * without any arithmetic.
 */
export function SourceBalance({
  balance,
  messages,
}: {
  balance: SourceBalanceCounts;
  messages: Messages;
}) {
  const total = balance.writing + balance.speaking;
  if (total === 0) return null;

  const percents = percentageShares(MISTAKE_SOURCES.map((source) => balance[source]));

  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.whereTheyShowUp}
      </h2>

      <div aria-hidden className="mt-4 flex h-2.5 gap-1">
        {MISTAKE_SOURCES.filter((source) => balance[source] > 0).map((source) => (
          <span
            key={source}
            className={source === "writing" ? "rounded-full bg-data-writing" : "rounded-full bg-data-speaking"}
            style={{ flex: `${balance[source]} 1 0` }}
          />
        ))}
      </div>

      <dl className="mt-4 divide-y divide-hairline">
        {MISTAKE_SOURCES.map((source, index) => (
          <div key={source} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 text-[0.9375rem] leading-snug">
              {messages.progress.sources[source]}
            </dt>
            <dd className="shrink-0 text-[0.875rem] leading-snug text-muted">
              {messages.progress.balanceShare(
                percents[index],
                messages.progress.mistakeCount(balance[source]),
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[0.8125rem] leading-snug text-faint">
        {messages.progress.whereTheyShowUpNote}
      </p>
    </section>
  );
}
