import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { writeGrade } from "./grade";
import { applyGradeBatch } from "./replay";

/**
 * Integration tests: these need a real Postgres.
 *
 *   npm run test:db
 *
 * The claim being checked is about rows, not about types: a grade dated before
 * the card it is about is a review of something that was not there, and the
 * streak, the heatmap and every "reviews this week" figure read that column.
 */

const OWNER = "itest-owner-grade";

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: OWNER } });
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
}

async function makeCard(createdAt: Date) {
  return prisma.card.create({
    data: {
      ownerId: OWNER, cardType: "RECOGNITION",
      front: "tuba", back: "room", targetCase: "INESSIVE",
      due: createdAt, createdAt,
    },
  });
}

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("writeGrade", () => {
  it("writes the review and returns exactly the scheduling it stored", async () => {
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    const next = await writeGrade(OWNER, {
      card, rating: 3, durationMs: 2_400,
      reviewedAt: new Date("2026-08-20T09:00:00Z"),
      now: new Date("2026-09-02T09:00:00Z"),
    });

    const stored = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(stored.due.toISOString()).toBe(next.due.toISOString());
    expect(stored.stability).toBeCloseTo(next.stability, 6);
    expect(stored.difficulty).toBeCloseTo(next.difficulty, 6);
    expect(stored.reps).toBe(next.reps);
    expect(stored.state).toBe(next.state);
    expect(stored.learningSteps).toBe(next.learningSteps);

    const review = await prisma.review.findFirstOrThrow({ where: { ownerId: OWNER } });
    expect(review.reviewedAt.toISOString()).toBe("2026-08-20T09:00:00.000Z");
    expect(review.rating).toBe(3);
    expect(review.stateBefore).toBe(card.state);
  });

  it("floors a review at the moment its card was created", async () => {
    const created = new Date("2026-08-01T09:00:00Z");
    const card = await makeCard(created);
    await writeGrade(OWNER, {
      card, rating: 3, durationMs: 1_000,
      reviewedAt: new Date("2026-06-01T09:00:00Z"),
      now: new Date("2026-09-02T09:00:00Z"),
    });

    const review = await prisma.review.findFirstOrThrow({ where: { ownerId: OWNER } });
    expect(review.reviewedAt.toISOString()).toBe(created.toISOString());
  });

  it("takes the client's id only where one is given", async () => {
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    await writeGrade(OWNER, {
      card, rating: 3, durationMs: 0, reviewedAt: new Date("2026-08-20T09:00:00Z"),
      now: new Date("2026-09-02T09:00:00Z"), reviewId: "from-the-device",
    });
    expect(await prisma.review.count({ where: { id: "from-the-device" } })).toBe(1);
  });
});

describe("the replay path takes the same floor", () => {
  /*
    THE FIX WAS WRITTEN ON THE DOOR NOBODY WAS COMING THROUGH.

    `gradeCard` floored a grade at the card's own creation and said why in a
    comment. `applyGradeBatch` is the path that actually carries a device's own
    timestamps, and it clamped forward and to thirty days back and no further,
    so an outbox entry could date a review before its card existed and no
    figure derived from the log could tell.
  */
  it("will not date an offline grade before its card existed", async () => {
    const created = new Date(Date.now() - 2 * 86_400_000);
    const card = await makeCard(created);

    const result = await applyGradeBatch(OWNER, [{
      id: "backdated", cardId: card.id, rating: 3, durationMs: 1_000,
      reviewedAt: Date.now() - 20 * 86_400_000,
    }]);

    expect(result.settled).toEqual(["backdated"]);
    const review = await prisma.review.findFirstOrThrow({ where: { id: "backdated" } });
    expect(review.reviewedAt.getTime()).toBeGreaterThanOrEqual(created.getTime());
  });

  it("still lands an honest offline grade at the moment it was answered", async () => {
    const card = await makeCard(new Date(Date.now() - 30 * 86_400_000));
    const answered = Date.now() - 3 * 86_400_000;

    await applyGradeBatch(OWNER, [{
      id: "honest", cardId: card.id, rating: 3, durationMs: 1_000, reviewedAt: answered,
    }]);

    const review = await prisma.review.findFirstOrThrow({ where: { id: "honest" } });
    expect(Math.abs(review.reviewedAt.getTime() - answered)).toBeLessThan(1_000);
  });
});


/**
 * The column that records what came back instead.
 *
 * Against a real database rather than a stub, because the claim is about a row
 * in the one table that is never updated and never deleted: if the wrong thing
 * lands here it is permanent, and it would not be a skewed count, it would be a
 * sentence telling somebody they mix up two cases nobody has asked them for.
 */
describe("the form a learner reached for instead", () => {
  it("records the pair where two forms were genuinely swapped", async () => {
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    await writeGrade(OWNER, {
      card, rating: 2, durationMs: 3_800,
      reviewedAt: new Date("2026-08-20T09:00:00Z"),
      practisedSlot: "INESSIVE",
      reachedSlot: "ELATIVE",
    });

    const row = await prisma.review.findFirstOrThrow({ where: { ownerId: OWNER } });
    expect(row.slot).toBe("INESSIVE");
    expect(row.reachedSlot).toBe("ELATIVE");
    // And the column the case charts read is untouched by either of them.
    expect(row.targetCase).toBe("INESSIVE");
  });

  it("writes nothing where the learner produced what was asked for", async () => {
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    await writeGrade(OWNER, {
      card, rating: 3, durationMs: 900,
      reviewedAt: new Date("2026-08-20T09:00:00Z"),
      practisedSlot: "INESSIVE",
      reachedSlot: "INESSIVE",
    });
    expect((await prisma.review.findFirstOrThrow({ where: { ownerId: OWNER } })).reachedSlot).toBeNull();
  });

  it("refuses a slot the app does not write, however it arrives", async () => {
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    await writeGrade(OWNER, {
      card, rating: 1, durationMs: 1_000,
      reviewedAt: new Date("2026-08-20T09:00:00Z"),
      practisedSlot: "INESSIVE",
      reachedSlot: "'; drop table \"Review\"; --",
    });
    expect((await prisma.review.findFirstOrThrow({ where: { ownerId: OWNER } })).reachedSlot).toBeNull();
  });

  it("refuses a pair where either side is a question about meaning", async () => {
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    await writeGrade(OWNER, {
      card, rating: 1, durationMs: 1_000,
      reviewedAt: new Date("2026-08-20T09:00:00Z"),
      practisedSlot: "RECOGNITION",
      reachedSlot: "INESSIVE",
    });
    const row = await prisma.review.findFirstOrThrow({ where: { ownerId: OWNER } });
    expect(row.slot).toBe("RECOGNITION");
    expect(row.reachedSlot).toBeNull();
  });

  it("carries both slots back from a grade taken offline", async () => {
    // The path the flash round takes on a train, and the one where the fields
    // were being dropped between the outbox and the server.
    const card = await makeCard(new Date("2026-08-01T09:00:00Z"));
    const result = await applyGradeBatch(OWNER, [{
      id: "replayed-confusion",
      cardId: card.id,
      rating: 2,
      durationMs: 4_100,
      reviewedAt: new Date("2026-08-20T09:00:00Z").getTime(),
      slot: "ADESSIVE",
      reachedSlot: "ALLATIVE",
    }]);

    expect(result.ok).toBe(true);
    const row = await prisma.review.findUniqueOrThrow({ where: { id: "replayed-confusion" } });
    expect(row.slot).toBe("ADESSIVE");
    expect(row.reachedSlot).toBe("ALLATIVE");
    expect(row.durationMs).toBe(4_100);
  });
});
