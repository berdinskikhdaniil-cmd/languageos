/**
 * Stable codes for every refusal a learner can actually see.
 *
 * A server action never returns a sentence. It returns one of these, and the
 * screen looks the wording up in the current interface language. That is the
 * whole reason they exist: a message built on the server has no idea who is
 * reading it, and a Russian interface must not suddenly answer in English
 * because a validator lost a form field.
 *
 * The codes are stable identifiers, not display text: they are safe to log, and
 * renaming one is a breaking change to every dictionary at once — which is
 * exactly the kind of change a compiler should catch.
 *
 * Deliberately one flat union rather than a hierarchy per feature. There are
 * about twenty of them; a taxonomy would cost more than it explains.
 */

export const APP_ERROR_CODES = [
  /* Identity. */
  "AUTH_EXPIRED",
  "ONBOARDING_REQUIRED",

  /* Tracker rules, raised by the data layer. */
  "SESSION_ALREADY_RUNNING",
  "NO_SESSION_RUNNING",
  "SESSION_ALREADY_STOPPED",

  /* Tracker, generic failures per action. */
  "SESSION_START_FAILED",
  "SESSION_STOP_FAILED",
  "SESSION_DISCARD_FAILED",
  "SESSION_SAVE_FAILED",

  /* Manual entry validation. */
  "ACTIVITY_REQUIRED",
  "DURATION_NOT_WHOLE",
  "DURATION_REQUIRED",
  "DURATION_TOO_LONG",
  "DATE_REQUIRED",
  "DATE_IN_FUTURE",

  /* Writing. */
  "WRITING_TYPE_REQUIRED",
  "WRITING_TEXT_REQUIRED",
  "WRITING_TOO_SHORT",
  "WRITING_TOO_LONG",
  "WRITING_NOT_FOUND",
  "WRITING_SAVE_FAILED",
  "WRITING_REVIEW_FAILED",
  "REWRITE_SAVE_FAILED",

  /* Onboarding. */
  "LANGUAGE_REQUIRED",
  "TIMEZONE_REQUIRED",
  "GOAL_REQUIRED",
  "ONBOARDING_SAVE_FAILED",

  /* Settings. */
  "UI_LANGUAGE_INVALID",
  "SETTINGS_SAVE_FAILED",

  /* Speaking: the microphone, before anything is recorded. */
  "MIC_UNSUPPORTED",
  "MIC_DENIED",
  "MIC_FAILED",

  /* Speaking: the recording itself. */
  "RECORDING_EMPTY",
  "RECORDING_TOO_SHORT",
  "RECORDING_TOO_LONG",
  "RECORDING_TOO_LARGE",
  "RECORDING_FORMAT_UNSUPPORTED",

  /* Speaking: the submission. */
  "SPEAKING_LANGUAGE_UNAVAILABLE",
  "SPEAKING_NOT_CONFIGURED",
  "SPEAKING_TOPIC_REQUIRED",
  "SPEAKING_ATTEMPT_NOT_FOUND",
  "SPEAKING_UPLOAD_FAILED",
  "SPEAKING_REVIEW_FAILED",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && (APP_ERROR_CODES as readonly string[]).includes(value);
}
