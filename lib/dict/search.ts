import { prisma } from "@/lib/db";

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
}

/**
 * Searches the local dictionary, diacritic-insensitively and in both directions.
 *
 * SQLite has no unaccent, so folding happens in JS over the candidate set. With a
 * few hundred to a few thousand words that is comfortably fast; if the dictionary
 * ever grows past that, this is the one function to revisit.
 */
export async function searchLexemes(query: string, limit = 40): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const folded = fold(q);

  const candidates = await prisma.lexeme.findMany({
    select: { id: true, lemma: true, translation: true, pos: true, cefr: true, gradationNote: true },
    take: 2000,
  });

  const scored = candidates
    .map((c) => ({ hit: c, score: score(c.lemma, c.translation, q, folded) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.lemma.localeCompare(b.hit.lemma, "et"));

  return scored.slice(0, limit).map((r) => r.hit);
}

function score(lemma: string, translation: string, raw: string, folded: string): number {
  const l = fold(lemma);
  const t = translation.toLowerCase();
  const r = raw.toLowerCase();

  // An exact Estonian match, diacritics and all, is unambiguous — it wins.
  if (lemma.toLowerCase() === r) return 100;
  // An exact English match beats a merely diacritic-folded Estonian one: typing
  // "room" almost always means the English word, not rõõm (joy).
  if (t === r) return 95;
  if (l === folded) return 90;
  if (l.startsWith(folded)) return 70;
  if (t.startsWith(r)) return 60;
  // Word-boundary match in the translation beats a mid-word substring.
  if (new RegExp(`\\b${escapeRegex(r)}`).test(t)) return 50;
  if (l.includes(folded)) return 30;
  if (t.includes(r)) return 20;
  return 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
