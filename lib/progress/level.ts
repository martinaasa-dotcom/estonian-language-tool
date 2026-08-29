import { latestFor } from "@/lib/progress/assessment";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { LEVELS, type Level } from "@/lib/collections/syllabus";
import { PRE_A1 } from "@/lib/assessment/types";

/**
 * The level the course opens at.
 *
 * Two things measure a learner's Estonian, and they arrived in the same week by
 * different routes. `/assess` is the fuller instrument: four skills, ten
 * minutes, case forms and government and dictation and a written sentence. The
 * placement ladder at `/placement` is four vocabulary questions per level and
 * says on its own result screen that it only measures recognition.
 *
 * So the richer one wins where it exists, and the order here is the whole point
 * of this module: without it the app would hold two answers to the same
 * question and let whichever screen the learner happened to open decide. A
 * course arranged around the weaker answer while the better one sat in the
 * database would be the app ignoring what it had already been told.
 *
 * `pre-A1` is a real result and not a level the course has units for, so it
 * opens at A1 — which is where somebody below A1 should start anyway.
 */
export async function courseLevelFor(ownerId: string): Promise<Level> {
  const [assessed, declared] = await Promise.all([
    latestFor(ownerId).catch(() => null),
    readSetting(ownerId, SETTING_KEYS.cefrPlacement),
  ]);

  const measured = assessed?.overall ?? null;
  if (measured === PRE_A1) return "A1";
  if (measured && isLevel(measured)) return measured;

  return isLevel(declared) ? declared : "A1";
}

const isLevel = (value: string | null | undefined): value is Level =>
  typeof value === "string" && (LEVELS as readonly string[]).includes(value);
