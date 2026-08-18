/** Minutes → "4h 32m" / "1h" / "42m". The unit the whole product counts in. */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

/** "+18%" / "-22%" / "0%" — for changes read alongside their own metric. */
export function formatPercentSigned(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded)}%`;
}

/** "Up 18%" / "Down 22%" — for changes that open a sentence. */
export function formatPercentWorded(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "No change";
  return `${rounded > 0 ? "Up" : "Down"} ${Math.abs(rounded)}%`;
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
export function formatSeconds(totalSeconds: number): string {
  if (totalSeconds > 0 && totalSeconds < 60) return "<1m";
  return formatDuration(totalSeconds / 60);
}

/** A running timer: "12:34", or "1:02:33" once it passes an hour. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
