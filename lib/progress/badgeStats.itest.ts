import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { buildBadgeStats } from "./achievements";
import { deckSnapshot, dailySummary } from "./summary";
import { earnedBadgeKeys } from "@/lib/achievements/badges";

/**
 * WHAT A BADGE COUNTS, AGAINST A REAL DECK.
 *
 * `totalWords` read the shared dictionary's size, which is the same six
 * thousand for everybody, so "add 50 words to your dictionary" and "add 200
 * words" were both handed out on the first load of Today, before a card had
 * been answered. No unit test could see it: the fault was in which query the
 * number came from, and a fixture supplies the number.
 *
 * `Achievement` is never re-awarded and never removed, so a badge given away
 * once stays given away. That is what makes this worth a database.
 *
 *   npm run test:db
 */

const OWNER = "itest-owner-badges";

async function wipe() {
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
  await prisma.review.deleteMany({ where: { ownerId: OWNER } });
  await prisma.setting.deleteMany({ where: { ownerId: OWNER } });
}

async function addWords(count: number) {
  const lexemes = await prisma.lexeme.findMany({ orderBy: { lemma: "asc" }, take: count, select: { id: true } });
  await prisma.card.createMany({
    data: lexemes.map((lex) => ({
      ownerId: OWNER, lexemeId: lex.id, cardType: "RECOGNITION",
      front: "x", back: "y", due: new Date(),
    })),
  });
  return lexemes.length;
}

async function statsFor() {
  const now = new Date();
  const snapshot = await deckSnapshot(OWNER, now);
  const summary = await dailySummary(OWNER, snapshot, now);
  return buildBadgeStats(OWNER, { snapshot, summary, units: [] });
}

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("the words a deck badge counts", () => {
  it("counts none for a learner who has added nothing", async () => {
    const stats = await statsFor();
    expect(stats.totalWords).toBe(0);
    expect(earnedBadgeKeys(stats)).not.toContain("deck_50");
    expect(earnedBadgeKeys(stats)).not.toContain("deck_200");
  });

  it("counts the learner's own words, not the dictionary's", async () => {
    const added = await addWords(60);
    expect(added).toBe(60);

    const stats = await statsFor();
    expect(stats.totalWords).toBe(60);
    expect(earnedBadgeKeys(stats)).toContain("deck_50");
    expect(earnedBadgeKeys(stats)).not.toContain("deck_200");
  });
});
