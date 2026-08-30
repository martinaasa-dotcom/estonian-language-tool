import { describe, expect, it } from "vitest";

import { resolvePos } from "./pos";

/**
 * Each case here is a real page whose label was wrong, or was right and could
 * easily have been broken by fixing the others.
 *
 * The whole fault this replaced was invisible: every wrong answer was a real
 * part of speech spelled correctly, and an Estonian adjective declines exactly
 * like a noun, so no screen looked broken and no sample would have found it.
 */
const inputs = (over: Partial<Parameters<typeof resolvePos>[0]> = {}) => ({
  sensePos: null,
  headwordPos: null,
  ekilexSaysVerb: false,
  fallback: "NOUN",
  ...over,
});

describe("resolvePos", () => {
  it("takes the heading the gloss sits under", () => {
    // `kallis`, shipped as NOUN because it is also listed as a noun.
    expect(resolvePos(inputs({ sensePos: "ADJECTIVE", headwordPos: "ADJECTIVE" }))).toBe("ADJECTIVE");
  });

  it("leaves a word alone whose first sense really is a noun", () => {
    /*
      `lamp` is in Wiktionary's adjectives category for a colloquial sense
      meaning "random", and `mari` for the Mari people. Both ship the noun
      gloss, so a rule reading the category rather than the line would have
      labelled them against their own answer side.
    */
    expect(resolvePos(inputs({ sensePos: "NOUN", headwordPos: "NOUN", fallback: "ADJECTIVE" }))).toBe("NOUN");
  });

  it("believes an adjective headword over a noun heading", () => {
    // `võimas`: headed `===Noun===`, declared `{{et-adj|võimsa|võimsat|s=võimsaim}}`.
    // The superlative parameter is something only an adjective has.
    expect(resolvePos(inputs({ sensePos: "NOUN", headwordPos: "ADJECTIVE" }))).toBe("ADJECTIVE");
  });

  it("does not let a noun headword overturn an adjective heading", () => {
    /*
      `üksik`, `lämbe`, `lämmi` and `miilipikkune` are all headed
      `===Adjective===` and declared `{{et-noun}}`, because an adjective
      declines like a noun and that is the template with the forms in it. It is
      a shrug, not a claim, and all four are adjectives.
    */
    expect(resolvePos(inputs({ sensePos: "ADJECTIVE", headwordPos: "NOUN" }))).toBe("ADJECTIVE");
  });

  it("lets Ekilex settle the verb question", () => {
    /*
      Eight pages head a verb `===Noun===` with `{{et-verb}}` under it:
      `väljuma`, `üllatama`, `hilinema`, `kastma` and four more. Ekilex draws
      this line properly, and it is the line that decides which principal parts
      a word has.
    */
    expect(resolvePos(inputs({ sensePos: "NOUN", headwordPos: "VERB", ekilexSaysVerb: true }))).toBe("VERB");
  });

  it("never labels a nominal a verb on the page's word alone", () => {
    // The stored principal parts would be a noun's, so a verb label makes a
    // card that cannot be answered. Wrong metadata is the smaller failure.
    expect(resolvePos(inputs({ sensePos: "VERB", headwordPos: "VERB", fallback: "NOUN" }))).toBe("NOUN");
    expect(resolvePos(inputs({ sensePos: "VERB", fallback: "VERB" }))).toBe("NOUN");
  });

  it("falls back to the candidate's category when the page heads it as something else", () => {
    // `===Postposition===`, `===Numeral===`, `===Participle===`: true things
    // this app has no column for. The category is all that is left.
    expect(resolvePos(inputs({ sensePos: null, fallback: "ADVERB" }))).toBe("ADVERB");
  });
});
