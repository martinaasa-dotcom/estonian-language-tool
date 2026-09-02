import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { MIN_LEARNERS, MIN_REVIEWS } from "@/lib/research/corpus";
import { SETTING_KEYS } from "@/lib/settings/store";

import { GET } from "./route";

/**
 * The export against a real database, because the half of it that can be wrong
 * is the half no unit test can see.
 *
 * `lib/research/corpus.test.ts` proves the disclosure gate: given tallies, it
 * publishes what it should and withholds what it should. That leaves exactly
 * one thing unchecked and it is the thing that would be worst to get wrong. The
 * gate can be perfect and still be handed the wrong rows. Every aggregation
 * here is SQL, on purpose, so that nothing proportional to the size of the
 * review log is ever read into Node, and SQL is what a unit test cannot run.
 *
 * The first test is the one that matters. A learner who asked to be left out is
 * left out, and the way to be sure of that is not to read the code: it is to
 * publish a figure, then add a person's worth of wrong answers under an opt-out
 * row, and check the figure did not move.
 */

const OWNERS = Array.from({ length: 24 }, (_, i) => `itest-research-${String(i).padStart(2, "0")}`);
const OPTED_OUT = "itest-research-opted-out";
const EVERYONE = [...OWNERS, OPTED_OUT];

const TOKEN = "itest-research-token";
const LEMMA = "uurimisproovisona";

/**
 * A second invented word with a gradation pattern of its own, and fewer answers.
 *
 * NOT DECORATION: `gradation_pattern` has `groupBy: 0`, so every pattern in the
 * corpus is in one group, and the gate's complementary rule withholds a second
 * cell from any group that withheld exactly one. A single stray review on any
 * gradating word, by anybody this fixture did not write, is therefore enough to
 * make the group hide one cell and then hide its smallest survivor as well.
 *
 * With one fixture pattern the smallest survivor *is* the assertion, and this
 * test failed on any machine that had ever run `npm run demo`, which is a suite
 * inheriting a precondition rather than stating one. With two it does not: zero
 * strays and the rule never fires, one stray and this smaller pattern is the
 * victim, two or more and the rule does not fire either. CI seeds fresh and so
 * never saw it.
 */
const OTHER_LEMMA = "uurimisproovisonake";

/*
  Made-up grouping keys, so that every figure this file asserts on is one this
  file put there.

  The export is deployment-wide by design, so a fixture using a real case name
  measures its own rows plus whatever else is in the database, and the first
  version of this asserted 60% and read 79 against a seeded deck. `targetCase`
  is a plain column and the export groups by whatever string is in it, so an
  invented key exercises exactly the same path while colliding with nothing.
  The same argument as the invented lemma above, one column over.
*/
const ONE = "ITEST_CASE_ONE";
const FEW_PEOPLE = "ITEST_CASE_FEW_PEOPLE";
const FEW_ANSWERS = "ITEST_CASE_FEW_ANSWERS";
const DOMINATED = "ITEST_CASE_DOMINATED";

let lexemeId = "";

async function wipe() {
  await prisma.review.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.card.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.setting.deleteMany({ where: { ownerId: { in: EVERYONE } } });
  await prisma.lexeme.deleteMany({ where: { lemma: { in: [LEMMA, OTHER_LEMMA] } } });
}

/*
  An invented word, never an Estonian one. `Lexeme` is unique on (lemma, pos)
  rather than on the lemma, so a fixture that writes a word the seed already
  holds does not collide with it, it sits beside it with no forms behind it, in
  a dictionary every later suite shares. And this app writes no Estonian
  (ADR-005), so neither do its fixtures: spell it so that nobody could mistake
  it for a word.
*/
async function seedWord(): Promise<string> {
  const lexeme = await prisma.lexeme.create({
    data: {
      lemma: LEMMA,
      pos: "NOUN",
      translation: "a fixture, not a word",
      cefr: "A1",
      gradation: "QUALITATIVE",
      gradationNote: "itest : itest",
      provenance: "SEED",
    },
  });
  return lexeme.id;
}

/** The decoy pattern. See `OTHER_LEMMA` for what it is holding off. */
async function seedOtherWord(): Promise<string> {
  const lexeme = await prisma.lexeme.create({
    data: {
      lemma: OTHER_LEMMA,
      pos: "NOUN",
      translation: "a second fixture, not a word",
      cefr: "A1",
      gradation: "QUALITATIVE",
      gradationNote: "itest2 : itest2",
      provenance: "SEED",
    },
  });
  return lexeme.id;
}

/**
 * `people` learners answering one case card `each` times, with `wrong` of those
 * answers graded Again.
 */
async function answers(
  owners: readonly string[],
  each: number,
  wrong: number,
  targetCase = ONE,
  /*
    Whether the card these answers were given on still exists.

    Written that way rather than inserted and then repointed, because `Review`
    is append-only and an invariant says so: a fixture that reaches for
    `review.update` to arrange a state is a fixture teaching the next person
    that the rule has exceptions. A review whose card is gone is exactly a row
    holding a `cardId` nothing matches, so writing one is the whole of it.
  */
  cardIsGone = false,
  /** Which word, for the one caller that wants the second fixture. */
  word = lexemeId,
) {
  for (const ownerId of owners) {
    const card = await prisma.card.create({
      data: {
        ownerId,
        lexemeId: word,
        cardType: "CASE_FORM",
        front: "front",
        back: "back",
        targetCase,
        state: 2,
      },
    });
    await prisma.review.createMany({
      data: Array.from({ length: each }, (_, i) => ({
        ownerId,
        cardId: cardIsGone ? "a card that is not there" : card.id,
        lexemeId: word,
        rating: i < wrong ? 1 : 3,
        stateBefore: 2,
        targetCase,
        reviewedAt: new Date(),
      })),
    });
  }
}

async function pull(token = TOKEN, format?: string): Promise<Response> {
  process.env.RESEARCH_TOKEN = TOKEN;
  const url = `http://localhost/api/research${format ? `?format=${format}` : ""}`;
  return GET(new NextRequest(url, { headers: { authorization: `Bearer ${token}` } }));
}

interface Cell {
  keys: string[];
  all: { reviews: number; learners: string; accuracyPct: number };
  mature: { accuracyPct: number } | null;
}

async function caseCells(): Promise<Map<string, Cell>> {
  const body = await (await pull()).json();
  const section = body.sections.find((s: { id: string }) => s.id === "case");
  return new Map(section.cells.map((c: Cell) => [c.keys[0]!, c]));
}

beforeEach(async () => {
  await wipe();
  lexemeId = await seedWord();
});

afterAll(async () => {
  await wipe();
  delete process.env.RESEARCH_TOKEN;
  await prisma.$disconnect();
});

describe("who is counted", () => {
  it("does not move a published figure when somebody who opted out answers", async () => {
    // Enough people, answering the same way, to clear the gate comfortably.
    await answers(OWNERS, 10, 4);
    const before = (await caseCells()).get(ONE);
    expect(before, "the fixture did not clear the gate, so this proves nothing").toBeDefined();

    // Now one more person, every answer wrong, who has asked to be left out.
    await prisma.setting.create({
      data: { ownerId: OPTED_OUT, key: SETTING_KEYS.researchOptOut, value: "1" },
    });
    await answers([OPTED_OUT], 200, 200);

    const after = (await caseCells()).get(ONE);
    expect(after!.all.accuracyPct).toBe(before!.all.accuracyPct);
    expect(after!.all.reviews).toBe(before!.all.reviews);
  });

  it("counts somebody who turned it back on", async () => {
    await answers(OWNERS, 10, 4);
    const before = (await caseCells()).get(ONE)!;

    await prisma.setting.create({
      data: { ownerId: OPTED_OUT, key: SETTING_KEYS.researchOptOut, value: "0" },
    });
    await answers([OPTED_OUT], 200, 200);

    const after = (await caseCells()).get(ONE)!;
    expect(after.all.reviews).toBeGreaterThan(before.all.reviews);
    expect(after.all.accuracyPct).toBeLessThan(before.all.accuracyPct);
  });
});

describe("what the gate does to real rows", () => {
  it("withholds a case too few people answered, rather than reporting it small", async () => {
    // One short of the threshold, and answering plenty each, so that only the
    // head count can be what stops it.
    await answers(OWNERS.slice(0, MIN_LEARNERS - 1), 40, 20, FEW_PEOPLE);
    expect((await caseCells()).has(FEW_PEOPLE)).toBe(false);
  });

  it("withholds a case too thin to mean anything, however many answered it", async () => {
    await answers(OWNERS, 1, 0, FEW_ANSWERS);
    const cells = await caseCells();
    expect(cells.has(FEW_ANSWERS)).toBe(false);
    // And the fixture really was above the head count, so it was the answer
    // count that stopped it.
    expect(OWNERS.length).toBeGreaterThanOrEqual(MIN_LEARNERS);
    expect(OWNERS.length).toBeLessThan(MIN_REVIEWS);
  });

  it("withholds a case one person is most of", async () => {
    await answers(OWNERS, 3, 0, DOMINATED);
    await answers([OPTED_OUT], 400, 0, DOMINATED);
    expect((await caseCells()).has(DOMINATED)).toBe(false);
  });

  it("publishes what clears it, with the accuracy the rows actually carry", async () => {
    // 24 people, 10 answers each, 4 wrong: 60% by construction.
    await answers(OWNERS, 10, 4);
    const cell = (await caseCells()).get(ONE)!;
    expect(cell.all.accuracyPct).toBe(60);
    expect(cell.all.reviews).toBe(240);
    expect(cell.all.learners).toBe("20-49");
    expect(cell.mature!.accuracyPct).toBe(60);
  });

  it("reaches the tables built on a join, not only the one that needs none", async () => {
    await answers(OWNERS, 10, 4);
    // A smaller second pattern, so a stray gradating review from outside this
    // fixture cannot make the complementary rule take the one being asserted.
    // See `OTHER_LEMMA`.
    await answers(OWNERS, 3, 1, ONE, false, await seedOtherWord());
    const body = await (await pull()).json();
    /** A cell in `id` carrying every one of `keys`, which is how a crosstab is pinned. */
    const has = (id: string, ...keys: string[]) =>
      body.sections
        .find((s: { id: string }) => s.id === id)
        .cells.some((c: Cell) => keys.every((k) => c.keys.includes(k)));

    /*
      Keys only this fixture can have produced, so that a table reached by a
      join cannot pass on somebody else's rows. `level` and `pos` are checked
      through the crosstab for the same reason: A1 and NOUN are in any seeded
      database, and asserting on them would pass with the join deleted.
    */
    expect(has("gradation_pattern", "itest : itest")).toBe(true);
    expect(has("word", LEMMA)).toBe(true);
    expect(has("case_by_level", ONE, "A1")).toBe(true);
    expect(has("case_by_gradation", ONE, "QUALITATIVE")).toBe(true);
    // The card join, which is the inner one and therefore drops rows.
    expect(has("case_by_task", ONE, "CASE_FORM")).toBe(true);
  });

  it("drops an answer whose card is gone rather than counting it as a shape", async () => {
    await answers(OWNERS, 10, 4, ONE, true);

    const body = await (await pull()).json();
    const has = (id: string, ...keys: string[]) =>
      body.sections
        .find((s: { id: string }) => s.id === id)
        .cells.some((c: Cell) => keys.every((k) => c.keys.includes(k)));

    // No `unknown` shape of question invented for them, anywhere.
    expect(has("task", "unknown")).toBe(false);
    expect(has("case_by_task", ONE, "unknown")).toBe(false);
    expect(has("case_by_task", ONE, "CASE_FORM")).toBe(false);
    // The case table needs no card and still has every one of them, and so do
    // the tables reached through the dictionary rather than through the deck.
    expect((await caseCells()).has(ONE)).toBe(true);
    expect(has("word", LEMMA)).toBe(true);
  });
});

describe("getting at it", () => {
  it("does not exist without a token configured", async () => {
    delete process.env.RESEARCH_TOKEN;
    const url = "http://localhost/api/research";
    const response = await GET(
      new NextRequest(url, { headers: { authorization: `Bearer ${TOKEN}` } }),
    );
    expect(response.status).toBe(404);
  });

  it("does not exist to a caller with the wrong token, or none", async () => {
    expect((await pull("wrong-token-entirely")).status).toBe(404);
    expect((await pull("")).status).toBe(404);
  });

  it("says the same thing in CSV as in JSON", async () => {
    await answers(OWNERS, 10, 4);
    const cell = (await caseCells()).get(ONE)!;

    const csv = await (await pull(TOKEN, "csv")).text();
    const row = csv
      .split("\n")
      .find((line) => line.startsWith(`case,case,${ONE},`));
    expect(row).toBeDefined();
    expect(row!.split(",")).toContain(String(cell.all.accuracyPct));
    expect(row!.split(",")).toContain(String(cell.all.reviews));
    // And the method travels with it.
    expect(csv.startsWith("# Kodukeel")).toBe(true);
    expect(csv).toContain(`at least ${MIN_LEARNERS} different people`);
  });

  it("is never cached, whatever asked for it", async () => {
    for (const format of [undefined, "csv"]) {
      const response = await pull(TOKEN, format);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
