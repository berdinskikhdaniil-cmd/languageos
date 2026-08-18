import { describe, expect, it } from "vitest";
import {
  POPULAR_LANGUAGES,
  SUPPORTED_LANGUAGES,
  findSupportedLanguage,
  isSupportedLanguageCode,
  searchLanguages,
} from "./languages";

describe("the supported list", () => {
  it("offers every language the first screen promises", () => {
    const names = POPULAR_LANGUAGES.map((language) => language.name);
    expect(names).toEqual([
      "English",
      "Spanish",
      "German",
      "French",
      "Italian",
      "Portuguese",
      "Dutch",
      "Polish",
      "Russian",
      "Ukrainian",
      "Turkish",
      "Arabic",
      "Chinese",
      "Japanese",
      "Korean",
    ]);
  });

  it("has no duplicate codes — a code is written into rows and must be unique", () => {
    const codes = SUPPORTED_LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses lowercase ISO 639-1 codes throughout", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(language.code).toMatch(/^[a-z]{2}$/);
      expect(language.name.trim()).not.toBe("");
    }
  });

  it("reaches beyond the popular fifteen", () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(POPULAR_LANGUAGES.length);
  });
});

describe("findSupportedLanguage", () => {
  it("resolves a code to its stored name", () => {
    expect(findSupportedLanguage("nl")).toMatchObject({ code: "nl", name: "Dutch" });
  });

  it("tolerates case and surrounding space from a client", () => {
    expect(findSupportedLanguage("  DE ")?.name).toBe("German");
  });

  it("refuses anything that is not on the list", () => {
    for (const value of ["other", "xx", "", "en-GB", "eng", null, undefined, 42, {}]) {
      expect(findSupportedLanguage(value)).toBeNull();
      expect(isSupportedLanguageCode(value)).toBe(false);
    }
  });
});

describe("searchLanguages", () => {
  it("shows the popular ones before anyone types", () => {
    expect(searchLanguages("")).toEqual(POPULAR_LANGUAGES);
    expect(searchLanguages("   ")).toEqual(POPULAR_LANGUAGES);
  });

  it("finds a language by its English name", () => {
    expect(searchLanguages("germ").map((language) => language.code)).toEqual(["de"]);
  });

  it("finds a language by what its speakers call it", () => {
    expect(searchLanguages("deutsch").map((language) => language.code)).toEqual(["de"]);
    expect(searchLanguages("español").map((language) => language.code)).toEqual(["es"]);
  });

  it("ignores accents typed either way round", () => {
    expect(searchLanguages("espanol").map((language) => language.code)).toEqual(["es"]);
    expect(searchLanguages("francais").map((language) => language.code)).toEqual(["fr"]);
  });

  it("reaches a language that is not on the first screen", () => {
    expect(searchLanguages("georgian").map((language) => language.code)).toEqual(["ka"]);
  });

  it("returns nothing rather than a wrong guess", () => {
    expect(searchLanguages("klingon")).toEqual([]);
  });
});
