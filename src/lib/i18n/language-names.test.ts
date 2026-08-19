import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "@/features/onboarding/domain/languages";
import { UI_LANGUAGES } from "./locale";
import { displayLanguageName } from "./language-names";

/**
 * The language being learned, named for whoever is reading.
 *
 * `Intl.DisplayNames` does the translating, so the test's job is the contract
 * around it: nothing stored changes, nothing comes back empty, and no code in
 * the picker falls through to something unreadable.
 */

describe("naming the language being learned", () => {
  it("keeps our own English names in the English interface", () => {
    // Not CLDR's — it calls Bengali "Bangla", and the name in the picker, in
    // the header and in the stored row should not disagree with each other.
    expect(displayLanguageName("de", "German", "en")).toBe("German");
    expect(displayLanguageName("bn", "Bengali", "en")).toBe("Bengali");
  });

  it("translates in the Russian interface, capitalised as a label", () => {
    expect(displayLanguageName("en", "English", "ru")).toBe("Английский");
    expect(displayLanguageName("de", "German", "ru")).toBe("Немецкий");
    expect(displayLanguageName("ru", "Russian", "ru")).toBe("Русский");
  });

  it("handles the languages whose names are least like their codes", () => {
    expect(displayLanguageName("zh", "Chinese", "ru")).toBe("Китайский");
    expect(displayLanguageName("ja", "Japanese", "ru")).toBe("Японский");
    expect(displayLanguageName("ko", "Korean", "ru")).toBe("Корейский");
    expect(displayLanguageName("he", "Hebrew", "ru")).toBe("Иврит");
    expect(displayLanguageName("ka", "Georgian", "ru")).toBe("Грузинский");
  });

  it("falls back to the stored English name for a code nobody knows", () => {
    expect(displayLanguageName("zz", "Fictional", "ru")).toBe("Fictional");
    expect(displayLanguageName("", "Fictional", "ru")).toBe("Fictional");
  });

  it("gives every supported language a non-empty name in every interface", () => {
    for (const language of UI_LANGUAGES) {
      for (const supported of SUPPORTED_LANGUAGES) {
        const name = displayLanguageName(supported.code, supported.name, language);
        expect(name.trim(), `${language}/${supported.code}`).not.toBe("");
        // A bare code on screen would mean the lookup silently failed.
        expect(name, `${language}/${supported.code}`).not.toBe(supported.code);
      }
    }
  });

  it("never returns a lowercase first letter, in either interface", () => {
    for (const language of UI_LANGUAGES) {
      for (const supported of SUPPORTED_LANGUAGES) {
        const [first] = [...displayLanguageName(supported.code, supported.name, language)];
        expect(first, `${language}/${supported.code}`).toBe(first?.toLocaleUpperCase());
      }
    }
  });
});
