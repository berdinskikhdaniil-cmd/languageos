import { describe, expect, it } from "vitest";
import type { CurrentUser } from "./onboarding-state";
import { OnboardingIncompleteError, isOnboarded, requireOnboarded } from "./onboarding-state";

const LANGUAGE = { id: "lang-1", code: "nl", name: "Dutch", dailyGoalMinutes: 30 };

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "user-1",
    firstName: "Anna",
    lastName: null,
    uiLanguage: "en",
    timeZone: "Europe/Amsterdam",
    primaryLanguage: LANGUAGE,
    onboardingCompletedAt: new Date("2026-08-18T10:00:00Z"),
    ...overrides,
  };
}

describe("isOnboarded", () => {
  it("accepts an account with a stamp and a language", () => {
    expect(isOnboarded(user())).toBe(true);
  });

  it("refuses a freshly authenticated Telegram account", () => {
    expect(
      isOnboarded(user({ primaryLanguage: null, onboardingCompletedAt: null, timeZone: "UTC" })),
    ).toBe(false);
  });

  it("refuses a stamp with no language behind it", () => {
    // The transaction writes both or neither, so this pairing is damage rather
    // than a state to render around.
    expect(isOnboarded(user({ primaryLanguage: null }))).toBe(false);
  });

  it("refuses a language with no stamp", () => {
    expect(isOnboarded(user({ onboardingCompletedAt: null }))).toBe(false);
  });
});

describe("requireOnboarded", () => {
  it("hands back the same user, narrowed", () => {
    const account = user();
    const onboarded = requireOnboarded(account);
    expect(onboarded.primaryLanguage.id).toBe("lang-1");
    expect(onboarded.primaryLanguage.dailyGoalMinutes).toBe(30);
  });

  it("refuses an account that has not finished setup", () => {
    expect(() =>
      requireOnboarded(user({ primaryLanguage: null, onboardingCompletedAt: null })),
    ).toThrow(OnboardingIncompleteError);
  });

  it("says what is wrong without leaking anything about the account", () => {
    try {
      requireOnboarded(user({ onboardingCompletedAt: null }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe(
        "Finish setting up your language before tracking time.",
      );
    }
  });
});
