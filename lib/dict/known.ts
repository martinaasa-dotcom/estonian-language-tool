import { prisma } from "@/lib/db";
import { fold, FOLD_FROM, FOLD_TO } from "@/lib/estonian/fold";
import { isKnownForm, lemmasOfForm } from "./forms";

/**
 * IS THAT AN ESTONIAN WORD?
 *
 * The question the dictionary could not answer. It held 5,363 entries, and
 * anything else came back as nothing at all: the same blank screen for a
 * misspelling, for an English word, and for a perfectly ordinary Estonian word
 * the seed happened not to carry. A learner reported the third case and it is
 * the one that stings, because the app had told them the word elsewhere on the
 * same site.
 *
 * `KnownWord` is 154,995 headwords built in thirty-two requests
 * (`scripts/build-wordlist.ts`) and it knows only that they exist; the forms
 * list beside it (`lib/dict/forms.ts`) knows every spelling of every one of
 * them and which headword each belongs to. Between them they tell those three
 * cases apart, which is the whole of what this module is for:
 *
 *   - **A real word the dictionary lacks.** Say so, and fetch it. The live
 *     lookup already existed and already worked; nothing told the screen it was
 *     worth waiting for, so a miss looked like a dead end either way.
 *   - **A near miss.** Offer the spelling. `uudishmulik` is one letter from a
 *     word, and "no results" is a poor answer to a typo.
 *   - **Neither.** Then it really is nothing, and saying so quickly is better
 *     than two requests to a free academic service on the way to the same
 *     answer.
 *
 * Folded on both sides, so a learner who cannot type õ is still told their
 * word exists. The spelling suggestion stays over the headwords, because a
 * suggestion is a link to an entry and a headword is what an entry is called.
 */

/** How far a suggestion may be from what was typed. Two is a typo; three is a different word. */
const MAX_DISTANCE = 2;

/** Suggestions offered. Three is a row; more is a search result of its own. */
const SUGGESTIONS = 3;

/**
 * How many candidates a suggestion is chosen from.
 *
 * The prefix index makes this a seek rather than a scan, and the cap is what
 * stops a two-letter prefix like `ka` reading several thousand rows to rank
 * three. Ordered, because it is a `take`.
 */
const CANDIDATES = 800;

/**
 * Whether the spelling is an Estonian word at all, and which headwords it is
 * a form of. Exact, folded.
 *
 * Over the forms list rather than `KnownWord`, because the question arrives
 * in a form: somebody who met `põhjas` on a sign types `põhjas`, and a list of
 * headwords says no to the seesütlev of one of the commonest nouns in the
 * language. The headwords lead where the spelling is one, so `põhi` answers
 * with `põhi` and `põhjas` answers with `põhi` and `põhjama`, which is what the
 * screen and the live lookup both need: the entry to open, or to fetch.
 */
export async function knownAs(query: string): Promise<string[]> {
  return lemmasOfForm(query);
}

/** Whether Ekilex holds this spelling at all, as a headword or as a form of one. */
export async function isKnownWord(query: string): Promise<boolean> {
  return isKnownForm(query);
}

/**
 * Words close enough to what was typed to be worth offering.
 *
 * WHAT IT CANNOT CATCH is a typo in the first two letters, and that is the
 * price of the prefix index: candidates are drawn by prefix, so `tuba` typed
 * as `guba` finds nothing. Widening to a trigram search would catch it and
 * would also read the whole table on a deployment where `pg_trgm` is missing,
 * which `prisma/indexes.ts` already warns is possible. A typo is nearly always
 * later in the word than the second character, and an answer that is fast and
 * usually right beats one that is thorough and sometimes very slow.
 *
 * SHORTEST FIRST, BECAUSE THE CAP CUTS AN ALPHABET IN HALF. Ordered by lemma,
 * the cap took the alphabetically first `CANDIDATES` words with the prefix,
 * and 54 of the 373 two-letter prefixes hold more than that: measured over the
 * 154,995-row word list, 77,402 words, essentially half of it, could never be
 * offered. The alphabetical head of a big prefix is long rare compounds, so
 * what it discarded was exactly what a beginner mistypes: `ka` cut at
 * `kaelarätik`, so `kana`, `kartul` and `kass` were unreachable; `ko` cut at
 * `kohevus`, so `kohv` and `kool` were; `va` cut at
 * `vahelduvvooluampermeeter`, so `vana` was. That is the `aberratsioon` fault
 * on the screen whose whole purpose is not being a dead end. Length is the
 * honest key: a suggestion is ranked by edit distance from a query of the
 * length somebody typed, so a shorter candidate is the likelier correction and
 * a 24-letter compound never was one. The lemma still ends the order, so the
 * cut is stable rather than the plan's choice.
 *
 * And the folding table is `lib/estonian/fold.ts`'s, not a fourth copy of the
 * six letters: that module exists because a marker and a search box that
 * disagreed about `ž` would mark somebody wrong for a spelling the dictionary
 * had just offered them.
 */
export async function didYouMean(query: string): Promise<string[]> {
  const folded = fold(query.trim());
  if (folded.length < 3) return [];

  // Two characters rather than three: a missing second letter is common, and
  // three would rule out the correction for it.
  const prefix = folded.slice(0, 2);
  const rows = await prisma.$queryRaw<{ lemma: string }[]>`
    SELECT lemma FROM "KnownWord"
    WHERE translate(lower(lemma), ${FOLD_FROM}, ${FOLD_TO}) LIKE ${`${prefix}%`}
    ORDER BY length(lemma) ASC, lemma ASC
    LIMIT ${CANDIDATES}
  `;
  return nearest(folded, rows.map((r) => r.lemma));
}

/**
 * The closest few of a candidate list, by edit distance.
 *
 * Pure, so the ranking can be tested without a database. Candidates are
 * compared folded and returned as they are spelled, because the spelling is
 * the answer: somebody who typed `roomus` is being shown `rõõmus`.
 */
export function nearest(folded: string, candidates: readonly string[]): string[] {
  const scored: { lemma: string; distance: number }[] = [];
  for (const lemma of candidates) {
    const other = fold(lemma);
    if (other === folded) continue;
    // Length alone rules most of a list out, and does it without the matrix.
    if (Math.abs(other.length - folded.length) > MAX_DISTANCE) continue;
    const distance = editDistance(folded, other, MAX_DISTANCE);
    if (distance <= MAX_DISTANCE) scored.push({ lemma, distance });
  }
  return scored
    // Nearest first, then shortest, then alphabetical: a total order, so the
    // same query offers the same three rather than whatever the query plan
    // returned them in.
    .sort((a, b) =>
      a.distance - b.distance || a.lemma.length - b.lemma.length
      || a.lemma.localeCompare(b.lemma, "et"))
    .slice(0, SUGGESTIONS)
    .map((s) => s.lemma);
}

/**
 * Levenshtein distance, abandoned once it is past `limit`.
 *
 * Two rows rather than a full matrix, and an early exit on a row whose every
 * cell is already past the limit: this runs several hundred times per search
 * and the answer is only ever read against a small threshold.
 */
function editDistance(a: string, b: string, limit: number): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      if (current[j]! < best) best = current[j]!;
    }
    if (best > limit) return limit + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}
