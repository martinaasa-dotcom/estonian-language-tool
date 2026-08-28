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

interface Candidate {
  id: string; lemma: string; translation: string; pos: string;
  cefr: string | null; gradationNote: string | null;
  forms: { formType: string; value: string }[];
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
export async function searchLexemes(query: string, limit = 40): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const folded = fold(q);

  const candidates: Candidate[] = await prisma.lexeme.findMany({
    select: {
      id: true, lemma: true, translation: true, pos: true,
      cefr: true, gradationNote: true,
      forms: { select: { formType: true, value: true } },
    },
    take: 4000,
  });

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
  if (stored) {
    return { score: 88, matchedAs: `${FORM_LABELS[stored.formType] ?? stored.formType} of ${c.lemma}` };
  }

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
