import type { Messages } from "@/lib/i18n/messages";
import type { SourceBalance as SourceBalanceCounts } from "../domain/aggregate";
import { MISTAKE_SOURCES } from "../domain/occurrence";

/**
 * Whether the mistakes are showing up in writing or out loud.
 *
 * Two numbers. Not a chart: a pie with two slices carries less than the two
 * figures written down, and takes more room to do it. Concrete mistakes only,
 * so the pair adds up to the headline figure above without any arithmetic.
 */
export function SourceBalance({
  balance,
  messages,
}: {
  balance: SourceBalanceCounts;
  messages: Messages;
}) {
  if (balance.writing === 0 && balance.speaking === 0) return null;

  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.whereTheyShowUp}
      </h2>

      <dl className="mt-2 divide-y divide-hairline">
        {MISTAKE_SOURCES.map((source) => (
          <div key={source} className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="min-w-0 text-[0.9375rem] leading-snug">
              {messages.progress.sources[source]}
            </dt>
            <dd className="shrink-0 text-[1.0625rem] font-semibold leading-snug">
              {balance[source]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
