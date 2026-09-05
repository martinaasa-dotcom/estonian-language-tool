/**
 * Turning a real Estonian sentence into an exercise.
 *
 * Two exercises, one rule: **nothing here writes Estonian.** A cloze blanks a
 * word out of a sentence a lexicographer recorded; a sentence builder shuffles
 * the words of one. Both only ever rearrange or hide text that came from
 * Ekilex, which is what makes them safe under ADR-005 — an app that generated
 * its own example sentences would be drilling invented morphology into memory,
 * which is the one failure this codebase is organized to prevent.
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
/**
 * Whether `word` stands in `text` as a whole word, ignoring case.
 *
 * The boundaries are the same character class the rest of this module splits
 * on rather than `\b`, which is defined on ASCII: `\bõun\b` does not mean what
 * it looks like, because õ is not a word character to a regular expression.
 * The hyphen is deliberately outside the class it would be a range inside, and
 * is not escaped: `\-` is an invalid escape under the `u` flag and throws
 * rather than failing to match, which is what took every hyphenated Estonian
 * word through `splitOnForm` the hard way.
 *
 * One definition, because two questions turn on it: whether a gap leaves its
 * own answer standing in the sentence, and whether the hint under the gap
 * hands it over.
 */
export function mentions(text: string, word: string): boolean {
  const wanted = word.trim();
  if (!wanted) return false;
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{M}-])${escaped}(?![\\p{L}\\p{M}-])`, "iu").test(text);
}

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

  const blanked = text.slice(0, best.index) + BLANK + text.slice(best.index + best.value.length);

  /*
    AND THE GAP MAY NOT LEAVE ITS OWN ANSWER STANDING. Only one occurrence is
    blanked, the longest match, so a sentence that says the word twice gave it
    away: `Poisid läksid ____ (= hakkasid kaklema).` had `kaklema` on the back
    and `kaklema` four words along, and `... ____ teenindajakaart on taksojuhi
    kohta ...` asked for `taksojuhi` with `taksojuhi` in the same line.

    Rejected rather than blanked twice, because two gaps taking one answer is a
    different exercise and the marker takes one string. The caller has other
    sentences, and fifteen cards across the whole dictionary is what this costs.
  */
  if (mentions(blanked, best.value)) return null;

  return {
    text: blanked,
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

/**
 * Is this a sentence a learner should be asked to read at all?
 *
 * Ekilex records a usage against a *sense*, not against a lesson, so what
 * comes back under a headword is sometimes not a sentence and sometimes not
 * about the word a learner thinks they are being asked. Three shapes turned up
 * in a real sitting and all three are mechanical.
 *
 * A usage that trails off, carries a slash between two alternatives, or is
 * numbered out of a list of definitions is a dictionary's own shorthand rather
 * than a sentence: `Uuringud näitavad, et ..` and `Elekter läks ära / kadus.`
 * are both perfectly good lexicography and neither is answerable. A usage with
 * no closing punctuation is a fragment for the same reason.
 *
 * And a usage that opens with the headword followed by a comma is the label
 * pattern, where the entry names itself and then illustrates: `Kahvel, lipp
 * kukub!` is filed under `kahvel` and is a sailing call about a gaff, not a
 * fork, which is exactly the question a learner cannot answer and cannot
 * argue with. Only a nominal is caught by it, because a verb standing before a
 * comma is an ordinary main clause: `Usun, et ta ei valeta` is a real
 * sentence and stays.
 *
 * Measured over the shipped dictionary: 8,826 usages pass the length rules and
 * this rejects 101 of them, so it costs almost nothing and it removes the ones
 * that were being read as errors in the app.
 */
/**
 * The label pattern, as `naturalSentence` needs to be told about it.
 *
 * A usage that opens with its own headword and a comma is a dictionary
 * illustrating a sense rather than a sentence somebody said, and the sense is
 * often not the one the gloss beside it names. Only a nominal, because a verb
 * before a comma is an ordinary main clause.
 *
 * It lives here rather than beside either caller because there are two: the
 * level check has always passed it and the deck's gap-fill cards did not, so
 * `Kahvel, lipp kukub!` was refused in an exam and made into a flashcard.
 */
export function nominalOpener(
  pos: string,
  forms: readonly string[],
): ((opening: string) => boolean) | undefined {
  if (pos === "VERB") return undefined;
  const known = new Set(forms.map((f) => f.trim().toLowerCase()));
  return (opening: string) => known.has(opening.trim().toLowerCase());
}

export function naturalSentence(sentence: string, opensWithNominal?: (word: string) => boolean): boolean {
  const text = sentence.trim();
  if (!/[.!?]$/.test(text)) return false;
  if (/\.\.|…|\/|[()]|\d\s*\)/.test(text)) return false;

  const opening = text.match(/^([\p{L}\p{M}]+)\s*,/u)?.[1];
  if (opening && opensWithNominal?.(opening)) return false;

  return true;
}
