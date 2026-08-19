import type { SpeakingFailureKey } from "@/lib/i18n/messages";

/**
 * What a learner is told when a spoken answer does not get through.
 *
 * Two different failures live here and the difference matters to the person
 * reading. If the recording never became text there is nothing to go back to —
 * the audio was not kept — so the answer is "record it again". If the
 * transcript exists and only the review failed, their words are safe and the
 * answer is "try the review again". Telling those apart is the whole reason
 * this file exists.
 *
 * As in Writing, none of the wording mentions the provider, the model, an HTTP
 * status or a schema. Those belong in the server log.
 */

/** Why a recording never became a transcript. */
export function transcriptionFailureKey(reason: string | null | undefined): SpeakingFailureKey {
  switch (reason) {
    case "not_configured":
      return "notConfigured";
    case "empty_transcript":
      return "emptyTranscript";
    case "rate_limited":
      return "busy";
    case "timeout":
      return "timeout";
    case "credits":
    case "auth":
      return "unavailable";
    default:
      return "transcriptionFailed";
  }
}

/** Why a transcript that exists has not been reviewed. */
export function speakingReviewFailureKey(reason: string | null | undefined): SpeakingFailureKey {
  switch (reason) {
    case "not_configured":
      return "notConfigured";
    case "processing":
      return "processing";
    case "rate_limited":
      return "busy";
    case "timeout":
      return "timeout";
    case "credits":
    case "auth":
      return "unavailable";
    default:
      return "reviewFailed";
  }
}
