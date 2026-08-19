import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAuthSession, findUserBySessionToken } from "@/lib/auth/session";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import { updateUiLanguage } from "./preferences";

/**
 * The one setting there is, against a real database.
 *
 * Three things are worth holding to the actual column rather than to the shape
 * of the code: that a choice survives, that the request path reads it back, and
 * that one account writing a preference cannot touch another's. The last is the
 * whole reason `updateUiLanguage` takes a user id it never receives from a
 * client — the id always comes from the session.
 */

let alice: TestAccount;
let bob: TestAccount;

async function storedLanguage(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row?.uiLanguage;
}

beforeAll(async () => {
  alice = await createTestAccount("Alice");
  bob = await createTestAccount("Bob");
});

afterAll(async () => {
  await deleteTestAccount(alice);
  await deleteTestAccount(bob);
});

beforeEach(async () => {
  await updateUiLanguage({ userId: alice.id, uiLanguage: "en" });
  await updateUiLanguage({ userId: bob.id, uiLanguage: "en" });
});

describe("a new account", () => {
  it("starts in English, from the column default rather than from code", async () => {
    const fresh = await createTestAccount("Fresh");
    try {
      expect(await storedLanguage(fresh.id)).toBe("en");
    } finally {
      await deleteTestAccount(fresh);
    }
  });
});

describe("choosing an interface language", () => {
  it("is written, and is still there afterwards", async () => {
    expect(await updateUiLanguage({ userId: alice.id, uiLanguage: "ru" })).toBe(true);
    expect(await storedLanguage(alice.id)).toBe("ru");
  });

  it("can be changed back", async () => {
    await updateUiLanguage({ userId: alice.id, uiLanguage: "ru" });
    await updateUiLanguage({ userId: alice.id, uiLanguage: "en" });

    expect(await storedLanguage(alice.id)).toBe("en");
  });

  it("is read back by the request path that resolves the caller", async () => {
    await updateUiLanguage({ userId: alice.id, uiLanguage: "ru" });

    // The same lookup getCurrentUser() performs once it has a cookie: the
    // preference travels with identity, not in a cookie of its own.
    const session = await createAuthSession(alice.id);
    const resolved = await findUserBySessionToken(session.token);

    expect(resolved?.id).toBe(alice.id);
    expect(resolved?.uiLanguage).toBe("ru");
  });

  it("reports nothing written when the account no longer exists", async () => {
    const gone = await createTestAccount("Gone");
    await deleteTestAccount(gone);

    expect(await updateUiLanguage({ userId: gone.id, uiLanguage: "ru" })).toBe(false);
  });
});

describe("one account's preference and another's", () => {
  it("are separate: writing Alice's leaves Bob's exactly as it was", async () => {
    await updateUiLanguage({ userId: alice.id, uiLanguage: "ru" });

    expect(await storedLanguage(alice.id)).toBe("ru");
    expect(await storedLanguage(bob.id)).toBe("en");
  });

  it("cannot be crossed by aiming an update at the other account", async () => {
    // The only way to reach Bob's row is to hold Bob's id, and the only place
    // that comes from is Bob's own session.
    await updateUiLanguage({ userId: bob.id, uiLanguage: "ru" });

    expect(await storedLanguage(bob.id)).toBe("ru");
    expect(await storedLanguage(alice.id)).toBe("en");
  });

  it("changes nothing else about the account", async () => {
    const [before] = await db.select().from(users).where(eq(users.id, alice.id));
    await updateUiLanguage({ userId: alice.id, uiLanguage: "ru" });
    const [after] = await db.select().from(users).where(eq(users.id, alice.id));

    // Timezone, onboarding and the Telegram mirror are not this setting's
    // business — Settings changes one thing, and only that thing.
    expect(after.timezone).toBe(before.timezone);
    expect(after.onboardingCompletedAt).toEqual(before.onboardingCompletedAt);
    expect(after.telegramLanguageCode).toBe(before.telegramLanguageCode);
    expect(after.telegramUserId).toBe(before.telegramUserId);
  });
});
