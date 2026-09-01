import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { goalsFor, historyFor, latestFor, paperFor, saveGoals, saveResult } from "./assessment";
import { placement } from "@/lib/assessment/score";
import type { ItemRef, Placement, Response } from "@/lib/assessment/types";

/**
 * The database half of the level check, against a real Postgres.
 *
 * Three properties are worth the cost of a database to assert, because all
 * three are about damage rather than arithmetic: a sitting is never rewritten,
 * one learner's result is never another's, and the paper is built from words
 * the learner does *not* already have in their deck. The third is the one that
 * would fail silently and most expensively: a check made of cards somebody has
 * been drilling for a month reports their revision back to them as their
 * Estonian, and gets better every time they study.
 */

const MINE = "itest-assess-a";
const THEIRS = "itest-assess-b";

async function wipe() {
  await prisma.assessment.deleteMany({ where: { ownerId: { in: [MINE, THEIRS] } } });
  await prisma.card.deleteMany({ where: { ownerId: { in: [MINE, THEIRS] } } });
  await prisma.setting.deleteMany({ where: { ownerId: { in: [MINE, THEIRS] } } });
}

beforeEach(wipe);
afterAll(wipe);

const items: ItemRef[] = [
  { id: "r1", skill: "reading", band: "A1" },
  { id: "r2", skill: "reading", band: "A2" },
  { id: "w1", skill: "writing", band: "A1" },
];

function sat(credits: number[]): Placement {
  const responses: Response[] = items.map((item, i) => ({
    itemId: item.id, skill: item.skill, band: item.band, credit: credits[i] ?? 0, ms: 1000,
  }));
  return placement(items, responses);
}

describe("a sitting is kept, and never rewritten", () => {
  it("writes a row that comes back with its band breakdown", async () => {
    const result = sat([1, 1, 1]);
    const stored = await saveResult(MINE, result);

    expect(stored.overall).toBe(result.overall);
    const [latest] = await historyFor(MINE, 5);
    expect(latest?.id).toBe(stored.id);
    expect(latest?.skills.find((s) => s.skill === "reading")?.bands.length).toBeGreaterThan(0);
  });

  /*
    EACH SITTING IS FOUND BY ITS OWN ID, NOT BY ITS PLACE IN THE LIST.

    The property is that a second sitting adds a row rather than rewriting the
    first, and it was asserted as `history[1]` being the earlier one, which is
    a claim about the order rather than about the row. That claim is a coin
    toss. `takenAt` is `timestamp(3)`, so all the column records is the
    millisecond, and two sittings written back to back land inside one of them
    on a runner quick enough; `historyFor` then falls through to `id asc` to
    break the tie, and the id is a random uuid. Measured against a real
    Postgres with the two rows given the same `takenAt`: the earlier sitting
    came second 105 times out of 200.

    So it failed on CI on a landing-page branch that cannot reach this file,
    and it will fail again on whatever lands next. Both rows are pinned by
    identity now, which asserts strictly more than the line it replaces (the
    later sitting was never checked at all) and asks nothing of an order the
    schema does not record.

    The ordering itself is left alone on purpose. Two sittings inside one
    millisecond is a thing this test does and a thing no learner can do, and
    the cure would be a column recording insertion order, which is a change to
    an append-only table to settle a case that only a test reaches.
  */
  it("adds a row rather than moving a number", async () => {
    const first = await saveResult(MINE, sat([0, 0, 0]));
    const second = await saveResult(MINE, sat([1, 1, 1]));

    const history = await historyFor(MINE, 5);
    expect(history).toHaveLength(2);
    // The earlier one is still exactly as it was sat, and so is the later one.
    expect(history.find((row) => row.id === first.id)?.overall).toBe("pre-A1");
    expect(history.find((row) => row.id === second.id)?.overall).toBe("A1");
    expect((await latestFor(MINE))?.overall).toBe(history[0]?.overall);
  });

  it("keeps one learner's result out of another's history", async () => {
    await saveResult(MINE, sat([1, 1, 1]));
    expect(await historyFor(THEIRS, 5)).toHaveLength(0);
    expect(await latestFor(THEIRS)).toBeNull();
  });

  it("stores the speaking rating as the learner's, never as a score", async () => {
    const withSpeaking = placement(
      [...items, { id: "s1", skill: "speaking", band: "A1" }],
      [
        { itemId: "r1", skill: "reading", band: "A1", credit: 1, ms: 10 },
        { itemId: "s1", skill: "speaking", band: "A1", credit: 0, selfRating: 4, ms: 10 },
      ],
    );
    const stored = await saveResult(MINE, withSpeaking);
    expect(stored.speakingSelf).toBe(4);
    // The level came from reading alone. A recording cannot move it.
    expect(stored.overall).toBe("A1");
  });
});

describe("the goal a learner states", () => {
  it("round trips through the settings store", async () => {
    await saveGoals(MINE, {
      reason: "citizenship", target: "B1",
      deadline: "2027-06-01T00:00:00.000Z", daysPerWeek: 4, note: "the exam",
    });
    const read = await goalsFor(MINE);
    expect(read.reason).toBe("citizenship");
    expect(read.target).toBe("B1");
    expect(read.daysPerWeek).toBe(4);
    expect(read.note).toBe("the exam");
  });

  it("comes back empty rather than guessed for somebody who never answered", async () => {
    const read = await goalsFor(THEIRS);
    expect(read.reason).toBeNull();
    expect(read.target).toBeNull();
    expect(read.deadline).toBeNull();
  });
});

describe("the paper", () => {
  it("is built from the dictionary and covers the four skills", async () => {
    const paper = await paperFor(MINE, 7);
    expect(paper.items.length).toBeGreaterThan(8);
    expect([...new Set(paper.items.map((i) => i.skill))].sort()).toEqual(
      ["listening", "reading", "speaking", "writing"],
    );
  });

  it("prefers words the learner does not already have in their deck", async () => {
    // Every A1 noun in the deck. The check should reach past them.
    const owned = await prisma.lexeme.findMany({
      where: { cefr: "A1", pos: "NOUN" }, select: { id: true }, take: 40,
    });
    expect(owned.length).toBeGreaterThan(10);
    await prisma.card.createMany({
      data: owned.map((l) => ({
        ownerId: MINE, lexemeId: l.id, cardType: "RECOGNITION", front: "x", back: "y",
      })),
    });

    const paper = await paperFor(MINE, 11);
    const ownedIds = new Set(owned.map((l) => l.id));
    const fromDeck = paper.items.filter((item) => [...ownedIds].some((id) => item.id.includes(id)));
    expect(fromDeck).toHaveLength(0);
  });

  it("is the same paper for a seed and a different one otherwise", async () => {
    const a = await paperFor(MINE, 3);
    const b = await paperFor(MINE, 3);
    const c = await paperFor(MINE, 500);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
    expect(a.items.map((i) => i.id).join()).not.toBe(c.items.map((i) => i.id).join());
  });
});
