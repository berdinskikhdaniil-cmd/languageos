import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userLanguages, users } from "@/db/schema";

/**
 * Throwaway accounts for integration tests. Each gets a real row and its own
 * primary language, so ownership rules are exercised exactly as in production.
 */

export type TestAccount = {
  id: string;
  languageId: string;
};

export async function createTestAccount(label: string): Promise<TestAccount> {
  const [user] = await db.insert(users).values({ firstName: label }).returning();

  const [language] = await db
    .insert(userLanguages)
    .values({
      userId: user.id,
      languageCode: "en",
      languageName: "English",
      isPrimary: true,
    })
    .returning();

  return { id: user.id, languageId: language.id };
}

/** Cascades to languages, sessions and auth sessions. */
export async function deleteTestAccount(account: TestAccount): Promise<void> {
  await db.delete(users).where(eq(users.id, account.id));
}
