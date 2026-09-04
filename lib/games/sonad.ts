/**
 * SÕNAD: SIX CIRCLES, SEVEN GUESSES, AND AN ESTONIAN WORD BEHIND THEM.
 *
 * The shape is the one everybody knows, and everything about it that somebody
 * else can own has been left alone deliberately rather than by accident. The
 * New York Times owns the name Wordle and the look of it, and has enforced
 * both. What it does not own, and could not, is the idea of guessing a word and
 * being told which letters were right: that is older than computers, since
 * Mastermind sold it in 1970 and Bulls and Cows was a pencil game before that.
 *
 * So: a different name, a different length, circles rather than squares, this
 * app's own three hues rather than green and yellow and grey, its own
 * animations, no line of anybody else's code and no shared word list.
 *
 * SIX LETTERS, WHICH IS A FACT ABOUT ESTONIAN AND ABOUT THIS DICTIONARY. Five
 * is the length the English game uses and it is the wrong one here twice over.
 * Estonian words are longer, and the graded dictionary this draws from holds
 * 450 five-letter content words against 603 at six, which after banding to a
 * learner's own level is 183 answers against 215 at A1, and 352 against 477 at
 * B1. Six is the bigger pool, the better game, and visibly not the other one.
 * Four was the alternative the brief offered: it has the biggest pool of all at
 * 816, and a four-letter word is guessed by accident.
 *
 * SEVEN GUESSES FOR SIX LETTERS. The English game gives six for five. Six for
 * six is the same ratio and it is not the same game: Estonian has nine vowels
 * where English is usually deducing among five, so a guesser who has placed
 * the consonants can still be choosing between `koolis`, `kuulis` and `küliss`
 * on the last row. The seventh is that one extra elimination.
 *
 * AND TWO CLUES, ON A LADDER, BECAUSE A CLUE THAT ARRIVES AT THE START IS PART
 * OF THE QUESTION. What kind of thing the word is comes on the fourth try,
 * which is the point at which somebody has stopped deducing and started
 * guessing; how many vowels it has comes on the last, where it is the
 * difference between finishing and being told. Both come out of the
 * dictionary: the category is Ekilex's own classification read through
 * `semanticCategory`, and the vowel count is arithmetic over the answer.
 * Nothing here is written about a word.
 *
 * Pure: strings in, marks out. Which word today is, and whether a guess is a
 * word at all, are database questions and live in `lib/progress/sonad.ts`.
 */

/** How long today's word is. See the header: a fact about the dictionary. */
export const SONAD_LENGTH = 6;

/** How many attempts. See the header: seven, and the seventh is the vowels. */
export const SONAD_GUESSES = 7;

/**
 * What one letter of a guess turned out to be.
 *
 * Named for the app's hues rather than for colours, because
 * `docs/14-design-system.md` fixes what each hue means and these three already
 * are those meanings: mint is "recalled", butter is "nearly", peach is
 * "missed". A fourth state would want a sixth hue and there is not one.
 */
export type Mark = "here" | "elsewhere" | "absent";

/**
 * Which letters were right, in the only way that handles a repeated letter.
 *
 * The naive rule marks a letter `elsewhere` whenever the answer holds it
 * anywhere, and gets a guess with two of a letter against an answer with one
 * wrong: both come back as near misses, which tells somebody something untrue
 * about a word they are deducing. So the exact hits are taken first and what is
 * left of the answer is a pool the misplaced ones draw from, one each.
 *
 * Case-folded, because a learner types what their keyboard gives them and the
 * answer is a dictionary headword. **Not** diacritic-folded: ö and o are
 * different letters, the difference is most of what makes spelling Estonian
 * hard, and a game that forgave it would be teaching the mistake.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const g = [...guess.toLocaleLowerCase("et")];
  const a = [...answer.toLocaleLowerCase("et")];
  const marks: Mark[] = g.map(() => "absent");

  const spare = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) marks[i] = "here";
    else spare.set(a[i]!, (spare.get(a[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === "here") continue;
    const left = spare.get(g[i]!) ?? 0;
    if (left > 0) {
      marks[i] = "elsewhere";
      spare.set(g[i]!, left - 1);
    }
  }
  return marks;
}

/**
 * The best thing known about each letter so far, for the on-screen keys.
 *
 * Best rather than latest: a letter shown `here` in guess two and `elsewhere`
 * in guess four is still in that place, and a keyboard that forgot it would be
 * quietly worse than the board above it.
 */
export function letterMarks(guesses: readonly string[], answer: string): Map<string, Mark> {
  const rank: Record<Mark, number> = { absent: 0, elsewhere: 1, here: 2 };
  const out = new Map<string, Mark>();
  for (const guess of guesses) {
    const marks = scoreGuess(guess, answer);
    [...guess.toLocaleLowerCase("et")].forEach((letter, i) => {
      const mark = marks[i] ?? "absent";
      const held = out.get(letter);
      if (!held || rank[mark] > rank[held]) out.set(letter, mark);
    });
  }
  return out;
}

export type Outcome = "playing" | "won" | "lost";

export function outcomeOf(guesses: readonly string[], answer: string): Outcome {
  const target = answer.toLocaleLowerCase("et");
  if (guesses.some((g) => g.toLocaleLowerCase("et") === target)) return "won";
  return guesses.length >= SONAD_GUESSES ? "lost" : "playing";
}

/** Which guess it was found on, counting from one, or null if it was not. */
export function solvedAt(guesses: readonly string[], answer: string): number | null {
  const target = answer.toLocaleLowerCase("et");
  const at = guesses.findIndex((g) => g.toLocaleLowerCase("et") === target);
  return at < 0 ? null : at + 1;
}

/**
 * What a finished round is worth in the review log, when the word is a card.
 *
 * ADR-016: every mode grades through the same log, so this is not a side game
 * with a score of its own. The mapping is about how much of the answer the
 * board had already given away by the time it was found.
 *
 * The first two guesses are recall: the player has the part of speech, the band
 * and a handful of letters, which is a harder question than the production card
 * asks. Three or four is the game working, which is a real answer with help.
 * Past that the clues have started arriving, so five, six, seven or a loss is
 * the board having told them, and `Again` is what the scheduler should hear
 * about that. The line sits where it does because it is drawn on what the
 * player was *given* rather than on how many rows are left: adding a seventh
 * try did not make guess five a better recall than it was.
 */
export function ratingFor(guesses: readonly string[], answer: string): 1 | 2 | 3 | 4 | null {
  const outcome = outcomeOf(guesses, answer);
  if (outcome === "playing") return null;
  const at = solvedAt(guesses, answer);
  if (at === null) return 1;
  if (at <= 2) return 4;
  if (at <= 4) return 3;
  return 2;
}

/**
 * WHEN EACH CLUE ARRIVES.
 *
 * Counted in guesses already made, so `cluesAt(3)` is what is on screen while
 * the fourth is being typed. Both are late on purpose: a category printed
 * beside the empty board is not a clue, it is part of the question, and the
 * whole of what a puzzle like this is worth is the stretch where you have to
 * work it out.
 *
 * The last row gets the vowel count because that is the row where the
 * alternative is being told the answer. Derived from `SONAD_GUESSES` rather
 * than typed, so a change to the number of tries carries.
 */
export const CATEGORY_AFTER = 3;

export interface Clues {
  /** Show what kind of thing the word is, where the dictionary has one. */
  readonly category: boolean;
  /** Show how many of the six letters are vowels. */
  readonly vowels: boolean;
}

export function cluesAt(guessed: number): Clues {
  return {
    category: guessed >= CATEGORY_AFTER,
    vowels: guessed >= SONAD_GUESSES - 1,
  };
}

/**
 * The next clue and how far off it is, so the board can say so.
 *
 * A clue that appears without warning reads as the rules moving under you.
 * Saying "what kind of word it is, on your next try" is a reason to keep
 * going, which is the half of a hint that is not the hint.
 */
export function nextClue(guessed: number, hasCategory: boolean): string | null {
  const clues = cluesAt(guessed);
  if (!clues.category && hasCategory) {
    const away = CATEGORY_AFTER - guessed;
    return `What kind of word it is, ${away === 1 ? "on your next try" : `in ${away} tries`}.`;
  }
  if (!clues.vowels) {
    const away = SONAD_GUESSES - 1 - guessed;
    return `How many vowels it has, ${away === 1 ? "on your last try" : `in ${away} tries`}.`;
  }
  return null;
}

/**
 * Estonian's vowels, which is the clue's whole content.
 *
 * Nine of them, and `y` with them: the guess list is every headword the Ekilex
 * enumeration brought back, loanwords included, and `süsteem` is not the only
 * word in it spelled with letters an Estonian alphabet chart leaves at the end.
 * Folding case, never diacritics, which is `scoreGuess`'s rule and for its
 * reason: ö and o are different letters and the whole difficulty of spelling
 * this language is that they are.
 */
const VOWELS = new Set([..."aeiouõäöüy"]);

export function vowelCount(word: string): number {
  return [...word.toLocaleLowerCase("et")].filter((letter) => VOWELS.has(letter)).length;
}

/** The letters a guess may be made of: Estonian's own alphabet, nothing else. */
export const SONAD_LETTERS = /^[a-zäöüõšž]+$/u;

/**
 * THE KEYS, LAID OUT AS AN ESTONIAN KEYBOARD RATHER THAN AS THE ALPHABET.
 *
 * They were `a b c d e ...` in a grid, on the argument that it is the order a
 * school poster uses and it puts õ ä ö ü together. A poster is read and a
 * keyboard is typed on: nobody has typed in alphabetical order since a
 * typewriter was a machine, so every letter had to be hunted for, and the
 * hunting is what the player is doing instead of thinking about the word.
 *
 * So it is the layout printed on the keys of every computer sold in Estonia.
 * QWERTY, with Ü and Õ closing the top row and Ö and Ä closing the home row,
 * which is exactly where somebody who types Estonian already reaches. Š and Ž
 * are AltGr keys on the real thing and have no place of their own, so they sit
 * at the end of the bottom row: `KnownWord` holds loanwords, a guess may
 * legitimately contain them, and a letter with no key is a word nobody can
 * type. That pairing is the rule and `sonad.test.ts` holds it in both
 * directions, because a keyboard missing a letter looks exactly like a
 * keyboard.
 *
 * Data rather than markup, for the reason the badges keep their icon *names*
 * here: what the rows are is a fact about Estonian, and how wide a key is
 * drawn is a fact about a phone.
 */
export const SONAD_KEY_ROWS: readonly (readonly string[])[] = [
  [..."qwertyuiopüõ"],
  [..."asdfghjklöä"],
  [..."zxcvbnmšž"],
];

/** Every letter the board offers, flattened, for a keyboard listener. */
export const SONAD_KEYS: readonly string[] = SONAD_KEY_ROWS.flat();

/** True when a guess is the right shape to be submitted at all. */
export function wellFormed(guess: string): boolean {
  const lower = guess.toLocaleLowerCase("et");
  return [...lower].length === SONAD_LENGTH && SONAD_LETTERS.test(lower);
}
