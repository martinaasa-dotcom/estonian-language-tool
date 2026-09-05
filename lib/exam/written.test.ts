import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { acceptedUses, usesRequiredWord, wordsOf, type RequiredWord } from "./written";

/*
  These functions are shared between the marking and the screen somebody is
  writing on, which is the only reason they are a module of their own. So what
  is worth testing is the thing that made them shared: the same text gives the
  same answer whoever asks, including in the cases where a looser or a stricter
  rule would have been tempting.

  The words come out of the shipped dictionary rather than being typed here,
  because the forms are the whole of what decides this now, and a hand-written
  one would be this file inventing Estonian (ADR-005). Hermetic: it reads the
  file `npm run db:seed` loads and nothing else.
*/
interface SeedEntry {
  lemma: string;
  pos: string;
  forms: { formType: string; value: string }[];
}
const EXPANDED: SeedEntry[] = JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));

function word(lemma: string): RequiredWord {
  const entry = EXPANDED.find((e) => e.lemma === lemma);
  if (!entry) throw new Error(`${lemma} is not in the shipped dictionary`);
  return { lemma: entry.lemma, pos: entry.pos, forms: entry.forms };
}

describe("counting the words of a written answer", () => {
  it("ignores the whitespace people actually type", () => {
    expect(wordsOf("  ma   olen\n\nsiin  ")).toEqual(["ma", "olen", "siin"]);
  });

  it("counts nothing in an empty answer", () => {
    expect(wordsOf("   ")).toHaveLength(0);
  });
});

describe("whether a required word was used", () => {
  it("counts a word used in its headword form", () => {
    expect(usesRequiredWord(word("raamat"), "Mul on uus raamat kodus.")).toBe(true);
  });

  it("counts a word however it was inflected, because Estonian inflects", () => {
    expect(usesRequiredWord(word("raamat"), "Ma lugesin raamatust ühe loo.")).toBe(true);
    expect(usesRequiredWord(word("jõgi"), "Me käisime jõel.")).toBe(true);
    expect(usesRequiredWord(word("aeg"), "Mul ei ole aega.")).toBe(true);
  });

  it("counts a case the dictionary stores rather than derives", () => {
    // The short illative is lexically unpredictable and is what people say.
    expect(usesRequiredWord(word("jõgi"), "Ta hüppas jõkke.")).toBe(true);
  });

  it("counts a verb in a person the rule works out from the stored first person", () => {
    expect(usesRequiredWord(word("lugema"), "Ta loeb iga õhtu.")).toBe(true);
    expect(usesRequiredWord(word("lugema"), "Ma loeksin rohkem.")).toBe(true);
  });

  it("sees through the punctuation attached to a word", () => {
    expect(usesRequiredWord(word("raamat"), "Kus on raamat?")).toBe(true);
  });

  it("does not count a word that is not there", () => {
    expect(usesRequiredWord(word("raamat"), "Ma olen kodus ja loen.")).toBe(false);
  });

  /*
    THE ONE THAT WAS WRONG, AND WAS MARKING A REAL PAPER.

    The rule was a prefix match on the lemma minus its last letter, floored at
    three characters. `kiri` became `kir` and lit on `kirjutan`, `aeg` on
    `aeglane`, `abi` on `abikaasa`, `arv` on `arvan`. Over the shipped
    dictionary, 1,529 of its 5,363 headwords have a needle reaching a different
    headword.
  */
  it("does not count a different word that merely starts the same way", () => {
    expect(usesRequiredWord(word("kiri"), "Ma kirjutan sulle homme.")).toBe(false);
    expect(usesRequiredWord(word("aeg"), "See rong on väga aeglane.")).toBe(false);
    expect(usesRequiredWord(word("abi"), "Minu abikaasa on kodus.")).toBe(false);
    expect(usesRequiredWord(word("kool"), "Mul on koer ja kass.")).toBe(false);
  });

  it("still counts the word those sentences were standing in for", () => {
    expect(usesRequiredWord(word("kiri"), "Sain sinult kirja.")).toBe(true);
    expect(usesRequiredWord(word("abi"), "Tänan abi eest.")).toBe(true);
  });

  it("counts nothing for a word with no forms, rather than everything", () => {
    // A lemma can be empty when a task anchored to a pool that had nothing in
    // it. Matching an empty string would light every chip on the screen and
    // award the words half of the marks for a blank answer.
    expect(usesRequiredWord({ lemma: "", pos: "NOUN", forms: [] }, "ükskõik mis")).toBe(false);
  });

  it("finds nothing in an answer nobody has started", () => {
    expect(usesRequiredWord(word("raamat"), "")).toBe(false);
  });
});

describe("the forms behind the marking", () => {
  it("gives every shipped word more than its headword to be recognized by", () => {
    // A set of one would mark somebody down for writing the word in a sentence
    // rather than in the nominative, which is the opposite fault to the one
    // this replaced. Measured: the thinnest entry in the dictionary has ten.
    let thinnest = Number.POSITIVE_INFINITY;
    for (const entry of EXPANDED) {
      const size = acceptedUses({ lemma: entry.lemma, pos: entry.pos, forms: entry.forms }).size;
      if (size < thinnest) thinnest = size;
    }
    expect(thinnest).toBeGreaterThan(1);
  });

  it("writes no Estonian of its own: every form comes from the entry or a suffix rule", () => {
    const kiri = acceptedUses(word("kiri"));
    expect(kiri.has("kiri")).toBe(true);
    expect(kiri.has("kirja")).toBe(true);
    expect(kiri.has("kirjas")).toBe(true);
    expect(kiri.has("kirjutan")).toBe(false);
  });
});
