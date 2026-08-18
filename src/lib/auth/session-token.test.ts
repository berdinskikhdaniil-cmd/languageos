import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./session-token";

describe("generateSessionToken", () => {
  it("produces a URL-safe token with 256 bits of entropy", () => {
    const token = generateSessionToken();
    // 32 bytes in base64url, unpadded.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
    expect(tokens.size).toBe(500);
  });
});

describe("hashSessionToken", () => {
  it("is SHA-256 hex, so a stored row cannot be turned back into a cookie", () => {
    const token = "a-known-token";
    expect(hashSessionToken(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
  });

  it("is deterministic, which is what makes cookie lookup possible", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("never returns the token itself", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates tokens that differ by a single character", () => {
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });
});
