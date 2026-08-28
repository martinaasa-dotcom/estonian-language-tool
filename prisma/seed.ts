import { PrismaClient } from "@prisma/client";
import { NOUNS } from "./data/nouns";
import { VERBS } from "./data/verbs";
import { ADJECTIVES, PHRASES } from "./data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "./data/advanced";
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

  let count = 0;

  for (const [lemma, translation, cefr, nomSg, genSg, partSg, partPl, genPl, illShort] of [...NOUNS, ...ADVANCED_NOUNS]) {
    const g = classifyGradation(nomSg, genSg);
    await upsert({
      lemma, pos: "NOUN", translation, cefr,
      gradation: g.type, gradationNote: g.note ?? null, government: null,
      forms: entries({
        NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg,
        ILL_SG_SHORT: illShort, PART_PL: partPl, GEN_PL: genPl,
      }),
    });
    count++;
  }

  for (const [lemma, translation, cefr, infMa, infDa, pres1sg, past1sg, partTud, government] of [...VERBS, ...ADVANCED_VERBS]) {
    const g = classifyVerbGradation(infMa, pres1sg);
    await upsert({
      lemma, pos: "VERB", translation, cefr,
      gradation: g.type, gradationNote: g.note ?? null, government: government ?? null,
      forms: entries({ INF_MA: infMa, INF_DA: infDa, PRES_1SG: pres1sg, PAST_1SG: past1sg, PART_TUD: partTud }),
    });
    count++;
  }

  for (const [lemma, translation, cefr, nomSg, genSg, partSg] of [...ADJECTIVES, ...ADVANCED_ADJECTIVES]) {
    const g = classifyGradation(nomSg, genSg);
    await upsert({
      lemma, pos: "ADJECTIVE", translation, cefr,
      gradation: g.type, gradationNote: g.note ?? null, government: null,
      forms: entries({ NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg }),
    });
    count++;
  }

  for (const [lemma, translation, cefr, note] of PHRASES) {
    await upsert({
      lemma, pos: "PHRASE", translation, cefr,
      gradation: "NONE", gradationNote: null, government: null,
      notes: note ?? null, forms: [],
    });
    count++;
  }

  console.log(`Seeded ${count} entries.`);
}

function entries(map: Record<string, string | undefined>) {
  return Object.entries(map)
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([formType, value]) => ({ formType, value }));
}

async function upsert(input: {
  lemma: string; pos: string; translation: string; cefr: string;
  gradation: string; gradationNote: string | null; government: string | null;
  notes?: string | null;
  forms: { formType: string; value: string }[];
}) {
  const { forms, ...data } = input;
  const lexeme = await prisma.lexeme.upsert({
    where: { lemma_pos: { lemma: data.lemma, pos: data.pos } },
    create: { ...data, provenance: "SEED" },
    update: { ...data },
  });
  // Replace forms wholesale so a corrected seed value actually lands.
  await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
  if (forms.length) {
    await prisma.form.createMany({ data: forms.map((f) => ({ ...f, lexemeId: lexeme.id })) });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
