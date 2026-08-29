import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Resolves the database URL a development script may use, and refuses anything
 * that is not local.
 *
 * The scripts that import this destroy data on purpose: `test-restore` deletes
 * every Review row to prove a backup brings them back, `test-ekilex` clears a
 * word before re-fetching it, `demo-data` wipes a learner's cards before laying
 * down two months of invented history. All of that is correct against a scratch
 * database and catastrophic against a real one — `Review` is append-only and is
 * the one table whose loss is unrecoverable (CLAUDE.md).
 *
 * The hazard is not hypothetical. Prisma reads `DATABASE_URL` from the process
 * environment *before* it reads `.env`, so a shell that already carries hosted
 * credentials — which is exactly how a deployment-linked terminal is set up —
 * silently redirects every one of these scripts at production while `.env` sits
 * there saying `localhost`. Nothing in the output would have told you.
 *
 * So the check is a hard stop rather than a warning, it names the host it
 * refused, and it hands back the URL it approved. Callers pass that URL to
 * `PrismaClient` explicitly, which closes the gap between the connection that
 * was checked and the connection that is opened.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** The escape hatch, for the rare case of pointing these at a scratch server. */
const OVERRIDE = "KODUKEEL_ALLOW_REMOTE_DB";

/** Mirrors Prisma's own precedence: the environment wins, `.env` is the fallback. */
export function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, from: "the environment" };

  const envPath = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), ".env");
  try {
    const line = readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("DATABASE_URL="));
    if (line) {
      const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
      if (value) return { url: value, from: ".env" };
    }
  } catch {
    // No .env is a normal state for a fresh clone; fall through to the error.
  }
  return { url: null, from: null };
}

export function hostOf(url) {
  try {
    // A Postgres URL is close enough to a URL for the parser, but the password
    // may hold characters it rejects, so strip the credentials first.
    return new URL(url.replace(/:\/\/[^@/]*@/, "://")).hostname || "(socket)";
  } catch {
    return "(unparseable)";
  }
}

export const isLocal = (url) => LOCAL_HOSTS.has(hostOf(url));

/**
 * Call before touching the database. Returns the approved URL; exits otherwise.
 *
 * @param {string} what - what the caller is about to do, for the refusal message.
 */
export function requireLocalDatabase(what) {
  const { url, from } = resolveDatabaseUrl();

  if (!url) {
    console.error(
      `\nRefusing to ${what}: no DATABASE_URL is set, in the environment or in .env.` +
      `\nRun \`npm run setup\` to create a local database first.\n`,
    );
    process.exit(1);
  }

  if (!isLocal(url)) {
    const host = hostOf(url);
    console.error(
      `\nRefusing to ${what}.` +
      `\n\n  DATABASE_URL comes from ${from} and points at ${host}, which is not a local database.` +
      `\n  This script deletes rows outright, including from Review, which is append-only` +
      `\n  and cannot be reconstructed. It is meant for a scratch database only.` +
      (from === "the environment"
        ? `\n\n  Note that .env is not what decided this: Prisma reads the environment first,` +
          `\n  so an exported DATABASE_URL overrides the local one written in .env.`
        : "") +
      `\n\n  Point DATABASE_URL at a local database, or set ${OVERRIDE}=1 if you` +
      `\n  genuinely mean to run this against ${host}.\n`,
    );
    if (process.env[OVERRIDE] !== "1") process.exit(1);
    console.warn(`  ${OVERRIDE}=1 is set — continuing against ${host} anyway.\n`);
  }

  return url;
}
