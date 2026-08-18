import { describe, expect, it } from "vitest";
import {
  formatTimeInZone,
  formatTimeZoneLabel,
  isValidTimeZone,
  listTimeZones,
  normaliseTimeZone,
} from "./timezone";

describe("isValidTimeZone", () => {
  it("accepts real IANA identifiers", () => {
    for (const zone of [
      "Europe/Amsterdam",
      "Europe/Moscow",
      "America/New_York",
      "America/Argentina/Buenos_Aires",
      "Asia/Tokyo",
      "UTC",
    ]) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it("rejects a fixed offset, even one the platform understands", () => {
    // An offset cannot follow a daylight-saving change, so storing one would
    // put a learner's evening on the wrong day twice a year.
    for (const value of ["+02:00", "-05:00", "UTC+2", "GMT+3", "+0200"]) {
      expect(isValidTimeZone(value)).toBe(false);
    }
  });

  it("rejects places that do not exist", () => {
    for (const value of ["Mars/Phobos", "Europe/Atlantis", "Not A Zone"]) {
      expect(isValidTimeZone(value)).toBe(false);
    }
  });

  it("rejects empty, oversized and non-string input", () => {
    for (const value of ["", "   ", "A".repeat(200), null, undefined, 7, {}, ["Europe/Paris"]]) {
      expect(isValidTimeZone(value)).toBe(false);
    }
  });

  it("rejects an injection attempt rather than passing it to the platform", () => {
    expect(isValidTimeZone("Europe/Paris'; drop table users; --")).toBe(false);
  });
});

describe("normaliseTimeZone", () => {
  it("keeps a canonical identifier as it is", () => {
    expect(normaliseTimeZone("Europe/Amsterdam")).toBe("Europe/Amsterdam");
  });

  it("settles on one spelling whatever case the device reports", () => {
    expect(normaliseTimeZone("europe/amsterdam")).toBe("Europe/Amsterdam");
  });

  it("trims what a form hands over", () => {
    expect(normaliseTimeZone("  Asia/Tokyo  ")).toBe("Asia/Tokyo");
  });

  it("answers null for anything it will not store", () => {
    expect(normaliseTimeZone("+02:00")).toBeNull();
    expect(normaliseTimeZone("nonsense")).toBeNull();
  });
});

describe("the picker's list", () => {
  it("offers real zones, and enough of them to find yourself", () => {
    const zones = listTimeZones();
    expect(zones.length).toBeGreaterThan(50);
    expect(zones).toContain("Europe/Amsterdam");
    for (const zone of zones.slice(0, 25)) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });
});

describe("presentation", () => {
  it("reads a zone as words rather than a path", () => {
    expect(formatTimeZoneLabel("America/New_York")).toBe("America · New York");
    expect(formatTimeZoneLabel("UTC")).toBe("UTC");
  });

  it("shows the local clock in a zone", () => {
    const noonUtc = new Date("2026-08-18T12:00:00Z");
    expect(formatTimeInZone("UTC", noonUtc)).toBe("12:00");
    expect(formatTimeInZone("Europe/Moscow", noonUtc)).toBe("15:00");
    expect(formatTimeInZone("Mars/Phobos", noonUtc)).toBeNull();
  });
});
