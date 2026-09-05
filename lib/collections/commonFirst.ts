import { COMMON_WORDS } from "./frequency";

/**
 * THE COMMONEST WORDS FIRST, AMONG CARDS NOBODY HAS SEEN YET.
 *
 * The review queue introduces at most ten unseen cards a session, read oldest
 * first and then ordered by how near the learner's band they are. Age is a
 * fact about when a card was written rather than about what is worth learning,
 * so a deck built from a unit, a photographed handout and an afternoon of
 * looking things up trickles out in the order it happened to be assembled.
 * `ja`, `aga` and `saama` wait behind whatever went in before them.
 *
 * This app already counts the language: `scripts/build-frequency.ts` runs a
 * published word list over the OpenSubtitles corpus and keeps the hundred
 * commonest of each of four kinds, gated word by word through the dictionary.
 * That measurement reached two screens and never reached the queue, which is
 * the one place it changes what somebody learns.
 *
 * IT IS A PARTITION AND NOT A RANK, AND THAT IS THE WHOLE OF THE CARE THIS
 * NEEDS. `COMMON_WORDS` is ordered by count and the obvious thing to write is a
 * comparator on that position. `scripts/build-frequency.ts` says in its own
 * header why that is not available: a nominal is counted on its dictionary form
 * and a verb on its persons, because summing every case of a noun credits
 * `välja` to `väli` and `ees` to `esi`, so the two are two measurements and
 * ranking one against the other compares things counted differently. A
 * comparator that reads the index would put a verb ahead of a noun on the
 * strength of an arithmetic neither of them shares, and it would not even be
 * transitive if it declined to: a tie between two kinds and a real answer
 * within one is exactly the comparator returning 0 this repository warns
 * about, and the sort's answer would depend on the algorithm.
 *
 * So the only claim made here is the one the corpus can carry for any two
 * words at once: this word is among the commonest of its kind, and that one is
 * not. Two buckets, each keeping the order it came in, which composes with
 * `aroundFirst` and `challengeFirst` rather than fighting them: run this first
 * and the band is still the outer ordering, with the commoner words leading
 * inside each band.
 *
 * NOTHING IS DROPPED, for the reason `aroundFirst` gives at length. A deck
 * holding not one of the four hundred comes out in exactly the order it went
 * in, and a curiosity looked up on the bus is still taught, just after `aga`.
 */

const COMMON = new Set(COMMON_WORDS.map((word) => word.lemma));

/** Whether the corpus counts this lemma among the commonest of its kind. */
export function isCommonWord(lemma: string | null | undefined): boolean {
  return lemma !== null && lemma !== undefined && COMMON.has(lemma);
}

/** The commonest words of their kind first, and nothing dropped. */
export function commonFirst<T>(
  items: readonly T[], lemmaOf: (item: T) => string | null | undefined,
): T[] {
  const common: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isCommonWord(lemmaOf(item)) ? common : rest).push(item);
  return [...common, ...rest];
}
