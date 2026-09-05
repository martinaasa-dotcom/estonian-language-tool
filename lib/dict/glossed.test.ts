import { describe, expect, it } from "vitest";
import { glossTokens, type GlossedToken } from "./glossed";

/**
 * The pure half of putting a dictionary under a teaching sentence.
 *
 * What is asserted here is the division of labour rather than any Estonian:
 * every character of the sentence comes back in order, the taught form is
 * marked exactly as the screen marked it before this existed, and a word the
 * lookup will not vouch for comes back plain rather than guessed at.
 */

const entry = (lemma: string, gloss: string): GlossedToken["entry"] =>
  ({ lexemeId: `id-${lemma}`, lemma, gloss, matchedAs: null });

const dictionary = (known: Record<string, string>) => (word: string) => {
  const gloss = known[word.toLocaleLowerCase("et")];
  return gloss ? entry(word.toLocaleLowerCase("et"), gloss) : null;
};

const joined = (tokens: GlossedToken[]) => tokens.map((t) => t.text).join("");

describe("glossTokens", () => {
  it("gives the sentence back exactly as it was recorded", () => {
    const sentence = "Lausa uskumatu, kui muutunud ta on!";
    expect(joined(glossTokens(sentence, "uskumatu", () => null))).toBe(sentence);
  });

  it("marks the taught form and never offers it a gloss of its own", () => {
    const tokens = glossTokens("Ma joon kohvi.", "kohvi", dictionary({ kohvi: "coffee" }));
    const taught = tokens.filter((t) => t.taught);
    expect(taught.map((t) => t.text)).toEqual(["kohvi"]);
    expect(taught[0]?.entry).toBeNull();
  });

  it("looks up every other word the dictionary vouches for", () => {
    const tokens = glossTokens("Ma joon kohvi.", "kohvi", dictionary({ ma: "I", joon: "drink" }));
    const glossed = tokens.filter((t) => t.entry);
    expect(glossed.map((t) => t.text)).toEqual(["Ma", "joon"]);
    expect(glossed[0]?.entry?.gloss).toBe("I");
  });

  it("leaves a word it will not vouch for plain rather than guessing", () => {
    const tokens = glossTokens("Kallas ütles nii.", null, dictionary({ nii: "so" }));
    const plain = tokens.filter((t) => t.word && !t.entry);
    expect(plain.map((t) => t.text)).toEqual(["Kallas", "ütles"]);
  });

  it("asks about words rather than about the punctuation between them", () => {
    const asked: string[] = [];
    glossTokens("Kas sa tuled?", null, (word) => { asked.push(word); return null; });
    expect(asked).toEqual(["Kas", "sa", "tuled"]);
  });

  it("marks a hyphenated taught form whole, the way splitOnForm found it", () => {
    const tokens = glossTokens("See on üle-eestiline asi.", "üle-eestiline", () => null);
    expect(joined(tokens.filter((t) => t.taught))).toBe("üle-eestiline");
  });

  it("marks nothing when the sentence does not carry the form", () => {
    const tokens = glossTokens("Ma joon vett.", "kohvi", () => null);
    expect(tokens.some((t) => t.taught)).toBe(false);
  });
});

describe("the form's name on the panel", () => {
  it("does not repeat the headword printed above it", async () => {
    const { __test } = await import("./glossed");
    expect(__test.withoutLemma("omastav (genitive) of kaitsevägi", "kaitsevägi"))
      .toBe("omastav (genitive)");
  });

  it("keeps a label it does not recognise rather than losing it", async () => {
    const { __test } = await import("./glossed");
    expect(__test.withoutLemma("genitive of something else", "kaitsevägi"))
      .toBe("genitive of something else");
    expect(__test.withoutLemma(undefined, "kaitsevägi")).toBeNull();
  });
});
