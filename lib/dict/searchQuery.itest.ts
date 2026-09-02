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

/*
  A VERB NO DICTIONARY HOLDS, BECAUSE THE REAL ONES ARE NOT A FIXED FIXTURE.

  `helistab` is a stored form the moment Ekilex enriches `helistama`, which any
  earlier suite can cause by opening the entry, so a check on a real word
  passes through the stored-form branch on one machine and through the derived
  one on another. This verb has a first person and nothing else, so only the
  rule can reach its other persons.

  Spelled so nobody could mistake it for Estonian: this app writes none
  (ADR-005) and neither do its fixtures.
*/
const INVENTED = "zurptama";

afterAll(async () => {
  await prisma.lexeme.deleteMany({ where: { lemma: INVENTED } });
  await prisma.$disconnect();
});

describe("searchLexemes against the seeded dictionary", () => {
  it("finds a word by an inflected form and says which form it was", async () => {
    const [top] = await searchLexemes("toas");
    expect(top?.lemma).toBe("tuba");
    expect(top?.matchedAs).toMatch(/seesütlev \(inessive\)/);
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
    expect(top?.matchedAs).toMatch(/lihtminevik ma/);
  });

  /*
    THE FORM A BEGINNER MEETS IN EVERY SENTENCE THEY READ.

    The search stripped a case ending to find a genitive stem and knew nothing
    about a person ending, so a verb was findable by its lemma, its two
    infinitives, its stored first person and its stored simple past, and by
    nothing else. `ta helistab` is the third person, which is what a sentence
    in a textbook is written in, and it found nothing at all. Measured over
    sixty graded words and six forms each: that gap was every miss the search
    had, 87.5% of forms found before and 100% after.
  */
  it("finds a verb by a person the rule works out from its stored first person", async () => {
    const [third] = await searchLexemes("helistab");
    expect(third?.lemma).toBe("helistama");
    expect(third?.matchedAs).toMatch(/olevik ta/);

    const [plural] = await searchLexemes("helistame");
    expect(plural?.lemma).toBe("helistama");
  });

  it("finds a verb by its conditional, and names the mood a class names", async () => {
    const [hit] = await searchLexemes("loeksin");
    expect(hit?.lemma).toBe("lugema");
    expect(hit?.matchedAs).toMatch(/tingiv kõneviis ma/);
  });

  it("reaches a person nothing has ever stored, off the first person alone", async () => {
    await prisma.lexeme.deleteMany({ where: { lemma: INVENTED } });
    await prisma.lexeme.create({
      data: {
        lemma: INVENTED, translation: "to test the rule", pos: "VERB", provenance: "SEED",
        forms: { create: [{ formType: "PRES_1SG", value: "zurptan" }] },
      },
    });

    const [third] = await searchLexemes("zurptab");
    expect(third?.lemma).toBe(INVENTED);
    expect(third?.matchedAs).toMatch(/olevik ta \(present\)/);

    const [cond] = await searchLexemes("zurptaksime");
    expect(cond?.lemma).toBe(INVENTED);

    // And the entry is still findable by the one form it actually stores.
    const [stored] = await searchLexemes("zurptan");
    expect(stored?.lemma).toBe(INVENTED);
  });

  it("names the person in Estonian and the category in English, without repeating the pronoun", async () => {
    const [hit] = await searchLexemes("helistab");
    expect(hit?.matchedAs).toMatch(/olevik ta \(present\)/);
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
    expect(top?.matchedAs).toMatch(/mitmuse kaasaütlev/);
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
