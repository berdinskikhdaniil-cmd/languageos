import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { defaultTimezone } from "@/db/env";
import { userLanguages, users } from "@/db/schema";

/**
 * Who the request is for.
 *
 * This is the only seam between the product and identity. Feature code calls
 * getCurrentUser() and never learns how the answer was reached, so replacing
 * the development identity with verified Telegram `initData` is a change to
 * this file alone.
 */

export type CurrentUser = {
  id: string;
  firstName: string | null;
  /** IANA zone; every day and week boundary is computed in it. */
  timeZone: string;
  primaryLanguage: {
    id: string;
    code: string;
    name: string;
  };
};

/**
 * Fixed id for the single local development identity. Deliberately confined to
 * this module — nothing else in the codebase knows a user id literal.
 */
const DEVELOPMENT_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEVELOPMENT_LANGUAGE = { code: "en", name: "English" };

/**
 * Cached per request, so several server components can ask without re-querying.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const user = await ensureDevelopmentUser();
  const language = await ensureDevelopmentLanguage(user.id);

  return {
    id: user.id,
    firstName: user.firstName,
    timeZone: user.timezone,
    primaryLanguage: { id: language.id, code: language.languageCode, name: language.languageName },
  };
});

async function ensureDevelopmentUser() {
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

  // Lost a race with a concurrent request; the row exists now.
  const [raced] = await db.select().from(users).where(eq(users.id, DEVELOPMENT_USER_ID));
  if (!raced) throw new Error("Could not create the development user.");
  return raced;
}

async function ensureDevelopmentLanguage(userId: string) {
  const existing = await db.select().from(userLanguages).where(eq(userLanguages.userId, userId));
  const primary = existing.find((row) => row.isPrimary) ?? existing[0];
  if (primary) return primary;

  const [created] = await db
    .insert(userLanguages)
    .values({
      userId,
      languageCode: DEVELOPMENT_LANGUAGE.code,
      languageName: DEVELOPMENT_LANGUAGE.name,
      isPrimary: true,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [raced] = await db.select().from(userLanguages).where(eq(userLanguages.userId, userId));
  if (!raced) throw new Error("Could not create the development language.");
  return raced;
}
