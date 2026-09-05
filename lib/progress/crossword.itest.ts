import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cellsOf, MAX_ENTRIES, MAX_SIDE, MIN_ENTRIES, solvedEntries } from "@/lib/games/crossword";
import type { DayKey } from "@/lib/time/day";
import { SEED_SET_SIZE } from "@/lib/collections/seedSize";
import { clueClashes, clueKey, clueParts } from "@/lib/games/clue";
import { crosswordFor } from "./crossword";

/**
 * The compiler over the dictionary that ships, which is the only place the
 * question that matters can be asked.
 *
 * `crossword.test.ts` proves the placement rules over invented letters. What it
 * cannot prove is that a real pool of Estonian words at a real learner's level
 * makes a grid at all, every day, without growing past a phone: that is a fact
 * about 215 A1 words and how often two of them share a letter, and no fixture
 * can stand in for it. A greedy compiler that quietly returns three words on
 * half the days would pass every unit test in the file next door.
 */

const OWNER = "itest-owner-crossword";

const days = Array.from({ length: 30 }, (_, i) =>
  `2026-0${1 + Math.floor(i / 10)}-${String(1 + (i % 10)).padStart(2, "0")}` as DayKey);

async function wipe() {
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

/*
  AND IT STATES THE ONE THING IT CANNOT MAKE FOR ITSELF.

  This is a fact about the shipped dictionary, so a dictionary some other suite
  left behind is a different question with the same name. `test-restore.mjs`
  empties it and restores it, `test-edit.mjs` corrects an entry, and
  `test-containment.mjs` ticks a word into it: run any of those first on a
  machine that is not CI and this failed with "B1 on 2026-01-01 got no grid",
  which reads as the compiler being broken and sends whoever hits it into
  `lib/games/crossword.ts`. It happened, and it cost an hour of looking in the
  wrong file.

  So the precondition is asked once, in words, before the thirty days are
  compiled. `SEED_SET_SIZE` is the seed's own count and `seedSize.test.ts`
  keeps it honest, so this is the same number `npm run db:seed` writes.
*/
describe("the dictionary this is a fact about", () => {
  it("is the one the seed loads", async () => {
    const words = await prisma.lexeme.count();
    expect(
      words, `the dictionary holds ${words} words, not the ${SEED_SET_SIZE.words} a fresh seed `
      + "loads. Run `npm run db:seed`: a suite that empties or edits it ran first, and the grid "
      + "below is a fact about the shipped dictionary rather than about whatever is there now",
    ).toBeGreaterThanOrEqual(SEED_SET_SIZE.words);
  });
});

describe("the daily crossword", () => {
  it("makes a grid every day at every level", async () => {
    for (const level of ["A1", "B1", "C1"] as const) {
      for (const day of days) {
        const puzzle = await crosswordFor(OWNER, day, level);
        expect(puzzle, `${level} on ${day} got no grid`).not.toBeNull();
        expect(puzzle!.entries.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
        expect(puzzle!.entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
      }
    }
  }, 60_000);

  /** The cap a phone is the reason for, over real words rather than fixtures. */
  it("never grows past what a phone can hold", async () => {
    for (const day of days) {
      const puzzle = await crosswordFor(OWNER, day, "B1");
      expect(puzzle!.rows).toBeLessThanOrEqual(MAX_SIDE);
      expect(puzzle!.cols).toBeLessThanOrEqual(MAX_SIDE);
    }
  }, 30_000);

  it("gives the same day the same grid, so a reload does not lose one", async () => {
    const first = await crosswordFor(OWNER, "2026-09-02" as DayKey, "A1");
    const again = await crosswordFor(OWNER, "2026-09-02" as DayKey, "A1");
    expect(again!.entries.map((e) => e.lemma)).toEqual(first!.entries.map((e) => e.lemma));
  });

  it("gives two days two grids", async () => {
    const seen = new Set<string>();
    for (const day of days.slice(0, 14)) {
      const puzzle = await crosswordFor(OWNER, day, "A1");
      seen.add(puzzle!.entries.map((e) => e.lemma).sort().join(","));
    }
    expect(seen.size).toBe(14);
  }, 30_000);

  /*
    A CLUE WITH TWO ANSWERS OVER A REAL DICTIONARY, WHICH IS WHERE IT LIVES.

    `clue.test.ts` proves the two rules over invented entries. What it cannot
    prove is that they survive the join: the clash set is read over every
    entry the dictionary holds and the pool over one band, so a bug that read
    the clash off the pool would pass every unit test in that file and put
    `3 down: human` back on somebody's screen.
  */
  it("names the kind of word every clue wants", async () => {
    for (const level of ["A1", "B1"] as const) {
      const puzzle = await crosswordFor(OWNER, "2026-09-02" as DayKey, level);
      for (const entry of puzzle!.entries) {
        expect(entry.clue, `${entry.lemma} is clued without a kind of word`)
          .toMatch(/ · (noun|verb|adjective|adverb)$/);
      }
    }
  });

  it("sets no clue a second entry answers", async () => {
    const rows = await prisma.lexeme.findMany({
      select: { lemma: true, pos: true, translation: true },
    });
    const clashes = clueClashes(rows);
    for (const day of days.slice(0, 7)) {
      const puzzle = await crosswordFor(OWNER, day, "B1");
      for (const entry of puzzle!.entries) {
        // The kind is read off the clue's own tail rather than off the first
        // row with that lemma, because `@@unique` is on `(lemma, pos)` and
        // `hall` is two entries: a `find` would pick whichever the query
        // happened to return first and ask about the other word.
        const { kind } = clueParts(entry.clue);
        const row = rows.find((r) => r.lemma === entry.lemma && r.pos.toLowerCase() === kind);
        expect(row, `${entry.lemma} is clued as a ${kind} and the dictionary has no such entry`)
          .toBeTruthy();
        expect(clashes.has(clueKey(entry.lemma, row!.pos)), `${entry.lemma} is clued twice over`)
          .toBe(false);
      }
    }
  }, 30_000);

  /**
   * Every answer is a word the dictionary holds, which is the ADR-005 half:
   * nothing here writes Estonian, it only arranges what is already there.
   */
  it("only ever uses words the dictionary has", async () => {
    const puzzle = await crosswordFor(OWNER, "2026-09-02" as DayKey, "A1");
    const rows = await prisma.lexeme.findMany({
      where: { id: { in: puzzle!.entries.map((e) => e.lexemeId) } },
      select: { id: true, lemma: true, translation: true },
    });
    expect(rows).toHaveLength(puzzle!.entries.length);
    for (const entry of puzzle!.entries) {
      const row = rows.find((r) => r.id === entry.lexemeId)!;
      expect(entry.lemma).toBe(row.lemma);
      // And the clue is that entry's own gloss, cut down rather than written.
      // The kind of word is named after it and is this app's, so it comes off
      // before the gloss is compared with the one the dictionary holds.
      const { gloss } = clueParts(entry.clue);
      expect(row.translation.toLowerCase()).toContain(gloss.split(",")[0]!.toLowerCase());
    }
  });

  it("says which of the words are already in the deck", async () => {
    const before = await crosswordFor(OWNER, "2026-09-02" as DayKey, "A1");
    expect(before!.inDeck).toEqual([]);

    await prisma.card.create({
      data: {
        ownerId: OWNER, lexemeId: before!.entries[0]!.lexemeId, cardType: "PRODUCTION",
        front: "x", back: "x",
      },
    });
    const after = await crosswordFor(OWNER, "2026-09-02" as DayKey, "A1");
    expect(after!.inDeck).toEqual([0]);
  });

  it("reads a fully filled grid as solved", async () => {
    const puzzle = await crosswordFor(OWNER, "2026-09-02" as DayKey, "A1");
    const typed: Record<number, string> = {};
    for (const entry of puzzle!.entries) {
      cellsOf(entry, puzzle!.cols).forEach((cell, i) => {
        typed[cell] = [...entry.lemma.toLocaleLowerCase("et")][i]!;
      });
    }
    expect(solvedEntries(puzzle!, typed).size).toBe(puzzle!.entries.length);
  });
});
