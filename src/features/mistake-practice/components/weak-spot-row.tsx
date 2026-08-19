"use client";

import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import type { PracticeFailureKey } from "@/lib/i18n/messages";
import { startMistakePracticeAction } from "../actions";
import { practiceSessionHref, type StoredTarget } from "../domain/target";

/**
 * One weak point, as something that obviously starts.
 *
 * Deliberately the same surface, radius and press behaviour as the rows on
 * Progress: a tappable thing should look the same everywhere in the product,
 * and a learner who has just tapped "Grammar, 4 mistakes" there should not have
 * to work out that this one is a different kind of object.
 *
 * What it does is not the same, though, so the whole row is a button rather than
 * a link. Building a set takes as long as one provider call, and a row that went
 * quiet for fifteen seconds would read as broken — so the second line says what
 * is happening while it happens.
 */
export function WeakSpotRow({
  target,
  title,
  detail,
}: {
  target: StoredTarget;
  title: string;
  /** "4 mistakes", already worded and pluralised by the caller. */
  detail: string;
}) {
  const router = useRouter();
  const messages = useMessages();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<PracticeFailureKey | AppErrorCode | null>(null);

  const start = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await startMistakePracticeAction({
        targetType: target.type,
        targetKey: target.key,
      });

      if (result.ok) {
        router.push(practiceSessionHref(result.sessionId));
        return;
      }

      setFailure("failure" in result ? result.failure : result.code);
    });
  };

  return (
    <li>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex w-full items-center gap-3 rounded-[var(--radius-tile)] bg-surface px-4 py-3.5 text-left transition-colors active:bg-surface-raised disabled:opacity-70"
      >
        {/* min-w-0 is what lets a long Russian skill name wrap instead of
            pushing the chevron off the right edge. */}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[0.9375rem] font-semibold leading-snug">
            {title}
          </span>
          <span className="mt-1 block text-[0.875rem] leading-snug text-muted">
            {pending ? messages.mistakePractice.preparing : detail}
          </span>
        </span>

        <ChevronRight size={18} strokeWidth={2} aria-hidden className="shrink-0 text-faint" />
      </button>

      <FieldError
        message={
          failure
            ? failure in messages.mistakePractice.failures
              ? messages.mistakePractice.failures[failure as PracticeFailureKey]
              : messages.errors[failure as AppErrorCode]
            : null
        }
      />
    </li>
  );
}
