import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { lastSession, SESSION_GAP_MS } from "./session";

/**
 * WHAT COUNTS AS THE SESSION THAT JUST ENDED.
 *
 * An integration test because the claim is about rows: `perfect_session` used
 * to be awarded from a count and an accuracy the browser handed in, and every
 * export of `app/actions.ts` is a public endpoint, so those two numbers were a
 * claim rather than a measurement. This reads them off the log instead, and
 * what a "session" means is the whole of the change.
 *
 *   npm run test:db
 */

const OWNER = "itest-owner-session";
const OTHER = "itest-owner-session-other";
const NOW = new Date("2026-09-02T18:00:00Z");

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: { in: [OWNER, OTHER] } } });
}

/** A graded card `minutesAgo` before `NOW`. Rating 3 and up is a recall. */
async function reviewed(minutesAgo: number, rating: number, ownerId = OWNER) {
  await prisma.review.create({
    data: {
      ownerId,
      cardId: crypto.randomUUID(),
      lexemeId: crypto.randomUUID(),
      rating,
      reviewedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
      durationMs: 1_000,
      stateBefore: 2,
    },
  });
}

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("lastSession", () => {
  it("counts the run of reviews ending now", async () => {
    for (let i = 0; i < 12; i += 1) await reviewed(i, 3);
    expect(await lastSession(OWNER, NOW)).toMatchObject({ count: 12, accuracy: 100 });
  });

  it("scores it on what the ratings say, not on what a caller says", async () => {
    for (let i = 0; i < 8; i += 1) await reviewed(i, 3);
    for (let i = 8; i < 10; i += 1) await reviewed(i, 1);
    expect(await lastSession(OWNER, NOW)).toMatchObject({ count: 10, accuracy: 80 });
  });

  /*
    The boundary is the whole idea. A sitting ends when the person stops, and
    coming back after lunch is a new one: without this, a learner's whole
    history would be one session and `perfect_session` would be unreachable
    for anybody who has ever missed a card.
  */
  it("stops at a gap longer than the session gap", async () => {
    for (let i = 0; i < 5; i += 1) await reviewed(i, 3);
    const past = SESSION_GAP_MS / 60_000 + 5;
    for (let i = 0; i < 20; i += 1) await reviewed(past + i, 1);
    expect(await lastSession(OWNER, NOW)).toMatchObject({ count: 5, accuracy: 100 });
  });

  it("is one session across a pause shorter than the gap", async () => {
    await reviewed(0, 3);
    await reviewed(SESSION_GAP_MS / 60_000 - 1, 3);
    expect((await lastSession(OWNER, NOW)).count).toBe(2);
  });

  it("says nothing happened when nothing did", async () => {
    expect(await lastSession(OWNER, NOW)).toMatchObject({ count: 0, accuracy: 0 });
  });

  /*
    Owner-scoped, like every other read in `lib/progress/`. A shared badge
    would be a stranger's answers deciding somebody's shelf.
  */
  it("never counts another learner's answers", async () => {
    for (let i = 0; i < 12; i += 1) await reviewed(i, 3, OTHER);
    expect(await lastSession(OWNER, NOW)).toMatchObject({ count: 0, accuracy: 0 });
  });

  /*
    THE FAULT THIS EXISTS FOR: nothing a caller says can manufacture a run.
    `checkAchievements({ count: 10, accuracy: 100 })` earned the badge with no
    card answered; there is no argument to pass any more, and an empty log is
    an empty session however loudly a caller claims otherwise.
  */
  it("cannot be told that a session went well", async () => {
    await reviewed(0, 1);
    const session = await lastSession(OWNER, NOW);
    expect(session.count).toBe(1);
    expect(session.accuracy).toBe(0);
  });

  /*
    The two hour-of-day badges read these rather than the moment the check ran,
    because a session that began at 06:40 and ended at 07:05 is an early bird
    by the half of it that happened before seven.
  */
  it("says when the run began and when it ended", async () => {
    for (const minutesAgo of [9, 5, 1]) await reviewed(minutesAgo, 3);

    const session = await lastSession(OWNER, NOW);
    expect(session.startedAt?.getTime()).toBe(NOW.getTime() - 9 * 60_000);
    expect(session.endedAt?.getTime()).toBe(NOW.getTime() - 60_000);
  });

  it("says nothing about when, on a log with nothing in it", async () => {
    const session = await lastSession(OWNER, NOW);
    expect(session.startedAt).toBeNull();
    expect(session.endedAt).toBeNull();
  });
});