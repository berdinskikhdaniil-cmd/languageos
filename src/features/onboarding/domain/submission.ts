import { isDailyGoalMinutes } from "@/features/tracker/domain/goals";
import type { AppErrorCode } from "@/lib/errors";
import { findSupportedLanguage } from "./languages";
import { normaliseTimeZone } from "./timezone";

/**
 * What onboarding is allowed to accept.
 *
 * Pure, so every rule below is testable without a database or a request. The
 * client sends three primitives and nothing else — no user id, no language row
 * id, no display name. Ownership comes from the session; the language's name
 * comes from our own list.
 */

export type OnboardingSubmissionRaw = {
  languageCode: unknown;
  timeZone: unknown;
  dailyGoalMinutes: unknown;
};

export type OnboardingSubmission = {
  language: { code: string; name: string };
  /** A canonical IANA identifier, never an offset. */
  timeZone: string;
  dailyGoalMinutes: number;
};

export type OnboardingField = "language" | "timezone" | "goal";

export type OnboardingSubmissionResult =
  | { ok: true; value: OnboardingSubmission }
  | { ok: false; field: OnboardingField; code: AppErrorCode };

export function validateOnboardingSubmission(
  raw: OnboardingSubmissionRaw,
): OnboardingSubmissionResult {
  const language = findSupportedLanguage(raw.languageCode);
  if (!language) {
    return { ok: false, field: "language", code: "LANGUAGE_REQUIRED" };
  }

  const timeZone = normaliseTimeZone(raw.timeZone);
  if (!timeZone) {
    return { ok: false, field: "timezone", code: "TIMEZONE_REQUIRED" };
  }

  // A number, not a numeric string: this comes from our own buttons, and
  // anything else is a caller that should be told plainly rather than coerced.
  if (!isDailyGoalMinutes(raw.dailyGoalMinutes)) {
    return { ok: false, field: "goal", code: "GOAL_REQUIRED" };
  }

  return {
    ok: true,
    value: {
      language: { code: language.code, name: language.name },
      timeZone,
      dailyGoalMinutes: raw.dailyGoalMinutes,
    },
  };
}
