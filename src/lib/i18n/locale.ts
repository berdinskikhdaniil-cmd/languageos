/**
 * Which language the interface is drawn in.
 *
 * Two, deliberately: English and Russian. The value is a preference on
 * `users.ui_language` and it is the only source of truth — Telegram's
 * `language_code` is consulted once, when an account is created, and never
 * again.
 *
 * Pure and dependency-free, so it can be imported from a domain module, a
 * server action, a client component or a migration script alike.
 */

export const UI_LANGUAGES = ["en", "ru"] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];

/**
 * What a row gets when nothing better is known: a fresh install, the local
 * development account, a pre-authentication screen. Never a guess about a
 * person — English is the fallback, not a claim.
 */
export const DEFAULT_UI_LANGUAGE: UiLanguage = "en";

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === "string" && (UI_LANGUAGES as readonly string[]).includes(value);
}

/**
 * The BCP 47 tag handed to `Intl`.
 *
 * "en-GB" rather than "en-US": it is the locale the product's dates already use
 * ("11 Aug", not "Aug 11"), and changing it would silently reformat every date
 * a learner has already seen.
 */
const INTL_LOCALES: Record<UiLanguage, string> = {
  en: "en-GB",
  ru: "ru-RU",
};

export function intlLocale(language: UiLanguage): string {
  return INTL_LOCALES[language];
}

/**
 * Telegram's `language_code` read as a starting point, and nothing more.
 *
 * Telegram sends a BCP 47 tag: "ru", "ru-RU", "en", "en-GB", sometimes nothing
 * at all. Only the primary subtag matters here, and only for choosing which of
 * our two interfaces a brand-new account opens in.
 *
 * This is called exactly once per account, from the sign-in path that creates
 * the row. It must never run for a returning user: the moment somebody opens
 * Settings and chooses, `users.ui_language` is the answer, and a Telegram client
 * whose own language differs is not allowed to overrule them at next launch.
 */
export function uiLanguageFromTelegram(code: string | null | undefined): UiLanguage {
  if (typeof code !== "string") return DEFAULT_UI_LANGUAGE;

  const primary = code.trim().toLowerCase().split(/[-_]/)[0];
  return isUiLanguage(primary) ? primary : DEFAULT_UI_LANGUAGE;
}

/**
 * The same reading applied to a browser tag, for the pre-authentication splash
 * where no account is known yet. A presentation hint with nothing behind it.
 */
export function uiLanguageFromBrowser(tags: readonly string[]): UiLanguage {
  for (const tag of tags) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (isUiLanguage(primary)) return primary;
  }
  return DEFAULT_UI_LANGUAGE;
}
