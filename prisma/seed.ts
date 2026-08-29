import { Prisma, PrismaClient } from "@prisma/client";
import { NOUNS } from "./data/nouns";
import { VERBS } from "./data/verbs";
import { ADJECTIVES, PHRASES } from "./data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "./data/advanced";
import { LEXEME_COLUMNS, type SeedEntry } from "./columns";
import { classifyGradation, classifyVerbGradation } from "../lib/estonian/gradation";

const prisma = new PrismaClient();

/**
 * Seeds the built-in dictionary. Idempotent: re-running updates entries in place
 * and never touches Card or Review rows, so a reseed cannot cost review history.
 *
 * With `--only-if-empty` it does nothing unless the dictionary is genuinely
 * empty. That is the mode the deploy runs in (see package.json `build`): a
 * brand-new database gets the dictionary it cannot function without, and one
 * that already has words — including words the learner added by hand or that
 * Ekilex cached — is left alone rather than re-upserted on every deploy.
 */
async function main() {
  if (process.argv.includes("--only-if-empty")) {
    const existing = await prisma.lexeme.count();
    if (existing > 0) {
      console.log(`Dictionary already has ${existing} entries — leaving it alone.`);
      return;
    }
    console.log("Dictionary is empty — seeding it.");
  }

  const entries: SeedEntry[] = [];

  for (const [lemma, translation, cefr, nomSg, genSg, partSg, partPl, genPl, illShort] of [...NOUNS, ...ADVANCED_NOUNS]) {
    const g = classifyGradation(nomSg, genSg);
    entries.push({
      lemma, pos: "NOUN", translation, cefr,
      gradation: g.type, gradationNote: g.note ?? null, government: null,
      forms: forms({
        NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg,
        ILL_SG_SHORT: illShort, PART_PL: partPl, GEN_PL: genPl,
      }),
    });
  }

  for (const [lemma, translation, cefr, infMa, infDa, pres1sg, past1sg, partTud, government] of [...VERBS, ...ADVANCED_VERBS]) {
    const g = classifyVerbGradation(infMa, pres1sg);
    entries.push({
      lemma, pos: "VERB", translation, cefr,
      gradation: g.type, gradationNote: g.note ?? null, government: government ?? null,
      forms: forms({ INF_MA: infMa, INF_DA: infDa, PRES_1SG: pres1sg, PAST_1SG: past1sg, PART_TUD: partTud }),
    });
  }

  for (const [lemma, translation, cefr, nomSg, genSg, partSg] of [...ADJECTIVES, ...ADVANCED_ADJECTIVES]) {
    const g = classifyGradation(nomSg, genSg);
    entries.push({
      lemma, pos: "ADJECTIVE", translation, cefr,
      gradation: g.type, gradationNote: g.note ?? null, government: null,
      forms: forms({ NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg }),
    });
  }

  for (const [lemma, translation, cefr, note] of PHRASES) {
    entries.push({
      lemma, pos: "PHRASE", translation, cefr,
      gradation: "NONE", gradationNote: null, government: null,
      notes: note ?? null, forms: [],
    });
  }

  const written = await write(dedupe(entries));
  console.log(`Seeded ${written.lexemes} entries and ${written.forms} forms.`);
}

/**
 * Writes the whole dictionary in six statements rather than three per entry.
 *
 * There are ~360 lexemes and ~1,570 forms. One entry at a time that is over a
 * thousand sequential round trips: unnoticeable over a local socket, and about
 * nine minutes against a hosted database in another region — a cost paid by
 * exactly the deploy that can least afford it, the first one, where
 * `--only-if-empty` finds an empty dictionary and has to fill it.
 *
 * It all runs in one transaction, so a seed that dies partway leaves the
 * dictionary as it was rather than half-written with some entries missing their
 * forms.
 */
async function write(entries: SeedEntry[]) {
  return prisma.$transaction(async (tx) => {
    const ids = new Map<string, string>();
    // Two statements, because the update differs: only entries carrying a
    // `notes` key hand ownership of that column to the seed.
    for (const group of [entries.filter(ownsNote), entries.filter((e) => !ownsNote(e))]) {
      for (const batch of chunks(group, 500)) {
        for (const row of await upsertLexemes(tx, batch)) ids.set(key(row), row.id);
      }
    }

    // Replace forms wholesale so a corrected seed value actually lands.
    await tx.form.deleteMany({ where: { lexemeId: { in: [...ids.values()] } } });

    const rows = entries.flatMap((e) => e.forms.map((f) => ({ ...f, lexemeId: ids.get(key(e))! })));
    for (const batch of chunks(rows, 2000)) await tx.form.createMany({ data: batch });

    return { lexemes: ids.size, forms: rows.length };
  }, { timeout: 120_000 });
}

/**
 * One `INSERT ... ON CONFLICT DO UPDATE` for a batch of entries, built from the
 * column table in `columns.ts` so the column list, the `VALUES` tuples and the
 * `SET` clause cannot drift apart. The identifiers are `Prisma.raw` because they
 * are literals from that table — every value is still a bound parameter.
 */
async function upsertLexemes(tx: Prisma.TransactionClient, batch: SeedEntry[]) {
  const owned = batch.some(ownsNote);
  const columns = LEXEME_COLUMNS.filter((c) => owned || !c.onlyWhenOwned);
  const quoted = (name: string) => Prisma.raw(`"${name}"`);

  const values = batch.map((e) => Prisma.sql`(${Prisma.join([
    Prisma.sql`${crypto.randomUUID()}`,
    ...columns.map((c) => (c.cast ? Prisma.sql`${c.value(e)}::${Prisma.raw(c.cast)}` : Prisma.sql`${c.value(e)}`)),
    Prisma.sql`NOW()`,
  ])})`);

  return tx.$queryRaw<{ id: string; lemma: string; pos: string }[]>`
    INSERT INTO "Lexeme" (id, ${Prisma.join(columns.map((c) => quoted(c.name)))}, "updatedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT (lemma, pos) DO UPDATE SET
      ${Prisma.join(
        columns
          .filter((c) => c.reseeded)
          .map((c) => Prisma.sql`${quoted(c.name)} = EXCLUDED.${quoted(c.name)}`),
      )},
      "updatedAt" = NOW()
    RETURNING id, lemma, pos
  `;
}

const key = (e: { lemma: string; pos: string }) => `${e.lemma} ${e.pos}`;

const ownsNote = (e: SeedEntry) => Object.hasOwn(e, "notes");

/**
 * `ON CONFLICT DO UPDATE` refuses to touch the same row twice in one statement,
 * so a word listed in two of the data files would now fail the whole seed where
 * the old entry-at-a-time loop quietly let the second one win. Keep letting it
 * win, but say so — a duplicate is an editing mistake worth seeing.
 */
function dedupe(entries: SeedEntry[]) {
  const byKey = new Map<string, SeedEntry>();
  for (const e of entries) {
    if (byKey.has(key(e))) console.warn(`  duplicate seed entry: ${e.lemma} (${e.pos}) — keeping the last one`);
    byKey.set(key(e), e);
  }
  return [...byKey.values()];
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function forms(map: Record<string, string | undefined>) {
  return Object.entries(map)
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([formType, value]) => ({ formType, value }));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
