import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Tests that need a real Postgres. Kept separate from `npm run test` on purpose:
 * the unit suite must stay hermetic and fast so it can gate every commit, and a
 * suite that silently needs a database is the thing that made the old one red on
 * a clean clone.
 */
export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["lib/**/*.itest.ts"],
    // These share one database, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
  },
});
