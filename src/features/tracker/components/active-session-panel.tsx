"use client";

import { useState, useTransition } from "react";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import { cancelSessionAction, stopSessionAction, type ActionResult } from "../actions";
import type { ActiveSessionView } from "../data/overview";
import { ElapsedTime } from "./elapsed-time";

/**
 * The running timer. Stopping and discarding both go through the server, and a
 * failure is reported in place rather than silently leaving the panel behind.
 */
export function ActiveSessionPanel({ session }: { session: ActiveSessionView }) {
  const messages = useMessages();
  const [failure, setFailure] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>) => {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setFailure(result.code);
    });
  };

  return (
    <section
      aria-label={messages.tracker.runningSession}
      className="rounded-[var(--radius-card)] bg-surface p-5"
    >
      <p className="text-[0.8125rem] font-medium text-muted">
        {messages.tracker.activityTypes[session.activityType]}
      </p>

      <p className="mt-1.5 text-[3rem] font-bold leading-none tracking-[-0.04em] text-accent">
        <ElapsedTime key={session.elapsedSeconds} baselineSeconds={session.elapsedSeconds} />
      </p>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => run(stopSessionAction)}
          disabled={pending}
          className="h-12 flex-1 rounded-[var(--radius-control)] bg-surface-raised text-[0.9375rem] font-semibold transition-colors active:bg-hairline disabled:opacity-60"
        >
          {pending ? messages.common.working : messages.tracker.stopSession}
        </button>
        <button
          type="button"
          onClick={() => run(cancelSessionAction)}
          disabled={pending}
          className="h-12 rounded-[var(--radius-control)] px-4 text-[0.875rem] font-medium text-muted transition-colors active:text-fg disabled:opacity-60"
        >
          {messages.tracker.discard}
        </button>
      </div>

      <FieldError message={failure ? messages.errors[failure] : null} />
    </section>
  );
}
