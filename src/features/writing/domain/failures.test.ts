import { describe, expect, it } from "vitest";
import { reviewFailureMessage } from "./failures";

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

describe("what a learner is told", () => {
  it("is a sentence, for every reason there is", () => {
    for (const reason of REASONS) {
      const message = reviewFailureMessage(reason);
      expect(message.length).toBeGreaterThan(20);
      expect(message.endsWith(".")).toBe(true);
    }
  });

  it("never leaks the provider, the model, a status code or a schema", () => {
    for (const reason of REASONS) {
      const message = reviewFailureMessage(reason).toLowerCase();
      for (const leak of ["openrouter", "json", "schema", "http", "api", "token", "429", "provider"]) {
        expect(message).not.toContain(leak);
      }
    }
  });

  it("never echoes the internal reason code back at the learner", () => {
    expect(reviewFailureMessage("rate_limited")).not.toContain("rate_limited");
    expect(reviewFailureMessage("unsupported_structured_output")).not.toContain("structured");
    expect(reviewFailureMessage("boom_internal_code")).not.toContain("boom_internal_code");
  });

  it("reassures that nothing was lost, wherever that is true", () => {
    for (const reason of ["timeout", "rate_limited", "invalid_response", "network", null]) {
      expect(reviewFailureMessage(reason).toLowerCase()).toContain("saved");
    }
  });

  it("says something different when the allowance is what ran out", () => {
    expect(reviewFailureMessage("limit_reached")).toContain("today");
  });
});
