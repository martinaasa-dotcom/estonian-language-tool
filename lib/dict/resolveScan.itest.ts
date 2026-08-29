import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { candidatesFor, resolveOneWord, resolveScannedItems } from "./resolveScan";

/**
 * The gate between a photograph and the deck, run against a real dictionary.
 *
 * The matching logic itself is unit tested over fixtures in `search.test.ts`.
 * What needs a database is the half that decides *what to match against*: a
 * page of homework is full of inflected forms, and the whole feature rests on
 * a retrieved paradigm and a derived case being just as good a match as the
 * headword. Fixtures cannot show that, because the paradigm is the thing that
 * comes out of the database.
 */

const LEMMA = "itest-scan-tuba";
const DECOY = "itest-scan-mitteseotud";

async function wipe() {
  const lexemes = await prisma.lexeme.findMany({
    where: { lemma: { startsWith: "itest-scan-" } },
    select: { id: true },
  });
  const ids = lexemes.map((l) => l.id);
  if (ids.length) {
    await prisma.card.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.form.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.lexeme.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeEach(async () => {
  await wipe();
  await prisma.lexeme.create({
    data: {
      lemma: LEMMA, pos: "NOUN", translation: "room", cefr: "A1", provenance: "EKILEX",
      forms: {
        create: [
          { formType: "NOM_SG", value: LEMMA },
          { formType: "GEN_SG", value: "itest-scan-toa" },
          { formType: "PART_SG", value: LEMMA },
          { formType: "EKILEX:SgIn", value: "itest-scan-toas", morphCode: "SgIn", isPrincipal: false },
        ],
      },
    },
  });
  // A word with nothing to do with the one being looked for, so that "the
  // query narrows" can be asserted rather than assumed.
  await prisma.lexeme.create({
    data: { lemma: DECOY, pos: "NOUN", translation: "decoy", cefr: "A1", provenance: "EKILEX" },
  });
});

afterAll(wipe);

describe("resolveScannedItems", () => {
  it("vouches for a headword the dictionary holds", async () => {
    const [item] = await resolveScannedItems([{ et: LEMMA, en: "chamber" }]);
    expect(item?.lexemeId).toBeTruthy();
    expect(item?.lemma).toBe(LEMMA);
    // The dictionary's English wins over the page's: this one was read by a
    // camera and the other was not.
    expect(item?.translation).toBe("room");
  });

  it("traces a retrieved paradigm form back to its headword", async () => {
    const [item] = await resolveScannedItems([{ et: "itest-scan-toas", en: "" }]);
    expect(item?.lemma).toBe(LEMMA);
    expect(item?.matchedAs).toContain("inessive");
  });

  it("traces a case derived from the genitive stem, which no Form row holds", async () => {
    // ADR-009: derived forms are never persisted. A page printing one still has
    // to resolve, or most of a homework exercise would come back unrecognised.
    const [item] = await resolveScannedItems([{ et: "itest-scan-toale", en: "" }]);
    expect(item?.lemma).toBe(LEMMA);
    expect(item?.matchedAs).toContain("allative");
  });

  it("hands back a word it cannot vouch for, marked as exactly that", async () => {
    const [item] = await resolveScannedItems([{ et: "itest-scan-puudub", en: "missing" }]);
    expect(item?.lexemeId).toBeNull();
    expect(item?.lemma).toBeNull();
    // The page's own gloss survives, because it is all there is to show.
    expect(item?.en).toBe("missing");
  });

  it("keeps the page's order and length, so a screen lines up with the paper", async () => {
    const items = await resolveScannedItems([
      { et: "itest-scan-puudub", en: "" },
      { et: LEMMA, en: "" },
    ]);
    expect(items.map((i) => i.et)).toEqual(["itest-scan-puudub", LEMMA]);
  });

  it("asks nothing of the database for an empty page", async () => {
    expect(await resolveScannedItems([])).toEqual([]);
  });
});

describe("resolveOneWord", () => {
  it("re-resolves a spelling the learner corrected", async () => {
    expect((await resolveOneWord(LEMMA))?.lexemeId).toBeTruthy();
  });

  it("has nothing to say about an empty correction", async () => {
    expect(await resolveOneWord("   ")).toBeNull();
  });
});

describe("candidatesFor", () => {
  /*
    The narrowing is the test, not an optimisation detail.

    This used to read the whole dictionary with `take: 4000` and no ordering,
    which is the same fault `searchLexemes` was fixed for: past four thousand
    entries the cap dropped words, and nothing said which, so a page printing a
    word the dictionary holds came back unrecognised depending on where its row
    happened to sit in the heap. Asserting "the right word resolves" cannot
    catch that, because it passes on a small dictionary and on a large one
    whenever the row lands early. Asserting that an unrelated word is *not*
    fetched fails immediately on any version that pulls the table.
  */
  it("fetches only what could match, never the table", async () => {
    const lemmas = (await candidatesFor([LEMMA])).map((c) => c.lemma);
    expect(lemmas).toContain(LEMMA);
    expect(lemmas).not.toContain(DECOY);
  });

  it("narrows a whole page in one pass, inflected forms included", async () => {
    const lemmas = (await candidatesFor([LEMMA, "itest-scan-toas", "itest-scan-puudub"]))
      .map((c) => c.lemma);
    expect(lemmas).toContain(LEMMA);
    expect(lemmas).not.toContain(DECOY);
  });

  it("asks nothing of the database for an empty page", async () => {
    expect(await candidatesFor([])).toEqual([]);
  });
});
