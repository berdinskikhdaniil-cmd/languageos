"use client";

import { useState, useTransition } from "react";
import { SUGGESTED_DAILY_GOAL_MINUTES } from "@/features/tracker/domain/goals";
import type { AppErrorCode } from "@/lib/errors";
import { completeOnboardingAction } from "../actions";
import { detectTimeZone } from "../domain/timezone";
import { GoalStep } from "./goal-step";
import { LanguageStep } from "./language-step";
import { TimezoneStep } from "./timezone-step";

/**
 * Three questions, one screen at a time, one write at the end.
 *
 * Nothing is saved as the learner moves between steps: the account becomes set
 * up in a single server call, or not at all. Going back therefore costs
 * nothing, and an abandoned flow leaves no half-configured row behind.
 *
 * The step lives in component state rather than the URL — Telegram's back
 * gesture closes the Mini App, so a history stack here would only surprise
 * people.
 *
 * Every word on these three screens is already in the account's own language.
 * `users.ui_language` is set when the row is created, from Telegram's tag, so
 * somebody whose Telegram is Russian reads the very first question in Russian —
 * there is nothing to wait for onboarding to finish before localising.
 */

const TOTAL_STEPS = 3;

export function OnboardingFlow() {
  const [step, setStep] = useState(1);
  const [languageCode, setLanguageCode] = useState<string | null>(null);
  /**
   * Detected once, in a lazy initializer rather than an effect.
   *
   * The server has no idea what zone this device is in, and its own answer
   * would be wrong — but nothing renders the zone until step two, which is
   * only ever reached by tapping. So the value never reaches the server's HTML
   * and there is nothing for hydration to disagree about.
   */
  const [detected] = useState<string | null>(detectTimeZone);
  const [timeZone, setTimeZone] = useState<string | null>(detected);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(SUGGESTED_DAILY_GOAL_MINUTES);
  const [failure, setFailure] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setFailure(null);

    startTransition(async () => {
      const result = await completeOnboardingAction({
        languageCode,
        timeZone,
        dailyGoalMinutes,
      });

      // A successful action redirects, so anything returned here is a failure.
      setFailure(result.code);
      if (result.field === "language") setStep(1);
      if (result.field === "timezone") setStep(2);
    });
  };

  if (step === 1) {
    return (
      <LanguageStep
        step={1}
        totalSteps={TOTAL_STEPS}
        selected={languageCode}
        onSelect={setLanguageCode}
        onContinue={() => setStep(2)}
      />
    );
  }

  if (step === 2) {
    return (
      <TimezoneStep
        step={2}
        totalSteps={TOTAL_STEPS}
        detected={detected}
        value={timeZone}
        onChange={setTimeZone}
        onContinue={() => setStep(3)}
        onBack={() => setStep(1)}
      />
    );
  }

  return (
    <GoalStep
      step={3}
      totalSteps={TOTAL_STEPS}
      value={dailyGoalMinutes}
      onChange={setDailyGoalMinutes}
      onSubmit={submit}
      onBack={() => setStep(2)}
      pending={pending}
      failure={failure}
    />
  );
}
