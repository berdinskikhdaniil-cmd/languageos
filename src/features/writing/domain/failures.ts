/**
 * What a learner is told when a review does not happen.
 *
 * Every branch says the same two things: their writing is safe, and what they
 * can do next. None of them mentions the provider, the model, an HTTP status, a
 * schema or a key — those belong in the server log, and the learner is not
 * debugging our integration.
 *
 * Takes a plain string because the reason may have come back out of the
 * database, where it is stored as text. Anything unrecognised gets the calm
 * default rather than leaking a code into the interface.
 */
export function reviewFailureMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "not_configured":
      return "AI review is not switched on for this installation yet. Your writing is saved.";
    case "limit_reached":
      return "You have used today's reviews. Your writing is saved, and you can review it tomorrow.";
    case "processing":
      return "This is being reviewed right now. Give it a moment and reload.";
    case "rate_limited":
      return "The reviewer is busy right now. Your writing is saved — try again in a minute.";
    case "timeout":
      return "The review took too long. Your writing is saved — try again.";
    case "credits":
    case "auth":
    case "not_configured_key":
      return "AI review is unavailable on this installation right now. Your writing is saved.";
    default:
      return "We couldn't review this yet. Your writing is saved.";
  }
}
