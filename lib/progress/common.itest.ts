import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { commonWords } from "@/lib/collections/frequency";
import { addPlanToDeck, planLemmas } from "@/lib/srs/deck";
import { commonSections, lemmasIn } from "./common";

/**
 * The commonest words, against the dictionary that ships.
 *
 * Everything worth checking here is a fact about the seed. The ranking is a
 * generated table of lemmas with no glosses in it, so the only question is
 * whether the dictionary can answer for them, and a unit test over three
 * invented rows could not fail on the case that matters: a table built from a
 * corpus naming words the seed does not hold.
 */

const OWNER = "itest-owner-common";

async function wipe() {
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("the commonest words", () => {
  /**
   * The whole point of the page, and the check that can fail on a word.
   *
   * `scripts/build-frequency.ts` gates every entry through the seed already,
   * so a shortfall here means the two files have drifted: a re-run of the
   * builder against a dictionary that has since lost words, or a table
   * committed without a reseed. Ninety-five rather than a hundred, because a
   * deployment is allowed to correct an entry's part of speech and move it.
   */
  it("finds nearly all of them in the shipped dictionary", async () => {
    const sections = await commonSections(OWNER);
    expect(sections).toHaveLength(4);
    for (const section of sections) {
      expect(section.found, `${section.group} found only ${section.found}`).toBeGreaterThanOrEqual(95);
      expect(section.found).toBeLessThanOrEqual(commonWords(section.group).length);
    }
  });

  it("keeps the measured order, most used first", async () => {
    const [small] = await commonSections(OWNER);
    const ranked = commonWords("SMALL").map((w) => w.lemma);
    const shown = small!.entries.map((e) => e.lemma);
    // A subsequence of the table: same order, with anything the dictionary
    // could not answer for missing rather than moved.
    let at = -1;
    for (const lemma of shown) {
      const next = ranked.indexOf(lemma, at + 1);
      expect(next, `${lemma} is out of order`).toBeGreaterThan(at);
      at = next;
    }
  });

  it("says nothing is in the deck until something is", async () => {
    const before = await commonSections(OWNER);
    expect(before.every((s) => s.kept === 0)).toBe(true);

    const { added, words } = await addPlanToDeck(
      OWNER, planLemmas(lemmasIn("VERB"), ["RECOGNITION", "PRODUCTION"]), "DICTIONARY",
    );
    expect(words).toBeGreaterThanOrEqual(95);
    // Two cards a word, because that is the pair `planLemmas` asks for.
    expect(added).toBe(words * 2);

    const after = await commonSections(OWNER);
    const verbs = after.find((s) => s.group === "VERB")!;
    expect(verbs.kept).toBe(verbs.found);
    expect(verbs.entries.every((e) => e.inDeck)).toBe(true);
    // And only that group: the four are separate lists, not one.
    expect(after.find((s) => s.group === "NOUN")!.kept).toBe(0);
  });

  /**
   * Pressing twice costs nothing, which is the lock's job and is worth
   * asserting from up here as well as from `deck.itest.ts`: this is the one
   * caller that offers a hundred words behind a single button, so a learner
   * who presses it again because the page had not finished is the ordinary
   * case rather than the unlikely one.
   */
  it("adds nothing the second time", async () => {
    const plan = () => planLemmas(lemmasIn("ADJECTIVE"), ["RECOGNITION", "PRODUCTION"] as const);
    const first = await addPlanToDeck(OWNER, plan(), "DICTIONARY");
    expect(first.added).toBeGreaterThan(0);

    const again = await addPlanToDeck(OWNER, plan(), "DICTIONARY");
    expect(again.added).toBe(0);
    expect(again.words).toBe(first.words);
  });
});
