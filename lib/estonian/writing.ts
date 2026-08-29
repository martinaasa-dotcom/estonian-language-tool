import { CASES, type CaseSpec } from "./cases";
import { deriveCase } from "./derive";
import type { CaseKey } from "./types";

/**
 * Free-production exercises: "write a sentence putting `tuba` in the inessive".
 *
 * This is the half of the feature that does not involve a model, and it is
 * deliberately the half that decides whether the learner was right about the
 * *form*. ADR-005 forbids the model supplying an Estonian form, and the reason
 * generalises: a model is not trustworthy about Estonian morphology, so it must
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

/** Cases that make a natural sentence and that a B1 learner actually reaches for. */
const WRITABLE_CASES: readonly CaseKey[] = [
  "INESSIVE", "ELATIVE", "ILLATIVE", "ALLATIVE", "ADESSIVE",
  "ABLATIVE", "COMITATIVE", "TRANSLATIVE", "PARTITIVE", "GENITIVE",
];

export interface WritingSource {
  lemma: string;
  translation: string;
  pos: string;
  /** Stored principal parts plus any full Ekilex paradigm. */
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
  /** Where the form came from, so the UI can be honest about it. */
  provenance: "ekilex" | "derived";
}

/** Ekilex morph codes for the singular of each case we set exercises on. */
const MORPH_FOR_CASE: Partial<Record<CaseKey, string>> = {
  GENITIVE: "SgG", PARTITIVE: "SgP", ILLATIVE: "SgIll", INESSIVE: "SgIn",
  ELATIVE: "SgEl", ALLATIVE: "SgAll", ADESSIVE: "SgAd", ABLATIVE: "SgAbl",
  TRANSLATIVE: "SgTr", COMITATIVE: "SgKom",
};

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
): { value: string; provenance: "ekilex" | "derived" } | null {
  const morph = MORPH_FOR_CASE[caseKey];
  if (morph) {
    const fromEkilex = source.forms.find(
      (f) => f.morphCode === morph || f.formType === `EKILEX:${morph}`,
    );
    if (fromEkilex?.value) return { value: fromEkilex.value, provenance: "ekilex" };
  }

  const stored = FORM_TYPE_FOR_CASE[caseKey];
  if (stored) {
    const principal = source.forms.find((f) => f.formType === stored);
    if (principal?.value) return { value: principal.value, provenance: "ekilex" };
  }

  const genSg = source.forms.find((f) => f.formType === "GEN_SG")?.value;
  if (!genSg) return null;
  const derived = deriveCase(genSg, caseKey);
  return derived ? { value: derived, provenance: "derived" } : null;
}

/** Every exercise this word can support. Empty for a word with no genitive stem. */
export function writingTasksFor(source: WritingSource): WritingTask[] {
  if (source.pos !== "NOUN" && source.pos !== "ADJECTIVE") return [];

  const tasks: WritingTask[] = [];
  for (const caseKey of WRITABLE_CASES) {
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
      caseQuestion: spec.question,
      targetForm: form.value,
      provenance: form.provenance,
    });
  }
  return tasks;
}

/** Lowercases and strips the punctuation that surrounds a word in a sentence. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()"'«»„“”–—]/g, " ")
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
  const used = words.has(normalise(task.targetForm));

  const others = allForms
    .map(normalise)
    .filter((f) => f && f !== normalise(task.targetForm));

  return { used, usedAnotherForm: !used && others.some((f) => words.has(f)) };
}

/** Rejects an "answer" that is too short to be a sentence, before spending a call. */
export function looksLikeSentence(text: string): boolean {
  const words = normalise(text).split(" ").filter(Boolean);
  return words.length >= 3;
}

export const MAX_SENTENCE_CHARS = 300;
