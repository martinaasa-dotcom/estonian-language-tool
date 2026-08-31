import { LEVELS, unitsAtLevel, type Level, type SyllabusUnit } from "./syllabus";

/**
 * The deck somebody gets on their first evening, decided for them.
 *
 * First run used to end in a list of fourteen units with checkboxes, opened on
 * three of them, and it was the wrong question asked at the worst moment. A
 * stranger who has been using this app for ninety seconds cannot tell whether
 * they need `Riided` before `Ilm`, and the honest answer is that at A1 it does
 * not matter: the units are ordered, and the order is the answer. What the list
 * actually did was hand somebody fourteen decisions, invite them to tick all of
 * them, and then quietly build a deck of two thousand cards, which at the pace
 * this app itself calls sustainable is a two and a half year backlog assembled
 * by accident on day one.
 *
 * So the course picks. The units at the front of each level are the everyday
 * ones on purpose (greetings, people, numbers, home, food, time), which is what
 * somebody needs to speak, get by and follow what is said to them, and it is
 * also why no choice is being taken away by choosing: the first three units at
 * a level are what anybody sensible would have ticked.
 *
 * Nothing is lost. `/learn` is the whole course, every unit has an add button,
 * and a learner who wants `Riided` on day one is two clicks from it. This is
 * the difference between a default and a restriction.
 *
 * Pure: the syllabus is a constant, so no database and no owner.
 */

/**
 * How many units a starter deck is.
 *
 * Three, and the number comes from the arithmetic rather than from taste. A
 * card costs about ten reviews over its first year, so a daily goal of fifteen
 * sustains about two genuinely new cards a day (`sustainableNewCardsPerDay`),
 * which over five days a week is ten. Three A1 units build a little over four
 * hundred cards, so the starter deck is roughly the next nine months at the
 * default pace. Two units would be under six and read as a demo; the whole
 * level is over two years and is the wall this replaced.
 */
export const STARTER_UNITS = 3;

/**
 * The most units first run will ever build, whoever is asking.
 *
 * `completeOnboarding` is a server action, so its arguments are whatever a
 * caller sends rather than whatever the screen offered. Without a ceiling here
 * a posted list of all eighty-three units would build the entire course into
 * one deck in one request.
 */
export const MAX_STARTER_UNITS = 6;

/**
 * The units a learner at this level starts with.
 *
 * Below A1 starts where A1 does, because the first sensible thing to do is the
 * same either way. A level the course does not carry falls back to A1 rather
 * than to nothing: an empty starter deck is the one outcome first run must not
 * produce, since every screen in the app is behind "add some words first".
 */
export function starterUnitsFor(level: string | null): readonly SyllabusUnit[] {
  const band = (LEVELS as readonly string[]).includes(level ?? "") ? (level as Level) : "A1";
  const units = unitsAtLevel(band).slice(0, STARTER_UNITS);
  return units.length > 0 ? units : unitsAtLevel("A1").slice(0, STARTER_UNITS);
}
