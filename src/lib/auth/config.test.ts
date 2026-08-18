import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authSessionTtlSeconds,
  initDataMaxAgeSeconds,
  isDevAuthAllowed,
  isProduction,
  telegramBotToken,
} from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDevAuthAllowed", () => {
  it("is off unless explicitly opted into", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_AUTH", undefined);
    expect(isDevAuthAllowed()).toBe(false);
  });

  it("is on in development when opted into", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_AUTH", "true");
    expect(isDevAuthAllowed()).toBe(true);
  });

  it("cannot be reached in production, however it is configured", () => {
    vi.stubEnv("NODE_ENV", "production");

    for (const value of ["true", "TRUE", "1", "yes", "on"]) {
      vi.stubEnv("ALLOW_DEV_AUTH", value);
      expect(isDevAuthAllowed()).toBe(false);
    }
  });

  it("only accepts the exact string \"true\", not any truthy-looking value", () => {
    vi.stubEnv("NODE_ENV", "development");

    for (const value of ["1", "yes", "TRUE", "True", "", " true "]) {
      vi.stubEnv("ALLOW_DEV_AUTH", value);
      expect(isDevAuthAllowed()).toBe(false);
    }
  });
});

describe("isProduction", () => {
  it("tracks NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isProduction()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(isProduction()).toBe(false);
  });
});

describe("telegramBotToken", () => {
  it("reports absence rather than returning an empty string", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    expect(telegramBotToken()).toBeNull();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(telegramBotToken()).toBeNull();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "   ");
    expect(telegramBotToken()).toBeNull();
  });

  it("returns a configured token", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "  123:abc  ");
    expect(telegramBotToken()).toBe("123:abc");
  });

  it("is not exposed to the browser under a NEXT_PUBLIC_ name", () => {
    // A public copy would ship the signing key to every client.
    const publicKeys = Object.keys(process.env).filter((key) =>
      key.startsWith("NEXT_PUBLIC_"),
    );
    expect(publicKeys.filter((key) => /TOKEN|SECRET/i.test(key))).toEqual([]);
  });
});

describe("durations", () => {
  it("fall back to sane defaults", () => {
    vi.stubEnv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", undefined);
    vi.stubEnv("AUTH_SESSION_TTL_SECONDS", undefined);
    expect(initDataMaxAgeSeconds()).toBe(3600);
    expect(authSessionTtlSeconds()).toBe(30 * 24 * 60 * 60);
  });

  it("accept a valid override", () => {
    vi.stubEnv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "60");
    vi.stubEnv("AUTH_SESSION_TTL_SECONDS", "7200");
    expect(initDataMaxAgeSeconds()).toBe(60);
    expect(authSessionTtlSeconds()).toBe(7200);
  });

  it("ignore nonsense instead of producing a zero-length session", () => {
    for (const value of ["0", "-1", "abc", "1.5", ""]) {
      vi.stubEnv("AUTH_SESSION_TTL_SECONDS", value);
      expect(authSessionTtlSeconds()).toBe(30 * 24 * 60 * 60);
    }
  });
});
