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
    // `prisma/` as well as `lib/`, because the seed's own claims about the
    // database are database claims: the reseed that repoints a corrected part
    // of speech cannot be checked anywhere a conflict key does not exist.
    //
    // And `app/`, for the one thing a route handler can be wrong about that
    // nothing else can see. `/api/research` builds its aggregations in SQL
    // rather than in Node, deliberately, so the queries themselves are the
    // part with no unit test around them: the disclosure gate can be perfect
    // and still be handed the wrong rows. A test beside the route is the only
    // place that is answerable.
    include: ["lib/**/*.itest.ts", "prisma/**/*.itest.ts", "app/**/*.itest.ts"],
    // These share one database, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
  },
});
