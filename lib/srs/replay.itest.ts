import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyGradeBatch } from "./replay";
import { grade } from "./scheduler";
import { MAX_BACKDATE_DAYS } from "@/lib/offline/outbox";

/**
 * Integration tests: these need a real Postgres, and they exist because the
 * claims they check are claims about the database, not about types.
 *
 *   npm run test:db     (see README — a throwaway local Postgres is enough)
 *
 * Everything is namespaced to a synthetic owner and cleaned between tests, so a
 * run cannot touch anyone's real deck.
 */

const OWNER = "itest-owner-replay";
const OTHER = "itest-owner-other";

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: { in: [OWNER, OTHER] } } });
  await prisma.card.deleteMany({ where: { ownerId: { in: [OWNER, OTHER] } } });
}

async function makeCard(ownerId = OWNER, id = crypto.randomUUID()) {
  return prisma.card.create({
    data: {
      id, ownerId, cardType: "RECOGNITION",
      front: "tuba", back: "room", targetCase: "INESSIVE",
      due: new Date("2026-08-01T00:00:00Z"),
    },
  });
}

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("applyGradeBatch", () => {
  it("writes one review and advances the card", async () => {
    const card = await makeCard();
    const result = await applyGradeBatch(OWNER, [{
      id: "g1", cardId: card.id, rating: 3, durationMs: 2000, reviewedAt: Date.now(),
    }]);

    expect(result.settled).toEqual(["g1"]);
    expect(await prisma.review.count({ where: { ownerId: OWNER } })).toBe(1);

    const after = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.reps).toBe(1);
    expect(after.due.getTime()).toBeGreaterThan(card.due.getTime());
  });

  it("is idempotent — replaying the same batch does not double-apply", async () => {
    const card = await makeCard();
    const batch = [{ id: "g1", cardId: card.id, rating: 3 as const, durationMs: 2000, reviewedAt: Date.now() }];

    await applyGradeBatch(OWNER, batch);
    const afterFirst = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });

    const second = await applyGradeBatch(OWNER, batch);

    expect(second.settled).toEqual(["g1"]);
    expect(await prisma.review.count({ where: { ownerId: OWNER } })).toBe(1);
    const afterSecond = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(afterSecond.reps).toBe(afterFirst.reps);
    expect(afterSecond.due.getTime()).toBe(afterFirst.due.getTime());
  });

  /*
    A batch that repeats an id, which a device with a half-written queue can
    send. This used to work by accident: the second copy asked the database
    whether the id existed and found the row the first copy had just written.
    The existence check is one query for the whole batch now, so the second
    copy would not be in that answer and would try to insert the same primary
    key twice, failing the whole replay rather than one grade. It is dropped
    before the loop instead.
  */
  it("keeps one grade when a batch repeats an id", async () => {
    const card = await makeCard();
    const at = Date.now();
    const result = await applyGradeBatch(OWNER, [
      { id: "g1", cardId: card.id, rating: 3, durationMs: 2000, reviewedAt: at },
      { id: "g1", cardId: card.id, rating: 3, durationMs: 2000, reviewedAt: at },
    ]);

    expect(result.ok).toBe(true);
    expect(result.settled).toEqual(["g1"]);
    expect(await prisma.review.count({ where: { ownerId: OWNER } })).toBe(1);
    const after = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.reps).toBe(1);
  });

  it("applies two grades of one card in time order, not array order", async () => {
    const card = await makeCard();
    const t0 = Date.parse("2026-08-20T09:00:00Z");

    // Handed over newest-first, as a naive queue read might.
    await applyGradeBatch(OWNER, [
      { id: "g2", cardId: card.id, rating: 3, durationMs: 1000, reviewedAt: t0 + 60_000 },
      { id: "g1", cardId: card.id, rating: 1, durationMs: 1000, reviewedAt: t0 },
    ]);

    const reviews = await prisma.review.findMany({
      where: { ownerId: OWNER }, orderBy: { reviewedAt: "asc" },
    });
    expect(reviews.map((r) => r.rating)).toEqual([1, 3]);
    // stateBefore proves the second grade saw the state the first one left.
    expect(reviews[0]?.stateBefore).toBe(0);
    expect(reviews[1]?.stateBefore).not.toBe(0);
  });

  it("reproduces exactly the schedule an online grade would have produced", async () => {
    // The whole promise of the offline path: a grade replayed later, with its
    // original timestamp, lands where it would have had the network held.
    const when = new Date("2026-08-20T09:00:00Z");
    const offlineCard = await makeCard();
    await applyGradeBatch(OWNER, [{
      id: "g1", cardId: offlineCard.id, rating: 3, durationMs: 2000, reviewedAt: when.getTime(),
    }]);
    const replayed = await prisma.card.findUniqueOrThrow({ where: { id: offlineCard.id } });

    const expected = grade(
      {
        due: new Date("2026-08-01T00:00:00Z"), stability: 0, difficulty: 0,
        elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0,
        lastReview: null, learningSteps: 0,
      },
      3,
      when,
    );

    expect(replayed.state).toBe(expected.state);
    expect(replayed.reps).toBe(expected.reps);
    expect(replayed.lastReview?.toISOString()).toBe(when.toISOString());
  });

  it("clamps a device clock set into the future", async () => {
    const card = await makeCard();
    await applyGradeBatch(OWNER, [{
      id: "g1", cardId: card.id, rating: 3, durationMs: 1000,
      reviewedAt: Date.now() + 30 * 86_400_000,
    }]);
    const review = await prisma.review.findUniqueOrThrow({ where: { id: "g1" } });
    expect(review.reviewedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("floors a grade older than the backdate limit", async () => {
    const card = await makeCard();
    await applyGradeBatch(OWNER, [{
      id: "g1", cardId: card.id, rating: 3, durationMs: 1000,
      reviewedAt: Date.now() - 400 * 86_400_000,
    }]);
    const review = await prisma.review.findUniqueOrThrow({ where: { id: "g1" } });
    const floor = Date.now() - MAX_BACKDATE_DAYS * 86_400_000;
    expect(review.reviewedAt.getTime()).toBeGreaterThanOrEqual(floor - 5000);
  });

  it("refuses to write into another user's card", async () => {
    const theirs = await makeCard(OTHER);
    const result = await applyGradeBatch(OWNER, [{
      id: "g1", cardId: theirs.id, rating: 4, durationMs: 1000, reviewedAt: Date.now(),
    }]);

    // Settled so the client stops retrying, but nothing was written.
    expect(result.settled).toEqual(["g1"]);
    expect(await prisma.review.count({ where: { cardId: theirs.id } })).toBe(0);
    const untouched = await prisma.card.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(untouched.reps).toBe(0);
  });

  it("does not settle a review id belonging to someone else", async () => {
    const theirs = await makeCard(OTHER);
    await applyGradeBatch(OTHER, [{
      id: "shared-id", cardId: theirs.id, rating: 3, durationMs: 1000, reviewedAt: Date.now(),
    }]);

    const mine = await makeCard(OWNER);
    const result = await applyGradeBatch(OWNER, [{
      id: "shared-id", cardId: mine.id, rating: 3, durationMs: 1000, reviewedAt: Date.now(),
    }]);

    // The id exists but is not this user's, so it is neither applied nor settled.
    expect(result.settled).toEqual([]);
    expect(await prisma.review.count({ where: { ownerId: OWNER } })).toBe(0);
  });

  it("settles a grade for a card that was deleted while the device was away", async () => {
    const card = await makeCard();
    await prisma.card.delete({ where: { id: card.id } });

    const result = await applyGradeBatch(OWNER, [{
      id: "g1", cardId: card.id, rating: 3, durationMs: 1000, reviewedAt: Date.now(),
    }]);
    expect(result.settled).toEqual(["g1"]);
  });

  it("drops a malformed entry instead of wedging the queue", async () => {
    const card = await makeCard();
    const result = await applyGradeBatch(OWNER, [
      { id: "bad", cardId: card.id, rating: 9 as never, durationMs: 1, reviewedAt: Date.now() },
      { id: "good", cardId: card.id, rating: 3, durationMs: 1, reviewedAt: Date.now() },
    ]);
    expect(result.settled).toEqual(["good"]);
  });

  it("rejects a batch larger than the agreed limit", async () => {
    const card = await makeCard();
    const huge = Array.from({ length: 200 }, (_, i) => ({
      id: `g${i}`, cardId: card.id, rating: 3 as const, durationMs: 1, reviewedAt: Date.now() + i,
    }));
    expect((await applyGradeBatch(OWNER, huge)).ok).toBe(false);
  });
});

describe("the append-only invariant", () => {
  it("keeps a card's reviews after the card is deleted", async () => {
    // This is the property the cascading foreign key used to break, and the
    // reason Review now carries its own ownerId and no relation to Card.
    const card = await makeCard();
    await applyGradeBatch(OWNER, [{
      id: "g1", cardId: card.id, rating: 3, durationMs: 1000, reviewedAt: Date.now(),
    }]);
    expect(await prisma.review.count({ where: { ownerId: OWNER } })).toBe(1);

    await prisma.card.delete({ where: { id: card.id } });

    const survivors = await prisma.review.findMany({ where: { ownerId: OWNER } });
    expect(survivors).toHaveLength(1);
    // Still groups into a per-card sequence, which is what FSRS optimisation reads.
    expect(survivors[0]?.cardId).toBe(card.id);
  });

  it("keeps reviews when the whole deck is deleted, as a replace-restore does", async () => {
    const a = await makeCard();
    const b = await makeCard();
    await applyGradeBatch(OWNER, [
      { id: "g1", cardId: a.id, rating: 3, durationMs: 1000, reviewedAt: Date.now() - 2000 },
      { id: "g2", cardId: b.id, rating: 2, durationMs: 1000, reviewedAt: Date.now() - 1000 },
    ]);

    await prisma.card.deleteMany({ where: { ownerId: OWNER } });

    expect(await prisma.review.count({ where: { ownerId: OWNER } })).toBe(2);
  });
});
