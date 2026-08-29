import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { searchLexemes } from "./search";

/**
 * The real query path, against a seeded database.
 *
 * The half that knows about Estonian — the ranking — is pure and lives in
 * `search.test.ts`, where it gates every commit without needing anything. This
 * checks the other half: that `searchLexemes` selects the right columns and
 * hands them to the ranker, which is a claim about Prisma rather than about
 * grammar, and so belongs in the suite that has a database.
 *
 *   npm run test:db
 */

afterAll(async () => { await prisma.$disconnect(); });

describe("searchLexemes against the seeded dictionary", () => {
  it("finds a word by an inflected form and says which form it was", async () => {
    const [top] = await searchLexemes("toas");
    expect(top?.lemma).toBe("tuba");
    expect(top?.matchedAs).toMatch(/inessive/);
  });

  it("finds a verb by a stored principal part", async () => {
    const [top] = await searchLexemes("lugesin");
    expect(top?.lemma).toBe("lugema");
    expect(top?.matchedAs).toMatch(/past 1sg/);
  });

  it("does not label a headword match as an inflected form", async () => {
    const [top] = await searchLexemes("tuba");
    expect(top?.lemma).toBe("tuba");
    expect(top?.matchedAs).toBeUndefined();
  });

  it("prefers an exact English match over a folded Estonian one", async () => {
    // "room" is English for tuba, and also folds to rõõm (joy).
    const [top] = await searchLexemes("room");
    expect(top?.lemma).toBe("tuba");
  });

  it("selects the columns the ranker needs", async () => {
    // A missing `forms` select would silently disable every inflected-form
    // rule while leaving headword search working, which is the failure mode
    // this test exists to catch.
    const [top] = await searchLexemes("tubadega");
    expect(top?.lemma).toBe("tuba");
    expect(top?.matchedAs).toMatch(/comitative plural/);
  });

  it("returns nothing for a query that matches nothing", async () => {
    expect(await searchLexemes("zzzzzzzz")).toEqual([]);
  });
});
