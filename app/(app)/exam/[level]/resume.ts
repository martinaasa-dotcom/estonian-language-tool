import type { Response } from "@/lib/exam/score";

/**
 * A sitting, kept on the device so a closed tab does not destroy it.
 *
 * THE PAPER USED TO SAY "nothing here is saved until you hand in, so sit it in
 * one go" AND MEANT IT. Three hours and five minutes of B2 written paper, and a
 * reload, a crashed tab, a phone call that takes the browser down, or an
 * accidental swipe back threw away every answer with nothing to go back to.
 * Nobody sits a mock exam twice after that; they stop sitting them.
 *
 * What is stored is what the learner did: the answers, which part they are on,
 * and when each part's clock runs out. **Never a mark and never a question** —
 * the paper is rebuilt from its seed by `buildPaper`, and it is rebuilt again on
 * the server to mark it (ADR-022), so nothing here can make a paper easier or a
 * score better. The worst somebody can do by editing it is give themselves back
 * time they already spent, which is the same thing walking away from the desk
 * would do, and it is their own mock exam.
 *
 * The deadlines are absolute epoch times rather than a remaining count, on
 * purpose: a clock that stops while the tab is shut is a clock you can stop by
 * shutting the tab. Come back an hour into a fifty minute reading part and it is
 * over, which is what would have happened in the hall.
 *
 * `localStorage` rather than the review outbox in `lib/offline/db.ts`: this is a
 * few kilobytes of one device's unfinished work, it is replaced wholesale on
 * every change, and nothing is ever replayed from it. Every read and write is
 * guarded, because a browser set to block site data throws on the accessor
 * itself, and a paper that will not open because storage is off would be a worse
 * failure than the one this fixes.
 */
export interface SavedSitting {
  v: 1;
  level: string;
  seed: string;
  /** Which part they had reached. */
  partIndex: number;
  responses: Record<string, Response>;
  /** Epoch ms each part's clock runs out at, keyed by part index. */
  deadlines: Record<number, number>;
  /** Epoch ms the sitting began, which is what the submission reports. */
  startedAt: number;
  /** Epoch ms the break between the halves ends, or null when not on one. */
  breakUntil: number | null;
  savedAt: number;
}

const VERSION = 1;

function keyFor(level: string, seed: string): string {
  return `kodukeel.exam.${level}.${seed}`;
}

export function loadSitting(level: string, seed: string): SavedSitting | null {
  try {
    const raw = window.localStorage.getItem(keyFor(level, seed));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSitting;
    // A stored shape from another version of the app is not worth guessing at:
    // a restored sitting that half fits is a paper answering questions nobody
    // asked. Dropping it costs one unfinished paper; trusting it costs a result.
    if (parsed?.v !== VERSION || parsed.level !== level || parsed.seed !== seed) return null;
    if (typeof parsed.partIndex !== "number" || typeof parsed.responses !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSitting(sitting: Omit<SavedSitting, "v" | "savedAt">): void {
  try {
    window.localStorage.setItem(
      keyFor(sitting.level, sitting.seed),
      JSON.stringify({ ...sitting, v: VERSION, savedAt: Date.now() }),
    );
  } catch {
    // Storage full, or blocked. The paper still works; only the safety net is
    // gone, and telling somebody mid-question is not worth the interruption.
  }
}

export function clearSitting(level: string, seed: string): void {
  try {
    window.localStorage.removeItem(keyFor(level, seed));
  } catch {
    // As above.
  }
}

/** How many questions a saved sitting has answers for, for the resume card. */
export function answeredIn(sitting: SavedSitting): number {
  return Object.values(sitting.responses).filter((r) => r && r.kind !== "blank").length;
}
