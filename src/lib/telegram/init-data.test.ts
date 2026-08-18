import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateTelegramInitData } from "./init-data";

/**
 * A throwaway token of the same shape BotFather issues. Not a real credential.
 */
const BOT_TOKEN = "123456:AAHfakeTokenForTestsOnly_not_a_real_secret";
const NOW = new Date("2026-08-18T12:00:00Z");
const AUTH_DATE = Math.floor(NOW.getTime() / 1000) - 30;
const MAX_AGE = 3600;

const USER_JSON = JSON.stringify({
  id: 7_654_321_098,
  first_name: "Ada",
  last_name: "Lovelace",
  username: "ada",
  language_code: "en",
  photo_url: "https://t.me/i/userpic/320/ada.jpg",
});

/**
 * Signs a payload the way Telegram does, written out step by step rather than
 * by calling the implementation, so the test is an independent check of the
 * algorithm and not a mirror of the code under test.
 */
function sign(fields: Record<string, string>): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");

  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

function validInitData(overrides: Record<string, string> = {}): string {
  return sign({
    auth_date: String(AUTH_DATE),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: USER_JSON,
    ...overrides,
  });
}

describe("validateTelegramInitData — a genuine launch", () => {
  it("accepts correctly signed data and returns the Telegram account", () => {
    const result = validateTelegramInitData(validInitData(), BOT_TOKEN, NOW, MAX_AGE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user).toEqual({
      id: 7_654_321_098,
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      languageCode: "en",
      photoUrl: "https://t.me/i/userpic/320/ada.jpg",
    });
    expect(result.authDate.getTime()).toBe(AUTH_DATE * 1000);
  });

  it("handles a Telegram id above the 32-bit range", () => {
    const bigId = 8_000_000_000;
    const result = validateTelegramInitData(
      validInitData({ user: JSON.stringify({ id: bigId, first_name: "Big" }) }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );

    expect(result.ok && result.user.id).toBe(bigId);
  });

  it("keeps optional profile fields as null rather than empty strings", () => {
    const result = validateTelegramInitData(
      validInitData({ user: JSON.stringify({ id: 42, first_name: "Solo", username: "" }) }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );

    expect(result.ok && result.user.lastName).toBeNull();
    expect(result.ok && result.user.username).toBeNull();
  });

  it("verifies against the check string built from every field except hash", () => {
    // A field Telegram may add that this code has never heard of must still be
    // covered by the signature, or the payload could be extended freely.
    const withExtraField = validInitData({ chat_type: "private", signature: "abc123" });
    expect(validateTelegramInitData(withExtraField, BOT_TOKEN, NOW, MAX_AGE).ok).toBe(true);
  });
});

describe("validateTelegramInitData — rejection", () => {
  it("rejects a wrong hash", () => {
    const tampered = validInitData().replace(/hash=[0-9a-f]+/, `hash=${"0".repeat(64)}`);
    expect(validateTelegramInitData(tampered, BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "invalid_hash",
    });
  });

  it("rejects data signed with a different bot token", () => {
    const result = validateTelegramInitData(validInitData(), "999999:someOtherToken", NOW, MAX_AGE);
    expect(result).toEqual({ ok: false, reason: "invalid_hash" });
  });

  it("rejects a tampered user, even when every other field is intact", () => {
    const genuine = new URLSearchParams(validInitData());
    genuine.set("user", JSON.stringify({ id: 1, first_name: "Attacker" }));

    expect(validateTelegramInitData(genuine.toString(), BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "invalid_hash",
    });
  });

  it("rejects a tampered auth_date", () => {
    const genuine = new URLSearchParams(validInitData());
    genuine.set("auth_date", String(AUTH_DATE + 5));

    expect(validateTelegramInitData(genuine.toString(), BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "invalid_hash",
    });
  });

  it("rejects a missing hash", () => {
    const withoutHash = new URLSearchParams(validInitData());
    withoutHash.delete("hash");

    expect(validateTelegramInitData(withoutHash.toString(), BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "missing_hash",
    });
  });

  it("rejects a hash that is not hex, without throwing", () => {
    const genuine = new URLSearchParams(validInitData());
    genuine.set("hash", "not-a-hash");

    expect(validateTelegramInitData(genuine.toString(), BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "invalid_hash",
    });
  });

  it("rejects a duplicated field, which could show two values to two readers", () => {
    const doubled = `${validInitData()}&user=${encodeURIComponent('{"id":1}')}`;
    expect(validateTelegramInitData(doubled, BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "duplicate_field",
    });
  });

  it("rejects malformed user JSON that is nonetheless correctly signed", () => {
    const result = validateTelegramInitData(
      validInitData({ user: "{not json" }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );
    expect(result).toEqual({ ok: false, reason: "malformed_user" });
  });

  it("rejects a signed user without a usable id", () => {
    for (const user of ['{"first_name":"NoId"}', '{"id":"42"}', '{"id":0}', '{"id":-7}', "[]"]) {
      expect(validateTelegramInitData(validInitData({ user }), BOT_TOKEN, NOW, MAX_AGE)).toEqual({
        ok: false,
        reason: "malformed_user",
      });
    }
  });

  it("rejects a signed payload with no user at all", () => {
    const noUser = sign({ auth_date: String(AUTH_DATE), query_id: "x" });
    expect(validateTelegramInitData(noUser, BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "missing_user",
    });
  });

  it("rejects initData older than the configured maximum age", () => {
    const old = Math.floor(NOW.getTime() / 1000) - (MAX_AGE + 1);
    const result = validateTelegramInitData(
      sign({ auth_date: String(old), user: USER_JSON }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts initData exactly at the age limit", () => {
    const edge = Math.floor(NOW.getTime() / 1000) - MAX_AGE;
    const result = validateTelegramInitData(
      sign({ auth_date: String(edge), user: USER_JSON }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );
    expect(result.ok).toBe(true);
  });

  it("honours a shorter configured maximum age", () => {
    const result = validateTelegramInitData(validInitData(), BOT_TOKEN, NOW, 10);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects an auth_date implausibly far in the future", () => {
    const future = Math.floor(NOW.getTime() / 1000) + 3600;
    const result = validateTelegramInitData(
      sign({ auth_date: String(future), user: USER_JSON }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );
    expect(result).toEqual({ ok: false, reason: "future_auth_date" });
  });

  it("tolerates a client clock a few seconds ahead", () => {
    const slightlyAhead = Math.floor(NOW.getTime() / 1000) + 15;
    const result = validateTelegramInitData(
      sign({ auth_date: String(slightlyAhead), user: USER_JSON }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a signed payload with a non-numeric auth_date", () => {
    const result = validateTelegramInitData(
      sign({ auth_date: "yesterday", user: USER_JSON }),
      BOT_TOKEN,
      NOW,
      MAX_AGE,
    );
    expect(result).toEqual({ ok: false, reason: "missing_auth_date" });
  });

  it("refuses to authenticate when the server has no bot token", () => {
    expect(validateTelegramInitData(validInitData(), null, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "missing_bot_token",
    });
    expect(validateTelegramInitData(validInitData(), "", NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "missing_bot_token",
    });
  });

  it("rejects empty and junk input without throwing", () => {
    expect(validateTelegramInitData("", BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateTelegramInitData("   ", BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateTelegramInitData("%%%not-a-query%%%", BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(validateTelegramInitData("hash=deadbeef", BOT_TOKEN, NOW, MAX_AGE)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
