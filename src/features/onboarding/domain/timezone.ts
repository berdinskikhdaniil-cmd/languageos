/**
 * Timezone validation, shared by the picker and by the server.
 *
 * Telegram does not tell us where the learner is, so onboarding reads the
 * device's own zone and asks them to confirm it. That makes the value
 * client-supplied, and client-supplied values are checked here before they
 * reach a column every day and week boundary is later computed from.
 *
 * Only real IANA identifiers are accepted. A fixed offset like "+02:00" is
 * rejected even though the platform happens to understand it: an offset cannot
 * follow a daylight-saving change, so a learner who stored one would silently
 * start logging into the wrong day twice a year.
 */

/**
 * "Europe/Amsterdam", "America/Argentina/Buenos_Aires", "UTC".
 *
 * Must start with a letter, which is what rules out "+02:00" and "-05:00".
 */
const IANA_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

const MAX_LENGTH = 64;

/**
 * Whether the platform can resolve this as a zone, and whether it looks like an
 * identifier rather than an offset.
 */
export function isValidTimeZone(value: unknown): value is string {
  return normaliseTimeZone(value) !== null;
}

/**
 * The canonical spelling of a valid zone, or null.
 *
 * Devices report zones in whatever case their platform likes; storing what
 * `Intl` resolves keeps one spelling in the database.
 */
export function normaliseTimeZone(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (candidate === "" || candidate.length > MAX_LENGTH) return null;
  if (!IANA_SHAPE.test(candidate)) return null;

  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    // RangeError: the platform has never heard of it.
    return null;
  }
}

/**
 * The zone this device thinks it is in, or null when the browser will not say.
 *
 * Null is a real answer and the caller must handle it by asking — never by
 * quietly falling back to the server's zone or to DEFAULT_TIMEZONE, which would
 * hand somebody a streak computed in a country they have never been to.
 */
export function detectTimeZone(): string | null {
  try {
    return normaliseTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

/**
 * Every zone this platform knows, for the manual picker.
 *
 * `Intl.supportedValuesOf` is platform data, so the picker costs no dependency
 * and no bundled table. Where it is missing the picker still works — it just
 * offers the shorter list below.
 */
export function listTimeZones(): readonly string[] {
  try {
    const supported = Intl.supportedValuesOf("timeZone");
    if (supported.length > 0) return supported;
  } catch {
    // Older engine without supportedValuesOf.
  }
  return FALLBACK_TIME_ZONES;
}

/** Enough of the world to find yourself when the platform offers no list. */
const FALLBACK_TIME_ZONES: readonly string[] = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Almaty",
  "Asia/Baku",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tbilisi",
  "Asia/Tokyo",
  "Asia/Yerevan",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Belgrade",
  "Europe/Berlin",
  "Europe/Bucharest",
  "Europe/Budapest",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Prague",
  "Europe/Riga",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Tallinn",
  "Europe/Vienna",
  "Europe/Vilnius",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "UTC",
];

/** "Europe/Amsterdam" → "Europe · Amsterdam", for a list that has to be read. */
export function formatTimeZoneLabel(zone: string): string {
  return zone.split("/").join(" · ").replace(/_/g, " ");
}

/** The local clock in a zone, e.g. "14:32". Reassures more than the name does. */
export function formatTimeInZone(zone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return null;
  }
}
