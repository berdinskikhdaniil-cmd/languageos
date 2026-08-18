import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userLanguages, users } from "@/db/schema";

/**
 * Throwaway accounts for integration tests. Each gets a real row and its own
 * primary language, so ownership rules are exercised exactly as in production.
 *
 * The default is a fully set-up account, because that is what almost every test
 * is about. `createIncompleteAccount` covers the other state: authenticated,
 * but no language, no timezone and no goal — a Telegram user who has just
 * arrived and not finished onboarding.
 */

export type TestAccount = {
  id: string;
  languageId: string;
};

export async function createTestAccount(
  label: string,
  options: { timeZone?: string; dailyGoalMinutes?: number } = {},
): Promise<TestAccount> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: label,
      timezone: options.timeZone ?? "UTC",
      onboardingCompletedAt: new Date(),
    })
    .returning();

  const [language] = await db
    .insert(userLanguages)
    .values({
      userId: user.id,
      languageCode: "en",
      languageName: "English",
      isPrimary: true,
      ...(options.dailyGoalMinutes === undefined
        ? {}
        : { dailyGoalMinutes: options.dailyGoalMinutes }),
    })
    .returning();

  return { id: user.id, languageId: language.id };
}

/** An authenticated account that has not been through onboarding. */
export async function createIncompleteAccount(label: string): Promise<{ id: string }> {
  const [user] = await db.insert(users).values({ firstName: label }).returning();
  return { id: user.id };
}

/** Cascades to languages, sessions and auth sessions. */
export async function deleteTestAccount(account: { id: string }): Promise<void> {
  await db.delete(users).where(eq(users.id, account.id));
}
