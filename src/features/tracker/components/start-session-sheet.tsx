"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import { startSessionAction } from "../actions";
import { TIMEABLE_ACTIVITY_TYPES, type ActivityType } from "../domain/activity";

type StartSessionSheetProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * One tap to pick an activity, one server round trip, then the timer appears
 * because the server says a session exists — not because the client assumed it.
 */
export function StartSessionSheet({ open, onClose }: StartSessionSheetProps) {
  const messages = useMessages();
  const [failure, setFailure] = useState<AppErrorCode | null>(null);
  const [starting, setStarting] = useState<ActivityType | null>(null);
  const [pending, startTransition] = useTransition();

  const start = (activityType: ActivityType) => {
    setFailure(null);
    setStarting(activityType);

    startTransition(async () => {
      const result = await startSessionAction(activityType);
      setStarting(null);

      if (result.ok) {
        onClose();
        return;
      }
      setFailure(result.code);
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={messages.tracker.startSheetTitle}>
      <div className="grid grid-cols-2 gap-2">
        {TIMEABLE_ACTIVITY_TYPES.map((activityType) => (
          <button
            key={activityType}
            type="button"
            onClick={() => start(activityType)}
            disabled={pending}
            className="h-[3.75rem] rounded-[var(--radius-tile)] px-2 text-[0.9375rem] font-semibold leading-tight transition-colors active:bg-hairline disabled:opacity-50 bg-surface-raised"
          >
            {starting === activityType
              ? messages.tracker.starting
              : messages.tracker.activityTypes[activityType]}
          </button>
        ))}
      </div>

      <FieldError message={failure ? messages.errors[failure] : null} />

      <p className="mt-4 text-[0.8125rem] leading-snug text-faint">
        {messages.tracker.startSheetNote}
      </p>
    </BottomSheet>
  );
}
