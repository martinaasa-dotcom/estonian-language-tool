/**
 * The dictionary a fresh install actually has, assembled the way the seed
 * assembles it, for scripts that need to reason about what the app ships.
 *
 * `prisma/seed.ts` reads six files and writes them into `Lexeme` under a
 * conflict key of `(lemma, pos)`. A script that wants to measure or audit what
 * shipped has to read the same six and dedupe the same way, or its numbers are
 * about something nobody has: `scripts/measure-scenes.ts` grew one copy of
 * that and `scripts/audit-senses.ts` wanted a second, which is how two reports
 * about one dictionary start disagreeing.
 *
 * Read-only and offline. No database, no network, no key. It is deliberately
 * not the seed's own code: the seed writes rows and computes gradation on the
 * way, and this only has to say what is in the files.
 */
import { NOUNS } from "../../prisma/data/nouns";
import { VERBS } from "../../prisma/data/verbs";
import { ADJECTIVES, PHRASES } from "../../prisma/data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "../../prisma/data/advanced";
import { HARVESTED } from "../../prisma/data/harvested";
import expandedRaw from "../../prisma/data/expanded.json";

export interface ShippedEntry {
  readonly lemma: string;
  readonly pos: string;
  readonly cefr: string | null;
  /** The English gloss, which is `Lexeme.translation` and a production card's prompt. */
  readonly gloss: string;
  /** Principal parts by formType, exactly as the seed stores them. */
  readonly parts: Readonly<Record<string, string>>;
  /** Sentences a lexicographer recorded against this entry. */
  readonly usages: readonly string[];
  /** Ekilex's own definition of the sense. Course words only. */
  readonly note: string | null;
  /** What Ekilex calls the word. Course words only. */
  readonly ekilexPos: readonly string[];
}

interface ExpandedEntry {
  lemma: string;
  pos: string;
  cefr: string | null;
  translation: string;
  notes?: string | null;
  examples?: { et: string; en: string | null }[];
  forms?: { formType: string; value: string }[];
}

function clean(parts: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parts)) if (v) out[k] = v;
  return out;
}

const bare = { note: null, ekilexPos: [] as string[] };

/**
 * Every entry the seed would write, first writer wins.
 *
 * `ON CONFLICT DO NOTHING` on `(lemma, pos)` is what the seed does, so the
 * order here is the order there: the hand-checked seeds, then the course
 * harvest, then the built expansion. A word in two of them is one entry, which
 * is why counting the files gives a larger number than counting the dictionary.
 */
export function shippedDictionary(): ShippedEntry[] {
  const rows: ShippedEntry[] = [];

  for (const [lemma, gloss, cefr, nomSg, genSg, partSg, partPl, genPl, illSgShort] of [
    ...NOUNS, ...ADVANCED_NOUNS,
  ]) {
    rows.push({
      lemma, pos: "NOUN", cefr, gloss, usages: [], ...bare,
      parts: clean({
        NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg,
        PART_PL: partPl, GEN_PL: genPl, ILL_SG_SHORT: illSgShort,
      }),
    });
  }

  for (const [lemma, gloss, cefr, nomSg, genSg, partSg] of [...ADJECTIVES, ...ADVANCED_ADJECTIVES]) {
    rows.push({
      lemma, pos: "ADJECTIVE", cefr, gloss, usages: [], ...bare,
      parts: clean({ NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg }),
    });
  }

  for (const [lemma, gloss, cefr, infMa, infDa, pres1sg, past1sg, partTud] of [
    ...VERBS, ...ADVANCED_VERBS,
  ]) {
    rows.push({
      lemma, pos: "VERB", cefr, gloss, usages: [], ...bare,
      parts: clean({ INF_MA: infMa, INF_DA: infDa, PRES_1SG: pres1sg, PAST_1SG: past1sg, PART_TUD: partTud }),
    });
  }

  /*
    A course phrase is an attested line in its own right, which is why its own
    text is its only usage. `Tere!` is a thing somebody says; Ekilex has no
    headword for a greeting, so the seed carries the hand-checked ones the
    built-in dictionary already had.
  */
  for (const [lemma, gloss, cefr] of PHRASES) {
    rows.push({ lemma, pos: "PHRASE", cefr, gloss, parts: {}, usages: [lemma], ...bare });
  }

  for (const h of HARVESTED) {
    rows.push({
      lemma: h.lemma, pos: h.pos, cefr: h.cefr, gloss: h.gloss,
      parts: h.parts, usages: h.usages, note: h.note, ekilexPos: h.ekilexPos,
    });
  }

  for (const e of expandedRaw as ExpandedEntry[]) {
    const parts: Record<string, string> = {};
    for (const f of e.forms ?? []) if (!parts[f.formType]) parts[f.formType] = f.value;
    rows.push({
      lemma: e.lemma, pos: e.pos, cefr: e.cefr, gloss: e.translation, parts,
      usages: (e.examples ?? []).map((x) => x.et),
      /*
        Deliberately not `e.notes`. The expansion's notes column holds an
        English sense note from Wiktionary, not an Ekilex definition, and nine
        pairs of them collide: `masin` and `pann` are both noted "car". Reading
        it as a sense key would call a frying pan a synonym for a car.
      */
      ...bare,
    });
  }

  const seen = new Map<string, ShippedEntry>();
  for (const row of rows) {
    const key = `${row.lemma}|${row.pos}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}
