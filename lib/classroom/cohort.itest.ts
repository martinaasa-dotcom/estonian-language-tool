import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { classRoster, workplaceRoster } from "./roster";

/**
 * The boundary between a teacher's seat and a sponsor's, against a real
 * Postgres.
 *
 * The unit tests next door assert what `summariseCohort` does with rows it is
 * handed. What they cannot see is the half that matters most here: which rows
 * are read at all. A view that fetched a student's weakest case and chose not
 * to print it would pass every assertion in `cohort.test.ts` and would still be
 * one careless render away from putting a colleague's grammar on their
 * employer's screen. So this drives the real query.
 *
 * The second property is the one that gets lost quietly. A cohort rollup built
 * per member is nine queries each, which is invisible with two learners in a
 * fixture and is the shape this repository has already measured at 330 queries
 * where five would do. Counting them is the only way that stays true.
 */

const BOSS = "itest-cohort-boss";
const ANU = "itest-cohort-anu";
const JAAN = "itest-cohort-jaan";
const EVERYONE = [BOSS, ANU, JAAN];

let classroomId = "";
let workplaceId = "";
let lexemeId = "";

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.card.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.assessment.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.examAttempt.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.classroom.deleteMany({ where: { ownerId: BOSS } });
  await prisma.lexeme.deleteMany({ where: { lemma: "itestkohort" } });
}

beforeEach(async () => {
  await wipe();

  // Invented rather than borrowed from the seed: `Lexeme` is unique on
  // (lemma, pos), so a fixture ticking a real word sits beside the seeded one
  // in a dictionary every later suite shares.
  const lexeme = await prisma.lexeme.create({
    data: { lemma: "itestkohort", pos: "NOUN", translation: "test word", cefr: "B1" },
  });
  lexemeId = lexeme.id;

  const workplaceRow = await prisma.classroom.create({
    data: {
      name: "Estonian at work", code: "ITWRK1", ownerId: BOSS,
      kind: "WORKPLACE", targetLevel: "B1",
      members: {
        create: [
          { ownerId: BOSS, role: "TEACHER", displayName: "Boss" },
          { ownerId: ANU, displayName: "Anu" },
          { ownerId: JAAN, displayName: "Jaan" },
        ],
      },
    },
  });
  workplaceId = workplaceRow.id;

  const classRow = await prisma.classroom.create({
    data: {
      name: "Eesti keel B1", code: "ITCLS1", ownerId: BOSS,
      members: {
        create: [
          { ownerId: BOSS, role: "TEACHER", displayName: "Boss" },
          { ownerId: ANU, displayName: "Anu" },
        ],
      },
    },
  });
  classroomId = classRow.id;
});

afterAll(wipe);

/** A card and enough graded history behind it to be worth reading. */
async function history(ownerId: string, count: number, rating: number, targetCase = "INESSIVE") {
  const card = await prisma.card.create({
    data: {
      ownerId, lexemeId, cardType: "CASE_FORM", front: "f", back: "b",
      targetCase, state: 2,
    },
  });
  const now = Date.now();
  await prisma.review.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      ownerId,
      cardId: card.id,
      lexemeId,
      rating,
      stateBefore: 2,
      targetCase,
      reviewedAt: new Date(now - i * 3_600_000),
    })),
  });
}

describe("what a sponsor's query reads", () => {
  it("never selects a case, however much case history is there", async () => {
    /*
      Driven rather than asserted from the source, which the invariant suite
      already does. Anu has 200 reviews all at one case and all wrong, which is
      exactly the shape `classRoster` reports as a named student's weakest
      point. Nothing about it may reach the workplace summary.
    */
    await history(ANU, 200, 1);

    const teacher = await classRoster(classroomId);
    const anuInClass = teacher.entries.find((e) => e.ownerId === ANU);
    expect(anuInClass?.weakestCase?.grammCase).toBe("INESSIVE");

    const sponsor = await workplaceRoster(workplaceId, "B1");
    const serialised = JSON.stringify(sponsor);
    expect(serialised).not.toContain("INESSIVE");
    expect(serialised).not.toContain("weakestCase");
    expect(serialised).not.toContain("confidence");
  });

  it("names everybody who joined, with a band and the tier behind it", async () => {
    await history(ANU, 200, 4);

    const sponsor = await workplaceRoster(workplaceId, "B1");
    expect(sponsor.members.map((m) => m.displayName)).toEqual(["Anu", "Boss", "Jaan"]);
    for (const member of sponsor.members) {
      expect(member.evidence).toMatch(/thin|fair|good/);
      expect(member.band).toMatch(/likely|close|far|unknown/);
    }
  });

  it("will not place somebody it has barely watched", async () => {
    // Nine reviews is an anecdote. The model would still hand back a number.
    await history(JAAN, 9, 1);
    const sponsor = await workplaceRoster(workplaceId, "B1");
    expect(sponsor.members.find((m) => m.displayName === "Jaan")?.band).toBe("unknown");
  });

  it("counts a review made today as practice this week", async () => {
    await history(ANU, 12, 3);
    const sponsor = await workplaceRoster(workplaceId, "B1");
    const anu = sponsor.members.find((m) => m.displayName === "Anu");
    expect(anu?.daysSinceLastReview).toBe(0);
    expect(anu?.reviewsThisWeek).toBeGreaterThan(0);
    expect(sponsor.active).toBe(1);
  });

  it("reports somebody who stopped, rather than losing them past the window", async () => {
    /*
      The last review is read from an all-time grouped max rather than from the
      windowed rows, so a member who stopped over a year ago has a real
      last-seen date instead of reading as never having reviewed at all.
    */
    const card = await prisma.card.create({
      data: { ownerId: JAAN, lexemeId, cardType: "RECOGNITION", front: "f", back: "b", state: 2 },
    });
    await prisma.review.create({
      data: {
        ownerId: JAAN, cardId: card.id, lexemeId, rating: 3, stateBefore: 2,
        reviewedAt: new Date(Date.now() - 400 * 86_400_000),
      },
    });

    const sponsor = await workplaceRoster(workplaceId, "B1");
    const jaan = sponsor.members.find((m) => m.displayName === "Jaan");
    expect(jaan?.daysSinceLastReview).toBeGreaterThan(365);
    expect(sponsor.active).toBe(0);
  });
});

describe("what it costs", () => {
  it("asks the same number of questions for three people as for one", async () => {
    await history(ANU, 60, 3);
    await history(JAAN, 60, 4);

    /*
      Counted by spying on the delegates the function actually calls rather
      than through Prisma's query log, which this client is not built to emit:
      a listener nothing ever fires would have counted zero both times and this
      test would have passed while measuring nothing.
    */
    const spies = [
      vi.spyOn(prisma.classroomMember, "findMany"),
      vi.spyOn(prisma.card, "findMany"),
      vi.spyOn(prisma.lexeme, "findMany"),
      vi.spyOn(prisma.lexeme, "groupBy"),
      vi.spyOn(prisma.review, "findMany"),
      vi.spyOn(prisma.review, "groupBy"),
      vi.spyOn(prisma.examAttempt, "findMany"),
      vi.spyOn(prisma.assessment, "findMany"),
    ];
    const calls = () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

    try {
      await workplaceRoster(workplaceId, "B1");
      const three = calls();
      expect(three).toBeGreaterThan(0);

      spies.forEach((spy) => spy.mockClear());
      await prisma.classroomMember.deleteMany({
        where: { classroomId: workplaceId, ownerId: { in: [ANU, JAAN] } },
      });
      spies.forEach((spy) => spy.mockClear());
      await workplaceRoster(workplaceId, "B1");
      const one = calls();

      /*
        Equal, not merely similar. A loop over members would show three times
        the reads here and would look perfectly fine in every other assertion
        in this file.
      */
      expect(three).toBe(one);
      expect(three).toBeLessThanOrEqual(10);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
