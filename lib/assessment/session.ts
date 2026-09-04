import { BANDS, type Band, type ItemRef, type Response, type Skill } from "./types";
import { FLOOR, PASS } from "./score";

/**
 * Which question comes next.
 *
 * The paper is laid out in ascending bands within each skill, and this is the
 * part that stops climbing. Once a band has been answered and not passed, at
 * most one more band is asked above it: they would take several more minutes
 * to confirm what the band below already said, and being walked up a ladder
 * you have visibly fallen off is a miserable way to start with an app.
 *
 * It is what keeps an eighty question paper from being eighty questions for
 * everybody. A learner who reads at A2 answers the A1, A2 and B1 questions and
 * is done; one who reads at C1 answers the lot, which is the paper they need.
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
 * Has this skill's ladder ended?
 *
 * Two rules, and the second is new because the score changed underneath it.
 * `levelFrom` now ends the climb at the first band that did not reach `PASS`,
 * so a band answered above that point cannot raise anybody's level and is
 * three more minutes spent measuring nothing. What it can still do is settle a
 * near miss, which is why one band is asked past the failure rather than none:
 * a learner who came in at 60% at B1 and then reads B2 comfortably was having
 * a bad ten questions, and that is worth finding out. Two bands past it is
 * not, and that is the confirmation stage every multi-stage placement test
 * stops at.
 *
 * The older rule stands in front of it. A band under `FLOOR` is not a near
 * miss, it is a level the learner has visibly not met, and being walked up a
 * ladder you have fallen off is a miserable way to start with an app. Nothing
 * above it is asked at all.
 *
 * And a near miss the band above has confirmed is no longer a failure, so it
 * no longer stops anything: `levelFrom` reads it as passed, and a learner who
 * just missed A2 and then passed B1 is a B1 who may be a B2, which is the
 * question the next band answers. The climb stops at the first band that is
 * not passed *and* not confirmed, the same as it always did for a band that
 * simply failed.
 */
export function ladderStopped(
  items: readonly ItemRef[],
  responses: readonly Response[],
  skill: Skill,
  band: Band,
): boolean {
  for (const lower of BANDS) {
    const rungs = BANDS.indexOf(band) - BANDS.indexOf(lower);
    if (rungs <= 0) break;
    if (!bandComplete(items, responses, skill, lower)) continue;
    const ratio = ratioAt(responses, skill, lower);
    if (ratio === null) continue;
    if (ratio < FLOOR) return true;
    if (ratio < PASS && rungs > 1 && !confirmedAbove(items, responses, skill, lower)) return true;
  }
  return false;
}

/** True when the band directly above `band` has been answered in full and passed. */
function confirmedAbove(items: readonly ItemRef[], responses: readonly Response[], skill: Skill, band: Band): boolean {
  const above = BANDS[BANDS.indexOf(band) + 1];
  if (!above || !bandComplete(items, responses, skill, above)) return false;
  const ratio = ratioAt(responses, skill, above);
  return ratio !== null && ratio >= PASS;
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
