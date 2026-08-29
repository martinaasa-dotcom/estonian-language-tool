import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { computeStreakWithShields } from "./badges";

/**
 * The streak query, against the database.
 *
 * It was rewritten from "load every review of the last 400 days" to a distinct-
 * day aggregate, because the original got slower the more somebody used the app.
 * These check the rewrite returns the same answer — including across a timezone
 * boundary, where a Postgres `date` parsed at local midnight would shift the day
 * and break a streak for anyone east of UTC.
 */

const OWNER = "itest-owner-streak";

/** The same query `resolveStreak` runs. */
async function streakDays(ownerId: string): Promise<Date[]> {
  const rows = await prisma.$queryRaw<{ day: string }[]>`
    SELECT DISTINCT TO_CHAR("reviewedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
    FROM "Review"
    WHERE "ownerId" = ${ownerId}
      AND "reviewedAt" >= ${new Date(Date.now() - 400 * 86_400_000)}
    ORDER BY day DESC
  `;
  return rows.map((r) => new Date(`${r.day}T00:00:00.000Z`));
}

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: OWNER } });
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
}

async function reviewsOn(offsetsFromToday: number[], atHourUtc = 12) {
  const card = await prisma.card.create({
    data: { ownerId: OWNER, cardType: "RECOGNITION", front: "a", back: "b" },
  });
  for (const offset of offsetsFromToday) {
    const at = new Date();
    at.setUTCDate(at.getUTCDate() - offset);
    at.setUTCHours(atHourUtc, 0, 0, 0);
    // Several reviews per day, so the distinct-day collapse is exercised.
    for (let i = 0; i < 3; i++) {
      await prisma.review.create({
        data: { ownerId: OWNER, cardId: card.id, rating: 3, reviewedAt: at },
      });
    }
  }
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("the streak day query", () => {
  it("collapses many reviews in a day to one day", async () => {
    await reviewsOn([0, 1, 2]);
    const days = await streakDays(OWNER);
    expect(days).toHaveLength(3);
    expect(computeStreakWithShields(days, 0).streak).toBe(3);
  });

  it("counts a run of consecutive days", async () => {
    await reviewsOn([0, 1, 2, 3, 4]);
    expect(computeStreakWithShields(await streakDays(OWNER), 0).streak).toBe(5);
  });

  it("stops at a gap", async () => {
    await reviewsOn([0, 1, 3, 4]);
    expect(computeStreakWithShields(await streakDays(OWNER), 0).streak).toBe(2);
  });

  it("keeps the UTC day for a review late in the evening", async () => {
    // 23:00 UTC. A `date` parsed at local midnight east of UTC would report the
    // previous day and break the streak.
    await reviewsOn([0], 23);
    const days = await streakDays(OWNER);
    const expected = new Date();
    expect(days[0]?.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it("keeps the UTC day for a review just after midnight", async () => {
    await reviewsOn([0], 0);
    const days = await streakDays(OWNER);
    expect(days[0]?.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it("returns nothing for an account with no reviews", async () => {
    expect(await streakDays(OWNER)).toEqual([]);
  });

  it("returns at most one row per day however many reviews there are", async () => {
    await reviewsOn([0]);
    await reviewsOn([0]);
    expect(await streakDays(OWNER)).toHaveLength(1);
  });
});
