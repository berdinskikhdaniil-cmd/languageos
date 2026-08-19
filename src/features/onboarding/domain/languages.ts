/**
 * Every language a learner can pick, in one place.
 *
 * The list is the product's own — not Telegram's, not the browser's. Codes are
 * ISO 639-1, which is what `user_languages.language_code` already stores, and a
 * code is the only thing a client is ever trusted to send: the display name is
 * looked up here on the server, so a stored name can never be forged or drift.
 *
 * Adding a language means adding a line. There is deliberately no "Other"
 * escape hatch — a made-up code would be a row nothing downstream can reason
 * about, and an empty name in the header.
 */

export type SupportedLanguage = {
  /** ISO 639-1. Stable: it is written into rows and never renamed. */
  code: string;
  /** English endonym-free name, shown in the picker and the header. */
  name: string;
  /**
   * The learner's own name for it, used only to widen search — someone typing
   * "Deutsch" or "Español" should find the row.
   */
  aliases?: readonly string[];
};

/**
 * The languages offered before anyone types. Ordered by how often we expect
 * them, not alphabetically: the point of a first screen is a short scan.
 */
export const POPULAR_LANGUAGE_CODES = [
  "en",
  "es",
  "de",
  "fr",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "ar",
  "zh",
  "ja",
  "ko",
] as const;

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish", aliases: ["español", "espanol", "castellano"] },
  { code: "de", name: "German", aliases: ["deutsch"] },
  { code: "fr", name: "French", aliases: ["français", "francais"] },
  { code: "it", name: "Italian", aliases: ["italiano"] },
  { code: "pt", name: "Portuguese", aliases: ["português", "portugues", "brazilian"] },
  { code: "nl", name: "Dutch", aliases: ["nederlands", "flemish"] },
  { code: "pl", name: "Polish", aliases: ["polski"] },
  { code: "ru", name: "Russian", aliases: ["русский", "russkiy"] },
  { code: "uk", name: "Ukrainian", aliases: ["українська", "ukrainska"] },
  { code: "tr", name: "Turkish", aliases: ["türkçe", "turkce"] },
  { code: "ar", name: "Arabic", aliases: ["عربي", "arabiy"] },
  { code: "zh", name: "Chinese", aliases: ["mandarin", "中文", "putonghua"] },
  { code: "ja", name: "Japanese", aliases: ["日本語", "nihongo"] },
  { code: "ko", name: "Korean", aliases: ["한국어", "hangugeo"] },

  // Reachable through search. Not on the first screen, but real rows — an
  // extensible list beats a fake "Other".
  { code: "sv", name: "Swedish", aliases: ["svenska"] },
  { code: "no", name: "Norwegian", aliases: ["norsk", "bokmål", "bokmal"] },
  { code: "da", name: "Danish", aliases: ["dansk"] },
  { code: "fi", name: "Finnish", aliases: ["suomi"] },
  { code: "is", name: "Icelandic", aliases: ["íslenska", "islenska"] },
  { code: "cs", name: "Czech", aliases: ["čeština", "cestina"] },
  { code: "sk", name: "Slovak", aliases: ["slovenčina", "slovencina"] },
  { code: "sl", name: "Slovenian", aliases: ["slovenščina"] },
  { code: "hr", name: "Croatian", aliases: ["hrvatski"] },
  { code: "sr", name: "Serbian", aliases: ["српски", "srpski"] },
  { code: "bg", name: "Bulgarian", aliases: ["български"] },
  { code: "ro", name: "Romanian", aliases: ["română", "romana"] },
  { code: "hu", name: "Hungarian", aliases: ["magyar"] },
  { code: "el", name: "Greek", aliases: ["ελληνικά", "ellinika"] },
  { code: "lt", name: "Lithuanian", aliases: ["lietuvių"] },
  { code: "lv", name: "Latvian", aliases: ["latviešu"] },
  { code: "et", name: "Estonian", aliases: ["eesti"] },
  { code: "ca", name: "Catalan", aliases: ["català", "catala"] },
  { code: "ga", name: "Irish", aliases: ["gaeilge"] },
  { code: "cy", name: "Welsh", aliases: ["cymraeg"] },
  { code: "he", name: "Hebrew", aliases: ["עברית", "ivrit"] },
  { code: "fa", name: "Persian", aliases: ["farsi", "فارسی"] },
  { code: "hi", name: "Hindi", aliases: ["हिन्दी"] },
  { code: "ur", name: "Urdu", aliases: ["اردو"] },
  { code: "bn", name: "Bengali", aliases: ["বাংলা", "bangla"] },
  { code: "ta", name: "Tamil", aliases: ["தமிழ்"] },
  { code: "id", name: "Indonesian", aliases: ["bahasa indonesia"] },
  { code: "ms", name: "Malay", aliases: ["bahasa melayu"] },
  { code: "vi", name: "Vietnamese", aliases: ["tiếng việt", "tieng viet"] },
  { code: "th", name: "Thai", aliases: ["ไทย"] },
  { code: "sw", name: "Swahili", aliases: ["kiswahili"] },
  { code: "ka", name: "Georgian", aliases: ["ქართული"] },
  { code: "hy", name: "Armenian", aliases: ["հայերեն"] },
  { code: "az", name: "Azerbaijani", aliases: ["azərbaycan"] },
  { code: "kk", name: "Kazakh", aliases: ["қазақша"] },
  { code: "uz", name: "Uzbek", aliases: ["o‘zbek", "ozbek"] },
];

const BY_CODE = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));

/** The languages shown before anyone searches, in the order declared above. */
export const POPULAR_LANGUAGES: readonly SupportedLanguage[] = POPULAR_LANGUAGE_CODES.map(
  (code) => {
    const language = BY_CODE.get(code);
    // A typo in POPULAR_LANGUAGE_CODES should fail loudly at import, not draw
    // an empty row on the first screen a new learner ever sees.
    if (!language) throw new Error(`Unknown popular language code: ${code}`);
    return language;
  },
);

export function findSupportedLanguage(code: unknown): SupportedLanguage | null {
  if (typeof code !== "string") return null;
  return BY_CODE.get(code.trim().toLowerCase()) ?? null;
}

export function isSupportedLanguageCode(code: unknown): code is string {
  return findSupportedLanguage(code) !== null;
}

/**
 * Case- and accent-insensitive search over names, aliases and the code itself.
 * An empty query means "show the popular ones", not "show all 50".
 *
 * `displayName` is optional and is how the reader's own language joins the
 * search: the picker passes the localised name, so a Russian interface finds
 * "Немецкий" as readily as "German" or "Deutsch". It is a presentation concern
 * injected by the caller rather than a second list here, because this module's
 * business is the codes and the English names that get stored.
 */
export function searchLanguages(
  query: string,
  displayName?: (language: SupportedLanguage) => string,
): readonly SupportedLanguage[] {
  const needle = normalise(query);
  if (needle === "") return POPULAR_LANGUAGES;

  return SUPPORTED_LANGUAGES.filter((language) => {
    if (language.code === needle) return true;
    if (normalise(language.name).includes(needle)) return true;
    if (displayName && normalise(displayName(language)).includes(needle)) return true;
    return (language.aliases ?? []).some((alias) => normalise(alias).includes(needle));
  });
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
