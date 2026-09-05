import { CASES, type CaseSpec } from "./cases";
import { caseFits, caseQuestionFor } from "./caseQuestion";
import { caseAnswer, stemsFrom } from "./derive";
import type { CaseKey } from "./types";

/**
 * Free-production exercises: "write a sentence putting `tuba` in the inessive".
 *
 * This is the half of the feature that does not involve a model, and it is
 * deliberately the half that decides whether the learner was right about the
 * *form*. ADR-005 forbids the model supplying an Estonian form, and the reason
 * generalizes: a model is not trustworthy about Estonian morphology, so it must
 * not be the thing that says whether a morpheme is correct either.
 *
 * So the split is:
 *   - the target form comes from Ekilex, or from the app's own derivation off
 *     the genitive stem — the same two sources the dictionary already trusts,
 *   - whether the learner used that form is checked here, by string matching,
 *   - and the model is left with what it is genuinely good at: judging whether
 *     the surrounding sentence is idiomatic, and explaining why.
 *
 * A model that hallucinates therefore cannot mark a correct answer wrong on the
 * morphology, which is the failure that would destroy trust fastest.
 */

/**
 * Cases that make a natural sentence and that a B1 learner actually reaches for.
 *
 * Both local trios are here and `caseFits` decides which of them the word in
 * front of the learner takes: `toas` for a room, `hobusel` for a horse,
 * `Saksamaal` for a country. This file had the list and never asked, so it was
 * setting `Kirjuta lause, kus on hobune sisseütlevas` and marking `hobusesse`
 * right.
 */
const WRITABLE_CASES: readonly CaseKey[] = [
  "INESSIVE", "ELATIVE", "ILLATIVE", "ALLATIVE", "ADESSIVE",
  "ABLATIVE", "COMITATIVE", "TRANSLATIVE", "PARTITIVE", "GENITIVE",
];

export interface WritingSource {
  lemma: string;
  translation: string;
  pos: string;
  /**
   * Which of the two sets of local cases the word takes, and whether it
   * answers `kes?` or `mis?`. See lib/estonian/caseQuestion.ts.
   */
  semanticTypes: string | null;
  /** Stored principal parts plus anything Ekilex supplied. */
  forms: { formType: string; value: string; morphCode?: string | null }[];
}

export interface WritingTask {
  lemma: string;
  translation: string;
  caseKey: CaseKey;
  caseEn: string;
  caseEt: string;
  caseQuestion: string;
  /** The form the learner must produce. Authoritative — never model-generated. */
  targetForm: string;
  /**
   * The other form that is also right, or `null`. The illative is the one case
   * that has one, and this is the field the comment on `authoritativeForm`
   * has always claimed made the marking fair: it said `accepted` was what did
   * that, and then kept `value` alone, so a learner asked for the illative of
   * `tuba` who wrote `toasse` was told they had not used the form at all.
   */
  alsoRight: string | null;
  /** Where the form came from, so the UI can be honest about it. */
  provenance: "ekilex" | "derived";
}

/** Ekilex morph codes for the singular of each case we set exercises on. */
/** Principal parts we store directly, for the two cases that have one. */
const FORM_TYPE_FOR_CASE: Partial<Record<CaseKey, string>> = {
  GENITIVE: "GEN_SG", PARTITIVE: "PART_SG",
};

/**
 * The authoritative form for one case, preferring Ekilex over derivation.
 * Returns null when neither source can supply it — in which case no exercise is
 * set, rather than one being invented.
 */
export function authoritativeForm(
  source: WritingSource,
  caseKey: CaseKey,
): { value: string; alsoRight: string | null; provenance: "ekilex" | "derived" } | null {
  const stored = FORM_TYPE_FOR_CASE[caseKey];
  if (stored) {
    const principal = source.forms.find((f) => f.formType === stored);
    // A principal part is one word: `FORM_TYPE_FOR_CASE` maps only the three,
    // and none of them is the illative, so there is no second form here.
    if (principal?.value) return { value: principal.value, alsoRight: null, provenance: "ekilex" };
  }

  /*
    THE ILLATIVE WAS BEING SET AS AN EXERCISE AND MARKED AGAINST THE WRONG FORM.

    This walked its own precedence: an Ekilex morph form, then the two
    principal parts, then a suffix on the genitive. `ILL_SG_SHORT` appeared in
    neither table, so a seeded word was marked against `X-sse` and a learner
    writing `tuppa` failed the exercise. Worse for an enriched word, where
    `SgIll` was found first and the short illative beside it was never looked
    at.

    `caseAnswer` is that precedence written once, in the module that owns it,
    with the short illative ahead of both. Its `accepted` list is what makes
    the marking fair where a word genuinely has two.
  */
  const answer = caseAnswer(stemsFrom(source.forms), caseKey);
  if (!answer) return null;
  return {
    value: answer.value,
    alsoRight: answer.alsoRight,
    provenance: answer.origin === "DERIVED" ? "derived" : "ekilex",
  };
}

/** Every exercise this word can support. Empty for a word with no genitive stem. */
export function writingTasksFor(source: WritingSource): WritingTask[] {
  if (source.pos !== "NOUN" && source.pos !== "ADJECTIVE") return [];

  const tasks: WritingTask[] = [];
  const subject = {
    lemma: source.lemma,
    semanticTypes: source.semanticTypes,
    nomSg: source.forms.find((f) => f.formType === "NOM_SG")?.value ?? null,
  };
  for (const caseKey of WRITABLE_CASES) {
    if (!caseFits(caseKey, subject)) continue;
    const form = authoritativeForm(source, caseKey);
    if (!form) continue;
    // A case whose form is identical to the headword teaches nothing here —
    // the learner could write the lemma and be marked right by accident.
    if (form.value.toLowerCase() === source.lemma.toLowerCase()) continue;

    const spec = CASES.find((c) => c.key === caseKey) as CaseSpec;
    tasks.push({
      lemma: source.lemma,
      translation: source.translation,
      caseKey,
      caseEn: spec.en,
      caseEt: spec.et,
      // The question this word answers, not the case's whole name.
      caseQuestion: caseQuestionFor(spec, subject),
      targetForm: form.value,
      alsoRight: form.alsoRight,
      provenance: form.provenance,
    });
  }
  return tasks;
}

/**
 * Punctuation that surrounds a word in a sentence and must not become part of
 * it. The dashes are written as escapes so the reader-copy sweep cannot see
 * them: they are characters being matched, not copy being shown, and losing
 * one would leave a dash stuck to the word beside it so that a learner who
 * used the required form correctly would be told they had not.
 */
const SENTENCE_PUNCTUATION = /[.,!?;:()"'\u00ab\u00bb\u201e\u201c\u201d\u2013\u2014]/g;

/** Lowercases and strips the punctuation that surrounds a word in a sentence. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(SENTENCE_PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FormCheck {
  /** True when the required form appears as a whole word. */
  used: boolean;
  /**
   * True when some other form of the same word appears instead — the common
   * near-miss, and worth a different message from "you ignored the task".
   */
  usedAnotherForm: boolean;
}

/**
 * Whether the learner actually produced the required form.
 *
 * Whole-word matching, because Estonian compounds and a substring test would
 * accept `toas` inside `toaseinal`. Case-insensitive, because the target word
 * may legitimately start the sentence.
 */
export function checkForm(sentence: string, task: WritingTask, allForms: string[]): FormCheck {
  const words = new Set(normalise(sentence).split(" "));
  /*
    EITHER ILLATIVE COUNTS, because both are the illative. `tuppa` and `toasse`
    are one answer to one question, and marking the second of them as "you used
    a different case" is the fault this module's header describes, arriving
    through the door marked "the exercise was still technically right".

    It also has to leave `others`, or the near miss below reports the learner's
    correct sentence as the wrong form of the word.
  */
  const right = [task.targetForm, task.alsoRight]
    .filter((f): f is string => !!f)
    .map(normalise);
  const used = right.some((f) => words.has(f));

  const others = allForms
    .map(normalise)
    .filter((f) => f && !right.includes(f));

  return { used, usedAnotherForm: !used && others.some((f) => words.has(f)) };
}

/** Rejects an "answer" that is too short to be a sentence, before spending a call. */
export function looksLikeSentence(text: string): boolean {
  const words = normalise(text).split(" ").filter(Boolean);
  return words.length >= 3;
}

export const MAX_SENTENCE_CHARS = 300;
