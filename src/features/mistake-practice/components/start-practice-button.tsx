"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import type { PracticeFailureKey } from "@/lib/i18n/messages";
import { startMistakePracticeAction } from "../actions";
import { practiceSessionHref } from "../domain/target";
import type { StoredTarget } from "../domain/target";

/**
 * The one way into a practice set, wherever it is offered.
 *
 * The target travels as the two strings a row already knows — a type and a
 * canonical key — and nothing else. There is no count, no name and no language
 * in it, because none of those are things the server would believe anyway: the
 * weak point is re-derived from the learner's own reviews before a single
 * exercise is generated.
 *
 * Building the set takes as long as one provider call, so the button says what
 * it is doing rather than going quiet. On the way out it pushes to the session's
 * own route — the exercises persist, and the URL has to be somewhere a learner
 * can come back to.
 */
export function StartPracticeButton({
  target,
  variant = "primary",
  label,
}: {
  target: StoredTarget;
  /** `primary` is the green CTA on a weak point; `quiet` sits inside a row. */
  variant?: "primary" | "quiet";
  /**
   * What the button says when it is not the first offer. The result screen asks
   * for "another five", which is a different promise from "practise this".
   */
  label?: string;
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
    <>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className={
          variant === "primary"
            ? "mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-60"
            : "mt-3 h-11 w-full rounded-[var(--radius-control)] bg-surface-raised px-4 text-[0.9375rem] font-semibold leading-tight transition-colors active:bg-hairline disabled:opacity-60"
        }
      >
        {pending
          ? messages.common.working
          : (label ?? messages.mistakePractice.practiceThis)}
      </button>

      <FieldError message={failure ? failureMessage(failure, messages) : null} />
    </>
  );
}

function failureMessage(
  key: PracticeFailureKey | AppErrorCode,
  messages: ReturnType<typeof useMessages>,
): string {
  return key in messages.mistakePractice.failures
    ? messages.mistakePractice.failures[key as PracticeFailureKey]
    : messages.errors[key as AppErrorCode];
}
