import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { commonWords } from "@/lib/collections/frequency";
import { addPlanToDeck, planLemmas } from "@/lib/srs/deck";
import { availableCardTypes, CARD_TYPES } from "@/lib/srs/cards";
import { COMMON_BATCH } from "@/lib/collections/commonGroups";
import { commonCounts, commonLexemeIds, commonSections, lemmasIn, nextCommonBatch } from "./common";

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
   * THE ROUND'S BATCH, WHICH IS THE PIECE NO UNIT TEST CAN SEE.
   *
   * `nextCommonBatch` decides what one press of "add the next twenty" builds,
   * and it decides it by comparing the card types a word could support against
   * the ones it already has. Both halves are facts about the seeded dictionary:
   * which words have a genitive stem, which have a recorded sentence, which
   * have a government. Three invented rows would answer none of it.
   */
  it("offers the commonest words first, and only while they are short of a card", async () => {
    const first = await nextCommonBatch(OWNER, "NOUN");
    expect(first).toHaveLength(COMMON_BATCH);

    // The corpus's own order, not the query's.
    const ranked = lemmasIn("NOUN");
    let at = -1;
    for (const lemma of first) {
      const next = ranked.indexOf(lemma, at + 1);
      expect(next, `${lemma} is out of order`).toBeGreaterThan(at);
      at = next;
    }

    // Building them out takes them off the front, and the next press moves on.
    await addPlanToDeck(OWNER, planLemmas(first, CARD_TYPES.map((s) => s.type)), "DICTIONARY");
    const second = await nextCommonBatch(OWNER, "NOUN");
    expect(second).toHaveLength(COMMON_BATCH);
    expect(second.filter((l) => first.includes(l))).toEqual([]);
  });

  /**
   * The half that makes pressing twice progress rather than stall.
   *
   * A word added from the dictionary's list holds a recognition card and a
   * production card and is short of everything else, so it comes back; a word
   * that can only ever make those two is finished at two and must not. Counting
   * rows instead of comparing types would leave `ei` at the front for ever.
   */
  it("counts a word finished by what it can build, not by how many cards it has", async () => {
    await addPlanToDeck(
      OWNER, planLemmas(lemmasIn("SMALL"), ["RECOGNITION", "PRODUCTION"]), "DICTIONARY",
    );
    const shallow = await nextCommonBatch(OWNER, "SMALL");
    /*
      A floor, for the reason `scripts/lib/checks.mjs` gives a suite one: the
      loop below asserts nothing at all on an empty list, and the mutation this
      test exists to catch, counting rows rather than comparing types, is
      exactly the one that empties it.
    */
    expect(shallow.length, "nothing came back, so the loop below checked nothing")
      .toBeGreaterThan(0);

    // Whatever comes back is short of something it could actually build.
    for (const lemma of shallow) {
      const entry = await prisma.lexeme.findFirst({
        where: { lemma },
        select: {
          lemma: true, translation: true, pos: true, gradation: true, gradationNote: true,
          government: true, examples: true, semanticTypes: true,
          forms: { select: { formType: true, value: true, morphCode: true } },
        },
      });
      expect(entry, lemma).not.toBeNull();
      expect(availableCardTypes(entry!).length, `${lemma} is finished and was offered`)
        .toBeGreaterThan(2);
    }

    // And building out everything it offers empties it, which is what stops the
    // button asking for ever.
    let guard = 0;
    for (;;) {
      const batch = await nextCommonBatch(OWNER, "SMALL");
      if (batch.length === 0) break;
      await addPlanToDeck(OWNER, planLemmas(batch, CARD_TYPES.map((s) => s.type)), "DICTIONARY");
      expect(guard++, "the batch never empties, so the button never stops asking").toBeLessThan(60);
    }
  });

  /**
   * What the round reads, and what the index prints, over one seeded
   * dictionary. Two answers to "how many of these do I have" that could drift.
   */
  it("counts what the round can ask about", async () => {
    const before = await commonCounts(OWNER);
    expect(before).toHaveLength(4);
    expect(before.every((c) => c.inDeck === 0)).toBe(true);

    const ids = await commonLexemeIds("VERB");
    expect(ids.length).toBeGreaterThanOrEqual(95);
    // One entry per lemma, which is what `oneEntryPerLemma` is there for: the
    // dictionary can hold `hall` twice and a round asking one word twice is a
    // round reading its own answer off the card before.
    expect(new Set(ids).size).toBe(ids.length);

    await addPlanToDeck(
      OWNER, planLemmas(lemmasIn("VERB"), ["RECOGNITION", "PRODUCTION"]), "DICTIONARY",
    );
    const after = await commonCounts(OWNER);
    const verbs = after.find((c) => c.group === "VERB")!;
    expect(verbs.inDeck).toBe(verbs.found);
    expect(after.find((c) => c.group === "NOUN")!.inDeck).toBe(0);

    // And it agrees with the page that lists them, because a learner reading
    // "40 of 100" on one screen and "100 of 100" on the next has caught the app
    // answering one question twice.
    const sections = await commonSections(OWNER);
    for (const count of after) {
      const section = sections.find((s) => s.group === count.group)!;
      expect(section.found, count.group).toBe(count.found);
      expect(section.kept, count.group).toBe(count.inDeck);
    }
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
