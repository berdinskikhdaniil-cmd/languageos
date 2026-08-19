import { ChevronRight } from "lucide-react";
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
 * One block per occurrence, on its own surface with air around it, because
 * these are separate events rather than lines of a log — and each one is a way
 * back into the review it came from, which a run of hairline-divided rows does
 * not look like.
 *
 * Inside the block the order is when and where, then the correction, then why.
 * The correction is the answer, so it reads as one line — what was said struck
 * through, what it should be beside it — instead of two stacked quotations.
 * The severity colour and the strike-through come from Writing's own mapping
 * rather than a second copy of it, which is what keeps a stylistic note visibly
 * different from an error in a list that holds both.
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
    <ul className="mt-5 flex flex-col gap-2.5">
      {occurrences.map((occurrence) => {
        const style = severityStyle(occurrence.severity);
        const key = normalizeLabel(occurrence.label);

        return (
          <li key={`${occurrence.source}-${occurrence.issueId}`}>
            <Link
              href={occurrenceHref(occurrence)}
              className="block rounded-[var(--radius-tile)] bg-surface px-4 py-4 transition-colors active:bg-surface-raised"
            >
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-faint">
                  {messages.progress.breakdown([
                    messages.progress.sources[occurrence.source],
                    localDateLabel(occurrence.createdAt, timeZone, now, language),
                  ])}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  className="shrink-0 text-faint"
                />
              </span>

              <span className="mt-2.5 block break-words text-[1.0625rem] leading-[1.45]">
                <span className={cn("line-through decoration-1", style.quote)}>
                  {occurrence.originalFragment}
                </span>
                <span aria-hidden className="text-faint">
                  {" → "}
                </span>
                <span className="font-bold tracking-[-0.01em] text-accent">
                  {occurrence.suggestion.trim() === ""
                    ? messages.writing.removeIt
                    : occurrence.suggestion}
                </span>
              </span>

              <span className="mt-2.5 block text-[0.9375rem] leading-[1.55] text-muted">
                {occurrence.explanation}
              </span>

              <span className="mt-2.5 block border-t border-hairline pt-2.5 text-[0.8125rem] leading-snug text-faint">
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
