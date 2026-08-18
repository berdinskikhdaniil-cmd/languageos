/**
 * What counts as "this machine".
 *
 * Two unrelated decisions need the same answer — a URL Telegram must never be
 * asked to open, and a database a destructive development script may touch —
 * and both are safety rules, so the list lives in one place rather than being
 * copied and drifting apart.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}
