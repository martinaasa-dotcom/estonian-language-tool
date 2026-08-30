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

  /*
    The dictionary is now thousands of words rather than the few hundred
    somebody typed, and the search that served the small one did not survive
    the change: it read every lexeme into memory with `take: 4000` and no
    ordering, so past four thousand entries words silently stopped being
    findable and which ones was undefined. `lugesin` stopped finding `lugema`
    while both the verb and its stored past tense sat in the table.

    This is the guard. It asserts against a dictionary big enough for the old
    cap to have bitten, so a return to filtering in memory fails here rather
    than in front of a learner.
  */
  it("still finds a word when the dictionary is larger than any in-memory cap", async () => {
    const words = await prisma.lexeme.count();
    expect(words, "seed the full dictionary before running this").toBeGreaterThan(4000);

    // The last word alphabetically is the one an unordered LIMIT drops first.
    const last = await prisma.lexeme.findFirst({
      orderBy: { lemma: "desc" },
      select: { lemma: true },
    });
    expect(last?.lemma).toBeTruthy();
    const hits = await searchLexemes(last!.lemma);
    expect(hits.map((h) => h.lemma)).toContain(last!.lemma);
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

describe("a query containing LIKE's own wildcards", () => {
  /*
    `%` and `_` are wildcards to LIKE, and pasted text is full of them. This is
    the half `search.test.ts` cannot check: whether the `ESCAPE` clause and the
    escaping function agree with each other and with Postgres. All three have
    to, and only a real database can say so.
  */
  it("treats an underscore as a character, not as any character", async () => {
    // `s_na` matched `sõna` before the escaping went in: the underscore stood
    // for the letter the learner could not type.
    const hits = await searchLexemes("s_na");
    expect(hits.map((h) => h.lemma)).not.toContain("sõna");
  });

  it("does not turn a stray percent sign into a match-everything", async () => {
    const hits = await searchLexemes("%");
    // Unescaped this is "every word in the dictionary". A literal percent is
    // in no Estonian lemma, so the honest answer is nothing.
    expect(hits).toHaveLength(0);
  });

  it("still finds an ordinary word", async () => {
    // The escaping must be invisible to every query that does not need it.
    const hits = await searchLexemes("tuba");
    expect(hits.map((h) => h.lemma)).toContain("tuba");
  });
});
