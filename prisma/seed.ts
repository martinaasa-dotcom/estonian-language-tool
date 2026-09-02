import { Prisma, PrismaClient } from "@prisma/client";
import { NOUNS } from "./data/nouns";
import { VERBS } from "./data/verbs";
import { ADJECTIVES, PHRASES } from "./data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "./data/advanced";
import { HARVESTED } from "./data/harvested";
import { LEXEME_COLUMNS, type SeedEntry } from "./columns";
import { applyPosCorrections, writeExpanded } from "./expanded";
import { writeWordlist } from "./wordlist";
import { repairProductionBacks } from "./repair";
import { ensureSearchIndexes } from "./indexes";
import { classifyGradation, classifyVerbGradation, gradates } from "../lib/estonian/gradation";
import { courseWords } from "../lib/collections/syllabus/index";

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
  /*
    Before the early return, deliberately. `--only-if-empty` is the mode the
    deploy runs, and it does nothing when the dictionary already has words, so
    anything behind that check would never reach an existing deployment. The
    indexes have to be ensured on every deploy, not only the first.
  */
  await ensureSearchIndexes(prisma);

  /*
    And the headword list, before the early return for the same reason: a
    deployment seeded before this existed has a full dictionary and an empty
    `KnownWord`, which is precisely what `--only-if-empty` skips.
  */
  const known = await writeWordlist(prisma);
  if (known > 0) console.log(`Added ${known} Estonian headwords to the word list.`);

  /*
    Before the early return for the same reason, and it is the reason this
    correction reaches anybody at all. A part of speech the builder got wrong
    is only wrong on a database that was already seeded with it, which is
    precisely the case `--only-if-empty` skips: put this after the check and it
    would run on new deployments, which do not need it, and never on the ones
    that do. Before the writes below as well, because the course harvest
    carries its own correct label for some of these words and inserting that
    first strands the stale row it was supposed to replace.
  */
  const relabelled = await applyPosCorrections(prisma);
  if (relabelled > 0) {
    console.log(`Corrected the part of speech on ${relabelled} entries.`);
  }

  /*
    And the cards built before the dictionary knew a prompt had two answers.

    Here for the reason the correction above is here, and after it because
    `pos` is half of what a prompt is. A production card built the old way
    carries one lemma on its back and marks the other right answer wrong every
    time a learner types it; nothing rewrites a `Card` row, so the fix in
    `lib/srs/cards.ts` reaches new cards only. This widens the old ones and
    touches no scheduling column at all.
  */
  const widened = await repairProductionBacks(prisma);
  if (widened > 0) {
    console.log(`Widened ${widened} production cards whose prompt has more than one answer.`);
  }

  if (process.argv.includes("--only-if-empty")) {
    const existing = await prisma.lexeme.count();
    if (existing > 0) {
      console.log(`Dictionary already has ${existing} entries. Leaving it alone.`);
      return;
    }
    console.log("Dictionary is empty. Seeding it.");
  }

  const entries: SeedEntry[] = [];

  for (const [lemma, translation, cefr, nomSg, genSg, partSg, partPl, genPl, illShort] of [...NOUNS, ...ADVANCED_NOUNS]) {
    const g = classifyGradation(nomSg, genSg);
    entries.push({
      lemma, pos: "NOUN", translation, cefr,
      translationRu: null, translationUk: null,
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
      translationRu: null, translationUk: null,
      gradation: g.type, gradationNote: g.note ?? null, government: government ?? null,
      forms: forms({ INF_MA: infMa, INF_DA: infDa, PRES_1SG: pres1sg, PAST_1SG: past1sg, PART_TUD: partTud }),
    });
  }

  for (const [lemma, translation, cefr, nomSg, genSg, partSg] of [...ADJECTIVES, ...ADVANCED_ADJECTIVES]) {
    const g = classifyGradation(nomSg, genSg);
    entries.push({
      lemma, pos: "ADJECTIVE", translation, cefr,
      translationRu: null, translationUk: null,
      gradation: g.type, gradationNote: g.note ?? null, government: null,
      forms: forms({ NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg }),
    });
  }

  for (const [lemma, translation, cefr, note] of PHRASES) {
    entries.push({
      lemma, pos: "PHRASE", translation, cefr,
      translationRu: null, translationUk: null,
      gradation: "NONE", gradationNote: null, government: null,
      notes: note ?? null, forms: [],
    });
  }

  // The harvested words go in last of the authored sets, and that ordering is
  // the point: where a word appears both in the hand-typed lists above and in
  // what Ekilex sent back, Ekilex wins. `dedupe` keeps the last entry for a key,
  // so the authoritative forms supersede the transcribed ones rather than
  // racing it.
  //
  // The legacy entries it supersedes are dropped here rather than left to
  // `dedupe`, because a warning printed 700 times is not a warning. What is left
  // for dedupe to shout about is a genuine editing mistake: one word listed
  // twice inside the hand-written files.
  const harvestedKeys = new Set(HARVESTED.map((w) => `${w.lemma} ${w.pos}`));
  const authored = entries.filter((e) => !harvestedKeys.has(key(e)));
  const superseded = entries.length - authored.length;

  for (const word of HARVESTED) {
    const p = word.parts;
    const gradation =
      !gradates(word.pos) ? { type: "NONE" as const, note: undefined }
      : word.pos === "VERB"
        ? classifyVerbGradation(p.INF_MA ?? word.lemma, p.PRES_1SG ?? "")
        : classifyGradation(p.NOM_SG ?? word.lemma, p.GEN_SG ?? "");
    authored.push({
      lemma: word.lemma,
      pos: word.pos,
      translation: word.gloss,
      // Ekilex's own equivalents, joined the way every other list in this
      // schema is: a comma and a space, which is what the gloss column already
      // uses and what a reader is already reading.
      translationRu: word.rus.length > 0 ? word.rus.join(", ") : null,
      translationUk: word.ukr.length > 0 ? word.ukr.join(", ") : null,
      // Ekilex's own proficiency code where it records one, and the level of the
      // unit that introduces the word where it does not. Both are honest; the
      // first is the authority's, and it wins.
      cefr: word.cefr ?? courseLevel.get(`${word.lemma}|${word.pos}`) ?? "B1",
      gradation: gradation.type,
      gradationNote: gradation.note ?? null,
      government: word.government,
      examples: JSON.stringify(word.usages.map((et) => ({ et, source: "EKILEX" }))),
      /*
        The principal parts, and beside them the whole forms no rule of this
        app reaches: the simple past third person of every verb, the present of
        `olema`, `pole`, the polite imperative, and the short forms of every
        pronoun and numeral. `EKILEX:<code>` is the spelling `stemsFrom`,
        `conjugatedForms` and `conjugationAnswer` already read for a retrieved
        form, so nothing downstream had to learn a new shape, and `Form`'s
        unique key is (lexeme, formType, value), so `minule` and `mulle` sit
        beside each other under one code rather than one overwriting the other.

        They are written as principal, like everything else the seed writes,
        and that is deliberate: `runEnrich` reads a non-principal form as "this
        entry has already been enriched", so a seed writing one would strand
        every reseeded word half-upgraded. See the note on that query.
      */
      /*
        And Ekilex's own Estonian explanation. The harvest has been fetching
        this since the syllabus existed and the seed dropped every one, because
        the column is written only for entries that carry its key and this path
        never did. 1,359 of them.

        Spread rather than set, so a word Ekilex has no explanation for does
        not claim the column at all. Written as `definition: word.note` it
        would hand `null` to the update for those, and a reseed would erase a
        definition the live lookup had fetched for the same word, which is the
        exact thing `onlyWhenOwned` exists to stop.
      */
      ...(word.note ? { definition: word.note } : {}),
      forms: [
        ...forms(p),
        ...word.extraForms.map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
      ],
    });
  }

  const written = await write(dedupe(authored));
  console.log(
    `Seeded ${written.lexemes} entries and ${written.forms} forms ` +
    `(${HARVESTED.length} from the course harvest, superseding ${superseded} hand-typed ones).`,
  );

  /*
    Then the built dictionary, which is much larger and only ever adds. Two
    things grew the dictionary at once and they are complements rather than
    rivals: the harvest above is the *course* vocabulary, fetched against the
    syllabus and carrying the attested sentences the lessons are built from,
    while this is a broad cache warm-up for everything a learner might look up.

    It runs last because it inserts with ON CONFLICT DO NOTHING, so anything
    already present wins by being there: a hand-written gloss chosen for a
    learner, and harvested forms that came back from Ekilex against a word
    the course actually teaches. A built gloss is Wiktionary's first sense and
    is occasionally the wrong homonym, so it is the one that should yield.
  */
  const expanded = await writeExpanded(prisma);
  if (expanded.added > 0) {
    console.log(`Added ${expanded.added} entries and ${expanded.forms} forms from Ekilex and Wiktionary.`);
  }

  /*
    AFTER THE WRITES, BECAUSE IT COMPARES AGAINST WHAT THEY WROTE.

    `notes` held two languages until Ekilex's Estonian explanation was given a
    column of its own, and the live lookup wrote the Estonian into the English
    one. So every word anybody had looked up on an existing deployment carries
    that sentence in `notes`, and the entry would print it twice: once as the
    definition and once under a heading saying "other meanings".

    Written above the early return first, which is where a correction that has
    to reach an already-seeded database belongs, and it was a deploy behind:
    the definitions it compares against are written by the lines above it, so
    on the first run it matched nothing and the duplicates showed until the
    next one. A run that writes definitions cleans up after itself instead, and
    a run that writes none has nothing to clean.

    The rule is exactly the rows the old code made and no others. Where the two
    columns hold the same sentence, the note is that copy. A real English note
    is never equal to an Estonian definition, so nothing a person wrote and
    nothing the builder stored can be caught by this.
  */
  const duplicated = await prisma.$executeRaw`
    UPDATE "Lexeme" SET notes = NULL
    WHERE notes IS NOT NULL AND notes = definition
  `;
  if (duplicated > 0) {
    console.log(`Cleared ${duplicated} notes that were a copy of the Estonian definition.`);
  }
}

/** The level of the unit that introduces each course word, as a CEFR fallback. */
const courseLevel = new Map(courseWords().map((w) => [`${w.lemma}|${w.pos}`, w.level]));

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
    /*
      A statement per ownership shape, because the update differs.

      A column marked `onlyWhenOwned` is written only for entries whose payload
      carries its key: the phrases own their English note and the harvested
      words own their Estonian definition, and everything else must leave both
      alone, since the dictionary editor and the live Ekilex lookup write them
      too. This was one hardcoded test for `notes`; a second such column made
      the shape a set rather than a boolean.
    */
    const groups = new Map<string, SeedEntry[]>();
    for (const entry of entries) {
      const shape = ownedBy(entry).join("|");
      const group = groups.get(shape) ?? [];
      group.push(entry);
      groups.set(shape, group);
    }
    for (const group of groups.values()) {
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
  // Every entry in a batch has the same shape: `write` grouped them by it.
  const owned = new Set(batch[0] ? ownedBy(batch[0]) : []);
  const columns = LEXEME_COLUMNS.filter((c) => !c.onlyWhenOwned || owned.has(c.name));
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

/** Which of the owned columns this entry hands to the seed, in table order. */
const ownedBy = (e: SeedEntry) =>
  LEXEME_COLUMNS.filter((c) => c.onlyWhenOwned && Object.hasOwn(e, c.name)).map((c) => c.name);

/**
 * `ON CONFLICT DO UPDATE` refuses to touch the same row twice in one statement,
 * so a word listed in two of the data files would now fail the whole seed where
 * the old entry-at-a-time loop quietly let the second one win. Keep letting it
 * win, but say so — a duplicate is an editing mistake worth seeing.
 */
function dedupe(entries: SeedEntry[]) {
  const byKey = new Map<string, SeedEntry>();
  for (const e of entries) {
    if (byKey.has(key(e))) console.warn(`  duplicate seed entry: ${e.lemma} (${e.pos}). Keeping the last one.`);
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
