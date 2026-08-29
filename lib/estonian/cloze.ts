import { fold } from "@/lib/dict/search";

/**
 * Cloze exercises built from text the learner brought.
 *
 * The importer already accepts pasted text, but only ever harvested word pairs
 * out of it. That throws away the most valuable thing on the clipboard: a real
 * Estonian sentence, with a real inflected form in a real context.
 *
 * The trick that makes this safe is that nothing is generated. The answer to a
 * cloze is the word that was already sitting in the learner's own text, so it is
 * authoritative by construction — more so than a derived form, because a native
 * writer put it there. The app's only job is to notice which words it recognises
 * and blank them.
 *
 * This module is pure. It knows nothing about the database; the caller supplies
 * whatever forms it wants matched.
 */

export interface KnownForm {
  /** The exact spelling to look for. */
  value: string;
  lexemeId: string;
  lemma: string;
  translation: string;
  /** A readable name for the paradigm slot, shown as the hint. */
  formLabel: string;
}

export interface ClozeItem {
  /** The sentence, with the target replaced by a blank. */
  masked: string;
  /** The word that was removed. Comes from the learner's text, never invented. */
  answer: string;
  /** The full sentence, for the reveal. */
  sentence: string;
  lexemeId: string;
  lemma: string;
  translation: string;
  formLabel: string;
}

export const BLANK = " ____ ";

/** Splits a passage into sentences, keeping their terminating punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Words of a sentence, with the offsets needed to put a blank back in place. */
function tokenise(sentence: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  // Estonian letters plus the hyphen that joins compounds.
  const re = /[\p{L}\p{M}-]+/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sentence)) !== null) {
    out.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return out;
}

export interface ClozeOptions {
  /** A sentence shorter than this teaches nothing — there is no context to use. */
  minWords?: number;
  /** At most this many items, and never two from one sentence. */
  limit?: number;
}

/**
 * Finds every place a known form appears in the passage and blanks it.
 *
 * Matching is exact on the surface form, not diacritic-folded: the whole point
 * is that the learner produces `toas` rather than `toas`-ish, so accepting a
 * fold here would defeat the exercise. Folding is used only to reject a match
 * that differs *only* in diacritics, which is a spelling error in the source
 * rather than a different word.
 */
export function buildCloze(
  text: string,
  known: KnownForm[],
  options: ClozeOptions = {},
): ClozeItem[] {
  const { minWords = 4, limit = 20 } = options;

  // Longest form first: in `raamatute` we want the longest known form that
  // matches, not a shorter one that happens to be a prefix.
  const byValue = new Map<string, KnownForm>();
  for (const form of [...known].sort((a, b) => b.value.length - a.value.length)) {
    const key = form.value.toLowerCase();
    if (!byValue.has(key)) byValue.set(key, form);
  }

  const items: ClozeItem[] = [];

  for (const sentence of splitSentences(text)) {
    const tokens = tokenise(sentence);
    if (tokens.length < minWords) continue;

    // One blank per sentence. Two makes the remaining context too thin to use,
    // which turns a reading exercise into a guessing game.
    const hit = tokens.find((t) => {
      const form = byValue.get(t.word.toLowerCase());
      if (!form) return false;
      // A word that is its own lemma teaches nothing about inflection, but is
      // still worth drilling for recall, so it is kept.
      return fold(t.word.toLowerCase()) === fold(form.value.toLowerCase());
    });
    if (!hit) continue;

    const form = byValue.get(hit.word.toLowerCase())!;
    items.push({
      masked: sentence.slice(0, hit.start) + BLANK + sentence.slice(hit.end),
      answer: hit.word,
      sentence,
      lexemeId: form.lexemeId,
      lemma: form.lemma,
      translation: form.translation,
      formLabel: form.formLabel,
    });

    if (items.length >= limit) break;
  }

  return items;
}

/** Compares an attempt with the answer, forgiving case and surrounding space. */
export function isClozeCorrect(attempt: string, answer: string): boolean {
  return attempt.trim().toLowerCase() === answer.trim().toLowerCase();
}

/**
 * True when the attempt is right except for its diacritics — worth saying,
 * because `oppima` for `õppima` is a keyboard problem, not a knowledge one.
 */
export function isDiacriticSlip(attempt: string, answer: string): boolean {
  if (isClozeCorrect(attempt, answer)) return false;
  return fold(attempt.trim().toLowerCase()) === fold(answer.trim().toLowerCase());
}

export const MAX_PASSAGE_CHARS = 8000;
