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

/**
 * The zone the development seed sets up its account in.
 *
 * No longer a fallback for real accounts: a learner's timezone is confirmed
 * during onboarding, from their own device, and nothing guesses one on their
 * behalf. This is left for the seed script and for self-hosters who want their
 * local data to sit in their own day.
 */
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

/**
 * Whether a deployment build should apply migrations to its database.
 *
 * The decision is made from Vercel's own environment indicators rather than a
 * branch name: `VERCEL_ENV` is what Vercel guarantees, and a preview built from
 * any branch must never touch the production database.
 *
 * Pure and inspectable, so the rule is testable without a build.
 */
export type DeploymentEnvironment = {
  /** Vercel sets VERCEL="1" in every build and function it runs. */
  onVercel: boolean;
  /** "production" | "preview" | "development", absent off Vercel. */
  vercelEnv: string | undefined;
};

export type MigrationDecision = { run: true } | { run: false; reason: string };

export function shouldRunDeploymentMigration(env: DeploymentEnvironment): MigrationDecision {
  if (!env.onVercel) {
    // Run by hand, against whatever DATABASE_URL the operator supplied.
    return { run: true };
  }

  if (env.vercelEnv === "production") return { run: true };

  return {
    run: false,
    reason: `this is a ${env.vercelEnv ?? "non-production"} deployment; only a production deployment migrates the production database`,
  };
}

export function readDeploymentEnvironment(): DeploymentEnvironment {
  return { onVercel: process.env.VERCEL === "1", vercelEnv: process.env.VERCEL_ENV };
}
