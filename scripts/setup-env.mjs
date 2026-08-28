import { copyFileSync, existsSync } from "node:fs";

/**
 * A fresh clone has no .env, and Prisma fails with a cryptic error without one.
 * Copy the example across on first setup so the first command anyone runs works.
 */
if (existsSync(".env")) {
  console.log(".env already exists — leaving it alone.");
} else {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example. The tutor key is optional; everything else works now.");
}
