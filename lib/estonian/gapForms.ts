import { CASES } from "@/lib/estonian/cases";
import { derivedVerbForms, pres1sgFrom } from "@/lib/estonian/conjugate";
import { caseAnswer, stemsFromParts } from "@/lib/estonian/derive";
import { caseFromMorphCode } from "@/lib/estonian/morph";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * Every spelling of one word that could be the gap in a sentence.
 *
 * A GAP-FILL IS BUILT OUT OF A SENTENCE SOMEBODY RECORDED, AND THE WORD IN IT
 * IS INFLECTED.
 *
 * `buildCloze` hides a word it is told to look for, so what it can hide is
 * whatever list the caller hands it, and there were five such lists. Two of
 * them (`lesson.ts`, `checkpoint.ts`) already added the ten regular cases and
 * were the same twenty lines twice. Three did not: the review card, the
 * printable worksheet, and the mock exam, and the worksheet's own comment says
 * "a sentence about `tuba` usually contains `toas`, not `tuba`, and hiding the
 * inflected form is the more useful exercise" over a list that could not hide
 * `toas` unless Ekilex happened to have stored it. None of the five knew a
 * verb person at all, so `Kontsert algab kell 18.` could not be gapped for
 * `algama` and `Kuidas sa elad?` could not be gapped for `elama`, which are
 * the two commonest shapes in the language.
 *
 * Measured over the graded half of the shipped dictionary: 2,201 words could
 * carry a gap and 2,758 can now, a quarter more, on sentences the dictionary
 * already held.
 *
 * NOTHING IS INVENTED, AND THE SENTENCE IS THE SECOND OPINION. Every spelling
 * here is a stored form or one of the two derivations ADR-005 amendment 1
 * allows, and a derived form only ever becomes a card by matching a word a
 * lexicographer wrote in a real sentence. A wrong derivation matches nothing
 * and disappears; a right one is confirmed by the sentence it was found in.
 *
 * Pure, like the two modules it unions.
 */

export interface GapWord {
  readonly lemma: string;
  readonly pos: string;
  readonly forms: readonly { formType: string; value: string; morphCode?: string | null }[];
}

/**
 * Lowercased spelling to the case it is, or null where it is not a case.
 *
 * A verb person and the headword itself are null: neither is a case, and a
 * card that claimed otherwise would put a wrong row in the accuracy chart.
 */
export function gapForms(word: GapWord): Map<string, CaseKey | null> {
  const out = new Map<string, CaseKey | null>();
  const add = (value: string | null | undefined, caseKey: CaseKey | null) => {
    const clean = value?.trim().toLowerCase();
    if (!clean) return;
    // First writer wins, so a stored form keeps the slot Ekilex named it with
    // rather than the one a suffix rule would guess for the same string.
    if (!out.has(clean)) out.set(clean, caseKey);
  };

  const parts: Record<string, string> = {};
  for (const form of word.forms) parts[form.formType] = form.value;

  /*
    A PRINCIPAL PART IS NOT LABELLED AND THE SHORT ILLATIVE IS.

    `tuba` is its own nominative and its own partitive, so a card built on it
    cannot say which case the sentence was using it in, and the label is what
    the accuracy chart counts: a guess there is a wrong row rather than a
    missing one. `ILL_SG_SHORT` is the exception because it is not syncretic
    by construction, the dictionary only promotes it where it differs from all
    three principal parts, and it is the one case whose everyday form no rule
    reaches. Where it does coincide with a stored part, that part is written
    first and keeps the slot.

    A retrieved form names its own slot, which is what `morphCode` is.
  */
  for (const form of word.forms) {
    add(form.value, form.formType === "ILL_SG_SHORT" ? "ILLATIVE" : caseFromMorphCode(form.morphCode));
  }
  add(word.lemma, null);

  if (word.pos === "VERB") {
    for (const derived of derivedVerbForms({ lemma: word.lemma, pres1sg: pres1sgFrom(word.forms) })) {
      add(derived.value, null);
    }
    return out;
  }

  const stems = stemsFromParts(parts);
  for (const spec of CASES) {
    // `accepted` rather than the one shown, because a learner reading the
    // sentence met whichever spelling the lexicographer wrote: the short
    // illative and the long one are both the word, and either can be the gap.
    for (const value of caseAnswer(stems, spec.key)?.accepted ?? []) add(value, spec.key);
  }
  return out;
}

/**
 * The same, for a caller holding principal parts rather than form rows.
 *
 * The course's own word shapes carry `parts` because that is what the syllabus
 * harvest writes down, and a `Record` cannot say which slot Ekilex named a
 * retrieved form with. It does not need to: a seeded word has principal parts
 * and nothing else, so every case in the table is worked out from the genitive
 * stem either way.
 */
export function gapFormsFromParts(word: {
  readonly lemma: string;
  readonly pos: string;
  readonly parts: Readonly<Record<string, string>>;
}): Map<string, CaseKey | null> {
  return gapForms({
    lemma: word.lemma,
    pos: word.pos,
    forms: Object.entries(word.parts).map(([formType, value]) => ({ formType, value })),
  });
}
