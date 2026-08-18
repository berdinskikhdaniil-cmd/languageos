import Link from "next/link";
import type { RecentWritingEntry } from "../data/entries";
import { WRITING_ENTRY_STATUS_LABELS } from "../domain/entry-status";
import { WRITING_TYPE_LABELS } from "../domain/writing-entry";
import { localDateLabel } from "@/lib/time";

/**
 * A way back to the last few things the learner wrote.
 *
 * Deliberately a list and not a set of cards: three rows separated by hairlines
 * read faster than three boxes, and nothing here is a distinct object that
 * earns a surface of its own. The status is a word in the same muted line as
 * the date, not a badge — it is a note about the row, not a label on it.
 */
export function RecentWriting({
  entries,
  timeZone,
  now,
}: {
  entries: RecentWritingEntry[];
  /** The learner's own zone: whether something is "today" depends on it. */
  timeZone: string;
  now: Date;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-7">
      <h3 className="text-[0.8125rem] font-medium text-muted">Recent writing</h3>

      <ul className="mt-1 divide-y divide-hairline">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/practice/writing/${entry.id}`}
              className="block py-3.5 transition-colors active:bg-surface"
            >
              <span className="block text-[0.9375rem] font-medium">
                {WRITING_TYPE_LABELS[entry.type]}
              </span>
              <span className="mt-1 block text-[0.8125rem] text-faint">
                {localDateLabel(entry.createdAt, timeZone, now)} · {entry.wordCount} words ·{" "}
                {WRITING_ENTRY_STATUS_LABELS[entry.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
