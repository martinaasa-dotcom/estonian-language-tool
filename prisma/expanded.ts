import { readFileSync, existsSync } from "node:fs";

import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * The built-in dictionary beyond the words somebody typed by hand.
 *
 * `prisma/data/expanded.json` is built by `scripts/expand-seed.ts`: Estonian
 * forms and sentences from Ekilex, English glosses from Wiktionary, nothing
 * from a model. It exists because 370 hand-written words is a demo rather than
 * a dictionary, and everything that reads the dictionary was bounded by it:
 * offline review, the minimal-pair finder, the government drill, and a
 * learner's first search for a word they met in class.
 *
 * IT IS WRITTEN AS A CACHE WARM-UP, NOT AS PART OF THE SEED, AND THE
 * DIFFERENCE IS THE WHOLE DESIGN HERE.
 *
 * `columns.ts` lists `examples`, `provenance`, `ekilexWordId` and `fetchedAt`
 * as columns the seed must never write, because they belong to the Ekilex
 * cache and to the learner, and reloading the built-in words has no business
 * overwriting them. That rule is about *re*seeding. These rows are the same
 * data the cache would have fetched on demand, just fetched in advance, so
 * they are inserted with `ON CONFLICT DO NOTHING` and never update anything.
 *
 * The consequences are the ones that matter: a hand-written entry always wins,
 * because it is already there. A word a learner has corrected is untouched. A
 * form the live Ekilex lookup has already cached is untouched. Running
 * this twice changes nothing the second time.
 *
 * `applyPosCorrections` is the one write here that is not an insert, and it
 * lives in this file rather than beside the seed because the reason for it is
 * the conflict key above. See its own comment for what it does; `seed.ts`
 * decides when, and the answer is earlier than this function.
 */

const DATA = "prisma/data/expanded.json";
const CORRECTIONS = "prisma/data/pos-corrections.json";

interface ExpandedEntry {
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  notes: string | null;
  /**
   * The Institute's semantic type codes for the word's primary sense.
   *
   * Written here as well as in `prisma/columns.ts` because the two writers
   * cover different halves of the dictionary: the seed's bulk upsert writes
   * the 1,422 course words, and this writes the 4,612 the expansion brings.
   * Adding the column to one of them left `politsei` and every other word
   * outside the course with no classification, which reads on screen as a
   * word the Institute never typed rather than as a column nobody wrote.
   */
  semanticTypes: string | null;
  examples: { et: string; en: string | null }[];
  forms: { formType: string; value: string }[];
  ekilexWordId: number;
}

export function readExpanded(): ExpandedEntry[] {
  if (!existsSync(DATA)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(DATA, "utf8"));
    return Array.isArray(parsed) ? (parsed as ExpandedEntry[]) : [];
  } catch {
    // A truncated file from an interrupted build should not take a deploy with
    // it: the hand-written dictionary is still there and the app still works.
    console.warn(`  ${DATA} could not be read; skipping the expanded dictionary.`);
    return [];
  }
}

/** A label the part-of-speech audit corrected, written down by `scripts/audit-pos.ts`. */
interface PosCorrection {
  lemma: string;
  from: string;
  to: string;
}

export function readPosCorrections(): PosCorrection[] {
  if (!existsSync(CORRECTIONS)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(CORRECTIONS, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return (parsed as PosCorrection[]).filter((c) => c?.lemma && c.from && c.to && c.from !== c.to);
  } catch {
    // Same reasoning as `readExpanded`: a file that cannot be read must not
    // take a deploy with it. The dictionary still works, one label stays stale.
    console.warn(`  ${CORRECTIONS} could not be read; leaving existing labels alone.`);
    return [];
  }
}

/**
 * Moves an already-seeded row onto the label this build corrected.
 *
 * `pos` is half of `Lexeme`'s conflict key, so a corrected label stops matching
 * the row it belongs to: the seed looks for `kallis` ADJECTIVE, finds nothing,
 * and inserts it beside the `kallis` NOUN already there. Two of the same word
 * in the dictionary, each with its own id, forms and cards, and no error
 * anywhere. This repoints the existing row instead, which writes no content at
 * all: the translation, the forms, the examples and the provenance stay
 * exactly as they were, and only the label this pipeline itself got wrong
 * moves.
 *
 * Two guards, and both have a specific failure behind them rather than a
 * general caution. `editedBy IS NULL` is the shared-dictionary rule: a
 * correction one learner makes is everybody's, and a reseed walking over it
 * would erase a person's work along with the record of who did it. The `NOT
 * EXISTS` is the conflict key itself: `hall` is a noun meaning "frost" and an
 * adjective meaning "gray", so a deployment holding it twice is right, and an
 * update onto an occupied key is an error that would take the whole seed down
 * with it.
 *
 * WHEN IT RUNS IS PART OF THE FIX. `seed.ts` calls it before the early return
 * that `--only-if-empty` takes, for the reason `ensureSearchIndexes` is there
 * too: a deploy does nothing to a dictionary that already has words, so
 * anything behind that check would never reach the deployments this is for.
 * It is also before the course harvest is written, and that ordering was
 * arrived at the hard way. Run afterwards, the harvest has already inserted
 * its own correct `kallis` ADJECTIVE, the `NOT EXISTS` guard correctly
 * declines to move the stale NOUN onto an occupied key, and the duplicate this
 * exists to prevent survives anyway.
 *
 * Idempotent, because after it runs the `from` row is gone and it matches
 * nothing on the next pass.
 */
export async function applyPosCorrections(prisma: PrismaClient): Promise<number> {
  const corrections = readPosCorrections();
  if (corrections.length === 0) return 0;

  let moved = 0;
  for (const batch of chunk(corrections, 500)) {
    const rows = batch.map((c) => Prisma.sql`(${c.lemma}, ${c.from}, ${c.to})`);
    moved += await prisma.$executeRaw`
      UPDATE "Lexeme" AS l
      SET pos = c.to_pos, "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(rows)}) AS c(lemma, from_pos, to_pos)
      WHERE l.lemma = c.lemma
        AND l.pos = c.from_pos
        AND l."editedBy" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Lexeme" x WHERE x.lemma = c.lemma AND x.pos = c.to_pos
        )
    `;
  }
  return moved;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function writeExpanded(
  prisma: PrismaClient,
): Promise<{ added: number; forms: number }> {
  const entries = readExpanded();
  if (entries.length === 0) return { added: 0, forms: 0 };

  let added = 0;
  let formCount = 0;

  /*
    `examples` is NOT NULL with a '[]' default. An explicit null overrides a
    default rather than falling back to it, so a word with no attested sentence
    has to be given the empty list by name. The whole statement is one insert,
    so one such word failed the entire batch.
  */
  for (const batch of chunk(entries, 250)) {
    const values = batch.map(
      (e) => Prisma.sql`(
        ${crypto.randomUUID()}, ${e.lemma}, ${e.pos}, ${e.translation},
        ${e.cefr}::text, ${e.gradation}, ${e.gradationNote}::text,
        ${e.government}::text, ${e.notes}::text, ${e.semanticTypes ?? null}::text,
        ${JSON.stringify(e.examples ?? [])}::text,
        'EKILEX', ${e.ekilexWordId}, NOW(), NOW()
      )`,
    );

    // RETURNING gives back only the rows this statement actually inserted, so
    // forms are written for new words and never duplicated onto existing ones.
    const inserted = await prisma.$queryRaw<{ id: string; lemma: string; pos: string }[]>`
      INSERT INTO "Lexeme" (
        id, lemma, pos, translation, cefr, gradation, "gradationNote",
        government, notes, "semanticTypes", examples, provenance, "ekilexWordId", "fetchedAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (lemma, pos) DO NOTHING
      RETURNING id, lemma, pos
    `;

    const idFor = new Map(inserted.map((r) => [`${r.lemma} ${r.pos}`, r.id]));
    added += inserted.length;

    const forms = batch.flatMap((e) => {
      const lexemeId = idFor.get(`${e.lemma} ${e.pos}`);
      if (!lexemeId) return [];
      return e.forms.map((f) => ({ ...f, lexemeId }));
    });
    for (const formBatch of chunk(forms, 2000)) {
      await prisma.form.createMany({ data: formBatch, skipDuplicates: true });
    }
    formCount += forms.length;
  }

  return { added, forms: formCount };
}
