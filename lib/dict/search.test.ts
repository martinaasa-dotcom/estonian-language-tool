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

import { prisma } from "@/lib/db";
import { searchLexemes } from "./search";

/**
 * These exercise the real query path, so they need the seeded development
 * database. Without one they are skipped rather than failed: `npm test` should
 * stay runnable on a fresh clone — where the pure logic above is exactly what a
 * contributor wants to check — and a red suite that only means "no DATABASE_URL"
 * trains people to ignore red suites.
 */
const seeded = await prisma.lexeme
  .count()
  .then((n) => n > 0)
  .catch(() => false);

const describeWithDb = seeded ? describe : describe.skip;

describeWithDb("searchLexemes — inflected forms", () => {
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
