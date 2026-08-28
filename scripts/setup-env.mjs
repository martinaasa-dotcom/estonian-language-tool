import { copyFileSync, existsSync } from "node:fs";

/**
 * A fresh clone has no .env, and Prisma fails with a cryptic error without one.
 * Copy the example across on first setup so the first command anyone runs works.
 */
if (existsSync(".env")) {
  console.log(".env already exists — leaving it alone.");
} else {
  copyFileSync(".env.example", ".env");
  console.log(
    "Created .env from .env.example. Fill in DATABASE_URL and DIRECT_URL with a real Postgres " +
    "connection (e.g. from supabase.com) before running `npm run setup` again — the tutor and " +
    "Ekilex keys are optional, but the database is not.",
  );
}
