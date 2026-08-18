import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { TelegramInitDataUser } from "@/lib/telegram/init-data";

/**
 * Turning a verified Telegram account into one of our users.
 *
 * Only ever called with a `TelegramInitDataUser` that came out of a successful
 * signature check, so the id here is trustworthy.
 *
 * Authentication stops at the user row. It does not choose a language, a
 * timezone or a goal — those are product decisions the learner makes in
 * onboarding, and a new account deliberately leaves this function with none of
 * them. `users.timezone` keeps its "UTC" column default until then; nothing
 * that counts days is reachable before onboarding writes the real zone.
 */

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
    // Their language, timezone, goal and onboarding stamp are left alone.
    const [updated] = await db
      .update(users)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
      .returning();

    return updated ?? existing;
  }

  const [created] = await db
    .insert(users)
    .values({ telegramUserId: telegramUser.id, ...profile })
    .onConflictDoNothing({ target: users.telegramUserId })
    .returning();

  if (created) return created;

  // Lost a race with a concurrent first launch; the row exists now.
  const [raced] = await db
    .select()
    .from(users)
    .where(eq(users.telegramUserId, telegramUser.id))
    .limit(1);

  if (!raced) throw new Error("Could not create a user for this Telegram account.");
  return raced;
}
