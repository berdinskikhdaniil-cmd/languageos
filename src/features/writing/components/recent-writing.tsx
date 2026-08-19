import Link from "next/link";
import type { RecentWritingEntry } from "../data/entries";
import { getMessages } from "@/lib/i18n/messages";
import type { UiLanguage } from "@/lib/i18n/locale";
import { localDateLabel } from "@/lib/time";

/**
 * A way back to the last few things the learner wrote.
 *
 * Deliberately a list and not a set of cards: three rows separated by hairlines
 * read faster than three boxes, and nothing here is a distinct object that
 * earns a surface of its own. The status is a word in the same muted line as
 * the date, not a badge — it is a note about the row, not a label on it.
 *
 * The zone and the language are separate arguments because they answer separate
 * questions: the zone decides whether something counts as today, the language
 * decides whether that word is "Today" or "Сегодня".
 */
export function RecentWriting({
  entries,
  timeZone,
  language,
  now,
}: {
  entries: RecentWritingEntry[];
  /** The learner's own zone: whether something is "today" depends on it. */
  timeZone: string;
  language: UiLanguage;
  now: Date;
}) {
  if (entries.length === 0) return null;

  const messages = getMessages(language);

  return (
    <div className="mt-7">
      <h3 className="text-[0.8125rem] font-medium text-muted">{messages.practice.recentWriting}</h3>

      <ul className="mt-1 divide-y divide-hairline">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/practice/writing/${entry.id}`}
              className="block py-3.5 transition-colors active:bg-surface"
            >
              <span className="block text-[0.9375rem] font-medium">
                {messages.writing.types[entry.type]}
              </span>
              {/* Three facts on one line; it wraps rather than overflowing. */}
              <span className="mt-1 block text-[0.8125rem] leading-snug text-faint">
                {localDateLabel(entry.createdAt, timeZone, now, language)} ·{" "}
                {messages.writing.wordCount(entry.wordCount)} ·{" "}
                {messages.writing.entryStatuses[entry.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
