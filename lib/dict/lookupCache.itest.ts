import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * That the dictionary asks Ekilex once rather than on every render.
 *
 * Two faults, both invisible in a unit test and both costing a free academic
 * service rather than showing up as a wrong answer on screen:
 *
 *   1. A word Ekilex has nothing for was never written down as a miss, so it
 *      was re-asked, twice over, on every single render of the page it
 *      appeared on. For ever. This is the same bug that cost four fifths of
 *      the dictionary on the seed's first run, in the live path.
 *   2. Two renders of the same entry arriving together made two full upgrades,
 *      which is four Ekilex requests and two `deleteMany`/`createMany` pairs
 *      racing over one word's forms.
 *
 * It needs a database because the miss is a column, and the whole point is
 * that it survives the request that recorded it.
 *
 *   npm run test:db
 */

const searchEkilex = vi.fn();
const fetchEkilexDetails = vi.fn();

vi.mock("@/lib/ekilex/client", () => ({
  ekilexConfigured: () => true,
  searchEkilex: (...args: unknown[]) => searchEkilex(...args),
  fetchEkilexDetails: (...args: unknown[]) => fetchEkilexDetails(...args),
}));

const LEMMA = "itestmisswordxyz";

async function makeSeededWord(): Promise<string> {
  const lexeme = await prisma.lexeme.create({
    data: { lemma: LEMMA, pos: "NOUN", translation: "a test word", provenance: "SEED" },
  });
  return lexeme.id;
}

beforeEach(async () => {
  searchEkilex.mockReset();
  fetchEkilexDetails.mockReset();
  await prisma.lexeme.deleteMany({ where: { lemma: LEMMA } });
});

afterEach(async () => {
  await prisma.lexeme.deleteMany({ where: { lemma: LEMMA } });
});

afterAll(async () => { await prisma.$disconnect(); });

describe("a word Ekilex has nothing to say about", () => {
  it("is asked once and then written down as a miss", async () => {
    const { enrichFromEkilex } = await import("./lookup");
    const id = await makeSeededWord();
    searchEkilex.mockResolvedValue([]);

    expect(await enrichFromEkilex(id)).toBe(false);
    expect(searchEkilex).toHaveBeenCalledTimes(1);

    const after = await prisma.lexeme.findUniqueOrThrow({
      where: { id }, select: { lookupMissAt: true, fetchedAt: true, provenance: true },
    });
    expect(after.lookupMissAt).toBeInstanceOf(Date);
    /*
      NOT `fetchedAt`, and this is the assertion that matters most. The exam
      pool orders by `fetchedAt` to mean "words the dictionary knows most
      about", so folding a miss into it would sort the least known words to the
      front of a mock paper. Two different facts, two columns.
    */
    expect(after.fetchedAt).toBeNull();
    // A question nobody answered says nothing about where the entry came from.
    expect(after.provenance).toBe("SEED");
  });

  it("is not asked again on the next render, which is the whole cost saved", async () => {
    const { enrichFromEkilex } = await import("./lookup");
    const id = await makeSeededWord();
    searchEkilex.mockResolvedValue([]);

    await enrichFromEkilex(id);
    await enrichFromEkilex(id);
    await enrichFromEkilex(id);

    expect(searchEkilex).toHaveBeenCalledTimes(1);
  });

  it("is asked again once the miss has aged out, because Ekilex is a living database", async () => {
    const { enrichFromEkilex } = await import("./lookup");
    const id = await makeSeededWord();
    searchEkilex.mockResolvedValue([]);
    await enrichFromEkilex(id);

    // Two days ago: a word added to Ekilex since must become findable.
    await prisma.lexeme.update({
      where: { id },
      data: { lookupMissAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });

    await enrichFromEkilex(id);
    expect(searchEkilex).toHaveBeenCalledTimes(2);
  });

  it("records a miss when the search answers with a different word", async () => {
    /*
      Ekilex answering with something is not Ekilex answering. A near match
      that maps to another lemma is rejected further down, and used to be
      rejected silently, which put this word back in the re-ask loop as surely
      as an empty result did.
    */
    const { enrichFromEkilex } = await import("./lookup");
    const id = await makeSeededWord();
    searchEkilex.mockResolvedValue([{ wordId: 1, wordValue: "midagimuud", homonymNr: 1, lang: "est" }]);
    fetchEkilexDetails.mockResolvedValue(null);

    expect(await enrichFromEkilex(id)).toBe(false);
    const after = await prisma.lexeme.findUniqueOrThrow({
      where: { id }, select: { lookupMissAt: true },
    });
    expect(after.lookupMissAt).toBeInstanceOf(Date);
  });
});

describe("two renders of the same word at once", () => {
  it("make one upstream request, not two", async () => {
    const { enrichFromEkilex } = await import("./lookup");
    const id = await makeSeededWord();
    searchEkilex.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return [];
    });

    await Promise.all([enrichFromEkilex(id), enrichFromEkilex(id), enrichFromEkilex(id)]);
    expect(searchEkilex).toHaveBeenCalledTimes(1);
  });
});
