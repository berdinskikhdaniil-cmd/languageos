import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userLanguages, users } from "@/db/schema";
import { defaultTimezone } from "@/db/env";
import type { TelegramInitDataUser } from "@/lib/telegram/init-data";

/**
 * Turning a verified Telegram account into one of our users.
 *
 * Only ever called with a `TelegramInitDataUser` that came out of a successful
 * signature check, so the id here is trustworthy.
 */

/**
 * TEMPORARY PRODUCT DECISION, not an architectural rule.
 *
 * A brand-new user is given English as their primary language so the tracker
 * has somewhere to put time immediately. Real onboarding — pick your language,
 * set a goal, set a timezone — is its own iteration, and it should replace this.
 */
const PROVISIONAL_FIRST_LANGUAGE = { code: "en", name: "English" };

export async function findOrCreateTelegramUser(telegramUser: TelegramInitDataUser) {
  const profile = {
    firstName: telegramUser.firstName,
    lastName: telegramUser.lastName,
    username: telegramUser.username,
    photoUrl: telegramUser.photoUrl,
    telegramLanguageCode: telegramUser.languageCode,
  };

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.telegramUserId, telegramUser.id))
    .limit(1);

  if (existing) {
    // Returning user: refresh the mirrored profile, never create a second row.
    const [updated] = await db
      .update(users)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
      .returning();

    const user = updated ?? existing;
    await ensurePrimaryLanguage(user.id);
    return user;
  }

  const [created] = await db
    .insert(users)
    .values({
      telegramUserId: telegramUser.id,
      ...profile,
      timezone: defaultTimezone(),
    })
    .onConflictDoNothing({ target: users.telegramUserId })
    .returning();

  if (created) {
    await ensurePrimaryLanguage(created.id);
    return created;
  }

  // Lost a race with a concurrent first launch; the row exists now.
  const [raced] = await db
    .select()
    .from(users)
    .where(eq(users.telegramUserId, telegramUser.id))
    .limit(1);

  if (!raced) throw new Error("Could not create a user for this Telegram account.");
  await ensurePrimaryLanguage(raced.id);
  return raced;
}

export async function ensurePrimaryLanguage(userId: string) {
  const existing = await db.select().from(userLanguages).where(eq(userLanguages.userId, userId));
  const primary = existing.find((row) => row.isPrimary) ?? existing[0];
  if (primary) return primary;

  const [created] = await db
    .insert(userLanguages)
    .values({
      userId,
      languageCode: PROVISIONAL_FIRST_LANGUAGE.code,
      languageName: PROVISIONAL_FIRST_LANGUAGE.name,
      isPrimary: true,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [raced] = await db.select().from(userLanguages).where(eq(userLanguages.userId, userId));
  if (!raced) throw new Error("Could not create a language for this user.");
  return raced;
}
