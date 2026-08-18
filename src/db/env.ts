/**
 * Environment reading, in one place so nothing else has to guess whether a
 * variable exists. Throws loudly rather than connecting to the wrong database.
 */

import { isLocalHostname } from "@/lib/host";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start the database with `npm run db:up`.",
    );
  }
  return url;
}

/** Timezone handed to users created before we know their real one. */
export function defaultTimezone(): string {
  return process.env.DEFAULT_TIMEZONE ?? "UTC";
}

/**
 * Which database a URL points at.
 *
 * "development" means the Postgres running on this machine — the Docker
 * container from `docker-compose.yml`. Anything else is somebody's real data,
 * whether or not it is the production project.
 */
export type DatabaseTarget = "development" | "remote";

export function classifyDatabaseUrl(url: string): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unreadable is not a licence to assume it is safe to destroy.
    return "remote";
  }
  return isLocalHostname(parsed.hostname) ? "development" : "remote";
}

/**
 * The gate in front of every script that deletes or rewrites rows.
 *
 * There is now a real production database one environment variable away, so a
 * destructive script refuses to run unless it can see for itself that the
 * target is local. Two independent conditions must hold — a local host *and* a
 * non-production NODE_ENV — for the same reason the auth bypass needs two.
 */
export function assertDevelopmentDatabase(operation: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Refusing to run ${operation}: NODE_ENV is production.`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(`Refusing to run ${operation}: DATABASE_URL is not set.`);
  }

  if (classifyDatabaseUrl(url) !== "development") {
    throw new Error(
      `Refusing to run ${operation}: DATABASE_URL does not point at a local development database. ` +
        "This script deletes data and must never reach production.",
    );
  }
}
