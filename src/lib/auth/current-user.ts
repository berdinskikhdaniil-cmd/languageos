import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { defaultTimezone } from "@/db/env";
import { users } from "@/db/schema";
import type { UserRow } from "@/db/schema";
import { SESSION_COOKIE_NAME, isDevAuthAllowed } from "./config";
import { findUserBySessionToken } from "./session";
import { ensurePrimaryLanguage } from "./telegram-login";

/**
 * Who the request is for.
 *
 * This is the only seam between the product and identity. Features call
 * getCurrentUser() and learn nothing about how the answer was reached — no
 * Telegram ids, no cookies, no session tokens leave this module. Everything
 * downstream works from our own `users.id`.
 */

export type CurrentUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** IANA zone; every day and week boundary is computed in it. */
  timeZone: string;
  primaryLanguage: {
    id: string;
    code: string;
    name: string;
  };
};

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
    if (user) return toCurrentUser(user, await ensurePrimaryLanguage(user.id));
  }

  if (isDevAuthAllowed()) {
    const user = await ensureDevelopmentUser();
    return toCurrentUser(user, await ensurePrimaryLanguage(user.id));
  }

  return null;
});

function toCurrentUser(
  user: UserRow,
  language: { id: string; languageCode: string; languageName: string },
): CurrentUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    timeZone: user.timezone,
    primaryLanguage: {
      id: language.id,
      code: language.languageCode,
      name: language.languageName,
    },
  };
}

/**
 * The local development identity. Also used by the seed script, which runs
 * outside any request and so cannot read cookies.
 */
export async function ensureDevelopmentUser(): Promise<UserRow> {
  const [existing] = await db.select().from(users).where(eq(users.id, DEVELOPMENT_USER_ID));
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      id: DEVELOPMENT_USER_ID,
      firstName: "Dev",
      timezone: defaultTimezone(),
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [raced] = await db.select().from(users).where(eq(users.id, DEVELOPMENT_USER_ID));
  if (!raced) throw new Error("Could not create the development user.");
  return raced;
}
