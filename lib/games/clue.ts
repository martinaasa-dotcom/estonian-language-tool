import { mentions } from "@/lib/estonian/cloze";

/**
 * WHAT A CROSSWORD CLUE IS, AND WHICH WORD IT IS ALLOWED TO BE ABOUT.
 *
 * NOTHING HERE WRITES A CLUE. The clue is the English gloss already beside the
 * entry, cut to its first sense or two, with the kind of word named. A model
 * writing crossword clues would be a model writing about Estonian a learner
 * then acts on, and this app has one answer to that (ADR-005). Every rule
 * below only ever *refuses* a clue or labels it; none of them writes English.
 *
 * WHY THIS IS A FILE AND NOT THREE LINES IN THE COMPILER. A learner reported
 * `3 down: human`, typed `inimene`, which is what a human is, watched it fit
 * the seven squares, and was marked wrong: the answer was `inimlik`, the
 * adjective. Nothing about that clue was false. `inimlik` is glossed "human"
 * and `inimene` is glossed "human being", and the two are different entries
 * with different parts of speech, so no check the app had could see it. What
 * the learner had in front of them was one English word that is a noun and an
 * adjective in English, over a row of the right length for both.
 *
 * A gap-fill or a flashcard can widen its answer instead, which is what
 * `acceptedAnswers` does for a word with two right spellings. A crossword
 * cannot: the grid is a fixed number of squares crossing other words, so
 * exactly one string can go in it, and a clue with two honest answers is a
 * trick rather than a question. So the clue narrows until it has one.
 *
 * TWO RULES, AND THEY CATCH DIFFERENT THINGS.
 *
 * A CLUE SAYS WHAT KIND OF WORD IT WANTS. English does not mark a part of
 * speech and Estonian derivation does: "human" is a noun and an adjective in
 * English and is two words here, and so is "clean", "light" and "empty".
 * `human · adjective` is `inimlik` and nothing else, and it costs one word of
 * the line. It is the hint a production card has carried since the deck was
 * built (`lib/srs/cards.ts` sets `hint: lex.pos.toLowerCase()`), on the one
 * screen that had never printed it. Measured over the shipped dictionary it
 * separates the pair above and six other clue lines outright.
 *
 * AND NO OTHER ENTRY ANSWERS IT. Naming the kind is not enough on its own,
 * because 92 clue lines in the shipped dictionary are the same line over the
 * same part of speech: `kena` and `ilus` are both "beautiful", and whichever
 * of them the grid wants, the other is a correct answer to the clue printed
 * above it. `clueClashes` finds them and both are refused, which is the rule
 * `senses.ts` reaches for a production card pointed at a screen that cannot
 * widen. Read over the **whole** dictionary rather than the day's band, and
 * that is the half that would have caught the report if the parts of speech
 * had matched: `inimene` is A1 and the grid was B1, so the rival was never in
 * the pool and a check against the pool would have passed.
 *
 * A SENSE SET RATHER THAN A STRING, because a clue is a list. "a friend" and
 * "a friend, a mate" are two different strings and one of them is every word
 * the other one is: everything the shorter clue says is true of both entries,
 * so it has two answers. Comparing the strings finds 319 refusals of the 2,290
 * words the pool can draw on and comparing the sets finds 665, which is 29% of
 * the pool and the reason this is worth measuring rather than reasoning about.
 * What is left is 271 words at A1 and 511 at B1, against a grid that wants
 * seven, so the cost is a word the compiler was never going to reach.
 *
 * Pure: entries in, strings out. Which entries is a database question and
 * lives in `lib/progress/crossword.ts`.
 */

/**
 * A clue is one line. A gloss like "a devil, an evil spirit, the deuce" is
 * three, and a crossword clue that is longer than the grid is a paragraph with
 * a box under it. Measured on the gloss rather than on the finished line, so
 * naming the kind of word does not silently drop the longest clues.
 */
const MAX_CLUE = 46;

/** How many senses of a gloss a clue keeps. Two is a clue; five is a list. */
const MAX_SENSES = 2;

/** The separator a label takes here, as everywhere else in the app. */
const LABEL = " · ";

/** One dictionary entry, as much of it as a clue needs. */
export interface ClueWord {
  readonly lemma: string;
  readonly pos: string;
  readonly translation: string;
}

/** What `clueClashes` returns and `crosswordFor` looks an entry up by. */
export function clueKey(lemma: string, pos: string): string {
  return `${lemma}|${pos}`;
}

/**
 * The senses a gloss offers, trimmed to what a clue may print.
 *
 * The first `;` or `/` segment, split on commas, at most two. Empty where the
 * gloss is blank or too long to be a line, which is what makes an entry with
 * no usable clue and an entry whose clue nobody can answer one case.
 */
function senses(translation: string): string[] {
  const first = translation.split(/[;/]/)[0] ?? "";
  const parts = first.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_SENSES);
  if (parts.length === 0) return [];
  return parts.join(", ").length > MAX_CLUE ? [] : parts;
}

/**
 * A gloss cut down to a clue, or nothing where it will not go.
 *
 * Dropped rather than truncated mid-word where it is still too long: a clue
 * cut off in the middle is worse than one word fewer in the grid.
 *
 * AND NOTHING WHERE THE CLUE IS THE ANSWER, which is the case this could not
 * see while it was handed a gloss and no word. A few dozen Estonian words are
 * spelled the same in English: the clue for `film` was "film", and for `sport`
 * it was "sport, sports", so the answer was written across the grid above the
 * squares it goes in. Measured on the shipped dictionary, 34 of the 5,329
 * words with a usable clue, 23 of them the answer exactly.
 *
 * `answer` and `pos` are both required rather than optional for the reason
 * `illSgShort` is: a caller that has not thought about either should not
 * compile. Whole words and case-insensitive, because a crossword is typed
 * without case and "August" over `august` gives away every letter of it.
 */
export function clueFrom(translation: string, answer: string, pos: string): string {
  const parts = senses(translation);
  if (parts.length === 0) return "";
  const gloss = parts.join(", ");
  if (mentions(gloss, answer)) return "";

  const kind = pos.trim().toLowerCase();
  return kind ? `${gloss}${LABEL}${kind}` : gloss;
}

/**
 * Every entry whose clue another entry answers just as well.
 *
 * Returns `lemma|pos` keys, and returns **both** sides of a clash rather than
 * keeping one: which of `kena` and `ilus` a grid ought to have is not a
 * question the dictionary can answer, and keeping either would leave the other
 * one standing as a correct answer that is marked wrong.
 *
 * A clash is a subset in either direction over one part of speech: everything
 * A's clue says is true of B, or the other way round. Equality is the case
 * where both hold, which is why it is not tested for separately.
 *
 * Rivals are looked up through a posting list per sense rather than compared
 * pairwise. Two entries can only be a subset of one another if they share a
 * sense, so the entries worth comparing against are the ones filed under one
 * of this clue's own two senses, which is a handful rather than six thousand.
 */
export function clueClashes(words: readonly ClueWord[]): Set<string> {
  const withSenses = words
    .map((w) => ({ key: clueKey(w.lemma, w.pos), pos: w.pos, senses: senses(w.translation) }))
    .filter((w) => w.senses.length > 0);

  const filed = new Map<string, typeof withSenses>();
  for (const word of withSenses) {
    for (const sense of word.senses) {
      const at = `${sense.toLowerCase()}|${word.pos}`;
      const group = filed.get(at) ?? [];
      group.push(word);
      filed.set(at, group);
    }
  }

  const covers = (a: readonly string[], b: readonly string[]) =>
    a.every((sense) => b.some((other) => other.toLowerCase() === sense.toLowerCase()));

  const out = new Set<string>();
  for (const word of withSenses) {
    for (const sense of word.senses) {
      for (const rival of filed.get(`${sense.toLowerCase()}|${word.pos}`) ?? []) {
        if (rival.key === word.key) continue;
        if (covers(word.senses, rival.senses) || covers(rival.senses, word.senses)) {
          out.add(word.key);
          out.add(rival.key);
        }
      }
    }
  }
  return out;
}
