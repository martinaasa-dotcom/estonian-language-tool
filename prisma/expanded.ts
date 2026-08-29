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
 * paradigm the live Ekilex lookup has already cached is untouched. Running
 * this twice changes nothing the second time.
 */

const DATA = "prisma/data/expanded.json";

interface ExpandedEntry {
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  notes: string | null;
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

  for (const batch of chunk(entries, 250)) {
    const values = batch.map(
      (e) => Prisma.sql`(
        ${crypto.randomUUID()}, ${e.lemma}, ${e.pos}, ${e.translation},
        ${e.cefr}::text, ${e.gradation}, ${e.gradationNote}::text,
        ${e.government}::text, ${e.notes}::text,
        ${e.examples.length ? JSON.stringify(e.examples) : null}::text,
        'EKILEX', ${e.ekilexWordId}, NOW(), NOW()
      )`,
    );

    // RETURNING gives back only the rows this statement actually inserted, so
    // forms are written for new words and never duplicated onto existing ones.
    const inserted = await prisma.$queryRaw<{ id: string; lemma: string; pos: string }[]>`
      INSERT INTO "Lexeme" (
        id, lemma, pos, translation, cefr, gradation, "gradationNote",
        government, notes, examples, provenance, "ekilexWordId", "fetchedAt", "updatedAt"
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
