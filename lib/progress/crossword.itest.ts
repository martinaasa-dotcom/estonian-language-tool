import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cellsOf, MAX_ENTRIES, MAX_SIDE, MIN_ENTRIES, solvedEntries } from "@/lib/games/crossword";
import type { DayKey } from "@/lib/time/day";
import { clueFrom, crosswordFor } from "./crossword";

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
      expect(row.translation.toLowerCase()).toContain(entry.clue.split(",")[0]!.toLowerCase());
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

describe("clueFrom", () => {
  it("keeps at most two senses", () => {
    expect(clueFrom("a devil, an evil spirit, the deuce")).toBe("a devil, an evil spirit");
  });

  it("takes the first group where a gloss is split by a semicolon", () => {
    expect(clueFrom("to read; to count")).toBe("to read");
  });

  it("drops a gloss too long to be a clue rather than cutting it mid-word", () => {
    expect(clueFrom("a" .repeat(60))).toBe("");
  });

  it("drops an empty gloss", () => {
    expect(clueFrom("   ")).toBe("");
  });
});
