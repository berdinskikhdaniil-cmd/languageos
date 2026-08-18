import { describe, expect, it } from "vitest";
import { localDateLabel } from "./time";

const AMSTERDAM = "Europe/Amsterdam";

describe("a date in a list", () => {
  const now = new Date("2026-08-18T09:00:00Z");

  it("says today for today, in the learner's own zone", () => {
    expect(localDateLabel(new Date("2026-08-18T05:00:00Z"), AMSTERDAM, now)).toBe("Today");
  });

  it("says yesterday for yesterday", () => {
    expect(localDateLabel(new Date("2026-08-17T20:00:00Z"), AMSTERDAM, now)).toBe("Yesterday");
  });

  it("gives a short date for anything older", () => {
    expect(localDateLabel(new Date("2026-08-11T10:00:00Z"), AMSTERDAM, now)).toBe("11 Aug");
  });

  it("adds the year only when it is not this one", () => {
    // "Sept" is en-GB's own abbreviation, the same locale the weekday names use.
    expect(localDateLabel(new Date("2025-09-03T10:00:00Z"), AMSTERDAM, now)).toBe("3 Sept 2025");
  });

  it("answers in the learner's zone, not the server's", () => {
    // 23:30 UTC is already the next day in Amsterdam, and still yesterday in
    // New York. The same instant is a different day to different learners.
    const lateUtc = new Date("2026-08-17T23:30:00Z");
    expect(localDateLabel(lateUtc, AMSTERDAM, now)).toBe("Today");
    expect(localDateLabel(lateUtc, "America/New_York", now)).toBe("Yesterday");
  });
});
