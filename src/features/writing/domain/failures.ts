import type { ReviewFailureKey } from "@/lib/i18n/messages";

/**
 * What a learner is told when a review does not happen.
 *
 * This file decides *which* explanation applies; the wording lives in the
 * dictionary, in both languages. Every branch says the same two things: their
 * writing is safe, and what they can do next. None of them mentions the
 * provider, the model, an HTTP status, a schema or a key — those belong in the
 * server log, and the learner is not debugging our integration.
 *
 * Takes a plain string because the reason may have come back out of the
 * database, where it is stored as text. Anything unrecognised gets the calm
 * default rather than leaking a code into the interface.
 */
export function reviewFailureKey(reason: string | null | undefined): ReviewFailureKey {
  switch (reason) {
    case "not_configured":
      return "notConfigured";
    case "limit_reached":
      return "limitReached";
    case "processing":
      return "processing";
    case "rate_limited":
      return "rateLimited";
    case "timeout":
      return "timeout";
    case "credits":
    case "auth":
    case "not_configured_key":
      return "unavailable";
    default:
      return "unknown";
  }
}
