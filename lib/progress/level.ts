import { latestFor } from "@/lib/progress/assessment";
import { readSettings, SETTING_KEYS, writeSetting } from "@/lib/settings/store";
import { LEVELS, type Level } from "@/lib/collections/syllabus";
import { PRE_A1 } from "@/lib/assessment/types";

/**
 * The level the course opens at.
 *
 * Two things measure a learner's Estonian, and they arrived in the same week by
 * different routes. `/assess` is the fuller instrument: four skills, eighty
 * questions, gapped sentences and dictation and forms typed out. The
 * placement ladder at `/placement` is four vocabulary questions per level and
 * says on its own result screen that it only measures recognition.
 *
 * So the richer one wins where it exists, and the order here is the whole point
 * of this module: without it the app would hold two answers to the same
 * question and let whichever screen the learner happened to open decide. A
 * course arranged around the weaker answer while the better one sat in the
 * database would be the app ignoring what it had already been told.
 *
 * **A third answer outranks both, and it is the learner's own.** Settings has
 * a level picker, and somebody who moved up in the class they are actually
 * sitting in knows something no measurement here does. Ordering by richness
 * alone made that button do nothing: a check sat in March beat a correction
 * made this morning, on every screen that reads a level, silently. So what
 * decides is *when*, not which. Whichever of the two was stated later is the
 * one the app holds, which means the picker takes effect on the next render
 * and a fresh level check takes it back, both without anything to explain.
 *
 * A declaration with no timestamp is read as older than any measurement. That
 * is every row written before the picker existed, and reading it that way is
 * exactly the behaviour those deployments already had.
 *
 * `pre-A1` is a real result and not a level the course has units for, so it
 * opens at A1 — which is where somebody below A1 should start anyway.
 */
export async function courseLevelFor(ownerId: string): Promise<Level> {
  const [assessed, settings] = await Promise.all([
    latestFor(ownerId).catch(() => null),
    readSettings(ownerId, [SETTING_KEYS.cefrPlacement, SETTING_KEYS.cefrPlacementAt]),
  ]);

  const measured = assessed?.overall ?? null;
  const declared = settings[SETTING_KEYS.cefrPlacement];
  const declaredAt = Date.parse(settings[SETTING_KEYS.cefrPlacementAt] ?? "");
  const measuredAt = assessed?.takenAt?.getTime() ?? Number.NEGATIVE_INFINITY;

  const stale = Number.isNaN(declaredAt) || declaredAt <= measuredAt;
  if (!stale && isLevel(declared)) return declared;

  if (measured === PRE_A1) return "A1";
  if (measured && isLevel(measured)) return measured;

  return isLevel(declared) ? declared : "A1";
}

const isLevel = (value: string | null | undefined): value is Level =>
  typeof value === "string" && (LEVELS as readonly string[]).includes(value);

/**
 * Stores a level that did not come from `/assess`, with the time it was stated.
 *
 * The three writers of `cefrPlacement` are the placement ladder, a passed
 * checkpoint and the picker in Settings, and all three go through here so none
 * of them can store a level without the timestamp that decides whether it is
 * still the current answer. A write with no timestamp beside it reads as older
 * than any level check, so forgetting one is not a crash, it is a button that
 * quietly stops working, which is the fault this whole pairing exists to fix.
 *
 * The owner is resolved by the caller and never sent to it: every export in
 * `app/actions.ts` is a public endpoint, so a level belongs to whoever asked.
 */
export async function recordCourseLevel(ownerId: string, level: Level, now = new Date()): Promise<void> {
  await Promise.all([
    writeSetting(ownerId, SETTING_KEYS.cefrPlacement, level),
    writeSetting(ownerId, SETTING_KEYS.cefrPlacementAt, now.toISOString()),
  ]);
}
