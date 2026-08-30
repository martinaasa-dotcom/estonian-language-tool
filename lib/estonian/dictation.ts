import { droppedDiacritics, editDistance } from "./answer";

/**
 * Marking a dictation.
 *
 * Typing back a sentence you have only heard is the hardest thing the app asks
 * for, and the only exercise that tests listening, spelling and word boundaries
 * at once — Estonian runs its case endings straight onto the stem, so hearing
 * `toas` and writing `toa` is a real and specific failure rather than a slip.
 *
 * Which is exactly why a single right/wrong verdict would be useless. A learner
 * who got eleven words out of twelve needs to see *which* one, and whether they
 * missed the word or only its diacritics. So this aligns what was typed against
 * what was said, word by word, and labels each pairing.
 *
 * Alignment is Needleman–Wunsch rather than a naive zip: drop one word early in
 * a sentence and every later word shifts, so zipping would mark a nearly
 * perfect answer as entirely wrong. Sentences are a dozen words at most, so the
 * quadratic table costs nothing.
 *
 * Nothing here writes Estonian. It compares a typed string against a sentence
 * that came from Ekilex (ADR-005).
 */

export type WordStatus =
  /** Typed exactly, ignoring case and punctuation. */
  | "right"
  /** The right word without its Estonian letters — `oues` for `õues`. */
  | "diacritics"
  /** One keystroke out. */
  | "typo"
  /** A different word in the same slot. */
  | "wrong"
  /** In the sentence, not in the answer. */
  | "missing"
  /** In the answer, not in the sentence. */
  | "extra";

export interface DictationWord {
  /** The word as the sentence has it, for display. Null for an extra word. */
  expected: string | null;
  /** The word as it was typed. Null for a word that was left out. */
  typed: string | null;
  status: WordStatus;
}

export interface DictationResult {
  words: DictationWord[];
  /** Words typed exactly right. */
  right: number;
  /** Words in the sentence. Extra words are counted as errors, not as length. */
  total: number;
  /** Percentage of the sentence typed exactly right, 0–100. */
  accuracy: number;
  verdict: "correct" | "diacritics" | "close" | "wrong";
  /** What to grade the card, unless the learner overrides it. */
  suggestedRating: 1 | 2 | 3;
  /** A one-line summary, ready to display. */
  note: string;
}

const FOLD: Record<string, string> = { õ: "o", ä: "a", ö: "o", ü: "u", š: "s", ž: "z" };

function fold(text: string): string {
  return [...text].map((ch) => FOLD[ch] ?? ch).join("");
}

/** Lowercase and strip the punctuation a listener cannot hear. */
/*
  Punctuation that is not part of a word, stripped before two spellings are
  compared.

  Written with escapes rather than the characters themselves. This reads
  dashes, it never writes one, and a literal em dash sitting in a character
  class is indistinguishable from copy to the reader-copy guard that walks
  this file. It was rewritten into a comma once already, which quietly turned
  a stray dash in a dictated Ekilex sentence into a word the learner had to
  type.
*/
const PUNCTUATION = /[.,!?;:"'`\u00b4\u2019\u201c\u201d\u00ab\u00bb()\u2013\u2014]/g;

function normalise(word: string): string {
  return word
    .toLocaleLowerCase("et")
    .normalize("NFC")
    .replace(PUNCTUATION, "")
    .trim();
}

/** Words as typed, with anything that normalises to nothing dropped. */
export function dictationWords(text: string): string[] {
  return text.split(/\s+/).map((w) => w.trim()).filter((w) => normalise(w).length > 0);
}

type Pairing = Exclude<WordStatus, "missing" | "extra">;

/**
 * A slipped keystroke, as opposed to a different form of the word.
 *
 * One edit apart is not enough on its own here: Estonian case endings *are* one
 * or two letters, so `toa` and `toas` are one edit apart and are the genitive
 * and the inessive. Forgiving that as a typo would forgive exactly the thing
 * dictation exists to test. So the ending has to survive — either the words are
 * the same length (a substitution somewhere inside) or they still end alike.
 */
function isTypo(expected: string, typed: string): boolean {
  if (expected.length < 4) return false;
  if (editDistance(typed, expected, 1) > 1) return false;
  if (expected.length === typed.length) return true;
  return expected.slice(-2) === typed.slice(-2);
}

/** How well two words match, and what to call it. */
function compare(expected: string, typed: string): Pairing {
  const e = normalise(expected);
  const t = normalise(typed);
  if (e === t) return "right";
  if (fold(e) === fold(t)) return "diacritics";
  if (isTypo(e, t)) return "typo";
  return "wrong";
}

/** Alignment cost: cheap for a match, dearer the further from one it gets. */
const COST: Record<Pairing, number> = { right: 0, diacritics: 0.4, typo: 0.6, wrong: 1.6 };
/** Leaving a word out, or inventing one, costs about as much as getting it wrong. */
const GAP = 1;

export function checkDictation(typed: string, expected: string): DictationResult {
  const want = dictationWords(expected);
  const got = dictationWords(typed);

  const words = align(want, got);
  const right = words.filter((w) => w.status === "right").length;
  const total = want.length;
  const accuracy = total === 0 ? 0 : Math.round((right / total) * 100);

  return { words, right, total, accuracy, ...judge(words, right, total, accuracy) };
}

/**
 * Needleman–Wunsch over words, then a walk back through the table to recover
 * which words were matched, dropped and invented.
 */
function align(want: string[], got: string[]): DictationWord[] {
  const rows = want.length;
  const cols = got.length;

  // table[i][j] = cost of aligning the first i expected words with the first j typed.
  const table: number[][] = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0));
  for (let i = 1; i <= rows; i++) table[i]![0] = i * GAP;
  for (let j = 1; j <= cols; j++) table[0]![j] = j * GAP;

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      const pair = table[i - 1]![j - 1]! + COST[compare(want[i - 1]!, got[j - 1]!)];
      const skipExpected = table[i - 1]![j]! + GAP;
      const skipTyped = table[i]![j - 1]! + GAP;
      table[i]![j] = Math.min(pair, skipExpected, skipTyped);
    }
  }

  const out: DictationWord[] = [];
  let i = rows;
  let j = cols;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const status = compare(want[i - 1]!, got[j - 1]!);
      if (table[i]![j] === table[i - 1]![j - 1]! + COST[status]) {
        out.push({ expected: want[i - 1]!, typed: got[j - 1]!, status });
        i--; j--;
        continue;
      }
    }
    if (i > 0 && table[i]![j] === table[i - 1]![j]! + GAP) {
      out.push({ expected: want[i - 1]!, typed: null, status: "missing" });
      i--;
      continue;
    }
    out.push({ expected: null, typed: got[j - 1]!, status: "extra" });
    j--;
  }
  return out.reverse();
}

function judge(
  words: DictationWord[],
  right: number,
  total: number,
  accuracy: number,
): Pick<DictationResult, "verdict" | "suggestedRating" | "note"> {
  if (total === 0 || words.every((w) => w.typed === null)) {
    return { verdict: "wrong", suggestedRating: 1, note: "Nothing typed." };
  }

  if (right === total && words.length === total) {
    return { verdict: "correct", suggestedRating: 3, note: "Word for word." };
  }

  // Only the letters that Estonian writes and English does not. Worth its own
  // verdict: the learner heard every word, which is the hard half.
  const onlyDiacritics = words.every((w) => w.status === "right" || w.status === "diacritics");
  if (onlyDiacritics) {
    const slipped = words.filter((w) => w.status === "diacritics").length;
    return {
      verdict: "diacritics",
      suggestedRating: 2,
      note: slipped === 1
        ? "Every word heard, one is missing its Estonian letters."
        : `Every word heard, ${slipped} are missing their Estonian letters.`,
    };
  }

  if (accuracy >= 60) {
    return {
      verdict: "close",
      suggestedRating: 2,
      note: `${right} of ${total} words exactly right.`,
    };
  }

  return {
    verdict: "wrong",
    suggestedRating: 1,
    note: total === right ? "Extra words crept in." : `${right} of ${total} words right, play it again.`,
  };
}

/**
 * What went wrong with one word, in words.
 *
 * THE DISTINCTION THIS EXERCISE EXISTS FOR WAS IN A TOOLTIP.
 *
 * `diacritics` and `typo` are the whole pedagogical claim of dictation: the
 * README promises the marking shows "whether you only lost its Estonian
 * letters", and that is a different lesson from a slipped finger. They were
 * rendered identically — same background, same ink, same "you: ‹typed›" line —
 * and told apart only by a `title` attribute, which is a hover tooltip. On a
 * phone, which is the device this app is measured on, hover does not happen,
 * so on the primary device the exercise's headline distinction was invisible.
 *
 * The main review flow already had this right: `checkAnswer` produces a
 * sentence and `ReviewSession` prints it. This is that, per word, and it
 * reuses `droppedDiacritics` rather than rewriting the loop, so the two
 * cannot drift apart on which letters they know about.
 *
 * `wrong`, `missing` and `extra` return null on purpose. What is already on
 * screen — the word that was expected, the word that was typed, "left out",
 * the strikethrough — says everything a label would, and a chip that explains
 * an obvious mistake at length is a chip nobody reads.
 *
 * Nothing here writes Estonian: every letter named comes out of the sentence
 * Ekilex recorded (ADR-005).
 */
export function wordNote(word: DictationWord): string | null {
  if (!word.expected || !word.typed) return null;

  if (word.status === "diacritics") {
    const dropped = droppedDiacritics(word.typed, word.expected);
    return dropped.length > 0 ? dropped.join(", ") : "the dots and tildes";
  }

  if (word.status === "typo") {
    // Deliberately not "which" keystroke. The point of separating this from a
    // dropped diacritic is that this one is a slip and that one is a thing to
    // learn; spelling out the slip would give the two the same weight again.
    return "one letter out";
  }

  return null;
}
