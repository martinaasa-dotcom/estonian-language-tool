import { prisma } from "@/lib/db";
import { ekilexConfigured, fetchEkilexDetails, searchEkilex } from "@/lib/ekilex/client";
import { mapEkilexDetails } from "@/lib/ekilex/mapper";
import { mergeExamples, parseExamples, serialiseExamples } from "./examples";
import { fetchEnglishGloss } from "./wiktionary";
import { translateWithAnu } from "@/lib/tutor/translate";
import { NEEDS_TRANSLATION, NO_VALUE } from "@/lib/copy/values";

/**
 * Fetches a word we do not hold locally, and stores it.
 *
 * No single source has everything, so each supplies what it is actually good at:
 *
 *   Ekilex      the full authoritative paradigm, CEFR level, verb government and
 *               an Estonian definition — but no English on a reader key
 *   Wiktionary  the English gloss Ekilex lacks, for most everyday vocabulary
 *   Anu         the remaining gaps, tagged as unverified because it is a guess
 *   the learner the final word, via the edit form
 *
 * Everything is written to the local database on the way through, so the second
 * lookup of a word is instant, works offline, and does not trouble a free
 * academic API again.
 */
export interface LookupResult {
  id: string;
  lemma: string;
  translationSource: "WIKTIONARY" | "AI" | "NONE";
}

/**
 * Upgrades a locally-held word to Ekilex's authoritative paradigm.
 *
 * The built-in dictionary is a warm start, not the truth: its forms are
 * hand-written and it holds only principal parts. The first time a seeded word is
 * actually looked at, we replace them with the real paradigm and keep the
 * translation the learner already has. Every word she uses becomes authoritative;
 * words she never opens cost nothing.
 */
export async function enrichFromEkilex(lexemeId: string): Promise<boolean> {
  if (!ekilexConfigured()) return false;

  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: {
      id: true, lemma: true, ekilexWordId: true,
      translation: true, provenance: true, government: true, examples: true,
      // The marker alone is not proof: re-running the seed rewrites forms with
      // principal parts only while leaving ekilexWordId set, which would strand
      // the word half-upgraded forever.
      forms: { where: { isPrincipal: false }, select: { id: true }, take: 1 },
    },
  });
  if (!lexeme) return false;
  // Typed in by hand — hers, not ours to overwrite.
  if (lexeme.provenance === "USER") return false;
  // Already carries a retrieved paradigm.
  if (lexeme.ekilexWordId && lexeme.forms.length > 0) return false;

  const matches = await searchEkilex(lexeme.lemma);
  const first = matches.find((m) => m.wordValue === lexeme.lemma) ?? matches[0];
  if (!first) return false;

  const details = await fetchEkilexDetails(first.wordId);
  const mapped = details ? mapEkilexDetails(details) : null;
  if (!mapped || mapped.lemma !== lexeme.lemma) return false;

  await prisma.lexeme.update({
    where: { id: lexeme.id },
    data: {
      // The hand-written English stays: it is better than anything we would refetch.
      cefr: mapped.cefr ?? undefined,
      gradation: mapped.gradation,
      gradationNote: mapped.gradationNote,
      // Ekilex records government as bare question words ("kellest/millest").
      // A worked example we already hold teaches more, so it is not overwritten.
      government: lexeme.government ?? mapped.government ?? undefined,
      notes: mapped.notes,
      // Sentences are merged rather than replaced: a translation already
      // resolved for one survives the refetch, exactly as the gloss does.
      examples: serialiseExamples(mergeExamples(parseExamples(lexeme.examples), mapped.examples)),
      ekilexWordId: mapped.ekilexWordId,
      provenance: "EKILEX",
      fetchedAt: new Date(),
    },
  });
  await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
  await prisma.form.createMany({
    data: mapped.forms.map((f) => ({ ...f, lexemeId: lexeme.id })),
  });
  return true;
}

export async function lookupAndStore(query: string): Promise<LookupResult | null> {
  if (!ekilexConfigured()) return null;

  const matches = await searchEkilex(query.trim());
  const first = matches[0];
  if (!first) return null;

  const details = await fetchEkilexDetails(first.wordId);
  if (!details) return null;

  const mapped = mapEkilexDetails(details);
  if (!mapped) return null;

  // Already stored under this lemma from an earlier lookup or the seed.
  const existing = await prisma.lexeme.findUnique({
    where: { lemma_pos: { lemma: mapped.lemma, pos: mapped.pos } },
    select: { id: true, translation: true, examples: true },
  });

  const { translation, source } = await resolveTranslation(
    mapped.lemma,
    existing?.translation,
  );

  const data = {
    lemma: mapped.lemma,
    pos: mapped.pos,
    translation,
    cefr: mapped.cefr,
    gradation: mapped.gradation,
    gradationNote: mapped.gradationNote,
    government: mapped.government,
    notes: mapped.notes,
    examples: serialiseExamples(mergeExamples(parseExamples(existing?.examples), mapped.examples)),
    ekilexWordId: mapped.ekilexWordId,
    provenance: "EKILEX",
    fetchedAt: new Date(),
  };

  const lexeme = existing
    ? await prisma.lexeme.update({ where: { id: existing.id }, data })
    : await prisma.lexeme.create({ data });

  // Ekilex is authoritative, so its paradigm replaces whatever we held.
  await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
  await prisma.form.createMany({
    data: mapped.forms.map((f) => ({ ...f, lexemeId: lexeme.id })),
  });

  return { id: lexeme.id, lemma: lexeme.lemma, translationSource: source };
}

/**
 * An English translation, from the best source that has one.
 *
 * A translation the learner has already accepted always wins — re-fetching would
 * overwrite a correction she made deliberately.
 */
/*
  A translation that is really a gap.

  Three spellings, because the marker has changed twice and the dictionary is
  seeded data that outlives a deploy. Rows written before `NO_VALUE` existed
  open with an em dash. Matching only today's spelling would leave every one
  of those looking like a translation somebody had chosen, so this would stop
  trying to fill it in and the word would keep a dash for its meaning for
  ever.
*/
function isPlaceholder(translation: string): boolean {
  const trimmed = translation.trim();
  return (
    trimmed.startsWith("\u2014") ||
    trimmed === NO_VALUE ||
    trimmed === NEEDS_TRANSLATION
  );
}

async function resolveTranslation(
  lemma: string,
  existing: string | undefined,
): Promise<{ translation: string; source: LookupResult["translationSource"] }> {
  if (existing && existing.trim() && !isPlaceholder(existing)) {
    return { translation: existing, source: "NONE" };
  }

  const gloss = await fetchEnglishGloss(lemma);
  if (gloss) return { translation: gloss.senses.join("; "), source: "WIKTIONARY" };

  const guess = await translateWithAnu(lemma);
  if (guess) return { translation: guess, source: "AI" };

  // Better an honest blank than a wrong word: the entry still carries the full
  // paradigm and the Estonian definition, and the learner can type the English.
  return { translation: NEEDS_TRANSLATION, source: "NONE" };
}
