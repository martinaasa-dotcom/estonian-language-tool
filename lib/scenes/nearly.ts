/**
 * What "close enough to be understood" means, said once.
 *
 * A learner in a real conversation is understood far more often than they are
 * correct, and the gap between those two is most of what makes speaking feel
 * possible: `ma tulema koju` is not Estonian and every Estonian who hears it
 * knows the person is coming home. The first version of the marker held every
 * turn to the dictionary's exact spelling, so a dropped õ, a slipped letter, a
 * bare nominative where the sisseütlev was due, or an infinitive where a
 * person was due each read as a turn nobody could follow, and the other side
 * said "I did not catch that" to somebody who had been perfectly clear. That
 * is not how people are, and a learner who meets it three times stops
 * talking.
 *
 * So `readTurn` reads four shapes of nearly-right as the word, understood,
 * and writes down what slipped (`Slip`):
 *
 *   spelling   a diacritic folded away, or one letter out on a word of five
 *              or more; `koik` for `kõik`, `tuleen` for `tulen`
 *   case       the right word in the wrong case; `pood` where `poodi` was due
 *   form       an ending the word does not have, on a stem that is plainly
 *              its own; `haiglat` where `haiglasse` was due, and anything
 *              else built on `haigla-`
 *   person     the infinitive where a person was due; `ma tulema` for `ma tulen`
 *
 * Every one of those is decided against the dictionary and nothing else, and
 * the recast, the form the other side says back, is read off the same
 * tables every card reads: `Lexicon.caseForm` for a case and the derived
 * present for a person (ADR-005 amendment 1). Nothing here writes a form; a
 * word this module cannot recast is understood and not recast, which is what
 * a person does too.
 *
 * WHAT IS DELIBERATELY NOT TOLERATED. Two letters out, because at that
 * distance `kool` is `kohv` and the marker would be guessing rather than
 * understanding; a typo on a word under five letters, for the same reason
 * (`pea`, `käsi` and `tee` are one edit from each other); and a wrong *word*,
 * which is what `offtarget` is for. A slip is a right thought in a slightly
 * wrong shape, and that is the whole of what it may be.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { fold } from "@/lib/estonian/fold";
import type { DerivedVerbCode } from "@/lib/estonian/conjugate";

/** A word shorter than this is never read as a typo of another. */
export const MIN_TYPO_LENGTH = 5;

/** How far a spelling may be from a form and still be that form. */
export const MAX_TYPO_DISTANCE = 1;

/**
 * How much of a word has to be a stem the dictionary knows before the ending
 * on it stops mattering.
 *
 * Four characters, and at least half of what was typed. Estonian inflects by
 * gluing an ending onto a stem, so a learner reaching for a form they do not
 * have still writes the stem: `haiglat`, `haiglale`, `haiglaks` and
 * `haiglasi` all say `haigla` to anybody who hears them, and only the last is
 * not a form of the word. Four rather than three because `tea`, `tee` and
 * `tea-` are three characters of several different words; half of what was
 * typed because a long word sharing four letters with a short one shares an
 * accident (`kohvik` and `kohv`).
 */
export const MIN_STEM = 4;

/**
 * The form a typed word was one slip away from, or null.
 *
 * Folded first, because a missing diacritic is by far the commonest slip and
 * is not a typo at all on a keyboard with no õ; then one edit, compared
 * folded so a dropped õ and a slipped letter together still count as one.
 * Candidates are the forms of one word rather than the whole list, because
 * "which word did they mean" is the beat's question and this only answers
 * "did they mean this one".
 */
export function nearlySpelled(word: string, candidates: ReadonlySet<string>): string | null {
  const folded = foldedOnly(word, candidates);
  if (folded) return folded;
  if (word.length < MIN_TYPO_LENGTH) return null;
  const flat = fold(word);
  let best: string | null = null;
  for (const form of candidates) {
    if (form.length < MIN_TYPO_LENGTH) continue;
    if (Math.abs(form.length - word.length) > MAX_TYPO_DISTANCE) continue;
    if (editDistance(flat, fold(form), MAX_TYPO_DISTANCE) <= MAX_TYPO_DISTANCE) {
      // The shortest candidate, then the first: a total order, so two runs agree.
      if (!best || form.length < best.length) best = form;
    }
  }
  return best;
}

/**
 * The same form with its diacritics folded away, and nothing looser.
 *
 * A dropped õ is a keyboard rather than a gap in anybody's Estonian, and it
 * is the one slip that is unambiguous. Everything else at one edit is not:
 * in a slot that wants a case, `kõrvat` is one letter from `kõrvas` and is
 * an ending rather than a slip of the pen, and telling a learner they
 * mistyped when they chose the wrong case sends them to the letter bar
 * instead of to the case. So the case branch of the marker asks for this
 * and the lemma branch, where any form counts and a wrong ending is not a
 * category, asks for the wider `nearlySpelled`.
 */
export function foldedOnly(word: string, candidates: ReadonlySet<string>): string | null {
  const flat = fold(word);
  for (const form of candidates) if (fold(form) === flat) return form;
  return null;
}

/**
 * Which present person a subject pronoun asks for.
 *
 * The pronouns are the ones `asesonad` teaches and `registerForms` already
 * carries; they are keys here rather than vocabulary, and the recast they
 * point at is a derived form the dictionary vouches for. A turn with no
 * pronoun in it is understood without a recast, since which person was meant
 * is not a thing anybody can read off `tulema koju`.
 */
const PERSON_OF: Readonly<Record<string, DerivedVerbCode>> = {
  ma: "IndPrSg1", mina: "IndPrSg1",
  sa: "IndPrSg2", sina: "IndPrSg2",
  ta: "IndPrSg3", tema: "IndPrSg3",
  me: "IndPrPl1", meie: "IndPrPl1",
  te: "IndPrPl2", teie: "IndPrPl2",
  nad: "IndPrPl3", nemad: "IndPrPl3",
};

/** The person the turn's subject pronoun names, or null where there is none. */
export function personAsked(spoken: readonly string[]): DerivedVerbCode | null {
  for (const word of spoken) {
    const code = PERSON_OF[word];
    if (code) return code;
  }
  return null;
}

/**
 * Levenshtein distance, abandoned once it is past `limit`.
 *
 * The same two-row shape `lib/dict/known.ts` keeps for the spelling row, and
 * a copy rather than an import because that module imports Prisma and this
 * directory may not.
 */
export function editDistance(a: string, b: string, limit: number): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (current[j]! < best) best = current[j]!;
    }
    if (best > limit) return limit + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}

/**
 * A FORM THE WORD DOES NOT HAVE, ON A STEM THAT IS PLAINLY ITS OWN.
 *
 * The rules above answer "did they mean this form"; this answers the thing a
 * person actually does, which is hear the stem and stop caring about the
 * ending. `ma tahan minna haiglat` is not Estonian and there is no doubt
 * whatever about which building is meant. So a word the scene's whole list
 * cannot vouch for, sharing a long enough opening with a form of the word the
 * beat is asking about, is that word.
 *
 * **Only where the list cannot vouch for the word at all**, and that guard is
 * the whole of why this is safe: `kohvik` is a word a café scene teaches, so
 * it is never read as a mangled `kohv`, and neither is any other real word a
 * learner might have reached for by mistake. What is left is a spelling
 * nobody in Estonian uses, which is exactly the case where the stem is all
 * the evidence there is and all a listener would need.
 *
 * Returns the form it was built on, so a caller can name the case that form
 * is in or recast to the one the beat wanted.
 */
export function nearlyInflected(
  word: string,
  candidates: ReadonlySet<string>,
  vouched: (word: string) => boolean,
): string | null {
  if (word.length < MIN_STEM || vouched(word)) return null;
  const flat = fold(word);
  let best: string | null = null;
  let longest = 0;
  for (const form of candidates) {
    const shared = sharedPrefix(flat, fold(form));
    if (shared < MIN_STEM || shared * 2 < flat.length) continue;
    if (shared > longest) { longest = shared; best = form; }
    // A tie goes to the shorter form, so a stem beats a longer form built on it.
    else if (shared === longest && best && form.length < best.length) best = form;
  }
  return best;
}

function sharedPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}
