/**
 * What "set up" means, as a rule rather than a query.
 *
 * Pure and infrastructure-free on purpose: it is the distinction the whole
 * product turns on — every route gate, every tracker mutation and the shape of
 * the shell itself — so it must be testable without a database, and importable
 * from anywhere without dragging one in.
 */

export type PrimaryLanguage = {
  id: string;
  code: string;
  name: string;
  /** The learner's own daily target for this language, in minutes. */
  dailyGoalMinutes: number;
};

export type CurrentUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /**
   * IANA zone. Only meaningful once onboarding has run — before that it is the
   * column's "UTC" placeholder, which is why nothing that computes a day or a
   * week accepts a plain CurrentUser.
   */
  timeZone: string;
  /** null until onboarding creates one. */
  primaryLanguage: PrimaryLanguage | null;
  /** null while the account is authenticated but not set up. */
  onboardingCompletedAt: Date | null;
};

/**
 * A user who finished onboarding. The type is the guarantee: a function that
 * takes one of these cannot be reached with a half-configured account, so no
 * query has to defend itself against a missing language.
 */
export type OnboardedUser = CurrentUser & {
  primaryLanguage: PrimaryLanguage;
  onboardingCompletedAt: Date;
};

/**
 * Both halves are required, and the stamp is not enough on its own: the pair is
 * what the onboarding transaction writes together, so a row carrying only one
 * of them is damage, not a state to render around.
 */
export function isOnboarded(user: CurrentUser): user is OnboardedUser {
  return user.onboardingCompletedAt !== null && user.primaryLanguage !== null;
}

/** Raised when a feature is asked to act for an account that is not set up. */
export class OnboardingIncompleteError extends Error {
  constructor() {
    super("Finish setting up your language before tracking time.");
    this.name = "OnboardingIncompleteError";
  }
}

/**
 * The gate every mutation puts in front of itself. Throwing rather than
 * returning null keeps the incomplete case from being ignored by accident.
 */
export function requireOnboarded(user: CurrentUser): OnboardedUser {
  if (!isOnboarded(user)) throw new OnboardingIncompleteError();
  return user;
}
