import { describe, expect, it } from "vitest";
import { nearest } from "./known";

/*
  Only the ranking is tested here. `isKnownWord` and `didYouMean` are two SQL
  statements each and belong to the integration suite; what has logic worth
  pinning is which of a candidate list is offered, and that is pure.
*/
describe("nearest", () => {
  it("offers a word one letter away", () => {
    // The reported spelling, one character short of a real word.
    expect(nearest("uudishmulik", ["uudishimulik", "uudishimu", "uudis"]))
      .toContain("uudishimulik");
  });

  it("never offers the word that was typed", () => {
    // A suggestion identical to the query reads as the app not listening.
    expect(nearest("tuba", ["tuba", "tubli"])).toEqual(["tubli"]);
  });

  it("does not offer a word that differs only by its diacritics", () => {
    /*
      `roomus` folds to exactly `rõõmus`, so it is not a near miss, it is the
      word typed without diacritics. `isKnownWord` folds both sides and has
      already said yes by the time this is asked, and offering "did you mean
      rõõmus" to somebody who just found rõõmus reads as the app not listening.
    */
    expect(nearest("roomus", ["rõõmus"])).toEqual([]);
  });

  it("compares folded and answers spelled", () => {
    // One letter out *and* missing its diacritics: the comparison folds, and
    // what comes back is the spelling the learner needs to see.
    expect(nearest("roomas", ["rõõmus"])).toEqual(["rõõmus"]);
  });

  it("drops a word too far away to be a typo", () => {
    expect(nearest("kohv", ["kohver", "kohvik", "kohtunik", "kool"]))
      .not.toContain("kohtunik");
  });

  it("offers at most three", () => {
    const many = ["kala", "kali", "kala-", "kalu", "kale", "kalk"];
    expect(nearest("kalx", many).length).toBeLessThanOrEqual(3);
  });

  it("puts the nearest first", () => {
    // `kool` is one edit from `kooli`, two from `koolis`.
    const [first] = nearest("kool", ["koolis", "kooli"]);
    expect(first).toBe("kooli");
  });

  it("breaks a tie the same way every time", () => {
    /*
      Two candidates at the same distance and the same length. Without the last
      key the order is whatever the caller's list happened to be, so the same
      query would offer a different word depending on how the rows came back.
    */
    const forwards = nearest("kals", ["kald", "kalb"]);
    const backwards = nearest("kals", ["kalb", "kald"]);
    expect(forwards).toEqual(backwards);
  });

  it("says nothing rather than reaching for something unrelated", () => {
    expect(nearest("xyzzy", ["kohv", "tuba", "raamat"])).toEqual([]);
  });

  it("rules a candidate out on length before measuring it", () => {
    // Not a behaviour test so much as the shape the shortcut has to preserve:
    // a word four letters longer is never a typo of this one.
    expect(nearest("kass", ["kassiomanik"])).toEqual([]);
  });
});
