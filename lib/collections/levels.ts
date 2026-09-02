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

/**
 * The order in which a band is worth *teaching*, which is not the order it is
 * worth *showing*.
 *
 * `aroundFirst` answers "is this word anywhere near them", which is the right
 * question for a suggestion row, a pairs round and a review queue: all of those
 * order a pool the learner already owns and must never drop from it. Learn asks
 * a narrower question. It picks the next five words somebody will be taught
 * from scratch, and a word one band below is one they very likely met in the
 * class they are sitting in, so putting it at the front of that queue spends
 * the session on revision. A word one band above is where the next thing they
 * need is.
 *
 * So: at level, then the band above, then their own untagged words, then below,
 * then anything further off. Untagged sits third rather than first because a
 * deck can hold hundreds of words off a photographed handout and none of them
 * carries a band, and letting those lead would quietly stop the course from
 * ever teaching anything. It sits above "below" because the learner went to
 * the trouble of putting them there.
 *
 * Ordering and never filtering, for the reason `aroundFirst` gives at length:
 * a learner whose whole deck is two bands off still gets taught something.
 */
export function challengeRank(cefr: string | null | undefined, level: Level): number {
  const window = bandsAround(level);
  if (!cefr) return 2;
  if (cefr === level) return 0;
  const at = window.indexOf(cefr);
  if (at === -1) return 4;
  // The window is ordered low to high around the level, so anything after the
  // learner's own band in it is the band above.
  return at > window.indexOf(level) ? 1 : 3;
}

/** The ones worth teaching next first, and nothing dropped. */
export function challengeFirst<T>(
  items: readonly T[], level: Level, cefrOf: (item: T) => string | null | undefined,
): T[] {
  return [...items]
    .map((item, index) => ({ item, index, rank: challengeRank(cefrOf(item), level) }))
    // Index breaks the tie, because a comparator that returns 0 for two
    // different rows hands the order to whatever built the array.
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
