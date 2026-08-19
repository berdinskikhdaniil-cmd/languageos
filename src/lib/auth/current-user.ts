import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userLanguages, users } from "@/db/schema";
import type { UserRow } from "@/db/schema";
import { SESSION_COOKIE_NAME, isDevAuthAllowed } from "./config";
import { findUserBySessionToken } from "./session";
import type { CurrentUser, PrimaryLanguage } from "./onboarding-state";

/**
 * Who the request is for.
 *
 * This is the only seam between the product and identity. Features call
 * getCurrentUser() and learn nothing about how the answer was reached — no
 * Telegram ids, no cookies, no session tokens leave this module. Everything
 * downstream works from our own `users.id`.
 *
 * Authenticated and set-up are two different states and this module keeps them
 * apart. A brand-new Telegram account is a real, authenticated user with no
 * language, no timezone of its own and no goal; only onboarding turns it into
 * an `OnboardedUser`, and only an `OnboardedUser` can be handed to the tracker.
 */

export type {
  CurrentUser,
  OnboardedUser,
  PrimaryLanguage,
} from "./onboarding-state";
export { OnboardingIncompleteError, isOnboarded, requireOnboarded } from "./onboarding-state";

/**
 * Fixed id for the single local development identity. Confined to this module —
 * nothing else in the codebase knows a user id literal.
 */
const DEVELOPMENT_USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Resolves the caller, or null when nobody is signed in.
 *
 * Order matters and there is no fallback between the two paths: a real session
 * wins, and the development identity is only consulted when the operator has
 * explicitly enabled it outside production. A *failed* Telegram sign-in never
 * reaches this function — it fails at the endpoint and no session is created.
 *
 * Throws only on infrastructure failure, which callers distinguish from an
 * absent user.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const user = await findUserBySessionToken(token);
    // An expired or unknown token authenticates nobody. It is not a reason to
    // fall back to a development user.
    if (user) return toCurrentUser(user, await loadPrimaryLanguage(user.id));
  }

  if (isDevAuthAllowed()) {
    const user = await ensureDevelopmentUser();
    return toCurrentUser(user, await loadPrimaryLanguage(user.id));
  }

  return null;
});

function toCurrentUser(user: UserRow, language: PrimaryLanguage | null): CurrentUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    timeZone: user.timezone,
    uiLanguage: user.uiLanguage,
    primaryLanguage: language,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

/**
 * The language the learner is studying, or null when onboarding has not run.
 *
 * Read-only: nothing here creates a row. The one place a language comes into
 * existence is the onboarding transaction.
 */
export async function loadPrimaryLanguage(userId: string): Promise<PrimaryLanguage | null> {
  const [primary] = await db
    .select()
    .from(userLanguages)
    .where(and(eq(userLanguages.userId, userId), eq(userLanguages.isPrimary, true)))
    .limit(1);

  if (!primary) return null;

  return {
    id: primary.id,
    code: primary.languageCode,
    name: primary.languageName,
    dailyGoalMinutes: primary.dailyGoalMinutes,
  };
}

/**
 * The local development identity. Also used by the seed script, which runs
 * outside any request and so cannot read cookies.
 *
 * Created bare, exactly like a new Telegram account: a fresh local database
 * therefore shows the real onboarding flow rather than a shortcut nobody in
 * production ever takes.
 */
export async function ensureDevelopmentUser(): Promise<UserRow> {
  const [existing] = await db.select().from(users).where(eq(users.id, DEVELOPMENT_USER_ID));
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ id: DEVELOPMENT_USER_ID, firstName: "Dev" })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [raced] = await db.select().from(users).where(eq(users.id, DEVELOPMENT_USER_ID));
  if (!raced) throw new Error("Could not create the development user.");
  return raced;
}
