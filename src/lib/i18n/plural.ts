import { intlLocale, type UiLanguage } from "./locale";

/**
 * Plural forms, from the platform rather than from a table of our own.
 *
 * Russian needs three forms where English needs two — 1 слово, 2 слова, 5 слов,
 * and 21 слово back to the first again — and the rule that picks between them
 * is not something to reimplement by hand. `Intl.PluralRules` already knows it,
 * for every locale, so the dictionaries supply the words and the platform
 * supplies the arithmetic.
 *
 * Deliberately tiny. This is not a message-format implementation and must not
 * grow into one: two languages and a handful of counted nouns.
 */

/** `Intl.PluralRules` construction is not free, and the set of locales is two. */
const CACHE = new Map<string, Intl.PluralRules>();

function rulesFor(locale: string): Intl.PluralRules {
  const cached = CACHE.get(locale);
  if (cached) return cached;

  const rules = new Intl.PluralRules(locale);
  CACHE.set(locale, rules);
  return rules;
}

/**
 * The forms a dictionary may supply. `other` is required and is what a category
 * the language does not distinguish falls back to — for English that is the
 * plural, for Russian the genitive plural.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function pluralForm(language: UiLanguage, count: number, forms: PluralForms): string {
  const category = rulesFor(intlLocale(language)).select(count);
  return forms[category] ?? forms.other;
}

/** "29 words" / "29 слов" — the count and its noun, already joined. */
export function pluralize(language: UiLanguage, count: number, forms: PluralForms): string {
  return `${count} ${pluralForm(language, count, forms)}`;
}
