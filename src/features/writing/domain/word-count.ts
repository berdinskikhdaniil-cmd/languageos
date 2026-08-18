/**
 * How many words a submission is.
 *
 * The product is multi-language, so `text.split(" ")` is not a definition of a
 * word — it answers 1 for a Japanese paragraph. `Intl.Segmenter` is the
 * platform's own word breaker and knows that 私は日本語を勉強しています is
 * several words, so it does the work wherever it exists.
 *
 * This is a writing word count for the learner to glance at, not a linguistic
 * measurement, and nothing in the product treats it as one.
 */

/** Counts anything that is a letter, a digit or an ideograph as part of a word. */
const WORDLIKE = /[\p{L}\p{N}]/u;

/**
 * The fallback's idea of a word: a run of letters and digits, with apostrophes
 * and hyphens allowed inside so "don't" and "well-known" stay whole.
 */
const FALLBACK_WORD = /[\p{L}\p{N}]+(?:['’‐-―-][\p{L}\p{N}]+)*/gu;

/**
 * Characters that carry a word each in scripts written without spaces. The
 * fallback would otherwise count a whole Chinese sentence as one word.
 */
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

export function countWords(text: string, locale?: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;

  const segmented = segmentedCount(trimmed, locale);
  return segmented ?? fallbackCount(trimmed);
}

function segmentedCount(text: string, locale?: string): number | null {
  if (typeof Intl?.Segmenter !== "function") return null;

  try {
    // An unknown locale tag would throw; the fallback handles that too.
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      // isWordLike is what separates "word" from spaces and punctuation.
      if (segment.isWordLike) count += 1;
    }
    return count;
  } catch {
    return null;
  }
}

/**
 * Used only where `Intl.Segmenter` is missing or the locale was unusable.
 * Deliberately simple, and deliberately not silently wrong for CJK.
 */
function fallbackCount(text: string): number {
  let count = 0;

  for (const match of text.matchAll(FALLBACK_WORD)) {
    const word = match[0];
    // A run of unspaced script is counted per character rather than as one word.
    count += UNSPACED_SCRIPT.test(word) ? [...word].filter(isWordCharacter).length : 1;
  }

  return count;
}

function isWordCharacter(character: string): boolean {
  return WORDLIKE.test(character);
}
