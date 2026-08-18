/**
 * Preflight for the destructive database scripts that are shell pipelines
 * rather than TypeScript, so they can refuse a non-local target too.
 *
 * Exits non-zero — and therefore stops the `&&` chain that runs it — whenever
 * DATABASE_URL is not this machine's development database.
 */

import { assertDevelopmentDatabase } from "@/db/env";

const operation = process.argv[2] ?? "this script";

try {
  assertDevelopmentDatabase(operation);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
