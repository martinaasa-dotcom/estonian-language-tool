/**
 * A SMALL DAILY CROSSWORD, BUILT RATHER THAN WRITTEN.
 *
 * English clues, Estonian answers, which is the one direction that teaches
 * anything: you know what you mean and you are trying to find the word, which
 * is the position a learner is in every time they open their mouth.
 *
 * WHAT IS AND IS NOT ANYBODY'S. A grid of interlocking words with numbered
 * clues is a puzzle format from 1913 and is nobody's property; what a
 * newspaper owns is its own grids, its own clues and its own name. Nothing
 * here is taken from one: the grid is compiled by the function below, the
 * answers are dictionary headwords and the clues are the English glosses
 * already beside them. There is no clue-writing anywhere in this app, which is
 * also what keeps it inside ADR-005: the only authored English is the gloss the
 * syllabus already carries, and no Estonian is written at all.
 *
 * A CRISS-CROSS RATHER THAN A DENSE GRID, AND DELIBERATELY. A five-by-five
 * where every row and every column is a word is the shape a newspaper mini
 * takes, and filling one needs a search over a word list with the right letter
 * patterns, which for Estonian at a beginner's level does not reliably
 * terminate: there are 215 six-letter A1 words and a dense grid wants a
 * specific letter in a specific place five times over. A criss-cross places
 * words at intersections and leaves the rest of the grid empty, always
 * succeeds, and is the shape every schoolbook puzzle takes anyway.
 *
 * DETERMINISTIC IN ITS SEED, so a reload returns the same puzzle and the server
 * can rebuild it to mark it, which is the mock exam's rule (ADR-022) and the
 * reason nothing here reaches for `Math.random`.
 *
 * Pure: words in, a grid out. Which words is a database question and lives in
 * `lib/progress/crossword.ts`.
 */

/** One word the compiler may use: the answer, and the clue that stands for it. */
export interface Candidate {
  lemma: string;
  clue: string;
  lexemeId: string;
}

export type Direction = "across" | "down";

export interface Entry {
  lemma: string;
  clue: string;
  lexemeId: string;
  direction: Direction;
  /** Where the first letter goes, after the grid has been cropped. */
  row: number;
  col: number;
  /** The number printed in its first cell, shared with a word starting there. */
  number: number;
}

export interface Crossword {
  /** How many rows and columns the cropped grid has. */
  rows: number;
  cols: number;
  entries: Entry[];
  /**
   * Which cells are part of a word, as `row * cols + col`. Everything else is
   * blank and is drawn as nothing rather than as a black square, because a
   * criss-cross is mostly empty and a page of black squares reads as a fault.
   */
  filled: Set<number>;
}

/** How big the working grid is before cropping. Generous, and cropped away. */
const CANVAS = 16;

/**
 * The widest and tallest the finished grid may be.
 *
 * Not a taste: at 360px, which is the width this app is measured at, nine
 * columns is a 36px cell and ten is under 32, which is below the target size a
 * finger can hit. The first version of the compiler had no cap and produced a
 * fifteen by eight grid on its second day.
 *
 * A placement that would push the bounding box past this is refused rather
 * than accepted and cropped, so a long word early on costs the grid a word
 * rather than costing it its shape.
 */
export const MAX_SIDE = 9;

/** The most words worth putting on a phone. */
export const MAX_ENTRIES = 7;

/** The fewest that make it a crossword rather than a word. */
export const MIN_ENTRIES = 3;

/**
 * How long an answer may be.
 *
 * Short enough to cross something and long enough to be worth clueing: a
 * two-letter word crosses nothing anybody wants to read, and eight will not fit
 * a nine-wide grid beside anything else. Exported because the query that draws
 * the pool is in `lib/dict/facts.ts`, where it is cached across requests, and a
 * length typed there would be the compiler's rule written down twice.
 */
export const MIN_LETTERS = 3;
export const MAX_LETTERS = 7;

interface Placed { lemma: string; clue: string; lexemeId: string; direction: Direction; row: number; col: number }

/**
 * Compiles a puzzle out of a pool, in the pool's own order.
 *
 * The caller shuffles with a seeded generator and hands the result over, so
 * this stays pure and the day decides which words are tried first. It is
 * greedy and never backtracks: the first word is placed, and every word after
 * it goes at the first intersection that fits. Backtracking would produce
 * denser grids and would also let one bad pool spend a second; a crossword
 * with five words in it is a crossword.
 *
 * Returns null where the pool could not make one, which the caller reports
 * rather than papering over.
 */
export function compile(pool: readonly Candidate[]): Crossword | null {
  const first = pool[0];
  if (!first) return null;

  const grid = new Map<string, string>();
  const placed: Placed[] = [];

  const mid = Math.floor(CANVAS / 2);
  put(grid, placed, {
    lemma: first.lemma, clue: first.clue, lexemeId: first.lexemeId,
    direction: "across", row: mid, col: mid - Math.floor([...first.lemma].length / 2),
  });

  for (const candidate of pool.slice(1)) {
    if (placed.length >= MAX_ENTRIES) break;
    const spot = findSpot(grid, placed, candidate);
    if (spot) put(grid, placed, spot);
  }

  if (placed.length < MIN_ENTRIES) return null;
  return crop(grid, placed);
}

/** Writes a word into the working grid. */
function put(grid: Map<string, string>, placed: Placed[], entry: Placed): void {
  [...entry.lemma].forEach((letter, i) => {
    const row = entry.direction === "across" ? entry.row : entry.row + i;
    const col = entry.direction === "across" ? entry.col + i : entry.col;
    grid.set(key(row, col), letter);
  });
  placed.push(entry);
}

const key = (row: number, col: number) => `${row},${col}`;

/**
 * The first placement that crosses something already there and breaks nothing.
 *
 * Every letter of the candidate is tried against every letter of every placed
 * word, running the other way, which for seven words of six letters is a few
 * hundred checks and is not worth being cleverer about.
 */
function findSpot(
  grid: Map<string, string>, placed: readonly Placed[], candidate: Candidate,
): Placed | null {
  const letters = [...candidate.lemma];
  // A word already on the board is not a word to place again. Only the same
  // word: this said "and a lemma that is a substring of one would read as an
  // accident" and tested nothing of the kind, which is a comment describing a
  // check somebody meant to write. A substring is not a clash on a criss-cross,
  // where words meet at a letter rather than share a run of squares.
  if (placed.some((p) => p.lemma === candidate.lemma)) return null;

  for (const anchor of placed) {
    const across = anchor.direction === "down";
    const anchorLetters = [...anchor.lemma];
    for (let a = 0; a < anchorLetters.length; a++) {
      for (let i = 0; i < letters.length; i++) {
        if (anchorLetters[a] !== letters[i]) continue;
        const row = across ? anchor.row + a : anchor.row - i;
        const col = across ? anchor.col - i : anchor.col + a;
        const spot: Placed = {
          lemma: candidate.lemma, clue: candidate.clue, lexemeId: candidate.lexemeId,
          direction: across ? "across" : "down", row, col,
        };
        if (fits(grid, spot) && withinBounds(grid, spot)) return spot;
      }
    }
  }
  return null;
}

/**
 * Whether a word can go there without inventing one.
 *
 * Three rules, and the second and third are what stop a criss-cross turning
 * into a wall of two-letter accidents. A cell must be empty or already hold
 * the same letter. A cell that is *new* must have nothing beside it in the
 * perpendicular direction, since two words running alongside each other spell
 * a column of pairs nobody wrote. And the cells immediately before and after
 * the word must be empty, or the word runs straight into another one.
 */
function fits(grid: Map<string, string>, entry: Placed): boolean {
  const letters = [...entry.lemma];
  const across = entry.direction === "across";

  const before = across ? key(entry.row, entry.col - 1) : key(entry.row - 1, entry.col);
  const afterRow = across ? entry.row : entry.row + letters.length;
  const afterCol = across ? entry.col + letters.length : entry.col;
  if (grid.has(before) || grid.has(key(afterRow, afterCol))) return false;

  let crossings = 0;
  for (let i = 0; i < letters.length; i++) {
    const row = across ? entry.row : entry.row + i;
    const col = across ? entry.col + i : entry.col;
    if (row < 0 || col < 0 || row >= CANVAS || col >= CANVAS) return false;

    const held = grid.get(key(row, col));
    if (held !== undefined) {
      if (held !== letters[i]) return false;
      crossings += 1;
      continue;
    }
    // Nothing beside a new cell, or the two words spell something sideways.
    const sides = across
      ? [key(row - 1, col), key(row + 1, col)]
      : [key(row, col - 1), key(row, col + 1)];
    if (sides.some((s) => grid.has(s))) return false;
  }
  // Exactly one crossing: a word sharing two letters with the board is
  // usually a coincidence, and always a harder grid to read.
  return crossings === 1;
}

/** Whether the grid would still fit a phone with this word in it. */
function withinBounds(grid: Map<string, string>, entry: Placed): boolean {
  const cells = [...grid.keys()].map((k) => k.split(",").map(Number) as [number, number]);
  const letters = [...entry.lemma].length;
  const last = entry.direction === "across"
    ? [entry.row, entry.col + letters - 1] as const
    : [entry.row + letters - 1, entry.col] as const;
  const rows = [...cells.map(([r]) => r), entry.row, last[0]];
  const cols = [...cells.map(([, c]) => c), entry.col, last[1]];
  return Math.max(...rows) - Math.min(...rows) < MAX_SIDE
    && Math.max(...cols) - Math.min(...cols) < MAX_SIDE;
}

/** Trims the working canvas down to what was used, and numbers the entries. */
function crop(grid: Map<string, string>, placed: readonly Placed[]): Crossword {
  const cells = [...grid.keys()].map((k) => k.split(",").map(Number) as [number, number]);
  const top = Math.min(...cells.map(([r]) => r));
  const left = Math.min(...cells.map(([, c]) => c));
  const rows = Math.max(...cells.map(([r]) => r)) - top + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) - left + 1;

  /*
    The number is the cell's, not the word's: a cell where an across and a down
    both begin carries one number and both clues point at it, which is how a
    crossword has always been numbered. Reading order, so 1 is the top left.
  */
  const starts = [...new Set(placed.map((p) => key(p.row - top, p.col - left)))]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numbers = new Map(starts.map(([r, c], i) => [key(r, c), i + 1]));

  const entries: Entry[] = placed
    .map((p) => ({
      lemma: p.lemma, clue: p.clue, lexemeId: p.lexemeId, direction: p.direction,
      row: p.row - top, col: p.col - left,
      number: numbers.get(key(p.row - top, p.col - left)) ?? 0,
    }))
    .sort((a, b) => a.number - b.number || (a.direction === "across" ? -1 : 1));

  const filled = new Set(
    cells.map(([r, c]) => (r - top) * cols + (c - left)),
  );
  return { rows, cols, entries, filled };
}

/** Which cell of the grid a letter of an entry falls in. */
export function cellsOf(entry: Entry, cols: number): number[] {
  return [...entry.lemma].map((_, i) => (
    entry.direction === "across"
      ? entry.row * cols + entry.col + i
      : (entry.row + i) * cols + entry.col
  ));
}

/** Whether every letter typed into the grid is the one the answers want. */
export function solvedEntries(
  puzzle: Crossword, typed: Readonly<Record<number, string>>,
): Set<number> {
  const out = new Set<number>();
  puzzle.entries.forEach((entry, index) => {
    const cells = cellsOf(entry, puzzle.cols);
    const written = cells.map((cell) => (typed[cell] ?? "").toLocaleLowerCase("et")).join("");
    if (written === entry.lemma.toLocaleLowerCase("et")) out.add(index);
  });
  return out;
}

/** Which cells hold a letter that is not the one the grid wants. */
export function wrongCells(
  puzzle: Crossword, typed: Readonly<Record<number, string>>,
): Set<number> {
  const answer = new Map<number, string>();
  for (const entry of puzzle.entries) {
    cellsOf(entry, puzzle.cols).forEach((cell, i) => {
      answer.set(cell, [...entry.lemma.toLocaleLowerCase("et")][i] ?? "");
    });
  }
  const out = new Set<number>();
  for (const [cell, want] of answer) {
    const got = (typed[cell] ?? "").toLocaleLowerCase("et");
    if (got && got !== want) out.add(cell);
  }
  return out;
}
