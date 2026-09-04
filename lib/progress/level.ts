import { latestFor } from "@/lib/progress/assessment";
import { readSettings, SETTING_KEYS, writeSetting } from "@/lib/settings/store";
import { LEVELS, type Level } from "@/lib/collections/syllabus";
import { BANDS, PRE_A1, type Level as AssessedLevel } from "@/lib/assessment/types";

/**
 * The level the course opens at.
 *
 * Two things measure a learner's Estonian. `/assess` is the fuller instrument:
 * four skills, eighty questions, gapped sentences and dictation and forms typed
 * out. A passed checkpoint on the path is the other, and a level the learner
 * states in Settings is a third answer that is not a measurement at all. (A
 * four-questions-per-level placement ladder used to sit beside these and was
 * removed: it measured recognition only and nothing linked to it.)
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

/**
 * Which answer the app currently holds, and what kind of answer it is.
 *
 * Two readers, one rule. The course wants a band to open at and does not care
 * how it was arrived at; the plan cares very much, because a level a paper
 * measured and a level a stranger ticked in ninety seconds are the same letter
 * and are not worth the same distance (`hoursFor` in lib/assessment/plan.ts).
 * A measured answer carries its per skill levels for the same reason. Both
 * read this so that the timestamp rule above is written once: a plan deciding
 * a learner was measured while the course held their later correction would
 * be the two-answers fault this module exists to prevent, one layer up.
 */
export type SkillLevels = Record<"reading" | "listening" | "writing", AssessedLevel | null>;

export type LevelAnswer =
  | {
      kind: "measured";
      level: AssessedLevel;
      /** The scored skills that were measured, for the plan's skill by skill distance. */
      skills: AssessedLevel[];
      /** The same, by name, for a screen or a briefing that says which is which. */
      bySkill: SkillLevels;
    }
  | { kind: "declared"; level: Level };

export async function currentLevelAnswer(ownerId: string): Promise<LevelAnswer | null> {
  const [assessed, settings] = await Promise.all([
    latestFor(ownerId).catch(() => null),
    readSettings(ownerId, [SETTING_KEYS.cefrPlacement, SETTING_KEYS.cefrPlacementAt]),
  ]);

  const measured = isAssessed(assessed?.overall) ? assessed!.overall : null;
  const declaredRaw = settings[SETTING_KEYS.cefrPlacement];
  const declared = isLevel(declaredRaw) ? declaredRaw : null;
  const declaredAt = Date.parse(settings[SETTING_KEYS.cefrPlacementAt] ?? "");
  const measuredAt = assessed?.takenAt?.getTime() ?? Number.NEGATIVE_INFINITY;

  const stale = Number.isNaN(declaredAt) || declaredAt <= measuredAt;
  if (!stale && declared) return { kind: "declared", level: declared };

  if (measured && assessed) {
    const bySkill: SkillLevels = {
      reading: isAssessed(assessed.reading) ? assessed.reading : null,
      listening: isAssessed(assessed.listening) ? assessed.listening : null,
      writing: isAssessed(assessed.writing) ? assessed.writing : null,
    };
    const skills = Object.values(bySkill).filter((l): l is AssessedLevel => l !== null);
    return { kind: "measured", level: measured, skills, bySkill };
  }

  return declared ? { kind: "declared", level: declared } : null;
}

export async function courseLevelFor(ownerId: string): Promise<Level> {
  const answer = await currentLevelAnswer(ownerId);
  if (!answer) return "A1";
  if (answer.kind === "declared") return answer.level;
  return answer.level === PRE_A1 ? "A1" : answer.level;
}

const isLevel = (value: string | null | undefined): value is Level =>
  typeof value === "string" && (LEVELS as readonly string[]).includes(value);

const isAssessed = (value: string | null | undefined): value is AssessedLevel =>
  value === PRE_A1 || (typeof value === "string" && (BANDS as readonly string[]).includes(value));

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
