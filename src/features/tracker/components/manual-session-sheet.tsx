"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FieldError } from "@/components/ui/field-error";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/locale-context";
import { addManualSessionAction, type ActionResult } from "../actions";
import { ACTIVITY_TYPES, type ActivityType } from "../domain/activity";

type ManualSessionSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Local "YYYY-MM-DD" for the user's timezone, computed on the server. */
  todayDayKey: string;
};

// Four fit one row at 360px; anything else goes in the hours/minutes fields.
const DURATION_PRESETS = [15, 20, 30, 45];

const FIELD_CLASS =
  "h-12 w-full rounded-[var(--radius-control)] bg-surface-raised px-3.5 text-[0.9375rem] text-fg placeholder:text-faint";

const DEFAULTS = { activityType: "video" as ActivityType, hours: "0", minutes: "20" };

export function ManualSessionSheet({ open, onClose, todayDayKey }: ManualSessionSheetProps) {
  const messages = useMessages();
  const [failure, setFailure] = useState<Extract<ActionResult, { ok: false }> | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>(DEFAULTS.activityType);
  const [hours, setHours] = useState(DEFAULTS.hours);
  const [minutes, setMinutes] = useState(DEFAULTS.minutes);
  const [pending, startTransition] = useTransition();

  /**
   * The sheet closes only after the server confirms the insert, so it never
   * looks saved when it was not.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFailure(null);

    startTransition(async () => {
      const result = await addManualSessionAction(formData);

      if (!result.ok) {
        setFailure(result);
        return;
      }

      form.reset();
      setActivityType(DEFAULTS.activityType);
      setHours(DEFAULTS.hours);
      setMinutes(DEFAULTS.minutes);
      onClose();
    });
  };

  const errorFor = (field: string) =>
    failure?.field === field ? messages.errors[failure.code] : null;
  const generalError = failure && !failure.field ? messages.errors[failure.code] : null;

  const applyPreset = (preset: number) => {
    setHours(String(Math.floor(preset / 60)));
    setMinutes(String(preset % 60));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={messages.tracker.manualSheetTitle}>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <input type="hidden" name="activityType" value={activityType} />

        <div>
          <p className="text-[0.8125rem] font-medium text-muted">{messages.tracker.activity}</p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {ACTIVITY_TYPES.map((type) => {
              const selected = type === activityType;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActivityType(type)}
                  className={cn(
                    // Three to a row at 360px, so a long Russian word wraps
                    // inside its own button instead of widening the grid.
                    "flex h-11 items-center justify-center rounded-[var(--radius-control)] px-1.5 text-center text-[0.8125rem] font-semibold leading-tight transition-colors",
                    selected
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-raised text-muted active:bg-hairline",
                  )}
                >
                  {messages.tracker.activityTypes[type]}
                </button>
              );
            })}
          </div>
          <FieldError message={errorFor("activityType")} />
        </div>

        <div>
          <p className="text-[0.8125rem] font-medium text-muted">{messages.tracker.howLong}</p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="h-9 rounded-full bg-surface-raised px-3.5 text-[0.8125rem] font-medium text-muted transition-colors active:bg-hairline"
              >
                {messages.tracker.durationPreset(preset)}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              <input
                name="hours"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={messages.tracker.hoursField}
                className={FIELD_CLASS}
              />
              <span className="text-[0.875rem] text-muted">{messages.units.hourSuffix}</span>
            </label>
            <label className="flex flex-1 items-center gap-2">
              <input
                name="minutes"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={messages.tracker.minutesField}
                className={FIELD_CLASS}
              />
              <span className="text-[0.875rem] text-muted">{messages.units.minuteSuffix}</span>
            </label>
          </div>
          <FieldError message={errorFor("duration")} />
        </div>

        <div>
          <label htmlFor="manual-date" className="text-[0.8125rem] font-medium text-muted">
            {messages.tracker.day}
          </label>
          <input
            id="manual-date"
            name="date"
            type="date"
            defaultValue={todayDayKey}
            max={todayDayKey}
            className={cn(FIELD_CLASS, "mt-2.5")}
          />
          <FieldError message={errorFor("date")} />
        </div>

        <div className="flex flex-col gap-3">
          <label htmlFor="manual-source" className="text-[0.8125rem] font-medium text-muted">
            {messages.tracker.whatWasIt} <span className="text-faint">{messages.common.optional}</span>
          </label>
          <input
            id="manual-source"
            name="sourceTitle"
            maxLength={200}
            placeholder={messages.tracker.sourcePlaceholder}
            className={FIELD_CLASS}
          />
          <input
            name="note"
            maxLength={500}
            placeholder={messages.tracker.notePlaceholder}
            aria-label={messages.tracker.noteField}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="h-14 w-full rounded-[var(--radius-control)] bg-accent text-[0.9375rem] font-bold text-accent-ink transition-colors active:bg-accent-pressed disabled:opacity-60"
          >
            {pending ? messages.common.saving : messages.tracker.saveSession}
          </button>
          <FieldError message={generalError} />
        </div>
      </form>
    </BottomSheet>
  );
}
