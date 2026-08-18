/**
 * Environment reading, in one place so nothing else has to guess whether a
 * variable exists. Throws loudly rather than connecting to the wrong database.
 */

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
