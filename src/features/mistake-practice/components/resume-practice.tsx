import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Messages } from "@/lib/i18n/messages";
import type { ResumablePractice } from "../data/sessions";
import { EXERCISE_COUNT } from "../domain/exercise";
import { fromStoredTarget, practiceSessionHref } from "../domain/target";
import { targetTitle } from "./target-title";

/**
 * The set somebody walked away from.
 *
 * A Mini App gets closed mid-exercise all the time — a message arrives, the
 * phone locks — and without this the answers would be sitting in a table with
 * nothing linking to them. That is the difference between persistence and a
 * feature: the rows were always saved, and this is what makes them findable.
 *
 * Only the latest, and only one. This is a way back into something interrupted
 * ten minutes ago, not a history screen; a list of everything ever started would
 * be a different feature with a different name.
 */
export function ResumePractice({
  practice,
  messages,
}: {
  practice: ResumablePractice;
  messages: Messages;
}) {
  const target = fromStoredTarget(practice.targetType, practice.targetKey);

  return (
    <Link
      href={practiceSessionHref(practice.sessionId)}
      className="flex items-center gap-3 rounded-[var(--radius-tile)] bg-surface px-4 py-3.5 transition-colors active:bg-surface-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold leading-snug">
          {messages.mistakePractice.resume}
        </span>
        <span className="mt-1 block break-words text-[0.875rem] leading-snug text-muted">
          {targetTitle(target, null, messages)}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-faint">
          {messages.mistakePractice.resumeDetail(practice.answered, EXERCISE_COUNT)}
        </span>
      </span>

      <ChevronRight size={18} strokeWidth={2} aria-hidden className="shrink-0 text-faint" />
    </Link>
  );
}
