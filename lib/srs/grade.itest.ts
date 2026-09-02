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
