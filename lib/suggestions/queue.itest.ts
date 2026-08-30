import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { groupKeyFor } from "./model";
import { readQueue } from "./queue";

/**
 * The queue is built for volume, and volume is the one thing a unit test
 * cannot show you. These run against a real database because the grouping,
 * the counts and the "what does the entry say now" column are all queries.
 *
 * The property under all of them: one problem is one line, whatever it cost
 * in reports, and the line carries enough to decide without opening anything
 * else.
 */

const LEMMA = "itest-queue-tuba";
const OWNERS = Array.from({ length: 5 }, (_, i) => `itest-queue-owner-${i}`);

async function wipe() {
  await prisma.suggestion.deleteMany({ where: { ownerId: { in: OWNERS } } });
  const lexeme = await prisma.lexeme.findFirst({ where: { lemma: LEMMA } });
  if (lexeme) {
    await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
    await prisma.lexeme.delete({ where: { id: lexeme.id } });
  }
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

async function seedWord() {
  return prisma.lexeme.create({
    data: {
      lemma: LEMMA, pos: "NOUN", translation: "room",
      forms: { create: [{ formType: "GEN_SG", value: "toa" }] },
    },
  });
}

/** `n` different people reporting the same thing about the same entry. */
async function reportedBy(count: number, lexemeId: string, translation = "chamber") {
  const patch = { kind: "SET_TRANSLATION" as const, lexemeId, translation };
  const groupKey = groupKeyFor({ category: "WRONG_MEANING", lexemeId, lemma: LEMMA, patch });
  for (let i = 0; i < count; i += 1) {
    await prisma.suggestion.create({
      data: {
        ownerId: OWNERS[i]!, category: "WRONG_MEANING", groupKey,
        lemma: LEMMA, lexemeId, note: `person ${i}`,
        patch: JSON.stringify(patch),
      },
    });
  }
  return groupKey;
}

describe("readQueue", () => {
  it("shows one line for a thing many people reported, and counts them", async () => {
    const lexeme = await seedWord();
    await reportedBy(4, lexeme.id);

    const queue = await readQueue({ status: "OPEN", category: null, page: 0 });
    const row = queue.rows.find((r) => r.lemma === LEMMA);

    expect(row).toBeDefined();
    expect(row!.reports).toBe(4);
    expect(queue.rows.filter((r) => r.lemma === LEMMA)).toHaveLength(1);
  });

  it("carries a few of the other voices without dragging in all of them", async () => {
    const lexeme = await seedWord();
    await reportedBy(5, lexeme.id);

    const queue = await readQueue({ status: "OPEN", category: null, page: 0 });
    const row = queue.rows.find((r) => r.lemma === LEMMA)!;
    expect(row.alsoSaid.length).toBeGreaterThan(0);
    expect(row.alsoSaid.length).toBeLessThanOrEqual(3);
  });

  /*
    The half that lets somebody decide without opening the dictionary in
    another tab. Without it every row is a claim with nothing to check it
    against, which is how a review queue stops being used.
  */
  it("shows what the entry says now beside what is proposed", async () => {
    const lexeme = await seedWord();
    await reportedBy(1, lexeme.id);

    const queue = await readQueue({ status: "OPEN", category: null, page: 0 });
    const row = queue.rows.find((r) => r.lemma === LEMMA)!;
    expect(row.before).toBe("room");
    expect(row.patch).toMatchObject({ translation: "chamber" });
    expect(row.blocked).toBeNull();
  });

  it("says when somebody has already fixed it, and offers nothing to apply", async () => {
    const lexeme = await seedWord();
    await reportedBy(1, lexeme.id, "room");

    const queue = await readQueue({ status: "OPEN", category: null, page: 0 });
    const row = queue.rows.find((r) => r.lemma === LEMMA)!;
    expect(row.blocked).toMatch(/already/i);
  });

  it("survives the entry being deleted under the report", async () => {
    const lexeme = await seedWord();
    await reportedBy(1, lexeme.id);
    await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
    await prisma.lexeme.delete({ where: { id: lexeme.id } });

    /*
      There is no foreign key from a report to a word, on purpose: a report
      about an entry has to outlive the entry, or merging two words would
      cascade away the evidence that one of them was wrong.
    */
    const queue = await readQueue({ status: "OPEN", category: null, page: 0 });
    const row = queue.rows.find((r) => r.lemma === LEMMA)!;
    expect(row).toBeDefined();
    expect(row.blocked).toMatch(/no longer/i);
  });

  it("counts open reports under the category tab that shows them", async () => {
    const lexeme = await seedWord();
    await reportedBy(3, lexeme.id);

    const queue = await readQueue({ status: "OPEN", category: null, page: 0 });
    expect(queue.openByCategory.WRONG_MEANING).toBeGreaterThanOrEqual(3);

    const filtered = await readQueue({ status: "OPEN", category: "MISSING_WORD", page: 0 });
    expect(filtered.rows.some((r) => r.lemma === LEMMA)).toBe(false);
  });

  it("leaves a resolved report out of the open queue", async () => {
    const lexeme = await seedWord();
    await reportedBy(2, lexeme.id);
    await prisma.suggestion.updateMany({
      where: { lexemeId: lexeme.id },
      data: { status: "ACCEPTED", reviewedBy: "itest-queue-reviewer" },
    });

    const open = await readQueue({ status: "OPEN", category: null, page: 0 });
    expect(open.rows.some((r) => r.lemma === LEMMA)).toBe(false);

    const accepted = await readQueue({ status: "ACCEPTED", category: null, page: 0 });
    expect(accepted.rows.some((r) => r.lemma === LEMMA)).toBe(true);
  });
});
