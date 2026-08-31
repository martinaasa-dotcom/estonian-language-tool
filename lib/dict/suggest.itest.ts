import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetNewsCache } from "@/lib/news/feed";
import { resetSuggestionCache, suggestWords } from "./suggest";

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
 * recognised the case. That is the gate working, and it is also why a stub for
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
      expect(row.source, "a dead feed still labelled the row as news").not.toBe("news");
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
    const rows = await prisma.lexeme.findMany({
      where: { lemma: { in: [...lemmas] } },
      select: { lemma: true, cefr: true, pos: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(["A1", "A2"], `${row.lemma} is ${row.cefr}, outside an A1 learner's band`)
        .toContain(row.cefr);
      expect(["NOUN", "VERB", "ADJECTIVE"]).toContain(row.pos);
    }
  });

  it("says why it chose these words, whichever source answered", async () => {
    feedSays(["itest-nothing-matches-this"]);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const row = await suggestWords(OWNER);
      expect(row.label.length, "a row of chips with nothing above it").toBeGreaterThan(3);
      seen.add(row.source);
    }
    expect(seen.size, "one source answered every time, so the others are dead").toBeGreaterThan(1);
  });
});
