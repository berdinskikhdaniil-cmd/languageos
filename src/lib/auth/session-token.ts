import { createHash, randomBytes } from "node:crypto";

/**
 * Session token primitives, kept free of any database import so they can be
 * reasoned about — and tested — on their own.
 */

const TOKEN_BYTES = 32;

/** 256 bits of CSPRNG output, URL-safe so it survives a cookie unescaped. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * What actually goes in the database. The raw token exists only in the cookie,
 * so a leaked table does not hand anyone a usable session.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
