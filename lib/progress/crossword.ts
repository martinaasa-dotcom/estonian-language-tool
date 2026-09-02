import { prisma } from "@/lib/db";
import { bandsAround } from "@/lib/collections/levels";
import type { Level } from "@/lib/collections/syllabus/types";
import { crosswordPool } from "@/lib/dict/facts";
import { compile, type Candidate, type Crossword } from "@/lib/games/crossword";
import { dayOrdinal } from "@/lib/random/dayHash";
import { shuffle } from "@/lib/random/shuffle";
import type { DayKey } from "@/lib/time/day";
import { mentions } from "@/lib/estonian/cloze";

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

/**
 * A clue is one line. A gloss like "a devil, an evil spirit, the deuce" is
 * three, and a crossword clue that is longer than the grid is a paragraph
 * with a box under it.
 */
const MAX_CLUE = 46;

export async function crosswordFor(
  ownerId: string, day: DayKey, level: Level,
): Promise<DailyCrossword | null> {
  /*
    Cached across requests in `lib/dict/facts.ts`, because which words a
    crossword could be built from is a fact about the shared dictionary and a
    band rather than about the person waiting: two learners at B1 draw from the
    same 2,039 rows, and this page fetched all of them on every render and
    again inside the action that marks the grid.
  */
  const rows = await crosswordPool(bandsAround(level));
  if (rows.length === 0) return null;

  /*
    Seeded on the day's ordinal, so every learner at one level gets one puzzle
    and a reload gets it again. `shuffle` takes its generator as a parameter
    for exactly this, and the generator is written out here rather than
    imported because it is three lines and a shared one would be shared state.
  */
  const random = seededRandom(dayOrdinal(day));
  const pool: Candidate[] = shuffle(rows, random)
    .map((row) => ({ lemma: row.lemma, clue: clueFrom(row.translation, row.lemma), lexemeId: row.id }))
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
 *
 * AND NOTHING WHERE THE CLUE IS THE ANSWER, which is the case this could not
 * see while it was handed a gloss and no word. The clue is the English beside
 * the entry and a few dozen Estonian words are spelled the same in English:
 * the clue for `film` was "film", and for `sport` it was "sport, sports", so
 * the answer was written across the grid above the squares it goes in.
 * Measured on the shipped dictionary, 34 of the 5,329 words with a usable
 * clue, 23 of them the answer exactly.
 *
 * `answer` is required rather than optional for the reason `illSgShort` is:
 * a caller that has not thought about this should not compile. Whole words
 * and case-insensitive, because a crossword is typed without case and
 * "August" over `august` gives away every letter of it.
 */
export function clueFrom(translation: string, answer: string): string {
  const senses = translation.split(/[;/]/)[0]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const clue = senses.slice(0, 2).join(", ");
  if (clue.length === 0 || clue.length > MAX_CLUE) return "";
  return mentions(clue, answer) ? "" : clue;
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
