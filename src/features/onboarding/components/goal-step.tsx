"use client";

import { cn } from "@/lib/cn";
import { DAILY_GOAL_OPTIONS } from "@/features/tracker/domain/goals";
import { FieldError } from "@/components/ui/field-error";
import type { AppErrorCode } from "@/lib/errors";
import { useMessages } from "@/lib/i18n/locale-context";
import { OnboardingStep, PrimaryAction } from "./onboarding-step";

/**
 * Step three, and the last thing between a new account and a working tracker.
 *
 * Four choices, no custom field: the number matters far less than having one,
 * and a text input here would be a decision to agonise over on the first
 * screen. It can be changed later, once settings exist.
 */
export function GoalStep({
  step,
  totalSteps,
  value,
  onChange,
  onSubmit,
  onBack,
  pending,
  failure,
}: {
  step: number;
  totalSteps: number;
  value: number;
  onChange: (minutes: number) => void;
  onSubmit: () => void;
  onBack: () => void;
  pending: boolean;
  failure: AppErrorCode | null;
}) {
  const messages = useMessages();

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={messages.onboarding.goalTitle}
      description={messages.onboarding.goalDescription}
      onBack={onBack}
      footer={
        <div>
          <PrimaryAction onClick={onSubmit} disabled={pending}>
            {pending ? messages.onboarding.settingUp : messages.onboarding.startLearning}
          </PrimaryAction>
          <FieldError message={failure ? messages.errors[failure] : null} />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        {DAILY_GOAL_OPTIONS.map((minutes) => {
          const selected = minutes === value;
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(minutes)}
              className={cn(
                "h-20 rounded-[var(--radius-tile)] text-[1.375rem] tracking-[-0.02em] transition-colors",
                selected
                  ? "bg-accent font-bold text-accent-ink"
                  : "bg-surface font-semibold text-fg active:bg-surface-raised",
              )}
            >
              {minutes}
              <span
                className={cn(
                  "ml-1 text-[0.9375rem] font-medium",
                  selected ? "text-accent-ink/70" : "text-muted",
                )}
              >
                {messages.units.minutesShort}
              </span>
            </button>
          );
        })}
      </div>
    </OnboardingStep>
  );
}
