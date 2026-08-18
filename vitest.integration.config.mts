import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import "dotenv/config";

/**
 * Tests that exercise real SQL — ownership scoping, expiry, database
 * constraints. They need a running database, so they are a separate suite:
 * `npm test` must stay runnable without any infrastructure.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Shared database rows; running files in parallel would interleave cleanup.
    fileParallelism: false,
  },
});
