import { BANDS, type Band, type ItemRef, type Response, type Skill } from "./types";
import { FLOOR } from "./score";

/**
 * Which question comes next.
 *
 * The paper is laid out in ascending bands within each skill, and this is the
 * part that stops climbing. Once every question at a band has been answered and
 * the learner scored under half of it, the harder questions in that skill are
 * skipped: they would take three more minutes to confirm what the last two
 * already said, and being walked up a ladder you have visibly fallen off is a
 * miserable way to start with an app.
 *
 * It is a pure function of the paper and the answers so far, so a test can walk
 * a whole session through it without a browser, and so the runner has no state
 * of its own to get out of step.
 */

export interface SessionCursor {
  /** The item to ask, or null when the paper is finished. */
  index: number | null;
  /** Items that will not now be asked, for the honest count on the result. */
  skipped: number;
}

function ratioAt(responses: readonly Response[], skill: Skill, band: Band): number | null {
  const answered = responses.filter((r) => r.skill === skill && r.band === band && !r.skipped);
  if (answered.length === 0) return null;
  return answered.reduce((sum, r) => sum + r.credit, 0) / answered.length;
}

/** True when every question of this skill and band has been answered. */
function bandComplete(items: readonly ItemRef[], responses: readonly Response[], skill: Skill, band: Band): boolean {
  const asked = items.filter((i) => i.skill === skill && i.band === band);
  if (asked.length === 0) return false;
  const done = new Set(responses.map((r) => r.itemId));
  return asked.every((i) => done.has(i.id));
}

/**
 * Has this skill's ladder ended? True once a completed band came in under half
 * and there is nothing left at or below it to ask.
 */
export function ladderStopped(
  items: readonly ItemRef[],
  responses: readonly Response[],
  skill: Skill,
  band: Band,
): boolean {
  for (const lower of BANDS) {
    if (BANDS.indexOf(lower) >= BANDS.indexOf(band)) break;
    if (!bandComplete(items, responses, skill, lower)) continue;
    const ratio = ratioAt(responses, skill, lower);
    if (ratio !== null && ratio < FLOOR) return true;
  }
  return false;
}

/** The next item to ask, given everything answered so far. */
export function nextCursor(items: readonly ItemRef[], responses: readonly Response[]): SessionCursor {
  const done = new Set(responses.map((r) => r.itemId));
  let skipped = 0;

  for (const [index, item] of items.entries()) {
    if (done.has(item.id)) continue;
    if (ladderStopped(items, responses, item.skill, item.band)) {
      skipped += 1;
      continue;
    }
    return { index, skipped };
  }
  return { index: null, skipped };
}

/** How far through the paper the learner is, for the progress meter. */
export function progress(items: readonly ItemRef[], responses: readonly Response[]): number {
  if (items.length === 0) return 100;
  const done = responses.filter((r) => !r.skipped).length;
  const remaining = items.filter((item) => {
    const answered = responses.some((r) => r.itemId === item.id);
    return !answered && !ladderStopped(items, responses, item.skill, item.band);
  }).length;
  const total = done + remaining;
  return total === 0 ? 100 : Math.round((done / total) * 100);
}
