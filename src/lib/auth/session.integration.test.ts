import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import {
  createAuthSession,
  deleteExpiredAuthSessions,
  findUserBySessionToken,
  revokeAuthSession,
} from "./session";
import { generateSessionToken, hashSessionToken } from "./session-token";

let account: TestAccount;

beforeAll(async () => {
  account = await createTestAccount("Session tester");
});

afterAll(async () => {
  await deleteTestAccount(account);
});

describe("auth sessions", () => {
  it("resolves a freshly issued token to its user", async () => {
    const { token } = await createAuthSession(account.id);
    const user = await findUserBySessionToken(token);
    expect(user?.id).toBe(account.id);
  });

  it("stores only the hash — the raw token is nowhere in the database", async () => {
    const { token } = await createAuthSession(account.id);

    const rows = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, account.id));

    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(token);
    expect(rows.some((row) => row.tokenHash === hashSessionToken(token))).toBe(true);
  });

  it("refuses an unknown token", async () => {
    expect(await findUserBySessionToken(generateSessionToken())).toBeNull();
  });

  it("refuses an empty token without querying", async () => {
    expect(await findUserBySessionToken("")).toBeNull();
  });

  it("refuses a token whose session has expired", async () => {
    const { token } = await createAuthSession(account.id);

    // Age the row rather than waiting for the TTL.
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.tokenHash, hashSessionToken(token)));

    expect(await findUserBySessionToken(token)).toBeNull();
  });

  it("treats the expiry moment as already past", async () => {
    const { token } = await createAuthSession(account.id);
    const expiresAt = new Date("2026-08-18T12:00:00Z");

    await db
      .update(authSessions)
      .set({ expiresAt })
      .where(eq(authSessions.tokenHash, hashSessionToken(token)));

    expect(await findUserBySessionToken(token, expiresAt)).toBeNull();
    expect(
      (await findUserBySessionToken(token, new Date(expiresAt.getTime() - 1)))?.id,
    ).toBe(account.id);
  });

  it("stops authenticating once revoked", async () => {
    const { token } = await createAuthSession(account.id);
    expect(await findUserBySessionToken(token)).not.toBeNull();

    await revokeAuthSession(token);
    expect(await findUserBySessionToken(token)).toBeNull();
  });

  it("cleans up expired rows and leaves live ones alone", async () => {
    const live = await createAuthSession(account.id);
    const stale = await createAuthSession(account.id);

    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(authSessions.tokenHash, hashSessionToken(stale.token)));

    await deleteExpiredAuthSessions();

    expect(await findUserBySessionToken(stale.token)).toBeNull();
    expect((await findUserBySessionToken(live.token))?.id).toBe(account.id);
  });

  it("disappears with its user", async () => {
    const doomed = await createTestAccount("Temporary");
    const { token } = await createAuthSession(doomed.id);
    expect(await findUserBySessionToken(token)).not.toBeNull();

    await deleteTestAccount(doomed);
    expect(await findUserBySessionToken(token)).toBeNull();
  });
});
