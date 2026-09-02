import { describe, expect, it } from "vitest";
import {
  letterMarks, outcomeOf, ratingFor, scoreGuess, solvedAt, SONAD_GUESSES, SONAD_LENGTH, wellFormed,
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
