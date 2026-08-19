import { intlLocale, type UiLanguage } from "./locale";

/**
 * What the language somebody is *learning* is called in the language they are
 * *reading*.
 *
 * Two different things, and keeping them apart is the whole point: an English
 * interface says "German", a Russian one says "Немецкий", and
 * `user_languages.language_code` says `de` in both. The stored code and the
 * stored English name are never touched by anything here.
 *
 * The names come from `Intl.DisplayNames`, which is CLDR data the platform
 * already ships — fifty languages translated by hand would be fifty chances to
 * be wrong, and a new row in the picker would need a translation before it could
 * appear. English keeps using our own curated name instead of CLDR's, so no
 * existing label shifts under anyone (CLDR calls Bengali "Bangla"), and it is
 * the fallback whenever the platform has nothing to say.
 */

const CACHE = new Map<string, Intl.DisplayNames | null>();

function displayNamesFor(locale: string): Intl.DisplayNames | null {
  if (CACHE.has(locale)) return CACHE.get(locale) ?? null;

  let instance: Intl.DisplayNames | null = null;
  try {
    instance = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
  } catch {
    // An engine without DisplayNames. The curated English name still works.
    instance = null;
  }

  CACHE.set(locale, instance);
  return instance;
}

/**
 * CLDR gives language names lowercase in Russian ("немецкий"), because that is
 * how they appear mid-sentence. Ours are labels — a row in a picker, a line
 * under the learner's name — so the first letter is raised.
 *
 * Split by code point rather than by index, so a script outside the BMP is not
 * cut in half.
 */
function capitalise(value: string): string {
  const [first, ...rest] = [...value];
  if (first === undefined) return value;
  return first.toLocaleUpperCase() + rest.join("");
}

/**
 * The display name, or `fallbackName` when the platform does not know the code.
 *
 * `fallbackName` is the curated English name from the language list — the value
 * already stored on the row — so this can never return an empty label.
 */
export function displayLanguageName(
  code: string,
  fallbackName: string,
  language: UiLanguage,
): string {
  if (language === "en") return fallbackName;

  let resolved: string | undefined;
  try {
    resolved = displayNamesFor(intlLocale(language))?.of(code);
  } catch {
    // `of` throws RangeError on anything that is not a well-formed tag — an
    // empty string, a code with a typo. The stored name still works.
    return fallbackName;
  }

  // `of` returns undefined under `fallback: "none"`, and can return the code
  // itself on some engines; neither is a name worth showing.
  if (!resolved || resolved === code) return fallbackName;

  return capitalise(resolved);
}
