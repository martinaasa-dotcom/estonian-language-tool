/**
 * The two things a machine may decide about a piece of writing.
 *
 * How long it is, and whether it used the words the task named. That is the
 * whole of what `lib/exam/score.ts` settles about a message or a composition,
 * because nothing else can be settled without a model deciding whether somebody's
 * Estonian is correct, and no model decides a mark here (ADR-022).
 *
 * SPLIT OUT OF THE MARKER SO THE EXAM SCREEN CAN SHOW IT LIVE. The screen ticks
 * each required word off as it is used and fills a length meter as the answer
 * grows, and both have to agree with the marking exactly: a chip that lit up on
 * a rule of its own would be promising a mark the server was not going to give.
 * It lives here rather than being exported from the marker because the sitting
 * screen may not import the marker at all, which is the invariant that stops a
 * client marking its own paper, and one convenience import is exactly how a rule
 * like that gets softened.
 *
 * Pure: no React, no Prisma, no clock, no provider. The two modules it leans
 * on are pure for the same reason, which is what lets the marker and the
 * screen agree on which spellings count without either of them reaching a database.
 */
import { derivedVerbForms } from "@/lib/estonian/conjugate";
import { buildCaseTable, stemsFromParts } from "@/lib/estonian/derive";

/** Splits a written answer the way the marking counts it. */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** A word the task named, with the forms the dictionary holds for it. */
export interface RequiredWord {
  readonly lemma: string;
  readonly pos: string;
  /** Stored principal parts plus anything retrieved from Ekilex. */
  readonly forms: readonly { formType: string; value: string }[];
}

function tidy(word: string): string {
  return word.toLocaleLowerCase("et").replace(/[^\p{L}\p{M}]/gu, "");
}

/**
 * Every spelling that counts as this word being used.
 *
 * The lemma, everything the dictionary stores for it, and the forms a rule can
 * build off those: the ten regular cases from the genitive stem for a nominal,
 * and the present, negative, conditional and imperative from the stored first
 * person for a verb (ADR-005 amendment 1). Nothing is written here; every
 * character comes out of the entry or off a suffix the app already derives
 * with everywhere else.
 */
export function acceptedUses(word: RequiredWord): Set<string> {
  const parts: Record<string, string> = {};
  for (const form of word.forms) parts[form.formType] = form.value;

  const out = new Set<string>();
  const add = (value: string | null | undefined) => {
    const cleaned = tidy(value ?? "");
    if (cleaned) out.add(cleaned);
  };

  add(word.lemma);
  for (const form of word.forms) add(form.value);

  if (word.pos === "VERB") {
    for (const derived of derivedVerbForms({ lemma: word.lemma, pres1sg: parts.PRES_1SG })) {
      add(derived.value);
    }
  } else {
    for (const derived of buildCaseTable(stemsFromParts(parts))) {
      add(derived.singular);
      add(derived.plural);
      add(derived.alsoRight);
    }
  }
  return out;
}

/**
 * Whether a written answer used one of the words it was asked to use.
 *
 * A TRUNCATED LEMMA IS NOT A STEM, AND THIS WAS MARKING A REAL PAPER.
 *
 * The rule was a prefix match on the lemma minus its last letter, floored at
 * three characters, on the argument that Estonian inflects and `raamatust` is
 * `raamat` used. It is, and so was `kirjutan` for `kiri`, `arvan` for `arv`,
 * `aeglane` for `aeg` and `abikaasa` for `abi`. Measured over the shipped
 * dictionary, 1,529 of its 5,363 headwords have a needle that reaches a
 * different headword, so on nearly a third of the words this task can name, a
 * candidate could be credited for a word they never wrote. A mock exam that
 * marks generously tells somebody they are ready for the state examination
 * when they are not, which is the one thing it exists not to do.
 *
 * No prefix rule can tell `kirja` from `kirjutan`, because the difference is
 * not in the first letters. What can is the word's own forms, which the
 * dictionary already holds and the paper now carries, and which is the
 * standard this app applies wherever it decides whether a written word is a
 * word it knows.
 */
export function usesRequiredWord(word: RequiredWord, text: string): boolean {
  const accepted = acceptedUses(word);
  if (accepted.size === 0) return false;
  return wordsOf(text).some((written) => accepted.has(tidy(written)));
}
