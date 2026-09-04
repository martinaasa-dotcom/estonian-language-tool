import { describe, expect, it } from "vitest";
import {
  cluesAt, letterMarks, nextClue, outcomeOf, ratingFor, scoreGuess, solvedAt,
  SONAD_GUESSES, SONAD_KEY_ROWS, SONAD_KEYS, SONAD_LENGTH, SONAD_LETTERS,
  vowelCount, wellFormed,
} from "./sonad";

/**
 * The marking, which is the whole of the game and the one part that is subtle.
 *
 * Words invented rather than borrowed, wherever a test is about the rule and
 * not about Estonian: a fixture that spells a real word invites somebody to
 * read the assertion as a claim about that word.
 */

describe("scoreGuess", () => {
  it("marks the answer itself all here", () => {
    expect(scoreGuess("porgand".slice(0, 6), "porgan")).toEqual(
      ["here", "here", "here", "here", "here", "here"],
    );
  });

  it("marks a letter in the wrong place as elsewhere", () => {
    expect(scoreGuess("abcdef", "fabcde")).toEqual(
      ["elsewhere", "elsewhere", "elsewhere", "elsewhere", "elsewhere", "elsewhere"],
    );
  });

  it("marks a letter that is not there at all as absent", () => {
    expect(scoreGuess("xxxxxx", "abcdef")).toEqual(
      ["absent", "absent", "absent", "absent", "absent", "absent"],
    );
  });

  /**
   * The case the naive rule gets wrong, and the reason the function has a pool
   * in it. Two Bs guessed against one B in the answer: the one in the right
   * place is `here` and the second is `absent`, because there is no second B
   * for it to be elsewhere. Marking both would tell somebody the answer holds
   * two of a letter it holds one of, in a game about deducing exactly that.
   */
  it("does not spend one letter of the answer twice", () => {
    expect(scoreGuess("abbccc", "abzzzz")).toEqual(
      ["here", "here", "absent", "absent", "absent", "absent"],
    );
  });

  /**
   * And the same the other way: two in the answer and two guessed misplaced is
   * two near misses, not one.
   */
  it("spends every letter the answer really has", () => {
    expect(scoreGuess("bbxxxx", "ccccbb")).toEqual(
      ["elsewhere", "elsewhere", "absent", "absent", "absent", "absent"],
    );
  });

  it("prefers the exact hit when the same letter is guessed twice", () => {
    // One `a` in the answer, at the end. The guess has one at each end, and it
    // is the one in the right place that counts.
    expect(scoreGuess("axxxxa", "bxxxxa")).toEqual(
      ["absent", "here", "here", "here", "here", "here"],
    );
  });

  it("treats a diacritic as its own letter", () => {
    // ö and o are different letters, and forgiving that would teach the mistake.
    expect(scoreGuess("öxxxxx", "oxxxxx")[0]).toBe("absent");
  });

  it("ignores case", () => {
    expect(scoreGuess("ABCDEF", "abcdef").every((m) => m === "here")).toBe(true);
  });
});

describe("letterMarks", () => {
  it("keeps the best thing known about a letter, not the latest", () => {
    // `a` is in the right place in the first guess and misplaced in the second.
    const marks = letterMarks(["axxxxx", "xxxxxa"], "abcdef");
    expect(marks.get("a")).toBe("here");
  });

  it("says nothing about a letter nobody has guessed", () => {
    expect(letterMarks(["xxxxxx"], "abcdef").has("a")).toBe(false);
  });
});

describe("outcomeOf", () => {
  it("is still playing with guesses left", () => {
    expect(outcomeOf(["xxxxxx"], "abcdef")).toBe("playing");
  });

  it("is won the moment the answer is guessed, however late", () => {
    const guesses = Array.from({ length: SONAD_GUESSES - 1 }, () => "xxxxxx").concat("abcdef");
    expect(outcomeOf(guesses, "abcdef")).toBe("won");
    expect(solvedAt(guesses, "abcdef")).toBe(SONAD_GUESSES);
  });

  it("is lost when the guesses run out", () => {
    expect(outcomeOf(Array.from({ length: SONAD_GUESSES }, () => "xxxxxx"), "abcdef")).toBe("lost");
  });
});

describe("ratingFor", () => {
  it("says nothing while the round is unfinished", () => {
    expect(ratingFor(["xxxxxx"], "abcdef")).toBeNull();
  });

  it("reads an early solve as recall and a late one as help", () => {
    expect(ratingFor(["abcdef"], "abcdef")).toBe(4);
    expect(ratingFor(["xxxxxx", "abcdef"], "abcdef")).toBe(4);
    expect(ratingFor(["xxxxxx", "xxxxxx", "abcdef"], "abcdef")).toBe(3);
    expect(ratingFor(["xxxxxx", "xxxxxx", "xxxxxx", "xxxxxx", "abcdef"], "abcdef")).toBe(2);
  });

  it("reads a loss as Again, which is what the scheduler should hear", () => {
    expect(ratingFor(Array.from({ length: SONAD_GUESSES }, () => "xxxxxx"), "abcdef")).toBe(1);
  });
});

describe("wellFormed", () => {
  it("takes a word of the right length in Estonian letters", () => {
    expect(wellFormed("porgan")).toBe(true);
    expect(wellFormed("sõõrik".slice(0, 6))).toBe(true);
  });

  it("refuses the wrong length", () => {
    expect(wellFormed("abcde")).toBe(false);
    expect(wellFormed("abcdefg")).toBe(false);
    expect(SONAD_LENGTH).toBe(6);
  });

  it("refuses anything that is not a letter", () => {
    expect(wellFormed("abc de")).toBe(false);
    expect(wellFormed("abcde1")).toBe(false);
    expect(wellFormed("abcde-")).toBe(false);
  });
});

describe("the clue ladder", () => {
  it("says nothing at all on the first three tries", () => {
    for (const guessed of [0, 1, 2]) {
      expect(cluesAt(guessed)).toEqual({ category: false, vowels: false });
    }
  });

  it("gives the category on the fourth try and keeps it", () => {
    expect(cluesAt(3).category).toBe(true);
    expect(cluesAt(4).category).toBe(true);
  });

  /*
    The one that has to move with SONAD_GUESSES rather than with a number typed
    here: the point of it is the last row, whatever the last row turns out to
    be.
  */
  it("gives the vowels on the last try and not before", () => {
    expect(cluesAt(SONAD_GUESSES - 2).vowels).toBe(false);
    expect(cluesAt(SONAD_GUESSES - 1).vowels).toBe(true);
  });

  it("names what is coming, so a clue never arrives unannounced", () => {
    expect(nextClue(2, true)).toBe("What kind of word it is, on your next try.");
    expect(nextClue(1, true)).toBe("What kind of word it is, in 2 tries.");
    expect(nextClue(SONAD_GUESSES - 2, true)).toBe("How many vowels it has, on your last try.");
    expect(nextClue(SONAD_GUESSES - 1, true)).toBeNull();
  });

  /* A word the Institute classified as nothing useful skips straight to the
     vowels rather than promising a clue that will never come. */
  it("does not promise a category the dictionary does not have", () => {
    expect(nextClue(0, false)).toContain("vowels");
  });
});

describe("vowelCount", () => {
  it("counts Estonian's own nine, and y with them", () => {
    expect(vowelCount("õpetaja")).toBe(4);
    expect(vowelCount("küsimus")).toBe(3);
    expect(vowelCount("sport")).toBe(1);
    expect(vowelCount("rütmika")).toBe(3);
  });

  it("folds case and never a diacritic", () => {
    expect(vowelCount("KOOLIS")).toBe(3);
    // Both count, and they count as themselves: this is a tally, not a match.
    expect(vowelCount("tõõöõ")).toBe(4);
  });
});

describe("the keyboard", () => {
  /*
    BOTH DIRECTIONS, because each failure is invisible on its own. A letter
    with no key is a word a player can never type, and the board would look
    exactly like a board; a key for a letter no guess may contain is a key
    that refuses every word it is pressed into, and it would look exactly like
    a key.
  */
  it("offers every letter a guess may be spelled with", () => {
    for (const letter of "abcdefghijklmnopqrstuvwxyzäöüõšž") {
      expect(SONAD_LETTERS.test(letter), letter).toBe(true);
      expect(SONAD_KEYS, letter).toContain(letter);
    }
  });

  it("offers nothing a guess may not be spelled with", () => {
    for (const key of SONAD_KEYS) expect(SONAD_LETTERS.test(key), key).toBe(true);
  });

  it("has each key once", () => {
    expect(new Set(SONAD_KEYS).size).toBe(SONAD_KEYS.length);
  });

  /* Three rows is what makes it a keyboard rather than a grid of letters. */
  it("is three rows, none of them wider than a phone can draw", () => {
    expect(SONAD_KEY_ROWS).toHaveLength(3);
    for (const row of SONAD_KEY_ROWS) expect(row.length).toBeLessThanOrEqual(12);
  });
});
