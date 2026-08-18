import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_WEBHOOK_PATH,
  configuredWebAppUrl,
  isValidWebhookSecret,
  parseWebAppUrl,
  telegramWebhookSecret,
  telegramWebhookUrl,
  webAppUrlForTelegram,
} from "./bot-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseWebAppUrl", () => {
  it("accepts a public https URL", () => {
    expect(parseWebAppUrl("https://app.example.com", true)).toEqual({
      ok: true,
      value: { url: "https://app.example.com", isSecure: true, isLocal: false },
    });
  });

  it("drops a trailing slash so the webhook path appends cleanly", () => {
    const result = parseWebAppUrl("https://app.example.com/", false);
    expect(result.ok && result.value.url).toBe("https://app.example.com");
  });

  it("keeps a sub-path", () => {
    const result = parseWebAppUrl("https://example.com/app/", false);
    expect(result.ok && result.value.url).toBe("https://example.com/app");
  });

  it("refuses plain http against a real host, in any environment", () => {
    expect(parseWebAppUrl("http://app.example.com", false)).toEqual({
      ok: false,
      problem: "insecure",
    });
  });

  it("allows localhost in development but flags it", () => {
    expect(parseWebAppUrl("http://localhost:3000", false)).toEqual({
      ok: true,
      value: { url: "http://localhost:3000", isSecure: false, isLocal: true },
    });
    expect(parseWebAppUrl("http://127.0.0.1:3000", false).ok).toBe(true);
  });

  it("refuses localhost in production, https or not", () => {
    expect(parseWebAppUrl("http://localhost:3000", true)).toEqual({
      ok: false,
      problem: "local_in_production",
    });
    expect(parseWebAppUrl("https://localhost:3000", true)).toEqual({
      ok: false,
      problem: "local_in_production",
    });
  });

  it("reports absence, nonsense and unsupported schemes separately", () => {
    expect(parseWebAppUrl(undefined, false)).toEqual({ ok: false, problem: "missing" });
    expect(parseWebAppUrl("   ", false)).toEqual({ ok: false, problem: "missing" });
    expect(parseWebAppUrl("app.example.com", false)).toEqual({ ok: false, problem: "malformed" });
    expect(parseWebAppUrl("ftp://example.com", false)).toEqual({
      ok: false,
      problem: "unsupported_scheme",
    });
  });
});

describe("webAppUrlForTelegram", () => {
  it("hands Telegram a public https URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TELEGRAM_WEBAPP_URL", "https://app.example.com");
    expect(webAppUrlForTelegram()).toEqual({ ok: true, url: "https://app.example.com" });
    expect(configuredWebAppUrl()).toBe("https://app.example.com");
  });

  it("never hands Telegram a localhost URL, even where one is allowed locally", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TELEGRAM_WEBAPP_URL", "http://localhost:3000");

    expect(webAppUrlForTelegram()).toEqual({ ok: false, problem: "local" });
    expect(configuredWebAppUrl()).toBeNull();
  });

  it("reports nothing to attach a button to when unset", () => {
    vi.stubEnv("TELEGRAM_WEBAPP_URL", undefined);
    expect(configuredWebAppUrl()).toBeNull();
  });
});

describe("telegramWebhookUrl", () => {
  it("derives the endpoint from the Mini App URL rather than a second variable", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TELEGRAM_WEBAPP_URL", "https://app.example.com");

    expect(telegramWebhookUrl()).toEqual({
      ok: true,
      url: `https://app.example.com${TELEGRAM_WEBHOOK_PATH}`,
    });
  });

  it("is unavailable while the app only runs locally", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TELEGRAM_WEBAPP_URL", "http://localhost:3000");
    expect(telegramWebhookUrl()).toEqual({ ok: false, problem: "local" });
  });
});

describe("the webhook secret", () => {
  it("reports absence rather than returning an empty string", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", undefined);
    expect(telegramWebhookSecret()).toBeNull();
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "   ");
    expect(telegramWebhookSecret()).toBeNull();
  });

  it("accepts only what Telegram accepts as a secret_token", () => {
    expect(isValidWebhookSecret("a".repeat(256))).toBe(true);
    expect(isValidWebhookSecret("A-Za-z0-9_-")).toBe(true);
    expect(isValidWebhookSecret("")).toBe(false);
    expect(isValidWebhookSecret("a".repeat(257))).toBe(false);
    expect(isValidWebhookSecret("has spaces")).toBe(false);
    expect(isValidWebhookSecret("has:colon")).toBe(false);
  });
});
