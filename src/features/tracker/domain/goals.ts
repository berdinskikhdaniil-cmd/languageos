/**
 * The daily target, in minutes.
 *
 * A goal belongs to a language, not to an account: it is stored on
 * `user_languages.daily_goal_minutes` and chosen during onboarding. Nothing on
 * the dashboard invents one any more — the weekly chart draws whatever the
 * learner picked.
 */

/** What onboarding offers. Four choices, one row on a 360px phone. */
export const DAILY_GOAL_OPTIONS = [15, 30, 45, 60] as const;

export type DailyGoalOption = (typeof DAILY_GOAL_OPTIONS)[number];

/** Pre-selected on the goal step. The learner still has to confirm it. */
export const SUGGESTED_DAILY_GOAL_MINUTES = 30;

/**
 * The range the database also enforces, in
 * `user_languages_daily_goal_minutes_range`. Kept in step with it by hand;
 * a change here without a migration is a bug.
 */
export const MIN_DAILY_GOAL_MINUTES = 5;
export const MAX_DAILY_GOAL_MINUTES = 600;

export function isDailyGoalMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_DAILY_GOAL_MINUTES &&
    value <= MAX_DAILY_GOAL_MINUTES
  );
}
