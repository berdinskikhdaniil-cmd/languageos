import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Unit suite only: no database, no network. See vitest.integration.config.mts.
    // `.test.tsx` files render components and opt into jsdom with a docblock
    // of their own, so the default stays the faster node environment.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
  },
});
