/**
 * SÕNAD: SIX CIRCLES, SIX GUESSES, AND AN ESTONIAN WORD BEHIND THEM.
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
 * SIX GUESSES FOR SIX LETTERS. The English game gives six for five, which is
 * generous; six for six is that same generosity at a length where Estonian's
 * nine vowels make the search wider.
 *
 * Pure: strings in, marks out. Which word today is, and whether a guess is a
 * word at all, are database questions and live in `lib/progress/sonad.ts`.
 */

/** How long today's word is. See the header: a fact about the dictionary. */
export const SONAD_LENGTH = 6;

/** How many attempts. */
export const SONAD_GUESSES = 6;

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
 * Five, six, or a loss is the board having told them, and `Again` is what the
 * scheduler should hear about that.
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

/** The letters a guess may be made of: Estonian's own alphabet, nothing else. */
export const SONAD_LETTERS = /^[a-zäöüõšž]+$/u;

/** True when a guess is the right shape to be submitted at all. */
export function wellFormed(guess: string): boolean {
  const lower = guess.toLocaleLowerCase("et");
  return [...lower].length === SONAD_LENGTH && SONAD_LETTERS.test(lower);
}
