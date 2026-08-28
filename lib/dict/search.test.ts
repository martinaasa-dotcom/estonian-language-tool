import { describe, expect, it } from "vitest";
import { fold } from "./search";

describe("fold", () => {
  it.each([
    ["sõna", "sona"],
    ["käsi", "kasi"],
    ["õppima", "oppima"],
    ["šokolaad", "sokolaad"],
  ])("strips diacritics from %s", (input, expected) => {
    expect(fold(input)).toBe(expected);
  });

  it("lets an undiacriticked query match the real word", () => {
    expect(fold("SÕNA")).toBe(fold("sona"));
  });
});

import { searchLexemes } from "./search";

// These run against the seeded development database.
describe("searchLexemes — inflected forms", () => {
  it.each([
    ["loen", "lugema", /present 1sg/],
    ["lugesin", "lugema", /past 1sg/],
    ["tuppa", "tuba", /short illative/],
    ["toas", "tuba", /inessive/],
    ["raamatuga", "raamat", /comitative/],
    ["tubadega", "tuba", /comitative plural/],
    ["raamatud", "raamat", /nominative plural/],
  ])("finds %s as a form of %s", async (query, lemma, why) => {
    const [top] = await searchLexemes(query);
    expect(top?.lemma).toBe(lemma);
    expect(top?.matchedAs).toMatch(why);
  });

  it("does not label a headword match as an inflected form", async () => {
    const [top] = await searchLexemes("tuba");
    expect(top?.lemma).toBe("tuba");
    expect(top?.matchedAs).toBeUndefined();
  });

  it("still prefers an exact English match over a folded Estonian one", async () => {
    const [top] = await searchLexemes("room");
    expect(top?.lemma).toBe("tuba");
  });
});
