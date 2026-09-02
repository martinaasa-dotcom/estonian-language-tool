import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, "data/wordlist.txt");

/**
 * LOADS THE HEADWORD LIST: EVERY ESTONIAN WORD, AND NOTHING ABOUT ANY OF THEM.
 *
 * `KnownWord` is one column, so this is the simplest write in the seed, and
 * the only thing worth saying about it is what it is *not*. It is not the
 * dictionary. `Lexeme` is the dictionary: 5,363 entries with forms, glosses,
 * levels and sentences, and every one of them is something a learner can
 * study. This is 155,000 rows that answer one question, "is that a word",
 * which is the question a search screen could not answer before and is most of
 * why the dictionary felt thin.
 *
 * INSERTED, NEVER UPDATED, LIKE THE EXPANSION. A row here is a fact about
 * Estonian rather than about this deployment, so there is nothing to update:
 * `ON CONFLICT DO NOTHING` makes a re-seed cheap and makes this safe to run on
 * every deploy.
 *
 * It is deliberately outside `--only-if-empty`'s early return, for the reason
 * `ensureSearchIndexes` and `applyPosCorrections` are: a deployment seeded
 * before this file existed has a full `Lexeme` table and an empty
 * `KnownWord` one, and that is exactly the deployment the early return skips.
 */
export async function writeWordlist(prisma: PrismaClient): Promise<number> {
  const text = await readFile(FILE, "utf8");
  const lemmas = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lemmas.length === 0) return 0;

  /*
    Two thousand a statement. Postgres binds at most 65,535 parameters in one
    statement and this is one parameter per row, so the ceiling is well above
    that; what decides the number is the size of the statement text rather than
    the parameter count, and 78 round trips is already nothing against the
    155,000 this would otherwise be.
  */
  let added = 0;
  for (let i = 0; i < lemmas.length; i += 2000) {
    const batch = lemmas.slice(i, i + 2000);
    const values = batch.map((_, n) => `($${n + 1})`).join(",");
    added += await prisma.$executeRawUnsafe(
      `INSERT INTO "KnownWord" (lemma) VALUES ${values} ON CONFLICT (lemma) DO NOTHING`,
      ...batch,
    );
  }
  return added;
}
