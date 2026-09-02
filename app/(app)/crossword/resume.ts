import { PUZZLE_KEY_PREFIX } from "@/lib/offline/forget";

/**
 * A day's grid, kept on the device.
 *
 * Sõnad's own resume file makes the argument and this is the same one, a size
 * up: a crossword is fifteen minutes rather than three, so a reload that lost
 * it would be worse. What is stored is what was typed and which entries were
 * shown, never the answers: the grid is rebuilt on the server from the date to
 * mark it, so editing this file gives somebody a grid they filled in
 * themselves with a worse rating attached.
 */
export interface SavedGrid {
  v: 1;
  day: string;
  /** Letter per cell index. */
  typed: Record<number, string>;
  /** Entries the learner asked to be shown, which only lowers a rating. */
  helped: number[];
  recorded: boolean;
  savedAt: number;
}

const VERSION = 1;

const keyFor = (day: string) => `${PUZZLE_KEY_PREFIX}crossword.${day}`;

export function loadGrid(day: string): SavedGrid | null {
  try {
    const raw = window.localStorage.getItem(keyFor(day));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGrid;
    if (parsed?.v !== VERSION || parsed.day !== day) return null;
    if (typeof parsed.typed !== "object" || !Array.isArray(parsed.helped)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGrid(grid: Omit<SavedGrid, "v" | "savedAt">): void {
  try {
    window.localStorage.setItem(
      keyFor(grid.day),
      JSON.stringify({ ...grid, v: VERSION, savedAt: Date.now() }),
    );
  } catch {
    // Storage full or blocked. The grid still plays; only the safety net is
    // gone, and saying so mid-clue is not worth the interruption.
  }
}
