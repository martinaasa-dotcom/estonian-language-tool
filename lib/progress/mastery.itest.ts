import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { masteryFor } from "./mastery";
import { MASTERY_CORRECT } from "@/lib/srs/mastery";

/**
 * Integration tests: these need a real Postgres.
 *
 *   npm run test:db
 *
 * `lib/srs/mastery.test.ts` has the rule and can say what five correct answers
 * across three slots is worth. What it cannot say is how many slots a real word
 * in a real deck can be asked, and that is where this was wrong for a year: the
 * threshold was a flat three counted off `Review.targetCase`, which is null on
 * every card that is not about a case, so no verb in any deck could reach it
 * and a word added from the dictionary had two slots at best. Nothing failed.
 * The flash round simply kept asking about words it was never going to release.
 *
 * So these are the three shapes of word the rule has to get right, built as
 * rows: a verb, whose forms are named parts rather than cases; a phrase, which
 * has nothing to inflect at all; and a noun, which has eleven cases and should
 * still be asked for three.
 */

const OWNER = "itest-owner-mastery";

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: OWNER } });
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
  await prisma.lexeme.deleteMany({ where: { lemma: { startsWith: "itestsona" } } });
}

/**
 * A dictionary entry, with the one form that decides whether there are eleven
 * more. Spelled so nobody could mistake it for Estonian: this app writes none
 * and neither do its fixtures (ADR-005).
 */
async function makeWord(
  suffix: string, pos: string, forms: { formType: string; value: string }[],
) {
  return prisma.lexeme.create({
    data: {
      lemma: `itestsona${suffix}`, translation: "a test word", pos,
      provenance: "USER",
      forms: { create: forms },
    },
  });
}

async function makeCard(lexemeId: string, cardType: string, targetCase: string | null = null) {
  return prisma.card.create({
    data: { ownerId: OWNER, lexemeId, cardType, front: "q", back: "a", targetCase },
  });
}

/** `count` answers of one slot, all right, spaced so the last one is the last one. */
async function answer(
  cardId: string, lexemeId: string, slot: string, count: number, rating = 4,
) {
  for (let i = 0; i < count; i++) {
    await prisma.review.create({
      data: {
        ownerId: OWNER, cardId, lexemeId, rating, slot,
        reviewedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, i)), stateBefore: 2,
      },
    });
  }
}

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("masteryFor", () => {
  it("lets a verb be mastered, which no verb in any deck could be", async () => {
    /*
      The fault, exactly. A verb has no case cards, so every one of its answers
      carried `targetCase: null` and counted as one slot between them. Five
      right answers in the present, the past and the imperative is three
      different forms of the word by any reading, and the app called it
      "almost there" for ever.
    */
    const verb = await makeWord("verb", "VERB", [
      { formType: "INF_MA", value: "itestsonaverb" },
      { formType: "PRES_1SG", value: "itestsonaverbn" },
    ]);
    const card = await makeCard(verb.id, "CONJUGATION");
    await answer(card.id, verb.id, "IndPrSg1", 2);
    await answer(card.id, verb.id, "IndIpfSg1", 2);
    await answer(card.id, verb.id, "ImpPrSg2", 1);

    const [word] = await masteryFor(OWNER);
    expect(word?.verdict.correct).toBe(MASTERY_CORRECT);
    expect(word?.verdict.slots).toBe(3);
    expect(word?.verdict.mastery).toBe("mastered");
  });

  it("asks a phrase for the two questions a phrase has, and no more", async () => {
    // Nothing to inflect, so three slots is a bar it can never clear, and the
    // round would have gone on asking about it after there was nothing left.
    const phrase = await makeWord("fraas", "PHRASE", []);
    const recognition = await makeCard(phrase.id, "RECOGNITION");
    const production = await makeCard(phrase.id, "PRODUCTION");
    await answer(recognition.id, phrase.id, "RECOGNITION", 3);
    await answer(production.id, phrase.id, "PRODUCTION", 2);

    const [word] = await masteryFor(OWNER);
    expect(word?.verdict.slotsNeeded).toBe(2);
    expect(word?.verdict.mastery).toBe("mastered");
  });

  it("still asks a noun for three, whatever cards the learner happens to hold", async () => {
    /*
      The half that cannot be read off the deck. This word has a recognition
      card and a production card, so the cards alone say two, and the flash
      round asks it for cases it has no card for: a threshold counted from the
      cards would call it finished one answer early. The genitive stem is what
      says there are eleven more questions in it.
    */
    const noun = await makeWord("nimi", "NOUN", [
      { formType: "NOM_SG", value: "itestsonanimi" },
      { formType: "GEN_SG", value: "itestsonanime" },
    ]);
    const recognition = await makeCard(noun.id, "RECOGNITION");
    const production = await makeCard(noun.id, "PRODUCTION");
    await answer(recognition.id, noun.id, "RECOGNITION", 3);
    await answer(production.id, noun.id, "PRODUCTION", 2);

    const [word] = await masteryFor(OWNER);
    expect(word?.verdict.slotsNeeded).toBe(3);
    expect(word?.verdict.mastery).toBe("almost");

    // And one answer in a case finishes it, which is what the round is for.
    await answer(recognition.id, noun.id, "INESSIVE", 1);
    const [after] = await masteryFor(OWNER);
    expect(after?.verdict.mastery).toBe("mastered");
  });

  it("reads a row written before the slot column the way it always did", async () => {
    // Nobody's history is reinterpreted: an old row carries the case its card
    // was about and nothing else, and that is still what it counts as.
    const noun = await makeWord("vana", "NOUN", [{ formType: "GEN_SG", value: "itestsonavana" }]);
    const card = await makeCard(noun.id, "CASE_FORM", "INESSIVE");
    for (let i = 0; i < 5; i++) {
      await prisma.review.create({
        data: {
          ownerId: OWNER, cardId: card.id, lexemeId: noun.id, rating: 4,
          targetCase: "INESSIVE", slot: null,
          reviewedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, i)), stateBefore: 2,
        },
      });
    }

    const [word] = await masteryFor(OWNER);
    expect(word?.verdict.slots).toBe(1);
    expect(word?.verdict.filled).toEqual(["INESSIVE"]);
    expect(word?.verdict.mastery).toBe("almost");
  });
});
