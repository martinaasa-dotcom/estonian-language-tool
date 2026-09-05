import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { dayClock } from "@/lib/time/day";
import { outThere, outThereToday } from "./outThere";

/**
 * Integration tests: these need a real Postgres.
 *
 *   npm run test:db
 *
 * The rule about which of the three answers is a conversation is a pure one
 * and is tested where it lives. What needs rows is what the two readers make
 * of them, because both were counting every report as a conversation and
 * Today now takes "not yesterday" for an answer: a fortnight of honest noes
 * would have been reported back as a fortnight of real conversations and a
 * run of fourteen days, on the panel this app says it is measured by.
 *
 * The clock is pinned to a zone rather than the process's own, since a day
 * boundary with no zone is the deployment's midnight (`lib/time/day.ts`) and
 * "answered today" is the whole of what the card reads.
 */

const OWNER = "itest-owner-outthere";
const CLOCK = dayClock("Europe/Tallinn");
/** Mid-morning in Tallinn, so yesterday and tomorrow are both unambiguous. */
const NOW = new Date("2026-09-04T08:00:00+03:00");

async function wipe() {
  await prisma.encounter.deleteMany({ where: { ownerId: OWNER } });
}

async function report(outcome: string, at: Date, errandId: string | null = null) {
  await prisma.encounter.create({ data: { ownerId: OWNER, errandId, outcome, createdAt: at } });
}

/**
 * An instant on a named Tallinn day, written with the offset rather than
 * stepped off a midnight: `setHours` reads the process's zone, which is UTC in
 * CI, so a helper built that way puts a Tallinn morning on the wrong day and
 * the test then reports the query as broken.
 */
const at = (day: string, hour = "10") => new Date(`2026-09-${day}T${hour}:00:00+03:00`);
const TODAY = "04";
const YESTERDAY = "03";

beforeEach(wipe);
afterAll(wipe);

describe("what happened outside the app", () => {
  it("counts the days something was said, and not the days somebody answered", async () => {
    await report("UNDERSTOOD", at(YESTERDAY));
    await report("SWITCHED", at("02"));
    await report("BAILED", at("01"));
    await report("BAILED", new Date("2026-08-30T10:00:00+03:00"));

    const reading = await outThere(OWNER, CLOCK, NOW);
    expect(reading.total).toBe(2);
    expect(reading.byOutcome).toEqual({ UNDERSTOOD: 1, SWITCHED: 1, BAILED: 2 });
  });

  it("breaks the run on a day with nothing in it, not on a day with no answer", async () => {
    // Answered every day, and only two of them held a conversation. The run
    // is two, which is the honest reading of a card that accepts a no.
    await report("UNDERSTOOD", at(TODAY, "07"));
    await report("SWITCHED", at(YESTERDAY));
    await report("BAILED", at("02"));
    await report("UNDERSTOOD", at("01"));

    expect((await outThere(OWNER, CLOCK, NOW)).streak).toBe(2);
  });

  it("tells the card the question is open until it has been answered today", async () => {
    await report("UNDERSTOOD", at(YESTERDAY));
    const before = await outThereToday(OWNER, CLOCK, NOW);
    expect(before.answered).toBeNull();
    expect(before.conversations).toBe(1);

    await report("BAILED", at(TODAY, "07"));
    const after = await outThereToday(OWNER, CLOCK, NOW);
    expect(after.answered).toBe("BAILED");
    // A day with none in it is not a conversation, on the card either.
    expect(after.conversations).toBe(1);
  });

  it("takes the last answer of the day, since two can only come from two tabs", async () => {
    await report("BAILED", at(TODAY, "06"));
    await report("UNDERSTOOD", at(TODAY, "07"));
    expect((await outThereToday(OWNER, CLOCK, NOW)).answered).toBe("UNDERSTOOD");
  });

  it("reads a report that names no errand, which is what Today writes", async () => {
    // The column is nullable on purpose: the question is about the learner's
    // own day, so a conversation with a neighbor carries no errand id.
    await report("UNDERSTOOD", at(YESTERDAY), null);
    expect((await outThere(OWNER, CLOCK, NOW)).total).toBe(1);
  });
});
