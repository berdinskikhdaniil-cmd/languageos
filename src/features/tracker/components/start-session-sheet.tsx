"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FieldError } from "@/components/ui/field-error";
import { startSessionAction } from "../actions";
import { ACTIVITY_LABELS, TIMEABLE_ACTIVITY_TYPES, type ActivityType } from "../domain/activity";

type StartSessionSheetProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * One tap to pick an activity, one server round trip, then the timer appears
 * because the server says a session exists — not because the client assumed it.
 */
export function StartSessionSheet({ open, onClose }: StartSessionSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<ActivityType | null>(null);
  const [pending, startTransition] = useTransition();

  const start = (activityType: ActivityType) => {
    setError(null);
    setStarting(activityType);

    startTransition(async () => {
      const result = await startSessionAction(activityType);
      setStarting(null);

      if (result.ok) {
        onClose();
        return;
      }
      setError(result.error);
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="What are you doing?">
      <div className="grid grid-cols-2 gap-2">
        {TIMEABLE_ACTIVITY_TYPES.map((activityType) => (
          <button
            key={activityType}
            type="button"
            onClick={() => start(activityType)}
            disabled={pending}
            className="h-[3.75rem] rounded-[var(--radius-tile)] bg-surface-raised text-[0.9375rem] font-semibold transition-colors active:bg-hairline disabled:opacity-50"
          >
            {starting === activityType ? "Starting…" : ACTIVITY_LABELS[activityType]}
          </button>
        ))}
      </div>

      <FieldError message={error} />

      <p className="mt-4 text-[0.8125rem] leading-snug text-faint">
        Speaking practice gets its own guided flow later, so it is not a stopwatch here.
      </p>
    </BottomSheet>
  );
}
