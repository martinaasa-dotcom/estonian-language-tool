import { describe, expect, it } from "vitest";
import { COMMON_WORDS } from "./frequency";
import { commonFirst, isCommonWord } from "./commonFirst";

/**
 * THE COMMONEST WORDS LEAD AND NOTHING IS DROPPED.
 *
 * The two claims that matter about a partition, plus the one this file was
 * written to make impossible: it may not become a rank. See the module header
 * for why a noun and a verb cannot be ranked against each other.
 */
describe("commonFirst", () => {
  const item = (lemma: string | null) => ({ lemma });
  const order = (lemmas: (string | null)[]) =>
    commonFirst(lemmas.map(item), (i) => i.lemma).map((i) => i.lemma);

  it("puts a word the corpus counts ahead of one it has never heard of", () => {
    expect(order(["aberratsioon", "ja"])).toEqual(["ja", "aberratsioon"]);
  });

  it("keeps the incoming order inside each bucket", () => {
    // `ja` and `aga` are both on a list; which of them leads is the caller's
    // order, because ranking them against each other would compare a count of
    // one kind of word against a count of another.
    expect(order(["aga", "ja"])).toEqual(["aga", "ja"]);
    expect(order(["ja", "aga"])).toEqual(["ja", "aga"]);
  });

  it("drops nothing", () => {
    const given = ["aberratsioon", "ja", null, "kohv", "aga"];
    expect(order(given).slice().sort()).toEqual(given.slice().sort());
  });

  it("treats a word with no lemma as one the corpus says nothing about", () => {
    expect(order([null, "ja"])).toEqual(["ja", null]);
  });

  it("is stable over an array holding none of them", () => {
    const none = ["aberratsioon", "kvantmehaanika"];
    expect(order(none)).toEqual(none);
  });

  it("recognises exactly what the generated table holds", () => {
    expect(isCommonWord(COMMON_WORDS[0]!.lemma)).toBe(true);
    expect(isCommonWord(COMMON_WORDS[COMMON_WORDS.length - 1]!.lemma)).toBe(true);
    expect(isCommonWord("aberratsioon")).toBe(false);
    expect(isCommonWord(null)).toBe(false);
    expect(isCommonWord(undefined)).toBe(false);
  });

  it("never folds a spelling, because the corpus is spelled correctly", () => {
    // The build script's own rule: `matchEstonianForm` folds diacritics for a
    // search box and folding here put `õli` at the top of the nouns on the
    // occurrences of `oli`. Nothing downstream may quietly reintroduce it.
    const withDiacritic = COMMON_WORDS.map((w) => w.lemma).find((l) => /[õäöüšž]/.test(l));
    expect(withDiacritic).toBeDefined();
    const folded = withDiacritic!
      .replace(/õ/g, "o").replace(/ä/g, "a").replace(/ö/g, "o")
      .replace(/ü/g, "u").replace(/š/g, "s").replace(/ž/g, "z");
    if (folded !== withDiacritic) expect(isCommonWord(folded)).toBe(false);
  });
});
