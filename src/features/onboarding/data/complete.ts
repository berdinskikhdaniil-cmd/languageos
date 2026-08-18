import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { userLanguages, users } from "@/db/schema";
import type { OnboardingSubmission } from "../domain/submission";

/**
 * The one place an account becomes set up.
 *
 * Everything happens in a single transaction, so the state this product must
 * never be in — marked onboarded with no language to log time against — cannot
 * be reached, whether the request fails halfway or two submissions arrive at
 * once.
 */

export type CompleteOnboardingResult = {
  /**
   * True when the account was already set up and this call changed nothing.
   * A double tap, a retried request or a second tab lands here.
   */
  alreadyComplete: boolean;
};

export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingError";
  }
}

export async function completeOnboarding({
  userId,
  submission,
  now = new Date(),
}: {
  userId: string;
  submission: OnboardingSubmission;
  now?: Date;
}): Promise<CompleteOnboardingResult> {
  const { language, timeZone, dailyGoalMinutes } = submission;

  return db.transaction(async (tx) => {
    /**
     * The row lock is what makes a second submission safe. Two concurrent
     * requests both read `onboarding_completed_at`; without `for update` both
     * could read NULL and both insert. With it, the second waits, sees the
     * stamp the first wrote, and returns without touching anything.
     */
    const [account] = await tx
      .select({ id: users.id, onboardingCompletedAt: users.onboardingCompletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");

    if (!account) throw new OnboardingError("That account no longer exists.");
    if (account.onboardingCompletedAt) return { alreadyComplete: true };

    /**
     * `on conflict` rather than a plain insert: an account can already carry a
     * language row without being onboarded — one created by the previous
     * deployment in the minutes between this migration and this code going
     * live. Reusing it keeps every session already filed against it intact.
     */
    const [primary] = await tx
      .insert(userLanguages)
      .values({
        userId,
        languageCode: language.code,
        languageName: language.name,
        isPrimary: true,
        dailyGoalMinutes,
      })
      .onConflictDoUpdate({
        target: [userLanguages.userId, userLanguages.languageCode],
        set: { languageName: language.name, isPrimary: true, dailyGoalMinutes },
      })
      .returning();

    if (!primary) throw new OnboardingError("Could not save your language.");

    // Exactly one primary language, enforced here as well as by the single
    // language this iteration lets anyone choose.
    await tx
      .update(userLanguages)
      .set({ isPrimary: false })
      .where(and(eq(userLanguages.userId, userId), ne(userLanguages.id, primary.id)));

    await tx
      .update(users)
      .set({ timezone: timeZone, onboardingCompletedAt: now, updatedAt: now })
      .where(eq(users.id, userId));

    return { alreadyComplete: false };
  });
}
