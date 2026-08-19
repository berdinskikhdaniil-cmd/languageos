import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { updateUiLanguage } from "@/features/settings/data/preferences";
import type { TelegramInitDataUser } from "@/lib/telegram/init-data";
import { findOrCreateTelegramUser } from "./telegram-login";

/**
 * What Telegram is allowed to decide, and when it stops being allowed to.
 *
 * The rule this file exists for: Telegram's `language_code` seeds the interface
 * language on the row it creates, and never touches it again. A learner who
 * opens Settings and picks Russian must still be reading Russian after the next
 * launch, whatever their Telegram client is set to — otherwise the setting is
 * not a setting, it is a suggestion Telegram overrules every morning.
 */

/** Real ids are 64-bit; these are far outside anything Telegram would issue. */
let nextId = 900_000_000_000;

const created: string[] = [];

function telegramUser(overrides: Partial<TelegramInitDataUser> = {}): TelegramInitDataUser {
  return {
    id: (nextId += 1),
    firstName: "Test",
    lastName: null,
    username: null,
    languageCode: null,
    photoUrl: null,
    ...overrides,
  };
}

async function signIn(user: TelegramInitDataUser) {
  const row = await findOrCreateTelegramUser(user);
  if (!created.includes(row.id)) created.push(row.id);
  return row;
}

afterEach(async () => {
  while (created.length > 0) {
    const id = created.pop();
    if (id) await db.delete(users).where(eq(users.id, id));
  }
});

describe("a brand-new Telegram account", () => {
  it("opens in Russian when the client reports Russian", async () => {
    const row = await signIn(telegramUser({ languageCode: "ru" }));
    expect(row.uiLanguage).toBe("ru");
  });

  it("reads a regional Russian tag the same way", async () => {
    const row = await signIn(telegramUser({ languageCode: "ru-RU" }));
    expect(row.uiLanguage).toBe("ru");
  });

  it("opens in English for every other client language", async () => {
    for (const languageCode of ["en", "en-GB", "de", "uk", "kk"]) {
      const row = await signIn(telegramUser({ languageCode }));
      expect(row.uiLanguage, languageCode).toBe("en");
    }
  });

  it("opens in English when Telegram says nothing", async () => {
    const row = await signIn(telegramUser({ languageCode: null }));
    expect(row.uiLanguage).toBe("en");
  });

  it("arrives with no language, no goal and no real timezone — only this", async () => {
    // Authentication still stops at the user row; a readable screen is the one
    // thing it has to decide before the learner can be asked anything.
    const row = await signIn(telegramUser({ languageCode: "ru" }));

    expect(row.onboardingCompletedAt).toBeNull();
    expect(row.timezone).toBe("UTC");
    expect(row.uiLanguage).toBe("ru");
  });
});

describe("signing in again", () => {
  it("never overwrites a choice the learner made in Settings", async () => {
    // Signed up on a Russian client, then switched the app to English.
    const first = await signIn(telegramUser({ languageCode: "ru" }));
    expect(first.uiLanguage).toBe("ru");

    await updateUiLanguage({ userId: first.id, uiLanguage: "en" });

    const again = await signIn(telegramUser({ id: first.telegramUserId!, languageCode: "ru" }));

    expect(again.id).toBe(first.id);
    expect(again.uiLanguage).toBe("en");
  });

  it("does not push the client's language onto an account that chose the other one", async () => {
    // The mirror image: signed up on an English client, chose Russian.
    const first = await signIn(telegramUser({ languageCode: "en" }));
    await updateUiLanguage({ userId: first.id, uiLanguage: "ru" });

    const again = await signIn(telegramUser({ id: first.telegramUserId!, languageCode: "en" }));

    expect(again.uiLanguage).toBe("ru");
  });

  it("still refreshes the mirrored profile, including Telegram's own tag", async () => {
    // `telegram_language_code` is a mirror and stays one. It is simply no
    // longer what decides anything after the row exists.
    const first = await signIn(telegramUser({ languageCode: "en", firstName: "Anna" }));
    await updateUiLanguage({ userId: first.id, uiLanguage: "ru" });

    const again = await signIn(
      telegramUser({ id: first.telegramUserId!, languageCode: "de", firstName: "Anna B" }),
    );

    expect(again.firstName).toBe("Anna B");
    expect(again.telegramLanguageCode).toBe("de");
    expect(again.uiLanguage).toBe("ru");
  });

  it("creates no second row", async () => {
    const first = await signIn(telegramUser({ languageCode: "ru" }));
    await signIn(telegramUser({ id: first.telegramUserId!, languageCode: "en" }));

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.telegramUserId, first.telegramUserId!));

    expect(rows).toHaveLength(1);
  });
});
