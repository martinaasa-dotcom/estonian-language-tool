import { describe, expect, it } from "vitest";
import {
  cellsOf, compile, MAX_ENTRIES, MAX_SIDE, solvedEntries, wrongCells, type Candidate,
} from "./crossword";

/**
 * The compiler, over invented words.
 *
 * Invented rather than Estonian, because every rule here is about letters
 * crossing letters and a fixture spelling a real word invites the assertion to
 * be read as a claim about that word. The one thing the real pool has to prove
 * is that it produces a grid at all, and that is an integration question:
 * `lib/progress/crossword.itest.ts` asks it against the dictionary that ships.
 */

const word = (lemma: string): Candidate => ({ lemma, clue: `clue for ${lemma}`, lexemeId: lemma });

describe("compile", () => {
  it("returns nothing from an empty pool", () => {
    expect(compile([])).toBeNull();
  });

  it("returns nothing when too few words can be placed", () => {
    // Nothing shares a letter, so only the first goes down.
    expect(compile([word("aaaa"), word("bbbb"), word("cccc")])).toBeNull();
  });

  it("crosses words at a shared letter", () => {
    const puzzle = compile([word("abcdef"), word("xxcxx"), word("yyeyy")]);
    expect(puzzle).not.toBeNull();
    expect(puzzle!.entries).toHaveLength(3);
    // The first is across, the ones crossing it run down.
    expect(puzzle!.entries.filter((e) => e.direction === "down")).toHaveLength(2);
  });

  it("crops the grid to what was used", () => {
    const puzzle = compile([word("abcdef"), word("xxcxx"), word("yyeyy")])!;
    // Six across, and two five-letter words hanging off it. The canvas the
    // compiler works on is sixteen square; what comes back is the bounding box.
    expect(puzzle.cols).toBe(6);
    expect(puzzle.rows).toBeLessThanOrEqual(5);
    // Every filled cell is inside it, and there is one per letter written.
    expect([...puzzle.filled].every((c) => c >= 0 && c < puzzle.rows * puzzle.cols)).toBe(true);
    expect(puzzle.filled.size).toBe(6 + 4 + 4);
    // And a cell in the top row and one in the left column are used, or it
    // was not cropped at all.
    expect([...puzzle.filled].some((c) => c < puzzle.cols)).toBe(true);
    expect([...puzzle.filled].some((c) => c % puzzle.cols === 0)).toBe(true);
  });

  it("numbers a cell once even where two words start in it", () => {
    // `abc` across and `axx` down both begin at the same cell.
    const puzzle = compile([word("abcde"), word("axxx"), word("yycyy")]);
    expect(puzzle).not.toBeNull();
    const numbers = puzzle!.entries.map((e) => e.number);
    expect(new Set(numbers).size).toBeLessThan(numbers.length);
  });

  it("never lays a word alongside another", () => {
    // `bcdefg` shares no letter with the first at a legal place; if it were
    // placed anyway it would run parallel and spell pairs down the columns.
    const puzzle = compile([word("abcdef"), word("bcdefg"), word("xxcxx"), word("yyexy")]);
    if (!puzzle) return;
    // Every pair of parallel words must be at least two rows or columns apart.
    const across = puzzle.entries.filter((e) => e.direction === "across");
    for (const a of across) {
      for (const b of across) {
        if (a === b) continue;
        const overlap = Math.max(a.col, b.col) < Math.min(a.col + a.lemma.length, b.col + b.lemma.length);
        if (overlap) expect(Math.abs(a.row - b.row)).toBeGreaterThan(1);
      }
    }
  });

  it("stops at the number a phone can hold", () => {
    const pool = ["abcdef", ...Array.from({ length: 20 }, (_, i) => `${"xyz"[i % 3]}${i}bcd`)];
    const puzzle = compile(pool.map(word));
    if (puzzle) expect(puzzle.entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
  });

  /**
   * The cap that a phone is the reason for.
   *
   * The first compiler had none and produced a fifteen by eight grid on its
   * second day, which at 360px is a 24px cell. A placement that would push the
   * box past nine is refused rather than accepted and cropped, so a long word
   * costs the grid a word rather than its shape.
   */
  it("never grows past what a phone can hold", () => {
    const pool = [
      word("abcdefg"),
      ...Array.from({ length: 40 }, (_, i) => word(`${"abcdefg"[i % 7]}${"hijklmnopqrstuvwxyz"[i % 19]}${i % 10}zz`)),
    ];
    const puzzle = compile(pool);
    if (!puzzle) return;
    expect(puzzle.rows).toBeLessThanOrEqual(MAX_SIDE);
    expect(puzzle.cols).toBeLessThanOrEqual(MAX_SIDE);
  });

  it("gives the same pool the same puzzle", () => {
    const pool = [word("abcdef"), word("xxcxx"), word("yyeyy")];
    expect(JSON.stringify(compile(pool)?.entries)).toBe(JSON.stringify(compile(pool)?.entries));
  });
});

describe("reading a grid back", () => {
  const puzzle = compile([word("abcdef"), word("xxcxx"), word("yyeyy")])!;

  it("says which entries are filled in right", () => {
    const typed: Record<number, string> = {};
    const first = puzzle.entries[0]!;
    cellsOf(first, puzzle.cols).forEach((cell, i) => { typed[cell] = [...first.lemma][i]!; });
    expect(solvedEntries(puzzle, typed).has(0)).toBe(true);
    expect(solvedEntries(puzzle, typed).size).toBeLessThan(puzzle.entries.length);
  });

  it("is not fooled by the right letters in the wrong case", () => {
    const typed: Record<number, string> = {};
    const first = puzzle.entries[0]!;
    cellsOf(first, puzzle.cols).forEach((cell, i) => { typed[cell] = [...first.lemma][i]!.toUpperCase(); });
    expect(solvedEntries(puzzle, typed).has(0)).toBe(true);
  });

  it("marks a wrong letter and leaves an empty cell alone", () => {
    const first = puzzle.entries[0]!;
    const cells = cellsOf(first, puzzle.cols);
    const wrong = wrongCells(puzzle, { [cells[0]!]: "q" });
    expect(wrong.has(cells[0]!)).toBe(true);
    // Nothing was typed anywhere else, and an empty cell is not a mistake.
    expect(wrong.size).toBe(1);
  });
});
