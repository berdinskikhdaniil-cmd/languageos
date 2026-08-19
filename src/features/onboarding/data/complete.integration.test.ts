import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions, userLanguages, users } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth/onboarding-state";
import { loadPrimaryLanguage } from "@/lib/auth/current-user";
import { findOrCreateTelegramUser } from "@/lib/auth/telegram-login";
import { getTrackerOverview } from "@/features/tracker/data/overview";
import { startSession } from "@/features/tracker/data/sessions";
import { createTestAccount, deleteTestAccount } from "@/test/db-fixtures";
import { validateOnboardingSubmission } from "../domain/submission";
import { completeOnboarding, OnboardingError } from "./complete";

/**
 * First-run setup against the real database.
 *
 * The rules that matter here are ones only SQL can prove: that authentication
 * writes no language, that completion is one transaction, and that a second
 * submission cannot produce a second language row.
 */

const created: { id: string }[] = [];

/** Telegram ids are 64-bit; these are far above any real account. */
let nextTelegramId = 9_000_000_000_001;

async function newTelegramUser() {
  const user = await findOrCreateTelegramUser({
    id: nextTelegramId++,
    firstName: "Newcomer",
    lastName: null,
    username: null,
    languageCode: "ru",
    photoUrl: null,
  });
  created.push({ id: user.id });
  return user;
}

function submission(overrides: Record<string, unknown> = {}) {
  const result = validateOnboardingSubmission({
    languageCode: "nl",
    timeZone: "Europe/Amsterdam",
    dailyGoalMinutes: 30,
    ...overrides,
  });
  if (!result.ok) throw new Error(`Fixture is not a valid submission: ${result.code}`);
  return result.value;
}

afterEach(async () => {
  while (created.length > 0) {
    const account = created.pop();
    if (account) await deleteTestAccount(account);
  }
});

describe("signing in for the first time", () => {
  it("creates the account and nothing else — no language is invented", async () => {
    const user = await newTelegramUser();

    const languages = await db
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, user.id));

    expect(languages).toEqual([]);
    expect(user.onboardingCompletedAt).toBeNull();
    expect(await loadPrimaryLanguage(user.id)).toBeNull();
  });

  it("does not borrow a timezone from Telegram or from DEFAULT_TIMEZONE", async () => {
    const user = await newTelegramUser();

    // "UTC" is the column placeholder. Telegram sent language_code "ru", and it
    // is neither a timezone nor a hint at one.
    expect(user.timezone).toBe("UTC");
    expect(user.telegramLanguageCode).toBe("ru");
  });

  it("leaves a returning account's setup exactly as it was", async () => {
    const first = await newTelegramUser();
    await completeOnboarding({ userId: first.id, submission: submission() });

    const again = await findOrCreateTelegramUser({
      id: first.telegramUserId as number,
      firstName: "Newcomer",
      lastName: "Renamed",
      username: null,
      languageCode: "ru",
      photoUrl: null,
    });

    expect(again.id).toBe(first.id);
    expect(again.lastName).toBe("Renamed");
    expect(again.onboardingCompletedAt).not.toBeNull();
    expect(again.timezone).toBe("Europe/Amsterdam");
    expect((await loadPrimaryLanguage(first.id))?.code).toBe("nl");
  });
});

describe("completing onboarding", () => {
  it("writes the language, the timezone, the goal and the stamp together", async () => {
    const user = await newTelegramUser();

    const result = await completeOnboarding({
      userId: user.id,
      submission: submission({ languageCode: "de", dailyGoalMinutes: 60 }),
      now: new Date("2026-08-18T10:00:00Z"),
    });

    expect(result.alreadyComplete).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.timezone).toBe("Europe/Amsterdam");
    expect(row.onboardingCompletedAt).toEqual(new Date("2026-08-18T10:00:00Z"));

    const language = await loadPrimaryLanguage(user.id);
    expect(language).toMatchObject({ code: "de", name: "German", dailyGoalMinutes: 60 });
  });

  it("creates exactly one language row, and marks it primary", async () => {
    const user = await newTelegramUser();
    await completeOnboarding({ userId: user.id, submission: submission() });

    const languages = await db
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, user.id));

    expect(languages).toHaveLength(1);
    expect(languages[0].isPrimary).toBe(true);
  });

  it("refuses an account that no longer exists", async () => {
    await expect(
      completeOnboarding({
        userId: "00000000-0000-4000-8000-0000000000ff",
        submission: submission(),
      }),
    ).rejects.toThrow(OnboardingError);
  });
});

describe("submitting twice", () => {
  it("is a no-op the second time, not a second language", async () => {
    const user = await newTelegramUser();

    const first = await completeOnboarding({
      userId: user.id,
      submission: submission({ languageCode: "nl", dailyGoalMinutes: 15 }),
      now: new Date("2026-08-18T10:00:00Z"),
    });
    const second = await completeOnboarding({
      userId: user.id,
      submission: submission({ languageCode: "ja", dailyGoalMinutes: 60 }),
      now: new Date("2026-08-18T11:00:00Z"),
    });

    expect(first.alreadyComplete).toBe(false);
    expect(second.alreadyComplete).toBe(true);

    const languages = await db
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, user.id));

    // The first answer stands. A retry cannot quietly re-language an account
    // that already has sessions filed against it.
    expect(languages).toHaveLength(1);
    expect(languages[0].languageCode).toBe("nl");
    expect(languages[0].dailyGoalMinutes).toBe(15);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.onboardingCompletedAt).toEqual(new Date("2026-08-18T10:00:00Z"));
  });

  it("survives two submissions racing each other", async () => {
    const user = await newTelegramUser();

    const [a, b] = await Promise.all([
      completeOnboarding({ userId: user.id, submission: submission({ languageCode: "nl" }) }),
      completeOnboarding({ userId: user.id, submission: submission({ languageCode: "ja" }) }),
    ]);

    // Whichever got there first, exactly one of them did the writing.
    expect([a.alreadyComplete, b.alreadyComplete].sort()).toEqual([false, true]);

    const languages = await db
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, user.id));
    expect(languages).toHaveLength(1);
  });
});

describe("an account carrying a language from the previous deployment", () => {
  it("keeps that row and its sessions rather than adding a second one", async () => {
    // The window between this migration running and this code going live: the
    // old bootstrap could still have created an English row with no stamp.
    const user = await newTelegramUser();
    const [legacy] = await db
      .insert(userLanguages)
      .values({ userId: user.id, languageCode: "en", languageName: "English", isPrimary: true })
      .returning();

    await startSession({
      userId: user.id,
      userLanguageId: legacy.id,
      activityType: "reading",
      startedAt: new Date("2026-08-18T09:00:00Z"),
    });

    await completeOnboarding({
      userId: user.id,
      submission: submission({ languageCode: "en", dailyGoalMinutes: 60 }),
    });

    const languages = await db
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, user.id));

    expect(languages).toHaveLength(1);
    expect(languages[0].id).toBe(legacy.id);
    expect(languages[0].dailyGoalMinutes).toBe(60);

    const kept = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(kept).toHaveLength(1);
  });
});

describe("the tracker's view of an account that is not set up", () => {
  it("refuses it, rather than filing time against no language", async () => {
    const user = await newTelegramUser();

    expect(() =>
      requireOnboarded({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        uiLanguage: user.uiLanguage,
        timeZone: user.timezone,
        primaryLanguage: null,
        onboardingCompletedAt: user.onboardingCompletedAt,
      }),
    ).toThrow();

    // And there is nothing in the database it could have used anyway.
    expect(await loadPrimaryLanguage(user.id)).toBeNull();
  });

  it("works the moment onboarding finishes", async () => {
    const user = await newTelegramUser();
    await completeOnboarding({
      userId: user.id,
      submission: submission({ languageCode: "nl", dailyGoalMinutes: 15 }),
    });

    const language = await loadPrimaryLanguage(user.id);
    const onboarded = requireOnboarded({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      uiLanguage: user.uiLanguage,
      timeZone: "Europe/Amsterdam",
      primaryLanguage: language,
      onboardingCompletedAt: new Date(),
    });

    const started = await startSession({
      userId: onboarded.id,
      userLanguageId: onboarded.primaryLanguage.id,
      activityType: "video",
      startedAt: new Date(),
    });
    expect(started.userLanguageId).toBe(language?.id);

    // And the dashboard draws the goal they picked, not a default.
    const overview = await getTrackerOverview(onboarded);
    expect(overview.week.dailyGoalMinutes).toBe(15);
  });
});

describe("an account set up before onboarding existed", () => {
  it("stays onboarded, on the goal the dashboard was already drawing", async () => {
    // What the migration's backfill leaves behind: a stamped user whose
    // language row predates the goal column and therefore carries its default.
    const account = await createTestAccount("Long-standing", { timeZone: "Europe/Moscow" });
    created.push(account);

    const language = await loadPrimaryLanguage(account.id);
    expect(language).toMatchObject({ code: "en", name: "English", dailyGoalMinutes: 45 });

    const [row] = await db.select().from(users).where(eq(users.id, account.id));
    expect(row.onboardingCompletedAt).not.toBeNull();

    const onboarded = requireOnboarded({
      id: account.id,
      firstName: row.firstName,
      lastName: row.lastName,
      uiLanguage: row.uiLanguage,
      timeZone: row.timezone,
      primaryLanguage: language,
      onboardingCompletedAt: row.onboardingCompletedAt,
    });

    const overview = await getTrackerOverview(onboarded);
    expect(overview.week.dailyGoalMinutes).toBe(45);
  });
});

describe("the goal column itself", () => {
  it("will not hold a value outside the range, whatever code asks", async () => {
    const user = await newTelegramUser();

    await expect(
      db.insert(userLanguages).values({
        userId: user.id,
        languageCode: "fr",
        languageName: "French",
        isPrimary: true,
        dailyGoalMinutes: 0,
      }),
    ).rejects.toThrow();

    const rows = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, user.id), eq(userLanguages.languageCode, "fr")));
    expect(rows).toEqual([]);
  });
});
