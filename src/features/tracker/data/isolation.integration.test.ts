import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { createTestAccount, deleteTestAccount, type TestAccount } from "@/test/db-fixtures";
import {
  TrackerError,
  cancelSession,
  createManualSession,
  getActiveSession,
  getSessionsInInterval,
  startSession,
  stopSession,
} from "./sessions";

/**
 * Data isolation between two real users.
 *
 * Every tracker read and write is scoped by our own `users.id`, and none of them
 * accepts an id from a caller — no session id, no language id. These tests hold
 * that line against the actual database rather than trusting the shape of the
 * code.
 */

let alice: TestAccount;
let bob: TestAccount;

beforeAll(async () => {
  alice = await createTestAccount("Alice");
  bob = await createTestAccount("Bob");
});

afterAll(async () => {
  await deleteTestAccount(alice);
  await deleteTestAccount(bob);
});

beforeEach(async () => {
  await db.delete(sessions).where(eq(sessions.userId, alice.id));
  await db.delete(sessions).where(eq(sessions.userId, bob.id));
});

async function startFor(account: TestAccount, startedAt = new Date()) {
  return startSession({
    userId: account.id,
    userLanguageId: account.languageId,
    activityType: "video",
    startedAt,
  });
}

describe("reading another user's data", () => {
  it("does not surface Alice's running session to Bob", async () => {
    await startFor(alice);

    expect((await getActiveSession(alice.id))?.userId).toBe(alice.id);
    expect(await getActiveSession(bob.id)).toBeNull();
  });

  it("does not surface Alice's finished sessions to Bob", async () => {
    const startedAt = new Date("2026-08-18T09:00:00Z");
    await createManualSession({
      userId: alice.id,
      userLanguageId: alice.languageId,
      activityType: "reading",
      startedAt,
      endedAt: new Date(startedAt.getTime() + 1_200_000),
      durationSeconds: 1200,
      sourceTitle: "Alice's book",
      note: null,
    });

    const from = new Date("2026-08-18T00:00:00Z");
    const to = new Date("2026-08-19T00:00:00Z");

    expect(await getSessionsInInterval(alice.id, from, to)).toHaveLength(1);
    expect(await getSessionsInInterval(bob.id, from, to)).toHaveLength(0);
  });
});

describe("mutating another user's data", () => {
  it("does not let Bob stop Alice's session", async () => {
    const aliceSession = await startFor(alice);

    await expect(stopSession({ userId: bob.id, endedAt: new Date() })).rejects.toThrow(
      TrackerError,
    );

    const [after] = await db.select().from(sessions).where(eq(sessions.id, aliceSession.id));
    expect(after.endedAt).toBeNull();
    expect(after.durationSeconds).toBeNull();
  });

  it("does not let Bob discard Alice's session", async () => {
    const aliceSession = await startFor(alice);

    await expect(cancelSession({ userId: bob.id })).rejects.toThrow(TrackerError);

    const rows = await db.select().from(sessions).where(eq(sessions.id, aliceSession.id));
    expect(rows).toHaveLength(1);
  });

  it("lets each user stop only their own timer, concurrently", async () => {
    await startFor(alice);
    await startFor(bob);

    const stopped = await stopSession({ userId: bob.id, endedAt: new Date() });
    expect(stopped.userId).toBe(bob.id);

    expect((await getActiveSession(alice.id))?.userId).toBe(alice.id);
    expect(await getActiveSession(bob.id)).toBeNull();
  });

  it("keeps the one-running-session rule per user, not globally", async () => {
    await startFor(alice);
    // Bob starting is unaffected by Alice's timer.
    await expect(startFor(bob)).resolves.toBeDefined();
    // Alice starting a second one is not.
    await expect(startFor(alice)).rejects.toThrow(TrackerError);
  });
});

describe("filing a session against a language", () => {
  it("cannot attach Bob's session to Alice's language", async () => {
    // Enforced by the composite foreign key on (user_id, user_language_id).
    await expect(
      startSession({
        userId: bob.id,
        userLanguageId: alice.languageId,
        activityType: "video",
        startedAt: new Date(),
      }),
    ).rejects.toThrow();

    expect(await getActiveSession(bob.id)).toBeNull();
  });

  it("cannot attach a manual entry to another user's language either", async () => {
    const startedAt = new Date("2026-08-18T09:00:00Z");

    await expect(
      createManualSession({
        userId: bob.id,
        userLanguageId: alice.languageId,
        activityType: "reading",
        startedAt,
        endedAt: new Date(startedAt.getTime() + 600_000),
        durationSeconds: 600,
        sourceTitle: null,
        note: null,
      }),
    ).rejects.toThrow();

    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, bob.id)));
    expect(rows).toHaveLength(0);
  });
});
