import { isFormSlot } from "@/lib/srs/slots";

/**
 * WHICH TWO FORMS A LEARNER MIXES UP.
 *
 * Every other reading in this app is about one answer at a time: right or
 * wrong, fast or slow, this case or that one. None of them can say the thing a
 * teacher notices in a fortnight, which is that somebody does not have one
 * particular *distinction*. `poes` and `poest` are not two facts a learner is
 * missing separately. They are one line they have not drawn yet, and every
 * wrong answer on either side is evidence about the same gap.
 *
 * The app has been computing it, printing it and throwing it away. The flash
 * round says "That is the seestütlev. This one wanted the seesütlev."; the
 * scene round says the same about a sentence. Both work it out through
 * `lib/estonian/whichCase.ts`, which names a case only where exactly one case
 * is spelled that way, so it is a claim the dictionary will stand behind. Then
 * the card goes and the sentence goes with it. `Review.reachedSlot` is where
 * it lands now.
 *
 * THE PAIR IS UNORDERED, AND THAT IS A JUDGMENT RATHER THAN A CONVENIENCE.
 * Writing `poest` when asked for `poes` and writing `poes` when asked for
 * `poest` are one confusion seen from two sides: a learner who could tell them
 * apart would not make either. Splitting them halves the evidence behind a
 * pair that is already rare, so a real confusion would sit under the floor for
 * twice as long while reading as two shallower ones. The column keeps the
 * direction, so a later pass that wants to say which way somebody leans can
 * have it without a migration.
 *
 * WHY THE FLOOR IS TWO. One is a slip: a learner who typed the wrong ending
 * once was tired, and naming it would be the cruellest kind of false signal,
 * which is the argument `caseAccuracy` makes for its own floor. Two is the
 * smallest number that is a pattern rather than an event, and the count is
 * printed beside the pair so a reader can weigh a two against a nine
 * themselves.
 *
 * Pure: no React, no Prisma, no clock.
 */

/** One is a slip. Two is the smallest thing worth naming. */
export const MIN_CONFUSIONS = 2;

/** One review that reached for a different form. */
export interface ConfusionPoint {
  slot: string | null;
  reachedSlot: string | null;
}

export interface Confusion {
  /** The two slots, in a stable order so the same pair always reads the same. */
  pair: readonly [string, string];
  /** Both directions together. See the header. */
  times: number;
}

/**
 * The pairs a learner mixes up, commonest first.
 *
 * Rows where either side is missing are skipped rather than counted as an
 * unknown: a review written before the column existed is silence, not a
 * confusion, and an "unknown" bucket in a ranked list is a row that outranks
 * the real ones by being everything that was never recorded. That is the
 * finding `lib/research/corpus.ts` reached the expensive way.
 */
export function confusions(reviews: readonly ConfusionPoint[], min = MIN_CONFUSIONS): Confusion[] {
  const tally = new Map<string, { pair: [string, string]; times: number }>();

  for (const r of reviews) {
    const { slot, reachedSlot } = r;
    if (!slot || !reachedSlot || slot === reachedSlot) continue;
    // `writeGrade` already refuses anything else. Checked again because this
    // reads a column, and a column outlives the function that wrote it.
    if (!isFormSlot(slot) || !isFormSlot(reachedSlot)) continue;

    const pair: [string, string] = slot < reachedSlot ? [slot, reachedSlot] : [reachedSlot, slot];
    const key = `${pair[0]} ${pair[1]}`;
    const entry = tally.get(key) ?? { pair, times: 0 };
    entry.times++;
    tally.set(key, entry);
  }

  return [...tally.values()]
    .filter((c) => c.times >= min)
    /*
      Both halves of the pair, because one is not a total order. Two pairs with
      the same count sharing a first slot compared equal, `sort` is stable, and
      the order it was handed came from the review rows: the database deciding
      which confusion a learner is told about first, and a list that can differ
      between two identical requests.
    */
    .sort((a, b) =>
      b.times - a.times
      || a.pair[0].localeCompare(b.pair[0])
      || a.pair[1].localeCompare(b.pair[1]))
    .map((c) => ({ pair: c.pair, times: c.times }));
}
