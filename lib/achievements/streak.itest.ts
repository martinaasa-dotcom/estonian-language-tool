import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveStreakFor } from "@/lib/progress/summary";
import { writeSetting, SETTING_KEYS } from "@/lib/settings/store";
import { dayClock } from "@/lib/time/day";

/**
 * The streak, against the database, on the learner's own clock.
 *
 * It was rewritten once from "load every review of the last 400 days" to a
 * distinct-day aggregate, because the original got slower the more somebody
 * used the app. These check the aggregate still returns the same answer.
 *
 * AND THEY DRIVE `resolveStreakFor` RATHER THAN A COPY OF ITS QUERY. The
 * earlier version of this file kept its own `SELECT ... AT TIME ZONE 'UTC'`
 * beside the real one, and that copy is precisely what went stale the moment
 * the real query learned about timezones: the test would have gone on
 * asserting that UTC days give the right answer while the app had stopped
 * using them. A list in a test that shadows a list in the code is the fault
 * `PROVIDER_KEY_ENV` exists to prevent, and a query is a list.
 *
 * The case that matters is the last one. A learner in Tallinn who studied on
 * Monday morning, at one in the morning on Tuesday and again on Wednesday
 * morning kept a three-day streak. Those sittings fall in two UTC days with a
 * hole between them, and the app used to read that as a streak of 1 — and, if
 * they had a shield banked, spend it bridging a Tuesday they had not missed.
 */

const OWNER = "itest-owner-streak";
const TALLINN = "Europe/Tallinn";

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: OWNER } });
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
  await prisma.setting.deleteMany({ where: { ownerId: OWNER } });
}

async function card() {
  return prisma.card.create({
    data: { ownerId: OWNER, cardType: "RECOGNITION", front: "a", back: "b" },
  });
}

/** Reviews at these instants, three apiece so the distinct-day collapse is exercised. */
async function reviewsAt(instants: Date[]) {
  const c = await card();
  for (const at of instants) {
    for (let i = 0; i < 3; i++) {
      await prisma.review.create({
        data: { ownerId: OWNER, cardId: c.id, rating: 3, reviewedAt: at },
      });
    }
  }
}

/** `offsets` days back from `now`, at `atHour` on the given clock. */
function daysBack(now: Date, offsets: number[], zone: string, atHour: number): Date[] {
  const clock = dayClock(zone);
  return offsets.map((offset) => {
    const midnight = clock.startOfDay(clock.shiftDay(now, offset));
    return new Date(midnight.getTime() + atHour * 3_600_000);
  });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("the streak, counted in the learner's zone", () => {
  it("collapses many reviews in a day to one day", async () => {
    const now = new Date();
    await reviewsAt(daysBack(now, [0, 1, 2], TALLINN, 12));
    await writeSetting(OWNER, SETTING_KEYS.timeZone, TALLINN);
    expect((await resolveStreakFor(OWNER, now, dayClock(TALLINN))).streak).toBe(3);
  });

  it("counts a run of consecutive days", async () => {
    const now = new Date();
    await reviewsAt(daysBack(now, [0, 1, 2, 3, 4], TALLINN, 12));
    expect((await resolveStreakFor(OWNER, now, dayClock(TALLINN))).streak).toBe(5);
  });

  it("stops at a gap", async () => {
    const now = new Date();
    await reviewsAt(daysBack(now, [0, 1, 3, 4], TALLINN, 12));
    expect((await resolveStreakFor(OWNER, now, dayClock(TALLINN))).streak).toBe(2);
  });

  it("counts a session just before local midnight on the day it happened", async () => {
    const now = new Date();
    await reviewsAt(daysBack(now, [0, 1], TALLINN, 23));
    expect((await resolveStreakFor(OWNER, now, dayClock(TALLINN))).streak).toBe(2);
  });

  it("counts a session just after local midnight on the day it happened", async () => {
    const now = new Date();
    await reviewsAt(daysBack(now, [0, 1], TALLINN, 1));
    expect((await resolveStreakFor(OWNER, now, dayClock(TALLINN))).streak).toBe(2);
  });

  it("returns nothing for an account with no reviews", async () => {
    expect((await resolveStreakFor(OWNER, new Date(), dayClock(TALLINN))).streak).toBe(0);
  });

  it("keeps the streak of a learner who studies on both sides of UTC midnight", async () => {
    /*
      Three consecutive local days in Tallinn: yesterday-1 at 09:00, yesterday
      at 01:00, and today at 09:00. In UTC that is two days with a hole, which
      is what used to break this.
    */
    const now = new Date();
    const clock = dayClock(TALLINN);
    const at = (offset: number, hour: number) =>
      new Date(clock.startOfDay(clock.shiftDay(now, offset)).getTime() + hour * 3_600_000);
    await reviewsAt([at(2, 9), at(1, 1), at(0, 9)]);

    expect((await resolveStreakFor(OWNER, now, clock)).streak).toBe(3);
  });

  it("does not spend a shield on a day the learner did not miss", async () => {
    const now = new Date();
    const clock = dayClock(TALLINN);
    const at = (offset: number, hour: number) =>
      new Date(clock.startOfDay(clock.shiftDay(now, offset)).getTime() + hour * 3_600_000);
    await reviewsAt([at(2, 9), at(1, 1), at(0, 9)]);
    await writeSetting(OWNER, SETTING_KEYS.streakShields, "1");

    const result = await resolveStreakFor(OWNER, now, clock);
    expect(result.streak).toBe(3);
    expect(result.shieldsAvailable).toBe(1);
    const spent = await prisma.setting.findUnique({
      where: { ownerId_key: { ownerId: OWNER, key: SETTING_KEYS.streakShieldDates } },
    });
    expect(spent).toBeNull();
  });
});
