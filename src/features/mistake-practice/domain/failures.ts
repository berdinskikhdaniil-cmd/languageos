import type { PracticeFailureKey } from "@/lib/i18n/messages";

/**
 * What a learner is told when practice does not work.
 *
 * Two failures, and the difference between them is the whole reason this file
 * exists. If the exercises were never generated there is nothing to go back to,
 * so the answer is "try again" and a fresh generation. If the exercises exist
 * and only the check failed, every answer they typed is already saved and the
 * answer is "try the check again" — never "start over", which would throw away
 * five minutes of work over one provider timeout.
 *
 * As in Writing and Speaking, none of the wording mentions the provider, the
 * model, an HTTP status or a schema. Those belong in the server log; the learner
 * is not debugging our integration.
 */

/** Why a set of exercises was never produced. */
export function generationFailureKey(reason: string | null | undefined): PracticeFailureKey {
  switch (reason) {
    case "not_configured":
      return "notConfigured";
    case "no_examples":
      return "noExamples";
    case "processing":
      return "generating";
    case "rate_limited":
      return "busy";
    case "timeout":
      return "timeout";
    case "credits":
    case "auth":
      return "unavailable";
    default:
      return "generationFailed";
  }
}

/** Why a set of answers that exists has not been checked. */
export function gradingFailureKey(reason: string | null | undefined): PracticeFailureKey {
  switch (reason) {
    case "not_configured":
      return "notConfigured";
    case "processing":
      return "grading";
    case "incomplete":
      return "answerAll";
    case "rate_limited":
      return "busy";
    case "timeout":
      return "timeout";
    case "credits":
    case "auth":
      return "unavailable";
    default:
      return "gradingFailed";
  }
}
