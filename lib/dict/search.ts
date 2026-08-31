import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CASES } from "@/lib/estonian/cases";
import { formLabel } from "@/lib/estonian/morph";

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
  /** SEED | EKILEX | AI | USER, as `prisma/schema.prisma` defines it. */
  provenance: string;
  forms: { formType: string; value: string; morphCode: string | null; morphName: string | null }[];
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
export const FOLD_FROM = "õäöüšž";
export const FOLD_TO = "oaousz";

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
export function possibleStems(folded: string): string[] {
  const stems = new Set<string>([folded]);
  for (const { suffix } of CASE_SUFFIXES) {
    if (suffix && folded.endsWith(suffix)) stems.add(folded.slice(0, folded.length - suffix.length));
  }
  // Nominative plural is the one regular plural: genitive singular plus -d.
  if (folded.endsWith("d")) stems.add(folded.slice(0, -1));
  return [...stems].filter(Boolean);
}

/**
 * One string, as a literal inside a `LIKE` pattern.
 *
 * `%` and `_` are LIKE's own wildcards, and a search box is exactly where they
 * arrive by accident: pasted text, a stray keystroke, a word list with an
 * underscore in it. Unescaped, `_` silently matches any character, so a search
 * for `s_na` quietly returns `sõna` and `sina` and `sona` alike, and a `%`
 * matches everything from there to the end of the value. Both are wrong
 * answers rather than errors, which is the kind that nobody reports.
 *
 * Parameterisation does not cover this and never did: Prisma's tagged template
 * stops the string being read as SQL, which is a different question from what
 * the string means once it *is* a pattern.
 *
 * The backslash is escaped first, because escaping it last would go back over
 * the ones this function had just added.
 */
export function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export async function searchLexemes(query: string, limit = 40): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const folded = fold(q);
  const raw = q.toLowerCase();
  const stems = possibleStems(folded);
  // Substring branches only. The equality branches below compare whole values
  // and must not have backslashes inserted into them.
  const foldedLike = likeLiteral(folded);
  const rawLike = likeLiteral(raw);

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
        WHERE translate(lower(l.lemma), ${FOLD_FROM}, ${FOLD_TO})
              LIKE ${`%${foldedLike}%`} ESCAPE '\\'
      UNION
      SELECT l.id FROM "Lexeme" l
        WHERE lower(l.translation) LIKE ${`%${rawLike}%`} ESCAPE '\\'
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO}) = ${folded}
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE f."formType" IN ('GEN_SG', 'GEN_PL')
          AND translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO})
              IN (${Prisma.join(stems.length ? stems : [""])})
    ) AS candidates
    -- Ordered because it is truncated. Which 600 of a broad match you got was
    -- otherwise decided by the plan, so one query could answer differently
    -- after a reindex, and the ranker can only rank what it was handed.
    -- Arbitrary-but-stable beats arbitrary: a search is a function of the
    -- dictionary now, which is what makes a wrong result reproducible.
    -- Measured on the full dictionary, both ways, since the split-branch union
    -- above was won on exactly this ground: an ordinary word is 3ms either way,
    -- and a single letter, which is the only query that reaches 600, is 49ms
    -- against 50ms. The sort is off the end of a set the LIMIT already caps.
    ORDER BY id
    LIMIT 600
  `;

  if (rows.length === 0) return [];

  const candidates: Candidate[] = await prisma.lexeme.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true, lemma: true, translation: true, pos: true,
      cefr: true, gradationNote: true, provenance: true,
      forms: { select: { formType: true, value: true, morphCode: true, morphName: true } },
    },
  });

  return rankCandidates(candidates, q, limit);
}

/**
 * Which of two entries for the *same word* the app should lead with.
 *
 * More than one row can hold one lemma, and that is on purpose: `@@unique` is
 * on `(lemma, pos)`, so `hall` is grey and also frost. What was not on purpose
 * is that nothing chose between them. The scores are equal, the old tiebreak
 * compared `lemma` against `lemma` and got 0, neither query behind the search
 * carries an `ORDER BY`, and the entry page renders `hits[0]` and nothing else.
 * The winner was whatever order Postgres returned, which is stable enough to
 * look decided and arbitrary enough to change under a reindex or a restore.
 *
 * Two things went wrong with that. A fresh seed ships thirteen lemmas holding
 * two rows each, the A1 and A2 adjectives of open question Q8 where the course
 * harvest says ADJECTIVE and the built expansion says NOUN. And a learner who
 * confirms a scanned word the dictionary already knows gets a second, formless
 * row that could shadow the real one, so the paradigm disappeared from the
 * entry page for a word the app knows perfectly well.
 *
 * So: an entry there is something to teach from wins. A known part of speech
 * beats OTHER, which is what an unvouched scanned word is filed as. Then a
 * hand-written entry beats a built one. Then more stored principal parts beats
 * fewer. `id` last makes the order *total*, which is the property that actually
 * matters — a comparator that can return 0 for two different rows leaves the
 * answer to the array it was handed.
 *
 * WRITTEN BY HAND BEFORE COUNTED, AND THE ORDER OF THOSE TWO IS THE POINT.
 *
 * Ranking on the number of stored forms alone got this backwards on the
 * thirteen pairs it was written for. `vana` has a hand-checked A1 adjective
 * from the course with five principal parts, and a noun from the built
 * expansion with six, glossed "an old person; guy, dude, chap". So a learner
 * searching the commonest adjective in the language was handed the noun, every
 * time and by rule, which is worse than the arbitrary answer it replaced.
 *
 * `prisma/expanded.ts` already states the precedence this restores: the
 * expansion loads with `ON CONFLICT DO NOTHING` and never an update, "so a
 * hand-written entry, a learner's correction and a live Ekilex fetch all win
 * over it". That was a rule about writes and it is just as true about reads.
 * SEED and USER are the rows a person wrote; EKILEX is the built expansion, which is
 * every row it wrote and is where a wrong part of speech comes from in the
 * first place.
 *
 * It sits *after* the OTHER test on purpose. An unvouched word confirmed off a
 * photograph is USER and is filed as OTHER, so putting provenance first would
 * hand a formless stub the entry page again, which is the bug this function
 * exists for.
 */
const HAND_WRITTEN = new Set(["SEED", "USER"]);

/** The least a row has to carry for the rule above to have an opinion about it. */
export interface Substantial {
  id: string;
  pos: string;
  provenance: string;
  forms: readonly unknown[];
}

export function bySubstance(a: Substantial, b: Substantial): number {
  return Number(b.pos !== "OTHER") - Number(a.pos !== "OTHER")
    || Number(HAND_WRITTEN.has(b.provenance)) - Number(HAND_WRITTEN.has(a.provenance))
    || b.forms.length - a.forms.length
    || a.id.localeCompare(b.id);
}

/**
 * One entry per lemma, in the order the caller asked for them.
 *
 * `@@unique` is on `(lemma, pos)`, so a lemma can hold more than one row, and a
 * unit of the syllabus names *lemmas*. Five screens looked their unit's words
 * up with `where: { lemma: { in: [...unit.lemmas] } }` and rendered whatever
 * came back, so a lemma with two entries appeared twice on every one of them.
 * Not theoretical: with a scanned `tuba` confirmed into the dictionary beside
 * the Ekilex one, `/learn/kodu` listed the word twice and its printable
 * worksheet printed it six times, once per section. The unit page also counted
 * it twice, so a unit reported more words than it teaches; the lesson planner
 * split a duplicate into its own sitting; and React was warning about two
 * children with the same key, which it says may duplicate or omit a row.
 *
 * The thirteen adjective/noun pairs of open question Q8 are the same shape and
 * ship with a fresh seed, so this is the ordinary case rather than the odd one.
 *
 * Which of the two wins is not a new decision: it is `bySubstance`, the rule
 * the dictionary already uses to choose what a search leads with. A course
 * screen and the search box disagreeing about which `vana` is the real one
 * would be worse than either answer.
 *
 * The order is the caller's, because a unit's word list is taught in the order
 * it was written and the sort that used to do this (`order.get(a.lemma) -
 * order.get(b.lemma)`) returned 0 for exactly the two rows that are the
 * problem.
 */
export function oneEntryPerLemma<T extends Substantial & { lemma: string }>(
  rows: readonly T[],
  wanted: readonly string[],
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const held = best.get(row.lemma);
    if (!held || bySubstance(row, held) < 0) best.set(row.lemma, row);
  }
  return wanted.map((lemma) => best.get(lemma)).filter((row): row is T => row !== undefined);
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
    // Lemma before substance, so a prefix search stays alphabetical across
    // *different* words and only falls through to `bySubstance` for two rows
    // that are the same word.
    .sort((a, b) =>
      b.score - a.score
      || a.hit.lemma.localeCompare(b.hit.lemma, "et")
      || bySubstance(a.hit, b.hit));

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
  for (const [formType, plural] of [["GEN_SG", false], ["GEN_PL", true]] as const) {
    const stem = c.forms.find((f) => f.formType === formType)?.value;
    if (!stem) continue;
    const stemFolded = fold(stem);
    for (const { suffix, en, et } of CASE_SUFFIXES) {
      if (!folded.endsWith(suffix)) continue;
      if (folded.slice(0, folded.length - suffix.length) === stemFolded) {
        // Named the way a class names it. Estonian puts its word for the
        // plural in front of the case name rather than after it, so the two
        // halves cannot be concatenated the way the English pair can.
        const name = plural ? `mitmuse ${et} (${en} plural)` : `${et} (${en})`;
        return { score: 85, matchedAs: `${name} of ${c.lemma}` };
      }
    }
  }

  // Nominative plural is the one regular plural: genitive singular + d.
  const genForPlural = c.forms.find((f) => f.formType === "GEN_SG")?.value;
  if (genForPlural && folded === fold(genForPlural) + "d") {
    return { score: 85, matchedAs: `mitmuse nimetav (nominative plural) of ${c.lemma}` };
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

/**
 * How confident a match has to be before the app will vouch for it.
 *
 * The ranker's tiers, from `rank` above: 100 is the lemma spelled exactly,
 * 90 is the lemma with the diacritics folded away, 88 is a stored form and 85
 * is a regular case built on a genitive stem. Below that it is a prefix or a
 * substring, which is the right thing to *offer* somebody typing in a search
 * box and the wrong thing to hand a word to silently.
 *
 * The English tier (95) is excluded on purpose by `matchEstonianForm`, which
 * only ever looks at Estonian: a scanned page's `kalender` must not resolve
 * through some entry whose translation happens to read "kalender".
 */
export const VOUCHED_SCORE = 85;

/** A match confident enough to build a flashcard from, or nothing at all. */
export interface FormMatch {
  id: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  /** Set when the word given was an inflected form rather than the headword. */
  matchedAs?: string;
}

/**
 * Resolves one Estonian word, as written, to the dictionary entry it belongs to.
 *
 * This is the check that stands between a photograph and a flashcard. A word
 * read off a page by a model is a guess until something the app trusts
 * recognises it, and the dictionary recognising the exact spelling, one of its
 * stored forms, or a regular case of its stem is that something. Anything
 * vaguer is not a match: `tuba` must not quietly become `tubli` because the
 * two share three letters.
 *
 * Pure, like `rankCandidates`, so the boundary can be tested over fixtures.
 */
export function matchEstonianForm(candidates: Candidate[], word: string): FormMatch | null {
  const raw = word.trim();
  if (!raw) return null;
  const folded = fold(raw);
  const lower = raw.toLowerCase();

  let best: { hit: Candidate; score: number; matchedAs?: string } | null = null;
  for (const candidate of candidates) {
    const scored = rank(candidate, raw, folded);
    // The English tier: right for a search box, wrong here.
    if (scored.score === 95 && candidate.translation.toLowerCase() === lower) continue;
    if (scored.score < VOUCHED_SCORE) continue;
    /*
      `>` alone kept whichever of two equal candidates the array happened to
      hold first, which is the same fault `bySubstance` exists for and worse
      here than in a search box: this is the check that stands between a
      photograph and a flashcard, so an arbitrary winner means the word a
      learner ticks off their own homework brings back an arbitrary paradigm.
      A tie now goes to the entry with something in it.
    */
    if (!best
      || scored.score > best.score
      || (scored.score === best.score && bySubstance(candidate, best.hit) < 0)) {
      best = { hit: candidate, ...scored };
    }
  }
  if (!best) return null;

  return {
    id: best.hit.id,
    lemma: best.hit.lemma,
    translation: best.hit.translation,
    pos: best.hit.pos,
    cefr: best.hit.cefr,
    ...(best.matchedAs ? { matchedAs: best.matchedAs } : {}),
  };
}
