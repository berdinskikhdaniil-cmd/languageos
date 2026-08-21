"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import type { PracticeFailureKey } from "@/lib/i18n/messages";
import { retryPracticeGenerationAction } from "../actions";

/**
 * A set of exercises that never arrived.
 *
 * One calm sentence and the button again. Nothing here names the provider, the
 * model or an HTTP status: those are in the server log, and the learner is not
 * debugging our integration.
 *
 * The retry reuses this session rather than starting another, so the URL keeps
 * working and nobody is left with a trail of empty sets behind them.
 */
export function PracticeFailed({
  sessionId,
  failure,
}: {
  sessionId: string;
  failure: PracticeFailureKey;
}) {
  const router = useRouter();
  const messages = useMessages();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<PracticeFailureKey | AppErrorCode | null>(null);

  const retry = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await retryPracticeGenerationAction(sessionId);
      if (result.ok) {
        router.refresh();
        return;
      }
      setProblem("failure" in result ? result.failure : result.code);
    });
  };

  return (
    <div className="mt-7 flex flex-col">
      <p className="text-[1.0625rem] font-semibold leading-snug">
        {messages.mistakePractice.failures[failure]}
      </p>
      {/*
        Whatever went wrong, nothing of the learner's was spent on it. Saying so
        is the difference between a setback and a loss.
      */}
      <p className="mt-2 max-w-[22rem] text-[0.9375rem] leading-[1.5] text-muted">
        {messages.mistakePractice.nothingLost}
      </p>

      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="mt-6 h-14 w-full rounded-[var(--radius-control)] bg-accent px-4 text-[0.9375rem] font-bold leading-tight text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-60"
      >
        {pending ? messages.common.working : messages.common.tryAgain}
      </button>

      <Link
        href="/practice"
        className="mt-3 flex h-11 items-center justify-center px-4 text-center text-[0.875rem] font-medium text-muted transition-colors active:text-fg"
      >
        {messages.mistakePractice.backToPractice}
      </Link>

      <FieldError
        message={
          problem
            ? problem in messages.mistakePractice.failures
              ? messages.mistakePractice.failures[problem as PracticeFailureKey]
              : messages.errors[problem as AppErrorCode]
            : null
        }
      />
    </div>
  );
}
