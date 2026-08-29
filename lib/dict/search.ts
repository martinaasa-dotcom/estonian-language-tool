import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CASES } from "@/lib/estonian/cases";

/** Strips Estonian diacritics so `sona` finds `sõna`. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("õ", "o").replaceAll("ä", "a").replaceAll("ö", "o")
    .replaceAll("ü", "u").replaceAll("š", "s").replaceAll("ž", "z");
}

export interface SearchHit {
  id: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  gradationNote: string | null;
  /** Set when the query was an inflected form rather than the headword. */
  matchedAs?: string;
}

const FORM_LABELS: Record<string, string> = {
  NOM_SG: "nominative", GEN_SG: "genitive", PART_SG: "partitive",
  ILL_SG_SHORT: "short illative", PART_PL: "partitive plural", GEN_PL: "genitive plural",
  INF_MA: "ma-infinitive", INF_DA: "da-infinitive",
  PRES_1SG: "present 1sg", PAST_1SG: "past 1sg", PART_TUD: "tud-participle",
};

/** Case suffixes, longest first so `-sse` is tried before `-s`. */
const CASE_SUFFIXES = CASES
  .filter((c) => c.suffix)
  .map((c) => ({ suffix: c.suffix, en: c.en.toLowerCase(), et: c.et }))
  .sort((a, b) => b.suffix.length - a.suffix.length);

/**
 * A dictionary row as the ranker needs to see it. Exported so the ranking can be
 * exercised over fixtures: `searchLexemes` is a database read plus `rankCandidates`,
 * and only the second half carries the linguistic logic worth testing.
 */
export interface Candidate {
  id: string; lemma: string; translation: string; pos: string;
  cefr: string | null; gradationNote: string | null;
  forms: { formType: string; value: string; morphCode: string | null; morphName: string | null }[];
}

/** Ekilex morph codes → a readable English name, for the "you typed the X of Y" note. */
const MORPH_LABELS: Record<string, string> = {
  SgN: "nominative", SgG: "genitive", SgP: "partitive", SgAdt: "short illative",
  SgIll: "illative", SgIn: "inessive", SgEl: "elative", SgAll: "allative",
  SgAd: "adessive", SgAbl: "ablative", SgTr: "translative", SgTer: "terminative",
  SgEs: "essive", SgAb: "abessive", SgKom: "comitative",
  PlN: "nominative plural", PlG: "genitive plural", PlP: "partitive plural",
  PlIll: "illative plural", PlIn: "inessive plural", PlEl: "elative plural",
  PlAll: "allative plural", PlAd: "adessive plural", PlAbl: "ablative plural",
  PlTr: "translative plural", PlTer: "terminative plural", PlEs: "essive plural",
  PlAb: "abessive plural", PlKom: "comitative plural",
  Sup: "ma-infinitive", Inf: "da-infinitive",
  IndPrSg1: "present 1sg", IndPrSg2: "present 2sg", IndPrSg3: "present 3sg",
  IndPrPl1: "present 1pl", IndPrPl2: "present 2pl", IndPrPl3: "present 3pl",
  IndIpfSg1: "past 1sg", IndIpfSg3: "past 3sg",
  PtsPtIps: "tud-participle", PtsPtPs: "nud-participle",
};

/** Never shows an internal formType to the reader — that leaked as "EKILEX:SgIn" once. */
function formLabel(form: { formType: string; morphCode: string | null; morphName: string | null }): string {
  if (form.morphCode && MORPH_LABELS[form.morphCode]) return MORPH_LABELS[form.morphCode]!;
  if (FORM_LABELS[form.formType]) return FORM_LABELS[form.formType]!;
  if (form.morphName) return form.morphName;
  return form.formType.replace(/^EKILEX:/, "");
}

/**
 * Searches the local dictionary in both directions, diacritic-insensitively, and
 * — importantly — by inflected form.
 *
 * A learner meets `toas` and `lugesin` in class, not `tuba` and `lugema`. So the
 * search matches stored principal parts directly, and falls back to stripping a
 * case ending and looking for the resulting genitive stem. Both paths report
 * *why* they matched, which turns a lookup into a small grammar lesson.
 *
 * SQLite has no unaccent, so folding happens in JS over the candidate set. At a
 * few hundred to a few thousand words that is single-digit milliseconds; if the
 * dictionary ever grows past that, this is the one function to revisit.
 */
/**
 * The Estonian letters the ranker folds, and what it folds them to, as a pair
 * of arguments to Postgres `translate`.
 *
 * It has to agree with `fold` above, character for character, because the
 * database now does the first pass. `translate` rather than the `unaccent`
 * extension: this needs no extension installed, and it folds exactly the six
 * letters Estonian uses rather than everything with a diacritic.
 */
const FOLD_FROM = "õäöüšž";
const FOLD_TO = "oaousz";

/**
 * Finds the words a query could match, in the database.
 *
 * This used to read the entire dictionary into memory and rank it in
 * JavaScript, with `take: 4000` and no ordering. That was survivable at 370
 * hand-written words and became a real fault the moment the dictionary grew:
 * past four thousand entries the cap silently dropped words, and since nothing
 * ordered the query, *which* words vanished was undefined. `lugesin` stopped
 * finding `lugema` and `raamatut` stopped finding `raamat`, both of them still
 * sitting in the table with their forms intact. It also meant every search
 * loaded five thousand lexemes and thirty thousand forms to return forty rows.
 *
 * So the database narrows, and `rankCandidates` still decides. The SQL is a
 * deliberate superset of what the ranker can match, so nothing the ranker
 * would have scored is filtered out before it gets the chance:
 *
 *   the lemma contains the query, folded, or the English contains it raw;
 *   a stored form equals it, which is how `loen` finds `lugema`;
 *   a genitive stem is a *prefix* of it, which is how `toas` finds `tuba`,
 *     since a regular case form is that stem plus a suffix.
 */

/**
 * The genitive stems a query could be a regular case form of.
 *
 * `toas` is the inessive, which is the genitive stem plus `-s`, so one of the
 * stems worth looking for is `toa`. Stripping each known suffix gives at most a
 * handful of candidates, and turns the database's job from "find every stem
 * this query starts with", which no index can answer, into "find these three
 * exact strings", which is an index lookup.
 *
 * The suffix list is the same one the ranker scores with, so the prefilter
 * cannot miss a form the ranker would have matched. The bare query is included
 * because a genitive typed on its own is its own stem.
 */
function possibleStems(folded: string): string[] {
  const stems = new Set<string>([folded]);
  for (const { suffix } of CASE_SUFFIXES) {
    if (suffix && folded.endsWith(suffix)) stems.add(folded.slice(0, folded.length - suffix.length));
  }
  // Nominative plural is the one regular plural: genitive singular plus -d.
  if (folded.endsWith("d")) stems.add(folded.slice(0, -1));
  return [...stems].filter(Boolean);
}

export async function searchLexemes(query: string, limit = 40): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const folded = fold(q);
  const raw = q.toLowerCase();
  const stems = possibleStems(folded);

  /*
    A union of four branches rather than one WHERE with four ORs.

    They are the same rows either way, and the plans are not close. A single OR
    across two tables leaves Postgres no choice but to read `Lexeme` end to end
    and evaluate every branch per row; as a union, each branch is a separate
    query that can take its own index, and `prisma/indexes.ts` gives all four
    one. Measured on the full dictionary: 35ms as an OR, 14ms with the form
    indexes and the OR, and under a millisecond once the branches were split.
  */
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT l.id FROM "Lexeme" l
        WHERE translate(lower(l.lemma), ${FOLD_FROM}, ${FOLD_TO}) LIKE ${`%${folded}%`}
      UNION
      SELECT l.id FROM "Lexeme" l
        WHERE lower(l.translation) LIKE ${`%${raw}%`}
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO}) = ${folded}
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE f."formType" IN ('GEN_SG', 'GEN_PL')
          AND translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO})
              IN (${Prisma.join(stems.length ? stems : [""])})
    ) AS candidates
    LIMIT 600
  `;

  if (rows.length === 0) return [];

  const candidates: Candidate[] = await prisma.lexeme.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true, lemma: true, translation: true, pos: true,
      cefr: true, gradationNote: true,
      forms: { select: { formType: true, value: true, morphCode: true, morphName: true } },
    },
  });

  return rankCandidates(candidates, q, limit);
}

/**
 * The half of the search that knows about Estonian. Pure — no Prisma, no I/O —
 * so the inflected-form behaviour can be tested over fixtures rather than
 * against whatever happens to be seeded in a developer's database.
 */
export function rankCandidates(candidates: Candidate[], query: string, limit = 40): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const folded = fold(q);

  const scored = candidates
    .map((c) => ({ hit: c, ...rank(c, q, folded) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.lemma.localeCompare(b.hit.lemma, "et"));

  return scored.slice(0, limit).map(({ hit, matchedAs }) => ({
    id: hit.id,
    lemma: hit.lemma,
    translation: hit.translation,
    pos: hit.pos,
    cefr: hit.cefr,
    gradationNote: hit.gradationNote,
    ...(matchedAs ? { matchedAs } : {}),
  }));
}

function rank(c: Candidate, raw: string, folded: string): { score: number; matchedAs?: string } {
  const l = fold(c.lemma);
  const t = c.translation.toLowerCase();
  const r = raw.toLowerCase();

  // An exact Estonian match, diacritics and all, is unambiguous — it wins.
  if (c.lemma.toLowerCase() === r) return { score: 100 };
  // An exact English match beats a merely diacritic-folded Estonian one: typing
  // "room" almost always means the English word, not rõõm (joy).
  if (t === r) return { score: 95 };
  if (l === folded) return { score: 90 };

  // A stored principal part: `loen` should find `lugema`.
  const stored = c.forms.find((f) => fold(f.value) === folded);
  if (stored) return { score: 88, matchedAs: `${formLabel(stored)} of ${c.lemma}` };

  // A regular case form built on a genitive stem: `toas` → `toa` + -s, and
  // `tubadega` → `tubade` + -ga on the plural stem.
  for (const [formType, number] of [["GEN_SG", ""], ["GEN_PL", " plural"]] as const) {
    const stem = c.forms.find((f) => f.formType === formType)?.value;
    if (!stem) continue;
    const stemFolded = fold(stem);
    for (const { suffix, en, et } of CASE_SUFFIXES) {
      if (!folded.endsWith(suffix)) continue;
      if (folded.slice(0, folded.length - suffix.length) === stemFolded) {
        return { score: 85, matchedAs: `${en}${number} (${et}) of ${c.lemma}` };
      }
    }
  }

  // Nominative plural is the one regular plural: genitive singular + d.
  const genForPlural = c.forms.find((f) => f.formType === "GEN_SG")?.value;
  if (genForPlural && folded === fold(genForPlural) + "d") {
    return { score: 85, matchedAs: `nominative plural of ${c.lemma}` };
  }

  if (l.startsWith(folded)) return { score: 70 };
  if (t.startsWith(r)) return { score: 60 };
  // Word-boundary match in the translation beats a mid-word substring.
  if (new RegExp(`\\b${escapeRegex(r)}`).test(t)) return { score: 50 };
  if (l.includes(folded)) return { score: 30 };
  if (t.includes(r)) return { score: 20 };
  return { score: 0 };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
