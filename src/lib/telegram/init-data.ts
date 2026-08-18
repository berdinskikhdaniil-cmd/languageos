import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validation of Telegram Mini App `initData`. Server-only: it takes the bot
 * token, which must never reach a browser.
 *
 * Pure and clock-injected — `now` is a parameter — so every rule below is
 * testable without a Telegram client or a real token.
 *
 * Follows the official algorithm: build a check string from every received
 * field except `hash`, sorted by key and joined with newlines; derive the secret
 * as HMAC-SHA256 of the bot token keyed by the literal "WebAppData"; compare
 * against HMAC-SHA256 of the check string keyed by that secret.
 *
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

/** Small tolerance for a Telegram client whose clock runs slightly ahead. */
const FUTURE_SKEW_TOLERANCE_SECONDS = 60;

export type TelegramInitDataUser = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  photoUrl: string | null;
};

export type InitDataFailureReason =
  | "missing_bot_token"
  | "empty"
  | "malformed"
  | "duplicate_field"
  | "missing_hash"
  | "invalid_hash"
  | "missing_auth_date"
  | "expired"
  | "future_auth_date"
  | "missing_user"
  | "malformed_user";

export type InitDataResult =
  | { ok: true; user: TelegramInitDataUser; authDate: Date }
  | { ok: false; reason: InitDataFailureReason };

/** Human-readable, safe to show a learner. Never echoes the input. */
export const INIT_DATA_FAILURE_MESSAGES: Record<InitDataFailureReason, string> = {
  missing_bot_token: "Telegram sign-in is not configured on the server.",
  empty: "Telegram did not provide any sign-in data.",
  malformed: "Telegram sign-in data could not be read.",
  duplicate_field: "Telegram sign-in data could not be read.",
  missing_hash: "Telegram sign-in data could not be read.",
  invalid_hash: "Telegram sign-in data could not be verified.",
  missing_auth_date: "Telegram sign-in data could not be read.",
  expired: "This sign-in has expired. Reopen the app from Telegram.",
  future_auth_date: "Telegram sign-in data could not be verified.",
  missing_user: "Telegram did not provide an account.",
  malformed_user: "Telegram sign-in data could not be read.",
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Parses into a Map, rejecting repeated keys. A duplicate would let a caller
 * present one value to the signature check and another to the parser.
 */
function parseFields(rawInitData: string): Map<string, string> | null {
  const fields = new Map<string, string>();

  for (const [key, value] of new URLSearchParams(rawInitData)) {
    if (fields.has(key)) return null;
    fields.set(key, value);
  }

  return fields;
}

function expectedHash(fields: Map<string, string>, botToken: string): string {
  const checkString = [...fields.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secretKey).update(checkString).digest("hex");
}

/** Equal-length, constant-time comparison of two hex digests. */
function hashesMatch(received: string, expected: string): boolean {
  if (!/^[0-9a-f]+$/i.test(received)) return false;

  const receivedBytes = Buffer.from(received.toLowerCase(), "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (receivedBytes.length !== expectedBytes.length || receivedBytes.length === 0) return false;

  return timingSafeEqual(receivedBytes, expectedBytes);
}

function parseUser(raw: string): TelegramInitDataUser | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  // Telegram ids exceed 32 bits but stay inside the exact-integer range.
  const id = candidate.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;

  return {
    id,
    firstName: nonEmptyString(candidate.first_name),
    lastName: nonEmptyString(candidate.last_name),
    username: nonEmptyString(candidate.username),
    languageCode: nonEmptyString(candidate.language_code),
    photoUrl: nonEmptyString(candidate.photo_url),
  };
}

export function validateTelegramInitData(
  rawInitData: string,
  botToken: string | null,
  now: Date,
  maxAgeSeconds: number,
): InitDataResult {
  if (!botToken) return { ok: false, reason: "missing_bot_token" };
  if (typeof rawInitData !== "string" || rawInitData.trim() === "") {
    return { ok: false, reason: "empty" };
  }

  const fields = parseFields(rawInitData);
  if (!fields) return { ok: false, reason: "duplicate_field" };
  if (fields.size < 2) return { ok: false, reason: "malformed" };

  const receivedHash = fields.get("hash");
  if (!receivedHash) return { ok: false, reason: "missing_hash" };

  // Integrity first. Nothing below this line trusts a field before the
  // signature over the whole payload has been verified.
  if (!hashesMatch(receivedHash, expectedHash(fields, botToken))) {
    return { ok: false, reason: "invalid_hash" };
  }

  const rawAuthDate = fields.get("auth_date");
  const authDateSeconds = Number(rawAuthDate);
  if (!rawAuthDate || !Number.isInteger(authDateSeconds) || authDateSeconds <= 0) {
    return { ok: false, reason: "missing_auth_date" };
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const ageSeconds = nowSeconds - authDateSeconds;
  if (ageSeconds > maxAgeSeconds) return { ok: false, reason: "expired" };
  if (ageSeconds < -FUTURE_SKEW_TOLERANCE_SECONDS) {
    return { ok: false, reason: "future_auth_date" };
  }

  const rawUser = fields.get("user");
  if (!rawUser) return { ok: false, reason: "missing_user" };

  const user = parseUser(rawUser);
  if (!user) return { ok: false, reason: "malformed_user" };

  return { ok: true, user, authDate: new Date(authDateSeconds * 1000) };
}
