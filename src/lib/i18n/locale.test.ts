import { describe, expect, it } from "vitest";
import { uiLanguageEnum } from "@/db/schema";
import {
  DEFAULT_UI_LANGUAGE,
  UI_LANGUAGES,
  intlLocale,
  isUiLanguage,
  uiLanguageFromBrowser,
  uiLanguageFromTelegram,
} from "./locale";

describe("which languages the interface speaks", () => {
  it("is exactly two, and English is what nothing-known falls back to", () => {
    expect([...UI_LANGUAGES]).toEqual(["en", "ru"]);
    expect(DEFAULT_UI_LANGUAGE).toBe("en");
  });

  it("accepts only those two", () => {
    expect(isUiLanguage("en")).toBe(true);
    expect(isUiLanguage("ru")).toBe(true);

    for (const value of ["de", "RU", "ru-RU", "", " ", null, undefined, 7, {}]) {
      expect(isUiLanguage(value)).toBe(false);
    }
  });

  it("matches the enum the column is typed with", () => {
    // A value in one and not the other would be a row the app cannot render or
    // a preference the database refuses to store.
    expect([...uiLanguageEnum.enumValues]).toEqual([...UI_LANGUAGES]);
  });

  it("keeps the product's existing date locale for English", () => {
    // "11 Aug", not "Aug 11" — changing this reformats every date already seen.
    expect(intlLocale("en")).toBe("en-GB");
    expect(intlLocale("ru")).toBe("ru-RU");
  });
});

describe("the hint Telegram gives a brand-new account", () => {
  it("reads a Russian client as Russian, however the tag is written", () => {
    for (const tag of ["ru", "ru-RU", "ru_RU", "RU", " ru ", "ru-UA"]) {
      expect(uiLanguageFromTelegram(tag)).toBe("ru");
    }
  });

  it("reads everything else as English", () => {
    for (const tag of ["en", "en-GB", "de", "uk", "be", "kk", "zh-Hans", "rus", "russian"]) {
      expect(uiLanguageFromTelegram(tag)).toBe("en");
    }
  });

  it("reads a missing tag as English rather than guessing", () => {
    expect(uiLanguageFromTelegram(null)).toBe("en");
    expect(uiLanguageFromTelegram(undefined)).toBe("en");
    expect(uiLanguageFromTelegram("")).toBe("en");
  });

  it("never answers with anything that is not a supported language", () => {
    for (const tag of ["", "??", "x-klingon", "ru-RU-x-private"]) {
      expect(isUiLanguage(uiLanguageFromTelegram(tag))).toBe(true);
    }
  });
});

describe("the hint a browser gives before anybody is signed in", () => {
  it("takes the first tag it understands", () => {
    expect(uiLanguageFromBrowser(["ru-RU", "en-US"])).toBe("ru");
    expect(uiLanguageFromBrowser(["en-US", "ru-RU"])).toBe("en");
    expect(uiLanguageFromBrowser(["de-DE", "ru"])).toBe("ru");
  });

  it("falls back to English when it understands none of them", () => {
    expect(uiLanguageFromBrowser(["de-DE", "fr-FR"])).toBe("en");
    expect(uiLanguageFromBrowser([])).toBe("en");
  });
});
