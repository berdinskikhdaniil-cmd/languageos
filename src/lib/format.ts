import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "./i18n/locale";
import { getMessages } from "./i18n/messages";

/**
 * How the product writes durations, changes and clocks.
 *
 * Everything that has words in it takes the interface language, and the words
 * themselves come from the dictionary rather than from a template here — "4h
 * 32m" and "4 ч 32 мин" differ by more than a translation table would suggest.
 * The language is defaulted rather than required so a caller with nothing to say
 * about it still gets a sensible string, but every call site inside the product
 * passes the learner's own.
 *
 * Timezone-dependent formatting is not here: whether something happened "today"
 * is a question only the learner's zone can answer, and that lives in lib/time.
 */

/** Minutes → "4h 32m" / "1h" / "42m". The unit the whole product counts in. */
export function formatDuration(
  totalMinutes: number,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): string {
  const { units } = getMessages(language);
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return units.minutes(remainder);
  if (remainder === 0) return units.hours(hours);
  return `${units.hours(hours)} ${units.minutes(remainder)}`;
}

/** "+18%" / "-22%" / "0%" — for changes read alongside their own metric. */
export function formatPercentSigned(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded)}%`;
}

/** "Up 18%" / "Down 22%" — for changes that open a sentence. */
export function formatPercentWorded(
  value: number,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): string {
  const { change } = getMessages(language);
  const rounded = Math.round(value);
  if (rounded === 0) return change.none;

  const percent = `${Math.abs(rounded)}%`;
  return rounded > 0 ? change.up(percent) : change.down(percent);
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

/**
 * Seconds → the same "4h 32m" shape the rest of the product uses.
 *
 * Anything above zero but below a minute reads "<1m" rather than "0m", so a
 * freshly started session never shows a filled chart next to a zero.
 */
export function formatSeconds(
  totalSeconds: number,
  language: UiLanguage = DEFAULT_UI_LANGUAGE,
): string {
  if (totalSeconds > 0 && totalSeconds < 60) return getMessages(language).units.underAMinute;
  return formatDuration(totalSeconds / 60, language);
}

/**
 * A running timer: "12:34", or "1:02:33" once it passes an hour.
 *
 * Digits and colons only, so it reads the same in every language — and it is
 * updated every second, which is not the moment to look anything up.
 */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
