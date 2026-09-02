import type { Level } from "./syllabus/types";

/**
 * Which CEFR bands are worth putting in front of somebody at a given level.
 *
 * One table, read by everything that shows a learner a word chosen for them:
 * the dictionary's suggestion row, the new cards a review session introduces,
 * and the minimal pairs round. It was one table already and it lived inside
 * `lib/dict/suggest.ts`, where exactly one of those three could see it, so the
 * other two did not band their words at all. The pairs round drew
 * `ORDER BY cefr ASC` over the whole dictionary, which is a C1 speaker being
 * offered A1 pairs for as long as they keep opening it.
 *
 * The window is one band either side rather than "at or below". Below is where
 * the words somebody already knows are, and a round made only of those is
 * revision dressed as practice; one band up is where the next thing they need
 * is, and a learner who never meets it never moves. A1 has nothing under it
 * and the top reaches C2, which the course does not go to and the dictionary
 * does grade, so a C1 learner is the one person those seventy odd words are
 * any use to.
 *
 * Pure, and in `lib/collections/` with the syllabus it is keyed on, so a page
 * with a database in it and a unit test can both read the same answer.
 */
export const BANDS_AROUND: Record<Level, readonly string[]> = {
  A1: ["A1", "A2"],
  A2: ["A1", "A2", "B1"],
  B1: ["A2", "B1", "B2"],
  B2: ["B1", "B2", "C1"],
  C1: ["B2", "C1", "C2"],
};

/** The CEFR tags worth showing at this level. */
export function bandsAround(level: Level): readonly string[] {
  return BANDS_AROUND[level];
}

/**
 * True when a word carrying this CEFR tag is around the learner's level.
 *
 * An untagged word is **not** filtered out, and that is the load-bearing half.
 * A learner's own deck is full of words they typed in, photographed off their
 * homework or pasted from a class handout, and none of those carries a band.
 * Reading a missing tag as "not your level" would quietly stop review from
 * ever introducing a word the learner added themselves, which is the opposite
 * of what a level is for.
 */
export function isAround(cefr: string | null | undefined, level: Level): boolean {
  if (!cefr) return true;
  return bandsAround(level).includes(cefr);
}

/**
 * The ones around the learner's level first, and nothing dropped.
 *
 * Ordering rather than filtering is the whole of why a level is safe to apply
 * to somebody's own deck. A word two bands above them is not hidden, it waits
 * behind the ones that are not, and it arrives the moment those run out. So a
 * learner who set their level low still meets everything they put in their
 * deck, and one who set it high is never handed an empty session.
 *
 * Stable within each half, because the caller's order is already an answer to
 * a different question: review hands this cards in the order they were added,
 * and `inTeachingOrder` reads that afterwards to settle which card of a word
 * teaches first.
 */
export function aroundFirst<T>(items: readonly T[], level: Level, cefrOf: (item: T) => string | null | undefined): T[] {
  const near: T[] = [];
  const far: T[] = [];
  for (const item of items) (isAround(cefrOf(item), level) ? near : far).push(item);
  return [...near, ...far];
}
