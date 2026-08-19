import type { Messages } from "@/lib/i18n/messages";
import type { SourceBalance } from "../domain/aggregate";
import { MISTAKE_SOURCES } from "../domain/occurrence";

/**
 * "Writing 4 · Speaking 2", with the empty half left out.
 *
 * Shared by both row lists so the phrase is built once. A source with nothing
 * in it is dropped rather than written as a zero — "Speaking 0" is a fact
 * nobody needs on a row that already says how many there are in total.
 */
export function sourceBreakdown(balance: SourceBalance, messages: Messages): string | null {
  const parts = MISTAKE_SOURCES.filter((source) => balance[source] > 0).map((source) =>
    messages.progress.sourceCount(messages.progress.sources[source], balance[source]),
  );

  return parts.length === 0 ? null : messages.progress.breakdown(parts);
}
