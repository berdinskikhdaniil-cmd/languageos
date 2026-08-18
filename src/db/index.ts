import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "./env";
import * as schema from "./schema";

/**
 * One pool per process. Next.js reloads modules in development, so the pool is
 * stashed on globalThis to avoid leaking a connection pool per hot reload.
 */
const globalForDb = globalThis as unknown as { languageOsPool?: Pool };

/**
 * Serverless runs many short-lived instances, each with a pool of its own, and
 * one instance serves only a handful of concurrent requests. A large per-
 * instance pool therefore buys nothing and multiplies straight into the
 * provider's connection limit, so production keeps it small and leans on the
 * provider's own pooler in front of Postgres. A single local dev process can
 * afford more.
 */
const MAX_POOL_CLIENTS = process.env.NODE_ENV === "production" ? 4 : 10;

const pool =
  globalForDb.languageOsPool ??
  new Pool({
    connectionString: databaseUrl(),
    max: MAX_POOL_CLIENTS,
    // Fail fast with a clear error instead of hanging a request forever.
    connectionTimeoutMillis: 5_000,
  });

/**
 * node-postgres emits `error` on the pool when an *idle* client dies — the
 * database restarting, a dropped network. That is not tied to any request, so
 * without a listener Node treats it as an uncaught exception and takes the
 * server down with it. Log it and let the pool discard the client; the next
 * query opens a fresh connection.
 */
if (!globalForDb.languageOsPool) {
  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.languageOsPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
