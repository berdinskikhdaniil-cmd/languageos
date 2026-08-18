/**
 * Applies pending Drizzle migrations. The one migration entry point.
 *
 * Two callers, same code:
 *   `npm run db:migrate`         — this machine, against the local database
 *   `npm run db:migrate:deploy`  — the Vercel production build, before `next build`
 *
 * It does not seed, reset or delete anything: Drizzle records what it has run in
 * `drizzle.__drizzle_migrations` and applies only what is newer, so running it
 * twice is a no-op. All pending migrations go in one transaction, so a failure
 * halfway leaves the schema as it was.
 *
 * Exits non-zero on any failure. In a build that fails the build, which is the
 * point: code expecting a schema it did not get must never reach production.
 *
 * The connection string is never printed, and anything URL-shaped is stripped
 * from an error before it reaches a build log.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { readDeploymentEnvironment, shouldRunDeploymentMigration } from "@/db/env";

const MIGRATIONS_FOLDER = "./drizzle";
const CONNECT_TIMEOUT_MS = 15_000;

function log(message: string): void {
  console.log(`[migrate] ${message}`);
}

function fail(message: string): never {
  console.error(`[migrate] ${message}`);
  process.exit(1);
}

/** A connection string must never reach a log, however an error phrases it. */
function sanitize(text: string): string {
  const withoutUrls = text.replace(/postgres(ql)?:\/\/\S+/gi, "<connection string redacted>");
  const url = process.env.DATABASE_URL;
  return url ? withoutUrls.split(url).join("<connection string redacted>") : withoutUrls;
}

/** How many migrations the database has recorded. Absent table means none. */
async function recordedCount(pool: Pool): Promise<number> {
  try {
    const { rows } = await pool.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations",
    );
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const decision = shouldRunDeploymentMigration(readDeploymentEnvironment());
  if (!decision.run) {
    log(`skipped — ${decision.reason}`);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail("DATABASE_URL is not set, so there is no database to migrate.");

  // A pool of one: this process makes a single short-lived connection and exits.
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });

  try {
    const before = await recordedCount(pool);
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    const after = await recordedCount(pool);

    if (after === before) {
      log(`no migrations to apply (${after} already applied)`);
    } else {
      log(`applied ${after - before} migration(s); ${after} now applied`);
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

/** Drizzle wraps a driver error, so the reason is one level down. Keep both. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  const causeMessage = cause instanceof Error ? cause.message : undefined;
  return causeMessage ? `${error.message} — ${causeMessage}` : error.message;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    fail(`failed: ${sanitize(describe(error))}`);
  });
