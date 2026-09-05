import { CASES } from "./cases";
import { caseAnswer, type NounStems } from "./derive";
import type { CaseKey } from "./types";

/**
 * WHICH CASE A LEARNER JUST WROTE, WHERE EXACTLY ONE CASE SPELLS IT THAT WAY.
 *
 * The inverse of `caseAnswer`, and it lives beside the table it inverts for
 * the reason `possibleFirstPersons` lives beside the ending table it reads
 * backwards: a rule read one way in one module and the other way in another is
 * two rules the day somebody edits one of them.
 *
 * It exists because "you did not use the form we asked for" is the least
 * useful true thing this app can say. A learner asked for `majas` who wrote
 * `majast` has made one specific mistake, has a good reason for it, and can be
 * told what they wrote instead in one line. Nothing else in the app could
 * answer that: every other screen compares against one form and stops.
 *
 * ONE RULE, AND IT IS DELIBERATELY THE STRICT ONE. A case is named only when
 * it is the only case that spells the word that way. That is the same
 * discipline `lib/estonian/gapForms.ts` states about the principal parts, and
 * generalizing it is what makes it correct rather than nearly correct: `tuba`
 * is its own nominative and its own partitive, so neither may be named, while
 * `raamatu` is only ever the omastav and naming it teaches something. A rule
 * that skipped the principal parts wholesale would lose `raamatu`, and a rule
 * that named the first match would call a partitive object a subject, which is
 * the fault the level check was shipped with.
 *
 * THE SHORT ILLATIVE IS WHY THIS CANNOT BE A SUFFIX TABLE READ BACKWARDS.
 * 1,937 of the 2,700 short illatives in the shipped dictionary are spelled
 * like the nominative, the genitive or the partitive, because that is what the
 * aditiiv does. Reading endings off a word would call every one of those an
 * illative. Building the whole singular from the entry and looking for
 * collisions is the only version that gets `aadressi` right.
 *
 * Pure. `caseAnswer` prefers an attested form over a derived one, so an
 * enriched entry is answered from what a lexicographer wrote and a seeded one
 * from the suffix rule, and neither is invented (ADR-005 amendment 1).
 */

export type CaseVerdict =
  /** Exactly one case is spelled this way. Safe to name. */
  | { readonly kind: "one"; readonly key: CaseKey }
  /** More than one is, so naming either would be a guess. */
  | { readonly kind: "shared"; readonly keys: readonly CaseKey[] }
  /** Not a singular form of this word at all. */
  | { readonly kind: "unknown" };

/** Lowercased and stripped of anything that is not a letter, so punctuation cannot miss a match. */
export function tidyForm(word: string): string {
  return word.toLocaleLowerCase("et").replace(/[^\p{L}\p{M}]/gu, "");
}

/**
 * Every singular spelling of one word, and the cases that claim each.
 *
 * Built once per word rather than per lookup: a sentence is a dozen words and
 * a round is five sentences, and rebuilding fourteen cases for each of those
 * is the shape `lib/dict/facts.ts` was written about one layer up.
 *
 * Only the spellings that are *right* go in. `CaseAnswer.accepted` is
 * deliberately wider, holding a suffix guess sitting beside a form Ekilex
 * retrieved so a marker can be generous, and generosity is wrong here: this
 * names a case out loud, and naming one on the strength of a guess the entry
 * itself disagrees with would put a wrong grammatical claim on the screen.
 */
export function caseIndex(stems: NounStems): Map<string, CaseKey[]> {
  const index = new Map<string, CaseKey[]>();

  const claim = (spelling: string | null | undefined, key: CaseKey) => {
    const form = tidyForm(spelling ?? "");
    if (!form) return;
    const held = index.get(form);
    if (held) { if (!held.includes(key)) held.push(key); }
    else index.set(form, [key]);
  };

  /*
    The three principal parts are stored rather than derived, so `caseAnswer`
    returns null for them and they are read off the stems directly. They are in
    the index rather than excluded from it: their job here is to *collide*, so
    that a short illative spelled like the partitive is reported as shared
    rather than announced as an illative.
  */
  claim(stems.nomSg, "NOMINATIVE");
  claim(stems.genSg, "GENITIVE");
  claim(stems.partSg, "PARTITIVE");

  for (const spec of CASES) {
    if (spec.principal) continue;
    const answer = caseAnswer(stems, spec.key);
    if (!answer) continue;
    claim(answer.value, spec.key);
    claim(answer.alsoRight, spec.key);
  }

  return index;
}

/** What case one written word is, given an index built for the word it belongs to. */
export function readCase(index: ReadonlyMap<string, CaseKey[]>, written: string): CaseVerdict {
  const keys = index.get(tidyForm(written));
  if (!keys || keys.length === 0) return { kind: "unknown" };
  if (keys.length === 1) return { kind: "one", key: keys[0]! };
  return { kind: "shared", keys };
}

/**
 * The first word of a sentence that is a form of this word, and what case it is.
 *
 * Returns null where the sentence holds none. Whole words rather than
 * substrings, for the reason `sentenceContaining` gives: `toa` sits inside
 * `toas`, and a substring match would report a case the sentence does not
 * contain, which is teaching the opposite of the lesson.
 */
export function caseWritten(
  index: ReadonlyMap<string, CaseKey[]>, sentence: string,
): { written: string; verdict: CaseVerdict } | null {
  for (const raw of sentence.split(/[^\p{L}\p{M}-]+/u)) {
    const word = tidyForm(raw);
    if (!word) continue;
    const verdict = readCase(index, word);
    if (verdict.kind !== "unknown") return { written: word, verdict };
  }
  return null;
}
