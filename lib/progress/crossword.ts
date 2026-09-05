import { prisma } from "@/lib/db";
import { bandsAround } from "@/lib/collections/levels";
import type { Level } from "@/lib/collections/syllabus/types";
import { clueClashes, crosswordPool } from "@/lib/dict/facts";
import { clueFrom, clueKey } from "@/lib/games/clue";
import { compile, type Candidate, type Crossword } from "@/lib/games/crossword";
import { dayOrdinal } from "@/lib/random/dayHash";
import { dayRng } from "@/lib/random/seeded";
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
 * word, trimmed to its first sense or two, with the kind of word named. A
 * model writing crossword clues would be a model writing about Estonian words
 * a learner then acts on, and this app has one answer to that (ADR-005).
 *
 * AND A CLUE THIS DICTIONARY HAS TWO ANSWERS TO IS NOT SET. `lib/games/clue.ts`
 * holds both halves of that rule and the report that produced it; what this
 * file adds is the reading it is done against, which is the **whole**
 * dictionary rather than the day's band. The word that made `3 down: human`
 * unanswerable was A1 and the grid was B1, so a clash read off the pool would
 * have found nothing to complain about.
 */

export interface DailyCrossword extends Crossword {
  /** The words in it that are already in the learner's deck, by entry index. */
  inDeck: number[];
}

/** Enough words to compile from without dragging the dictionary onto the page. */
const POOL = 90;

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
  const [rows, clashes] = await Promise.all([
    crosswordPool(bandsAround(level)),
    /*
      Over every entry the dictionary holds rather than over the day's pool,
      because a learner knows words outside their own band and a clue with two
      answers is a trick whichever band the other answer is graded at.
    */
    clueClashes(),
  ]);
  if (rows.length === 0) return null;

  /*
    Seeded on the day's ordinal, so every learner at one level gets one puzzle
    and a reload gets it again. `shuffle` takes its generator as a parameter for
    exactly this.

    `dayRng` rather than `rng`, and it is not a preference: this generator was
    written out here on the argument that "a shared one would be shared state",
    which is true of neither, since both return a fresh closure. What it is is a
    different sequence, because it pre-adds the constant. `recordCrossword`
    rebuilds the day's grid from the date to mark it, the way `submitExam`
    rebuilds a paper (ADR-022), so swapping the stream would mark somebody
    against a grid they were never given. Both live in `lib/random/seeded.ts`
    now, with the difference written down where it can be seen.
  */
  const random = dayRng(dayOrdinal(day));
  const pool: Candidate[] = shuffle(rows, random)
    .filter((row) => !clashes.has(clueKey(row.lemma, row.pos)))
    .map((row) => ({
      lemma: row.lemma,
      clue: clueFrom(row.translation, row.lemma, row.pos),
      lexemeId: row.id,
    }))
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

