import { describe, expect, it } from "vitest";
import { formatDuration, formatElapsed, formatSeconds } from "./format";

describe("formatDuration", () => {
  it("formats minutes into hours and minutes", () => {
    expect(formatDuration(272)).toBe("4h 32m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(42)).toBe("42m");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("formatSeconds", () => {
  it("matches the minute-based shape", () => {
    expect(formatSeconds(272 * 60)).toBe("4h 32m");
    expect(formatSeconds(1200)).toBe("20m");
    expect(formatSeconds(0)).toBe("0m");
  });

  it("says <1m rather than 0m for a session that just started", () => {
    expect(formatSeconds(5)).toBe("<1m");
    expect(formatSeconds(59)).toBe("<1m");
    expect(formatSeconds(60)).toBe("1m");
  });
});

describe("formatElapsed", () => {
  it("counts minutes and seconds, adding hours only when needed", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(754)).toBe("12:34");
    expect(formatElapsed(3753)).toBe("1:02:33");
  });

  it("never renders a negative clock", () => {
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
