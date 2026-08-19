import { describe, expect, it } from "vitest";
import { UI_LANGUAGES } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { reviewFailureKey } from "./failures";

const REASONS = [
  "not_configured",
  "timeout",
  "network",
  "rate_limited",
  "auth",
  "credits",
  "provider_unavailable",
  "unsupported_structured_output",
  "invalid_response",
  "bad_request",
  "processing",
  "limit_reached",
  null,
  undefined,
  "something we have never seen",
];

/** What the learner would actually read, in one language. */
function messageFor(reason: string | null | undefined, language: "en" | "ru") {
  return getMessages(language).writing.failures[reviewFailureKey(reason)];
}

describe("what a learner is told", () => {
  it("is a sentence, for every reason there is, in every language", () => {
    for (const language of UI_LANGUAGES) {
      for (const reason of REASONS) {
        const message = messageFor(reason, language);
        expect(message.length).toBeGreaterThan(20);
        expect(message.endsWith(".")).toBe(true);
      }
    }
  });

  it("never leaks the provider, the model, a status code or a schema", () => {
    for (const language of UI_LANGUAGES) {
      for (const reason of REASONS) {
        const message = messageFor(reason, language).toLowerCase();
        for (const leak of [
          "openrouter",
          "json",
          "schema",
          "http",
          "api",
          "token",
          "429",
          "provider",
        ]) {
          expect(message).not.toContain(leak);
        }
      }
    }
  });

  it("never echoes the internal reason code back at the learner", () => {
    for (const language of UI_LANGUAGES) {
      expect(messageFor("rate_limited", language)).not.toContain("rate_limited");
      expect(messageFor("unsupported_structured_output", language)).not.toContain("structured");
      expect(messageFor("boom_internal_code", language)).not.toContain("boom_internal_code");
    }
  });

  it("reassures that nothing was lost, wherever that is true", () => {
    const reassurance = { en: "saved", ru: "сохран" } as const;

    for (const language of UI_LANGUAGES) {
      for (const reason of ["timeout", "rate_limited", "invalid_response", "network", null]) {
        expect(messageFor(reason, language).toLowerCase()).toContain(reassurance[language]);
      }
    }
  });

  it("says something different when the allowance is what ran out", () => {
    expect(messageFor("limit_reached", "en")).toContain("today");
    expect(messageFor("limit_reached", "ru")).toContain("завтра");
  });
});

describe("the reason a stored row carries", () => {
  it("maps the known codes onto their own explanations", () => {
    expect(reviewFailureKey("not_configured")).toBe("notConfigured");
    expect(reviewFailureKey("limit_reached")).toBe("limitReached");
    expect(reviewFailureKey("processing")).toBe("processing");
    expect(reviewFailureKey("rate_limited")).toBe("rateLimited");
    expect(reviewFailureKey("timeout")).toBe("timeout");
  });

  it("treats every way of running out of provider access as the same thing", () => {
    for (const reason of ["credits", "auth", "not_configured_key"]) {
      expect(reviewFailureKey(reason)).toBe("unavailable");
    }
  });

  it("falls back calmly rather than passing an unknown code through", () => {
    expect(reviewFailureKey("boom_internal_code")).toBe("unknown");
    expect(reviewFailureKey(null)).toBe("unknown");
    expect(reviewFailureKey(undefined)).toBe("unknown");
  });
});
