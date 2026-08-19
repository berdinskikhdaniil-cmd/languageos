import Link from "next/link";
import { cn } from "@/lib/cn";
import { severityStyle } from "@/features/writing/domain/severity-style";
import type { UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import { localDateLabel } from "@/lib/time";
import { normalizeLabel, skillDisplayName } from "../domain/label";
import { occurrenceHref, type MistakeOccurrence } from "../domain/occurrence";

/**
 * Every time one weak point came up, newest first.
 *
 * Each entry is the learner's own words, the correction, and why — the same
 * three facts the review screens lead with, in the same order, because a
 * mistake should look the same wherever it is met. The severity colour and the
 * strike-through come from Writing's own mapping rather than a second copy of
 * it, which is also what keeps a stylistic note visibly different from an
 * error in a list that holds both.
 *
 * The whole row is the link back to the review it came from. No separate
 * "open" button: the row is the thing being pointed at.
 */
export function OccurrenceList({
  occurrences,
  timeZone,
  language,
  now,
  messages,
}: {
  occurrences: MistakeOccurrence[];
  timeZone: string;
  language: UiLanguage;
  now: Date;
  messages: Messages;
}) {
  if (occurrences.length === 0) {
    return (
      <p className="mt-6 text-[0.9375rem] leading-snug text-muted">
        {messages.progress.detailEmpty}
      </p>
    );
  }

  return (
    <ul className="mt-2 divide-y divide-hairline">
      {occurrences.map((occurrence) => {
        const style = severityStyle(occurrence.severity);
        const key = normalizeLabel(occurrence.label);

        return (
          <li key={`${occurrence.source}-${occurrence.issueId}`}>
            <Link
              href={occurrenceHref(occurrence)}
              className="block py-4 transition-colors active:bg-surface"
            >
              <span className="block text-[0.8125rem] leading-snug text-faint">
                {messages.progress.breakdown([
                  messages.progress.sources[occurrence.source],
                  localDateLabel(occurrence.createdAt, timeZone, now, language),
                ])}
              </span>

              <span
                className={cn(
                  "mt-2 block break-words text-[1.0625rem] leading-[1.45] line-through decoration-1",
                  style.quote,
                )}
              >
                {occurrence.originalFragment}
              </span>
              <span className="mt-1 block break-words text-[1.125rem] font-bold leading-[1.35] tracking-[-0.015em] text-accent">
                {occurrence.suggestion.trim() === ""
                  ? messages.writing.removeIt
                  : occurrence.suggestion}
              </span>

              <span className="mt-2.5 block text-[0.9375rem] leading-[1.55] text-muted">
                {occurrence.explanation}
              </span>

              <span className="mt-2 block text-[0.8125rem] leading-snug text-faint">
                {messages.progress.breakdown(
                  [
                    messages.writing.categories[occurrence.category],
                    key !== null && occurrence.label !== null
                      ? skillDisplayName(key, occurrence.label, messages.progress.skills)
                      : null,
                    messages.writing.severities[occurrence.severity],
                  ].filter((part): part is string => part !== null),
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
