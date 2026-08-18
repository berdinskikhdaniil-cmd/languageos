import { describe, expect, it } from "vitest";
import { validateOnboardingSubmission } from "./submission";

const VALID = { languageCode: "nl", timeZone: "Europe/Amsterdam", dailyGoalMinutes: 30 };

describe("a complete submission", () => {
  it("passes, and looks the language name up on the server", () => {
    const result = validateOnboardingSubmission(VALID);

    expect(result).toEqual({
      ok: true,
      value: {
        language: { code: "nl", name: "Dutch" },
        timeZone: "Europe/Amsterdam",
        dailyGoalMinutes: 30,
      },
    });
  });

  it("normalises what the client sent rather than storing it raw", () => {
    const result = validateOnboardingSubmission({
      languageCode: " DE ",
      timeZone: " europe/berlin ",
      dailyGoalMinutes: 60,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        language: { code: "de", name: "German" },
        timeZone: "Europe/Berlin",
        dailyGoalMinutes: 60,
      },
    });
  });
});

describe("an unusable language", () => {
  it("is refused, whatever shape it arrives in", () => {
    for (const languageCode of ["", "other", "xx", "klingon", null, 5, {}]) {
      const result = validateOnboardingSubmission({ ...VALID, languageCode });
      expect(result).toMatchObject({ ok: false, field: "language" });
    }
  });

  it("cannot smuggle its own display name in", () => {
    const result = validateOnboardingSubmission({
      ...VALID,
      // Extra keys are simply not read: the name comes from our list.
      languageCode: "en",
      languageName: "Definitely Not English",
    } as never);

    expect(result).toMatchObject({ ok: true, value: { language: { name: "English" } } });
  });
});

describe("an unusable timezone", () => {
  it("is refused, including a plausible-looking offset", () => {
    for (const timeZone of ["", "UTC+2", "+02:00", "Mars/Phobos", null, 3]) {
      const result = validateOnboardingSubmission({ ...VALID, timeZone });
      expect(result).toMatchObject({ ok: false, field: "timezone" });
    }
  });
});

describe("an unusable goal", () => {
  it("is refused above and below what the database will hold", () => {
    for (const dailyGoalMinutes of [0, -30, 4, 601, 100000]) {
      const result = validateOnboardingSubmission({ ...VALID, dailyGoalMinutes });
      expect(result).toMatchObject({ ok: false, field: "goal" });
    }
  });

  it("is refused when it is not a whole number of minutes", () => {
    for (const dailyGoalMinutes of [30.5, NaN, Infinity, "30", null, undefined]) {
      const result = validateOnboardingSubmission({ ...VALID, dailyGoalMinutes });
      expect(result).toMatchObject({ ok: false, field: "goal" });
    }
  });

  it("accepts a value inside the range that is not one of the four buttons", () => {
    // The buttons are a UI decision; the rule is the range.
    expect(validateOnboardingSubmission({ ...VALID, dailyGoalMinutes: 25 })).toMatchObject({
      ok: true,
    });
  });
});

describe("the order things are checked in", () => {
  it("reports the earliest problem, so the flow can return to that step", () => {
    const result = validateOnboardingSubmission({
      languageCode: "xx",
      timeZone: "nope",
      dailyGoalMinutes: 0,
    });

    expect(result).toMatchObject({ ok: false, field: "language" });
  });
});
