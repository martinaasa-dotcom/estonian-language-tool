/**
 * The vocabulary the exam modules share.
 *
 * Kept apart from `./spec` so `./readiness` can talk about skills without
 * pulling in the whole examination timetable, and so a page importing one
 * type does not import the other module's tables.
 */

/** The four parts of the paper, in the order they are sat. */
export type SkillKey = "writing" | "listening" | "reading" | "speaking";

export const SKILLS: readonly SkillKey[] = ["writing", "listening", "reading", "speaking"] as const;

/** What each part is called in English, for a screen that has room for one word. */
export const SKILL_LABEL: Record<SkillKey, string> = {
  writing: "Writing",
  listening: "Listening",
  reading: "Reading",
  speaking: "Speaking",
};

/**
 * And on the real paper.
 *
 * The names of the four parts, quoted from the examination specification. The
 * same latitude `lib/estonian/cases.ts` takes with `nimetav` and `osastav`:
 * these are the subject being named, not a form being taught, and an app that
 * cannot print the name of the part somebody is about to sit is being precious
 * rather than careful.
 */
export const SKILL_ET: Record<SkillKey, string> = {
  writing: "kirjutamine",
  listening: "kuulamine",
  reading: "lugemine",
  speaking: "rääkimine",
};
