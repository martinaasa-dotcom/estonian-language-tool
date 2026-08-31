import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SYLLABUS } from "@/lib/collections/syllabus";
import { addUnitsToDeck, planUnits, previewUnits } from "./deck";

/**
 * The deck builder, against the database, because the thing that was wrong with
 * it could only be wrong against a database.
 *
 * `addUnitsToDeck` reads the cards a learner already holds, filters the
 * generated ones against them and inserts the rest. That is check-then-act, and
 * the gap between the read and the insert is a whole unit's worth of card
 * building: two requests inside it both see the same deck and both insert. The
 * per-word path it replaced took an advisory lock for exactly this reason, and
 * the batched rewrite did not inherit one, which moved the fault from one word
 * to a unit at a time.
 *
 * Measured before the lock went back: eight concurrent adds of an eighteen-word
 * unit wrote 180 cards where 36 is right. A learner meets it by double-tapping
 * "Add to deck", or the last button of first run, which is the one screen where
 * somebody is already waiting and inclined to press again.
 *
 * So these run concurrently on purpose. No unit test can see this, because the
 * fault is entirely in what two connections do at once.
 *
 * It reads the shipped dictionary and writes nothing but its own cards. That is
 * deliberate: a fixture that wrote the unit's lemmas would be writing rows
 * beside the seeded ones, since `@@unique` is on `(lemma, pos)`, and the
 * builder's whole job is to turn the real dictionary into a real deck.
 */

const MINE = "itest-owner-deck";

/** A unit that drills cases, so a word earns more than its two bare cards. */
const UNIT = SYLLABUS.find((u) => u.cardTypes.includes("CASE_FORM")) ?? SYLLABUS[0]!;

async function wipe() {
  await prisma.card.deleteMany({ where: { ownerId: MINE } });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("addUnitsToDeck", () => {
  /**
   * What one add is supposed to write.
   *
   * `previewUnits` is the same generator over the same rows, which is the point
   * of it existing: the number a screen promises and the deck it delivers come
   * from one place. Using it here means this test cannot drift from the count
   * first run prints.
   */
  async function expected(): Promise<number> {
    const { cards } = await previewUnits([UNIT.id]);
    return cards;
  }

  /**
   * States its precondition rather than inheriting it. `test:db` runs after the
   * build, which seeds the dictionary, so the words are there; on a database
   * somebody pushed a schema into and never seeded they are not, and a builder
   * asked for words that do not exist correctly writes nothing. That is a fact
   * about the database and reads as a failure of the lock if nobody says so.
   */
  async function requireDictionary(): Promise<void> {
    const held = await prisma.lexeme.count({ where: { lemma: { in: [...planUnits([UNIT.id]).lemmas] } } });
    if (held === 0) {
      throw new Error(
        `the dictionary holds none of ${UNIT.id}'s words, so there is no deck to build. `
        + "Run `npm run db:seed` against this database first.",
      );
    }
  }

  it("writes one deck when the same unit is added several times at once", async () => {
    await requireDictionary();
    const want = await expected();
    expect(want).toBeGreaterThan(0);

    /*
      Eight at once, which is a double tap and then some. Under the unlocked
      shape every one of them read an empty deck and every one inserted a full
      set, so the deck came out eight times the size it should be and every
      surplus card was one the learner would be asked about twice.

      Asserted as the exact count rather than as "fewer than eight sets": the
      whole claim is that concurrency changes nothing about what gets written.
    */
    const results = await Promise.all(
      Array.from({ length: 8 }, () => addUnitsToDeck(MINE, [UNIT.id])),
    );

    expect(await prisma.card.count({ where: { ownerId: MINE } })).toBe(want);
    // And the count handed back is the count written, so the screen that says
    // "added N" is not describing a different deck from the one on disk.
    expect(results.reduce((n, r) => n + r.added, 0)).toBe(want);
  });

  it("adds nothing the second time, so re-adding a unit loses no scheduling", async () => {
    await requireDictionary();
    const want = await expected();

    expect((await addUnitsToDeck(MINE, [UNIT.id])).added).toBe(want);

    const before = await prisma.card.findMany({
      where: { ownerId: MINE }, select: { id: true, due: true }, orderBy: { id: "asc" },
    });

    expect((await addUnitsToDeck(MINE, [UNIT.id])).added).toBe(0);

    const after = await prisma.card.findMany({
      where: { ownerId: MINE }, select: { id: true, due: true }, orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  });
});
