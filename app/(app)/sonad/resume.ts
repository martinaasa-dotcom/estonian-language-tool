import { PUZZLE_KEY_PREFIX } from "@/lib/offline/forget";

/**
 * A day's board, kept on the device.
 *
 * The same argument the mock exam's own resume file makes, one size down: the
 * puzzle is stable through the learner's day, so a reload has to come back to
 * the guesses already made or the game is unplayable on a phone, where a
 * notification takes the tab away. What is stored is what was typed and
 * nothing else. The answer is recomputed on the server from the date, so
 * editing this file gives somebody back guesses they have already spent, which
 * is the same thing not playing would do, on their own puzzle.
 *
 * `localStorage` rather than a table, for the reason ADR-014 gives about
 * progress: a stored score is a second source of truth that drifts and can be
 * awarded for something that never happened. What a finished round is worth is
 * a `Review` row and nothing else, and the server decides it from the guesses.
 *
 * Keyed on the day, so yesterday's board does not open today, and prefixed so
 * that signing out on a shared machine can find every one of them without
 * knowing which days were played.
 */
export interface SavedBoard {
  v: 1;
  day: string;
  guesses: string[];
  /** Whether the finished round has already been sent to the review log. */
  recorded: boolean;
  savedAt: number;
}

const VERSION = 1;

function keyFor(day: string): string {
  return `${PUZZLE_KEY_PREFIX}sonad.${day}`;
}

export function loadBoard(day: string): SavedBoard | null {
  try {
    const raw = window.localStorage.getItem(keyFor(day));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedBoard;
    // A shape from another version is not worth guessing at, and a board
    // costs one morning rather than a result.
    if (parsed?.v !== VERSION || parsed.day !== day) return null;
    if (!Array.isArray(parsed.guesses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBoard(board: Omit<SavedBoard, "v" | "savedAt">): void {
  try {
    window.localStorage.setItem(
      keyFor(board.day),
      JSON.stringify({ ...board, v: VERSION, savedAt: Date.now() }),
    );
  } catch {
    // Storage full, or blocked. The board still plays; only the safety net is
    // gone, and saying so mid-guess is not worth the interruption.
  }
}
