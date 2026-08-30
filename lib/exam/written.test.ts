import { describe, expect, it } from "vitest";
import { usesRequiredWord, wordsOf } from "./written";

/*
  These two functions are shared between the marking and the screen somebody is
  writing on, which is the only reason they are a module of their own. So what is
  worth testing is the thing that made them shared: the same text gives the same
  answer whoever asks, including in the cases where a looser or a stricter rule
  would have been tempting.
*/

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
    expect(usesRequiredWord("raamat", "Mul on uus raamat kodus.")).toBe(true);
  });

  it("counts a word however it was inflected, because Estonian inflects", () => {
    expect(usesRequiredWord("raamat", "Ma lugesin raamatust ühe loo.")).toBe(true);
  });

  it("sees through the punctuation attached to a word", () => {
    expect(usesRequiredWord("raamat", "Kus on raamat?")).toBe(true);
  });

  it("does not count a word that is not there", () => {
    expect(usesRequiredWord("raamat", "Ma olen kodus ja loen.")).toBe(false);
  });

  it("does not count a different word that merely starts the same way", () => {
    // `kool` and `koolitus` share a stem; `koer` does not start like either.
    expect(usesRequiredWord("kool", "Mul on koer ja kass.")).toBe(false);
  });

  it("counts nothing for an empty required word, rather than everything", () => {
    // A lemma can be empty when a task anchored to a pool that had nothing in
    // it. Matching an empty prefix would light every chip on the screen and
    // award the words half of the marks for a blank answer.
    expect(usesRequiredWord("", "ükskõik mis")).toBe(false);
  });

  it("finds nothing in an answer nobody has started", () => {
    expect(usesRequiredWord("raamat", "")).toBe(false);
  });
});
