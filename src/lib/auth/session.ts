import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, users } from "@/db/schema";
import { authSessionTtlSeconds } from "./config";
import { hashSessionToken, generateSessionToken } from "./session-token";

/**
 * Our own opaque sessions.
 *
 * The browser holds a random token in an HttpOnly cookie; the database holds
 * only its SHA-256. Nothing about the user is encoded in the token, so a cookie
 * cannot be edited into someone else's identity — the only way to resolve it is
 * a lookup against a row we wrote.
 */

export type CreatedSession = {
  /** Handed to the browser once and never stored anywhere. */
  token: string;
  expiresAt: Date;
};

export async function createAuthSession(userId: string, now = new Date()): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + authSessionTtlSeconds() * 1000);

  await db.insert(authSessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Resolves a raw token to its user, or null.
 *
 * Expiry is part of the query rather than a check afterwards, so there is no
 * path that reads a row and forgets to look at `expiresAt`.
 */
export async function findUserBySessionToken(token: string, now = new Date()) {
  if (!token) return null;

  const [row] = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashSessionToken(token)), gt(authSessions.expiresAt, now)))
    .limit(1);

  return row?.user ?? null;
}

export async function revokeAuthSession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
}

/** Housekeeping for expired rows. Not wired to a schedule yet. */
export async function deleteExpiredAuthSessions(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, now))
    .returning({ id: authSessions.id });

  return deleted.length;
}
