import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetNewsCache } from "@/lib/news/feed";
import { oneEntryPerLemma } from "./search";
import { resetSuggestionCache, suggestWords, withATable } from "./suggest";

/**
 * What the dictionary offers somebody who has typed nothing, checked against a
 * real dictionary.
 *
 * The rule this defends has a name in this repository and it is `aberratsioon`:
 * the row used to read the first forty rows of an alphabetical list, so the
 * invitation to use the dictionary was three words nobody has ever needed. Two
 * filters keep that away and both are database facts, which is why they are
 * asserted here rather than over a fixture: a word carries a CEFR level, and it
 * is a part of speech with a paradigm behind it.
 *
 * The news feed is stubbed throughout. A test whose answer depends on what
 * happened in Estonia this morning is not a test, and this suite would
 * otherwise be the one place in the repository that reaches the network.
 */

const OWNER = "itest-owner-suggest";

/**
 * Words invented for this suite, so nothing here depends on what was seeded.
 *
 * Letters only and no hyphen, because these go through the headline reader on
 * their way in and it splits a word on anything that is not a letter.
 */
const UNGRADED = "itestaberratsioon";
const GRADED = "itestkohvik";
const CONJUNCTION = "itestning";

async function wipe() {
  await prisma.lexeme.deleteMany({ where: { lemma: { startsWith: "itest" } } });
  await prisma.setting.deleteMany({ where: { ownerId: OWNER } });
  await prisma.assessment.deleteMany({ where: { ownerId: OWNER } });
}

beforeEach(async () => {
  await wipe();
  resetNewsCache();
  resetSuggestionCache();
  vi.restoreAllMocks();
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

/**
 * Answers the feed with exactly these words, without going anywhere near it.
 *
 * One word per headline and no filler around it, which was learned here rather
 * than assumed: the first version wrote `<word> ja veel` and the row came back
 * carrying `vesi`, because `veel` is the adessive of it and the matcher
 * recognized the case. That is the gate working, and it is also why a stub for
 * it cannot pad its headlines with real Estonian.
 */
function feedSays(words: string[]) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      `<rss><channel><title>feed</title>${
        words.map((w) => `<item><title>${w}</title></item>`).join("")
      }</channel></rss>`,
      { status: 200 },
    ),
  );
}

/** The feed is unreachable, which is what most deployments and every phone see. */
function feedIsDown() {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
}

describe("the suggestion row", () => {
  it("never offers a word nothing has graded", async () => {
    await prisma.lexeme.create({
      data: { lemma: UNGRADED, pos: "NOUN", translation: "an aberration", cefr: null },
    });
    feedSays([UNGRADED]);

    for (let i = 0; i < 20; i += 1) {
      const row = await suggestWords(OWNER);
      expect(row.words, "an ungraded word reached the row").not.toContain(UNGRADED);
    }
  });

  it("never offers a word with no paradigm to open", async () => {
    await prisma.lexeme.create({
      data: { lemma: CONJUNCTION, pos: "OTHER", translation: "and", cefr: "A1" },
    });
    feedSays([CONJUNCTION]);

    for (let i = 0; i < 20; i += 1) {
      const row = await suggestWords(OWNER);
      expect(row.words, "a word with no paradigm reached the row").not.toContain(CONJUNCTION);
    }
  });

  it("keeps a lemma only when every entry under it has a table to open", async () => {
    /*
      THE ENTRY A LEARNER LANDS ON, not any entry sharing the lemma.

      A chip links to `/dictionary?q=<lemma>` and the dictionary answers with
      one entry, `bySubstance`'s. `@@unique` is on `(lemma, pos)`, so a lemma
      can hold more than one, and every source here filters the *rows* by part
      of speech: it kept a lemma on the strength of whichever entry its own
      filter matched. `oma` is the shipped instance and the test above is what
      caught it, the Wiktionary expansion heading it `Adjective` while the
      dictionary leads with the pronoun the course teaches.

      Asked of the rule directly rather than through the row, because the level
      source draws twelve at random out of a couple of thousand words in band:
      whether a planted pair is offered at all is a coin toss, and a check that
      passes because nothing was drawn is worse than no check. The two halves
      are the whole of the rule: a lone noun survives, and the same noun with a
      pronoun beside it does not.
    */
    const alone = "itestomataolinea";
    const paired = "itestomataolineb";
    await prisma.lexeme.create({
      data: { lemma: alone, pos: "NOUN", translation: "a thing", cefr: "A1" },
    });
    await prisma.lexeme.create({
      data: { lemma: paired, pos: "NOUN", translation: "a thing", cefr: "A1" },
    });
    await prisma.lexeme.create({
      data: { lemma: paired, pos: "PRONOUN", translation: "one's own", cefr: "A1" },
    });

    expect(await withATable([alone, paired]), `${paired} opens as a pronoun`).toEqual([alone]);
  });

  it("offers a word the feed mentioned as the lemma, never as the headline spelled it", async () => {
    /*
      A headline carries inflected forms, which is what makes this a real gate
      rather than a string comparison: `ettepaneku` is what is printed and
      `ettepanek` is what has a paradigm behind it. Eight words rather than
      one, because a source has to fill most of the row or it is passed over,
      and one match is not a row.
    */
    // Letters rather than numbers for the same reason as the hyphen above: a
    // digit is not a letter, so the reader would split the word in half.
    const lemmas = [..."abcdefgh"].map((letter) => `${GRADED}${letter}`);
    for (const lemma of lemmas) {
      await prisma.lexeme.create({
        data: {
          lemma, pos: "NOUN", translation: "a cafe", cefr: "A1",
          forms: { create: [{ formType: "GEN_SG", value: `${lemma}u` }] },
        },
      });
    }
    feedSays(lemmas.map((lemma) => `${lemma}u`));

    const row = await suggestWords(OWNER, new Date(), () => 0);
    expect(row.source, "the news source did not lead when it could fill the row").toBe("news");
    expect(row.label).toBe("In the news today");
    for (const word of row.words) {
      expect(lemmas, `${word} is not one of the headwords`).toContain(word);
      expect(word, "the row printed the form the headline used").not.toMatch(/u$/);
    }
  });

  it("fills the row from somewhere else when the feed is unreachable", async () => {
    feedIsDown();
    for (let i = 0; i < 10; i += 1) {
      const row = await suggestWords(OWNER, new Date(), () => 0);
      expect(row.source, "a dead feed still labeled the row as news").not.toBe("news");
      expect(row.words.length).toBe(12);
      expect(row.label).not.toBe("");
    }
  });

  it("stays inside the levels around a learner who has placed", async () => {
    feedIsDown();
    await prisma.setting.create({
      data: { ownerId: OWNER, key: "cefrPlacement", value: "A1" },
    });

    const lemmas = new Set<string>();
    for (let i = 0; i < 15; i += 1) {
      for (const word of (await suggestWords(OWNER)).words) lemmas.add(word);
    }
    /*
      THE ENTRY A LEARNER WOULD LAND ON, not every entry sharing the lemma.

      A chip is a link to `/dictionary?q=<lemma>` and the dictionary picks one
      entry by `bySubstance`, so that is the word the row is actually offering
      and the only one its promise is about. Read as "no entry with this lemma
      is outside the bands", this fails on any word with a homonym in another
      part of speech, and there is one: `või` is butter, a noun the food unit
      teaches, and the conjunction "or" that the connectives unit teaches. Both
      are A1, both are correct, and the row offers the noun.

      `oneEntryPerLemma` is the dictionary's own answer to which one that is,
      so asking it here is asking what the learner sees rather than what the
      table holds.
    */
    const rows = await prisma.lexeme.findMany({
      where: { lemma: { in: [...lemmas] } },
      select: { id: true, lemma: true, cefr: true, pos: true, provenance: true, forms: { select: { id: true } } },
    });
    const shown = oneEntryPerLemma(rows, [...lemmas]);
    expect(shown.length).toBeGreaterThan(0);
    for (const row of shown) {
      expect(["A1", "A2"], `${row.lemma} is ${row.cefr}, outside an A1 learner's band`)
        .toContain(row.cefr);
      expect(["NOUN", "VERB", "ADJECTIVE"], `${row.lemma} opens as a ${row.pos}, which has no case table`)
        .toContain(row.pos);
    }
  });

  it("says why it chose these words, whichever source answered", async () => {
    feedSays(["itest-nothing-matches-this"]);
    /*
      The roll is handed in rather than left to `Math.random`, one value inside
      each of the three orderings `order` draws from. This used to take 25
      draws and ask for two distinct sources, and with the feed stubbed empty
      the level source leads only on a roll past 0.8, so about one run in 260
      saw the season source 25 times and reported the others dead. A check
      that fails on a fair coin is a check people learn to re-run.
    */
    const seen = new Set<string>();
    for (const roll of [0, 0.6, 0.9]) {
      const row = await suggestWords(OWNER, new Date(), () => roll);
      expect(row.label.length, "a row of chips with nothing above it").toBeGreaterThan(3);
      seen.add(row.source);
    }
    expect(seen.size, "one source answered every time, so the others are dead").toBeGreaterThan(1);
  });
});
