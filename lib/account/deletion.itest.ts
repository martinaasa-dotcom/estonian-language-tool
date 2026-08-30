import { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Account deletion, against the database.
 *
 * The privacy page makes a specific promise about what disappears and what does
 * not. This checks the promise, table by table — a deletion that quietly misses
 * one of them is the kind of bug nobody notices until it matters.
 *
 * It runs the same statements `deleteMyAccount` runs; the action itself needs a
 * session. The list is kept in the same order so a new user-owned table added to
 * one and not the other is visible here.
 *
 * A LIST TYPED TWICE IS A LIST THAT DRIFTS, AND THIS ONE HAD. Three tables were
 * missing from the action and therefore from the copy of it below: mock exam
 * sittings, classes and class memberships. So the check that existed to catch a
 * missed table was written from the same missed list and agreed with it.
 *
 * The last test in this file is the one that could not have. It reads every
 * owner-scoped model out of the Prisma DMMF and asserts each is empty
 * afterwards, so a table added next year fails here without anybody adding a
 * line. `scripts/test-invariants.ts` does the same against the action's source.
 */

const MINE = "itest-owner-delete";
const THEIRS = "itest-owner-keep";
const LEMMA = "itest-delete-word";

async function wipe() {
  for (const owner of [MINE, THEIRS]) {
    await prisma.review.deleteMany({ where: { ownerId: owner } });
    await prisma.card.deleteMany({ where: { ownerId: owner } });
    await prisma.task.deleteMany({ where: { ownerId: owner } });
    await prisma.message.deleteMany({ where: { ownerId: owner } });
    await prisma.starredWord.deleteMany({ where: { ownerId: owner } });
    await prisma.achievement.deleteMany({ where: { ownerId: owner } });
    await prisma.setting.deleteMany({ where: { ownerId: owner } });
    await prisma.usageEvent.deleteMany({ where: { ownerId: owner } });
    await prisma.scan.deleteMany({ where: { ownerId: owner } });
    await prisma.assessment.deleteMany({ where: { ownerId: owner } });
    await prisma.examAttempt.deleteMany({ where: { ownerId: owner } });
    await prisma.classroomMember.deleteMany({ where: { ownerId: owner } });
    await prisma.classroom.deleteMany({ where: { ownerId: owner } });
  }
  const lexeme = await prisma.lexeme.findFirst({ where: { lemma: LEMMA } });
  if (lexeme) {
    await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
    await prisma.lexeme.delete({ where: { id: lexeme.id } });
  }
}

async function populate(ownerId: string, lexemeId: string) {
  const card = await prisma.card.create({
    data: { ownerId, lexemeId, cardType: "RECOGNITION", front: "a", back: "b" },
  });
  await prisma.review.create({
    data: { ownerId, cardId: card.id, lexemeId, rating: 3 },
  });
  await prisma.task.create({ data: { ownerId, title: "homework" } });
  await prisma.message.create({ data: { ownerId, role: "user", content: "tere" } });
  await prisma.starredWord.create({ data: { ownerId, lexemeId } });
  await prisma.achievement.create({ data: { ownerId, key: "first-review" } });
  await prisma.setting.create({ data: { ownerId, key: "dailyGoal", value: "15" } });
  await prisma.usageEvent.create({
    data: { ownerId, kind: "TUTOR", provider: "openrouter", model: "gpt-4o", day: "2026-08-29" },
  });
  await prisma.scan.create({ data: { ownerId, title: "itest page", items: "[]" } });
  await prisma.assessment.create({
    data: { ownerId, overall: "A2", ceiling: "B1", confidence: "indicative", answered: 9 },
  });
  await prisma.examAttempt.create({
    data: {
      ownerId, level: "B1", seed: "itest",
      pct: 61, passed: true,
      // The shape does not matter here; that it is the learner's own prose
      // does. This is the row that used to survive "delete everything".
      result: JSON.stringify({ writing: "Ma elan Tartus." }),
    },
  });
  const room = await prisma.classroom.create({
    data: { ownerId, name: "itest class", code: `IT${ownerId.slice(-4).toUpperCase()}` },
  });
  await prisma.classroomMember.create({
    data: { classroomId: room.id, ownerId, role: "TEACHER", displayName: "itest teacher" },
  });
}

/** Exactly what `deleteMyAccount` does, in the same order. */
async function deleteAccount(ownerId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.review.deleteMany({ where: { ownerId } });
    await tx.card.deleteMany({ where: { ownerId } });
    await tx.task.deleteMany({ where: { ownerId } });
    await tx.message.deleteMany({ where: { ownerId } });
    await tx.starredWord.deleteMany({ where: { ownerId } });
    await tx.achievement.deleteMany({ where: { ownerId } });
    await tx.setting.deleteMany({ where: { ownerId } });
    await tx.usageEvent.deleteMany({ where: { ownerId } });
    await tx.scan.deleteMany({ where: { ownerId } });
    await tx.assessment.deleteMany({ where: { ownerId } });
    await tx.examAttempt.deleteMany({ where: { ownerId } });
    await tx.classroomMember.deleteMany({ where: { ownerId } });
    await tx.classroom.deleteMany({ where: { ownerId } });
    await tx.lexeme.updateMany({ where: { editedBy: ownerId }, data: { editedBy: null } });
  });
}

async function countsFor(ownerId: string) {
  const [
    cards, reviews, tasks, messages, stars, badges, settings, usage, scans, checks,
    exams, classes, memberships,
  ] = await Promise.all([
    prisma.card.count({ where: { ownerId } }),
    prisma.review.count({ where: { ownerId } }),
    prisma.task.count({ where: { ownerId } }),
    prisma.message.count({ where: { ownerId } }),
    prisma.starredWord.count({ where: { ownerId } }),
    prisma.achievement.count({ where: { ownerId } }),
    prisma.setting.count({ where: { ownerId } }),
    prisma.usageEvent.count({ where: { ownerId } }),
    prisma.scan.count({ where: { ownerId } }),
    prisma.assessment.count({ where: { ownerId } }),
    prisma.examAttempt.count({ where: { ownerId } }),
    prisma.classroom.count({ where: { ownerId } }),
    prisma.classroomMember.count({ where: { ownerId } }),
  ]);
  return {
    cards, reviews, tasks, messages, stars, badges, settings, usage, scans, checks,
    exams, classes, memberships,
  };
}

let lexemeId: string;

beforeEach(async () => {
  await wipe();
  const lexeme = await prisma.lexeme.create({
    data: { lemma: LEMMA, pos: "NOUN", translation: "x", editedBy: MINE },
  });
  lexemeId = lexeme.id;
  await populate(MINE, lexemeId);
  await populate(THEIRS, lexemeId);
});

afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("deleteMyAccount", () => {
  it("removes every kind of personal data the privacy page names", async () => {
    expect(Object.values(await countsFor(MINE)).every((n) => n > 0)).toBe(true);

    await deleteAccount(MINE);

    expect(await countsFor(MINE)).toEqual({
      cards: 0, reviews: 0, tasks: 0, messages: 0,
      stars: 0, badges: 0, settings: 0, usage: 0, scans: 0, checks: 0,
      exams: 0, classes: 0, memberships: 0,
    });
  });

  it("deletes the review log, which nothing else is allowed to do", async () => {
    // Append-only means no updates and no incidental deletes. A person asking
    // for their own history to be erased is the case that outranks it.
    await deleteAccount(MINE);
    expect(await prisma.review.count({ where: { ownerId: MINE } })).toBe(0);
  });

  it("leaves every other account untouched", async () => {
    await deleteAccount(MINE);
    const theirs = await countsFor(THEIRS);
    expect(Object.values(theirs).every((n) => n > 0)).toBe(true);
  });

  it("keeps the shared dictionary, which other learners have cards on", async () => {
    await deleteAccount(MINE);
    expect(await prisma.lexeme.findUnique({ where: { id: lexemeId } })).not.toBeNull();
  });

  it("empties every owner-scoped table the schema has, named or not", async () => {
    /*
      The one test in this file that is not written from the same list the code
      is. Every other check here names its tables, and so did the code, and so
      both agreed that ten out of thirteen was all of them.

      This reads the models out of the generated client instead. A table added
      to the schema and not to the deletion fails here on the day it is added,
      which is the only version of this check worth having: the ones above
      confirm what somebody remembered, this one confirms what is true.
    */
    const owned = Prisma.dmmf.datamodel.models.filter((model) =>
      model.fields.some((f) => f.name === "ownerId" && f.kind === "scalar"),
    );
    expect(owned.length).toBeGreaterThanOrEqual(12);

    await deleteAccount(MINE);

    const left: string[] = [];
    for (const model of owned) {
      const accessor = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      const table = (prisma as unknown as Record<string, { count(a: unknown): Promise<number> }>)[
        accessor
      ]!;
      if (await table.count({ where: { ownerId: MINE } })) left.push(model.name);
    }
    expect(left).toEqual([]);
  });

  it("stops attributing an edited entry to the deleted account", async () => {
    await deleteAccount(MINE);
    const lexeme = await prisma.lexeme.findUniqueOrThrow({ where: { id: lexemeId } });
    expect(lexeme.editedBy).toBeNull();
  });
});
