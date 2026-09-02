import { prisma } from "@/lib/db";
import { bandsAround } from "@/lib/collections/levels";
import type { Level } from "@/lib/collections/syllabus/types";
import { compile, type Candidate, type Crossword } from "@/lib/games/crossword";
import { dayOrdinal } from "@/lib/random/dayHash";
import { shuffle } from "@/lib/random/shuffle";
import type { DayKey } from "@/lib/time/day";

/**
 * WHICH WORDS TODAY'S CROSSWORD IS MADE OF.
 *
 * The pool is the graded dictionary at the learner's own level, three to seven
 * letters, with a gloss short enough to be a clue. `lib/games/crossword.ts`
 * compiles it, and it compiles the pool in the order it is handed, so the day
 * decides which words are tried first and a reload returns the same grid.
 *
 * A SEEDED SHUFFLE RATHER THAN A SKIP, because a crossword needs a *set* of
 * words rather than one, and a window into an alphabetical list gives seven
 * words beginning with the same letter, which cross badly and read worse. The
 * generator is `lib/random/shuffle.ts`'s, with the day as its seed, which is
 * the same arrangement `lib/exam/paper.ts` has and for the same reason: the
 * server has to be able to rebuild the puzzle to mark it.
 *
 * NOTHING HERE WRITES A CLUE. The clue is the English gloss already beside the
 * word, trimmed to its first sense or two. A model writing crossword clues
 * would be a model writing about Estonian words a learner then acts on, and
 * this app has one answer to that (ADR-005).
 */

export interface DailyCrossword extends Crossword {
  /** The words in it that are already in the learner's deck, by entry index. */
  inDeck: number[];
}

/** Enough words to compile from without dragging the dictionary onto the page. */
const POOL = 90;

/** Short enough to cross, long enough to be worth clueing. */
const MIN_LETTERS = 3;
const MAX_LETTERS = 7;

/**
 * A clue is one line. A gloss like "a devil, an evil spirit, the deuce" is
 * three, and a crossword clue that is longer than the grid is a paragraph
 * with a box under it.
 */
const MAX_CLUE = 46;

export async function crosswordFor(
  ownerId: string, day: DayKey, level: Level,
): Promise<DailyCrossword | null> {
  const rows = await prisma.$queryRaw<{ id: string; lemma: string; translation: string }[]>`
    SELECT DISTINCT ON (lemma) id, lemma, translation FROM "Lexeme"
    WHERE char_length(lemma) BETWEEN ${MIN_LETTERS} AND ${MAX_LETTERS}
      AND lemma ~ ${"^[a-zäöüõšž]+$"}
      AND cefr = ANY(${[...bandsAround(level)]})
      AND pos = ANY(${["NOUN", "VERB", "ADJECTIVE", "ADVERB"]})
      AND translation <> ''
    ORDER BY lemma, id
  `;
  if (rows.length === 0) return null;

  /*
    Seeded on the day's ordinal, so every learner at one level gets one puzzle
    and a reload gets it again. `shuffle` takes its generator as a parameter
    for exactly this, and the generator is written out here rather than
    imported because it is three lines and a shared one would be shared state.
  */
  const random = seededRandom(dayOrdinal(day));
  const pool: Candidate[] = shuffle(rows, random)
    .map((row) => ({ lemma: row.lemma, clue: clueFrom(row.translation), lexemeId: row.id }))
    .filter((c) => c.clue.length > 0)
    .slice(0, POOL);

  const puzzle = compile(pool);
  if (!puzzle) return null;

  const held = await prisma.card.findMany({
    where: { ownerId, lexemeId: { in: puzzle.entries.map((e) => e.lexemeId) } },
    select: { lexemeId: true },
    distinct: ["lexemeId"],
  });
  const ids = new Set(held.map((c) => c.lexemeId ?? ""));
  return {
    ...puzzle,
    inDeck: puzzle.entries.flatMap((entry, index) => (ids.has(entry.lexemeId) ? [index] : [])),
  };
}

/**
 * A gloss cut down to a clue, or nothing where it will not go.
 *
 * Two senses at most, because a comma-separated list of five is the
 * lexicographer being thorough and a crossword clue being useless. Dropped
 * rather than truncated mid-word where it is still too long: a clue cut off in
 * the middle is worse than one word fewer in the grid.
 */
export function clueFrom(translation: string): string {
  const senses = translation.split(/[;/]/)[0]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const clue = senses.slice(0, 2).join(", ");
  return clue.length > 0 && clue.length <= MAX_CLUE ? clue : "";
}

/**
 * A small deterministic generator, seeded on the day.
 *
 * Mulberry32, which is four lines and passes the only test that matters here:
 * two consecutive seeds give unrelated sequences, which a linear congruential
 * generator seeded on consecutive integers does not.
 */
function seededRandom(seed: number): () => number {
  let a = (seed + 0x6d2b79f5) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
