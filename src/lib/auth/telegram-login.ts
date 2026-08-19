import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { uiLanguageFromTelegram } from "@/lib/i18n/locale";
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
 *
 * The one exception is which language the interface is drawn in, and it is not
 * really an exception: a screen has to be readable before anybody can be asked
 * anything, so Telegram's own language tag seeds `ui_language` on the row being
 * created. Once. A returning user's preference is never overwritten from
 * Telegram, whatever their client is set to today.
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
    // Their learning language, timezone, goal, onboarding stamp and chosen
    // interface language are all left exactly as they are.
    const [updated] = await db
      .update(users)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
      .returning();

    return updated ?? existing;
  }

  /**
   * The one moment Telegram's language tag is allowed to decide anything.
   *
   * It seeds the interface language on the row being created, so a learner
   * whose Telegram is in Russian sees the first onboarding screen in Russian
   * rather than being asked to find Settings in a language they do not read.
   * It is deliberately outside `profile`: the mirrored fields above are
   * refreshed on every sign-in, and this must never be — see the branch above,
   * which leaves `ui_language` untouched for a returning account.
   */
  const [created] = await db
    .insert(users)
    .values({
      telegramUserId: telegramUser.id,
      ...profile,
      uiLanguage: uiLanguageFromTelegram(telegramUser.languageCode),
    })
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
