import Link from "next/link";
import type { UiLanguage } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import { localDateLabel } from "@/lib/time";
import { normalizeLabel, skillDisplayName } from "../domain/label";
import { occurrenceHref, type MistakeOccurrence } from "../domain/occurrence";

/**
 * The last few mistakes, whichever skill they came from.
 *
 * A plain list, deliberately, where the two blocks above are rows you open.
 * This one is read rather than navigated — it is the last ten things that
 * happened — so it stays quieter: hairlines instead of surfaces, and no
 * chevron on ten consecutive lines. What a learner recognises is the correction
 * itself, so that leads — their own words, then the right ones — and the
 * classification follows in faint type underneath.
 *
 * Tapping a row opens the review it came from, with the whole text or
 * transcript around it. That is the point of the block: a mistake out of
 * context is trivia, and the context already has a screen.
 */
export function RecentMistakes({
  occurrences,
  timeZone,
  language,
  now,
  messages,
}: {
  occurrences: MistakeOccurrence[];
  /** The learner's own zone: whether something is "today" depends on it. */
  timeZone: string;
  language: UiLanguage;
  now: Date;
  messages: Messages;
}) {
  if (occurrences.length === 0) return null;

  return (
    <section>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">
        {messages.progress.recent}
      </h2>

      <ul className="mt-2 divide-y divide-hairline">
        {occurrences.map((occurrence) => {
          const key = normalizeLabel(occurrence.label);

          return (
            <li key={`${occurrence.source}-${occurrence.issueId}`}>
              <Link
                href={occurrenceHref(occurrence)}
                className="-mx-2 block rounded-[var(--radius-control)] px-2 py-4 transition-colors active:bg-surface"
              >
                <span className="block break-words text-[0.9375rem] leading-snug">
                  <span className="text-muted">{occurrence.originalFragment}</span>
                  <span aria-hidden className="text-faint">
                    {" → "}
                  </span>
                  <span className="font-semibold text-accent">
                    {occurrence.suggestion.trim() === ""
                      ? messages.writing.removeIt
                      : occurrence.suggestion}
                  </span>
                </span>

                <span className="mt-1.5 block text-[0.8125rem] leading-snug text-faint">
                  {messages.progress.breakdown(
                    [
                      messages.writing.categories[occurrence.category],
                      key !== null && occurrence.label !== null
                        ? skillDisplayName(key, occurrence.label, messages.progress.skills)
                        : null,
                    ].filter((part): part is string => part !== null),
                  )}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-faint">
                  {messages.progress.breakdown([
                    messages.progress.sources[occurrence.source],
                    localDateLabel(occurrence.createdAt, timeZone, now, language),
                  ])}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
