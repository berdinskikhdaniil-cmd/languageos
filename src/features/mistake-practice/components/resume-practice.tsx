import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Messages } from "@/lib/i18n/messages";
import type { OpenPractice } from "../data/sessions";
import { EXERCISE_COUNT } from "../domain/exercise";
import { fromStoredTarget, practiceSessionHref } from "../domain/target";
import { targetTitle } from "./target-title";

/**
 * The set the learner has open, offered as a way back into it.
 *
 * Three states reach this row and each says something different, because the
 * thing the learner needs to know is different in each. A set still being built
 * is not something to "continue" — nothing is waiting for them yet, the app is
 * working, and the honest line is that it is still going. A part-answered set is
 * a task with their own words already in it. A failed one is a button.
 *
 * Only the latest, and only one. This is a way back into something interrupted
 * ten minutes ago, not a history screen; a list of everything ever started would
 * be a different feature with a different name.
 */
export function ResumePractice({
  practice,
  messages,
}: {
  practice: OpenPractice;
  messages: Messages;
}) {
  const target = fromStoredTarget(practice.targetType, practice.targetKey);

  const heading =
    practice.status === "generating"
      ? messages.mistakePractice.preparing
      : practice.status === "failed"
        ? messages.mistakePractice.failures.generationFailed
        : messages.mistakePractice.resume;

  /**
   * The third line only appears when it says something. "0 of 5 answered" under
   * a set that is still being written would be a number about nothing.
   */
  const detail =
    practice.status === "ready"
      ? messages.mistakePractice.resumeDetail(practice.answered, EXERCISE_COUNT)
      : practice.status === "generating"
        ? messages.mistakePractice.usuallySeconds
        : null;

  return (
    <Link
      href={practiceSessionHref(practice.sessionId)}
      className="flex items-center gap-3 rounded-[var(--radius-tile)] bg-surface px-4 py-3.5 transition-colors active:bg-surface-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[0.9375rem] font-semibold leading-snug">
          {heading}
        </span>
        <span className="mt-1 block break-words text-[0.875rem] leading-snug text-muted">
          {targetTitle(target, null, messages)}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-faint">{detail}</span>
        ) : null}
      </span>

      <ChevronRight size={18} strokeWidth={2} aria-hidden className="shrink-0 text-faint" />
    </Link>
  );
}
