import { describe, expect, it } from "vitest";
import { clueClashes, clueFrom, clueKey, clueParts, type ClueWord } from "./clue";

/**
 * The clue, over invented entries.
 *
 * Hermetic, which is what moving this out of `lib/progress/crossword.itest.ts`
 * bought: deciding what a clue says is a question about two strings and a part
 * of speech, and it was being asked behind a Postgres connection.
 */
describe("clueFrom", () => {
  it("keeps at most two senses", () => {
    expect(clueFrom("a devil, an evil spirit, the deuce", "kurat", "NOUN"))
      .toBe("a devil, an evil spirit · noun");
  });

  it("takes the first group where a gloss is split by a semicolon", () => {
    expect(clueFrom("to read; to count", "lugema", "VERB")).toBe("to read · verb");
  });

  it("drops a gloss too long to be a clue rather than cutting it mid-word", () => {
    expect(clueFrom("a".repeat(60), "pikk", "ADJECTIVE")).toBe("");
  });

  it("drops an empty gloss", () => {
    expect(clueFrom("   ", "tühi", "ADJECTIVE")).toBe("");
  });

  /*
    A CLUE THAT IS THE ANSWER WRITES IT ACROSS THE TOP OF THE GRID. The clue is
    the English beside the entry, and a few dozen Estonian words are spelled
    the same in English: 34 of the 5,329 words in the shipped dictionary with a
    usable clue, 23 of them the answer exactly.
  */
  it("drops a clue that is the answer", () => {
    expect(clueFrom("film", "film", "NOUN")).toBe("");
    expect(clueFrom("number", "number", "NOUN")).toBe("");
    expect(clueFrom("monument", "monument", "NOUN")).toBe("");
  });

  it("drops a clue that merely contains the answer as a word", () => {
    expect(clueFrom("sport, sports", "sport", "NOUN")).toBe("");
    expect(clueFrom("norm, quota", "norm", "NOUN")).toBe("");
    // Typed without case, so a capital letter hides nothing.
    expect(clueFrom("August", "august", "NOUN")).toBe("");
  });

  it("keeps a clue that only looks like the answer", () => {
    // `mark` inside `market` is not the word, and the clue is the whole point.
    expect(clueFrom("a market", "mark", "NOUN")).toBe("a market · noun");
    expect(clueFrom("a lamp shade", "lambivari", "NOUN")).toBe("a lamp shade · noun");
  });

  /*
    THE REPORT. `3 down: human` was answered `inimene`, which is what a human
    is, and the grid wanted `inimlik`, the adjective. Both are seven letters,
    so the row filled and the answer was marked wrong. English does not mark a
    part of speech and Estonian derivation does, so the clue says which.
  */
  it("names the kind of word it wants", () => {
    expect(clueFrom("human", "inimlik", "ADJECTIVE")).toBe("human · adjective");
    expect(clueFrom("human being", "inimene", "NOUN")).toBe("human being · noun");
  });
});

/*
  The label is this app's and the gloss is the dictionary's, so anything
  comparing a clue against the entry it came from has to take the two apart
  first. `crossword.itest.ts` asserted that a grid's clue is contained in its
  own gloss and read the whole line, which the kind of word broke: "dance" does
  not contain "dance · noun".
*/
describe("clueParts", () => {
  it("reads a clue back into the gloss and the kind", () => {
    expect(clueParts("a devil, an evil spirit · noun"))
      .toEqual({ gloss: "a devil, an evil spirit", kind: "noun" });
  });

  it("says a clue naming no kind names none, rather than guessing one", () => {
    expect(clueParts("a market")).toEqual({ gloss: "a market", kind: "" });
  });

  it("takes the last separator, since a gloss may carry one", () => {
    expect(clueParts("a · b · verb")).toEqual({ gloss: "a · b", kind: "verb" });
  });
});

describe("clueClashes", () => {
  const word = (lemma: string, pos: string, translation: string): ClueWord =>
    ({ lemma, pos, translation });

  it("refuses both sides of a clue two entries answer", () => {
    const clashes = clueClashes([
      word("kena", "ADJECTIVE", "beautiful"),
      word("ilus", "ADJECTIVE", "beautiful"),
      word("suur", "ADJECTIVE", "big"),
    ]);
    expect(clashes).toEqual(new Set([
      clueKey("kena", "ADJECTIVE"), clueKey("ilus", "ADJECTIVE"),
    ]));
  });

  /*
    A clue is a list rather than a string, so "a friend" and "a friend, a mate"
    are two different lines and everything the first one says is true of both
    entries. Comparing the strings finds 319 refusals in the shipped dictionary
    and comparing the sets finds 665.
  */
  it("refuses a clue whose senses are all another entry's", () => {
    const clashes = clueClashes([
      word("sõber", "NOUN", "a friend"),
      word("semu", "NOUN", "a friend, a mate"),
    ]);
    expect(clashes.size).toBe(2);
  });

  it("leaves a clue that shares one sense of two", () => {
    const clashes = clueClashes([
      word("sõber", "NOUN", "a friend, a companion"),
      word("semu", "NOUN", "a friend, a mate"),
    ]);
    expect(clashes.size).toBe(0);
  });

  /*
    Naming the kind of word is the other half of the rule, so two entries whose
    glosses read alike and whose parts of speech do not are two clues.
  */
  it("does not clash two kinds of word", () => {
    const clashes = clueClashes([
      word("inimlik", "ADJECTIVE", "human"),
      word("inimene", "NOUN", "human"),
    ]);
    expect(clashes.size).toBe(0);
  });

  it("says nothing about an entry with no usable gloss", () => {
    const clashes = clueClashes([
      word("üks", "NOUN", ""),
      word("kaks", "NOUN", "   "),
    ]);
    expect(clashes.size).toBe(0);
  });
});
