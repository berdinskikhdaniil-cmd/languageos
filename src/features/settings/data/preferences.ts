import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { UiLanguage } from "@/lib/i18n/locale";

/**
 * Writes to a learner's own preferences, and nothing else.
 *
 * The user id is not a parameter a client can influence: every caller resolves
 * it from the session first. That is what makes the `where` clause the ownership
 * boundary — an account can only ever be the subject of its own update, and
 * there is no code path that takes an id from a form.
 */

/** True when a row was updated; false when that account no longer exists. */
export async function updateUiLanguage({
  userId,
  uiLanguage,
  now = new Date(),
}: {
  userId: string;
  uiLanguage: UiLanguage;
  now?: Date;
}): Promise<boolean> {
  const [updated] = await db
    .update(users)
    .set({ uiLanguage, updatedAt: now })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  return updated !== undefined;
}
