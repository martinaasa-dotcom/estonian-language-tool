/**
 * Turning a real Estonian sentence into an exercise.
 *
 * Two exercises, one rule: **nothing here writes Estonian.** A cloze blanks a
 * word out of a sentence a lexicographer recorded; a sentence builder shuffles
 * the words of one. Both only ever rearrange or hide text that came from
 * Ekilex, which is what makes them safe under ADR-005 — an app that generated
 * its own example sentences would be drilling invented morphology into memory,
 * which is the one failure this codebase is organised to prevent.
 *
 * Pure and framework-free, like the rest of `lib/estonian/`.
 */

/**
 * Letters, plus the marks that live inside an Estonian word.
 *
 * Exported because three modules were matching Estonian words with three
 * copies of it, each with its own comment saying it mirrored one of the
 * others. A hyphenated compound or a word with an apostrophe in it is a thing
 * the whole app has to agree about, so it is written once here and imported.
 */
export const ESTONIAN_WORD = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;

export interface Cloze {
  /** The sentence with the target replaced by a blank. */
  text: string;
  /** The form that was removed, exactly as it appeared. */
  answer: string;
  /** The whole sentence, for revealing afterwards. */
  full: string;
  /** Character index of the blank, for highlighting the answer on reveal. */
  index: number;
}

export const BLANK = "____";

/**
 * Blanks out whichever of `forms` appears in the sentence.
 *
 * The *longest* match wins: a word list for `tuba` contains both `toa` and
 * `toas`, and blanking the shorter one out of "toas" would leave "____s",
 * which asks a question nobody can answer.
 *
 * Returns null when the sentence contains no form of the word (Ekilex usages
 * are attached to a meaning, and a few genuinely do not repeat the headword),
 * or when blanking would leave a one-word sentence with nothing to go on.
 */
export function buildCloze(sentence: string, forms: readonly string[]): Cloze | null {
  const text = sentence.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const wanted = new Map<string, string>();
  for (const form of forms) {
    const clean = form.trim().toLowerCase();
    if (clean) wanted.set(clean, clean);
  }
  if (wanted.size === 0) return null;

  const tokens = [...text.matchAll(ESTONIAN_WORD)];
  if (tokens.length < 3) return null; // too short to be a question

  let best: { value: string; index: number } | null = null;
  for (const token of tokens) {
    const value = token[0];
    if (!wanted.has(value.toLowerCase())) continue;
    if (!best || value.length > best.value.length) {
      best = { value, index: token.index };
    }
  }
  if (!best) return null;

  return {
    text: text.slice(0, best.index) + BLANK + text.slice(best.index + best.value.length),
    answer: best.value,
    full: text,
    index: best.index,
  };
}

/**
 * The word tiles for a sentence-building exercise.
 *
 * Punctuation is stripped from the tiles: a full stop clinging to the last word
 * would give the ending away, and a comma would give the clause boundary away.
 * It is put back when the sentence is shown complete.
 */
export function sentenceTiles(sentence: string): string[] {
  return [...sentence.trim().matchAll(ESTONIAN_WORD)].map((m) => m[0]);
}

/** Compares a built sentence with the original, ignoring punctuation and case. */
export function sentenceMatches(built: readonly string[], original: string): boolean {
  const target = sentenceTiles(original).map((w) => w.toLowerCase());
  if (built.length !== target.length) return false;
  return built.every((word, i) => word.toLowerCase() === target[i]);
}

/**
 * Is this sentence worth asking someone to rebuild?
 *
 * Four to twelve words: below that there is no ordering to get wrong, above it
 * the exercise becomes a memory test of the sentence rather than of Estonian.
 * A sentence with a repeated word is rejected too — two identical tiles make
 * "wrong order" unfalsifiable.
 */
export function isBuildable(sentence: string): boolean {
  const tiles = sentenceTiles(sentence);
  if (tiles.length < 4 || tiles.length > 12) return false;
  const lowered = tiles.map((t) => t.toLowerCase());
  return new Set(lowered).size === lowered.length;
}
