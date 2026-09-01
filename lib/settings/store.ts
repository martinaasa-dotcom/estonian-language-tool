import { cache } from "react";

import { prisma } from "@/lib/db";

/**
 * Per-learner settings, in one place.
 *
 * The Setting table is a key/value bag, which is the right shape for a dozen
 * small preferences but the wrong shape for string literals scattered across
 * twenty files — one typo and a setting silently reverts to its default forever.
 * Every key lives here, every read and write goes through these helpers, and
 * the defaults are stated once.
 */
export const SETTING_KEYS = {
  dailyGoal: "dailyGoal",
  sprintBest: "sprintBest",
  matchBest: "matchBest",
  streakShields: "streakShields",
  streakShieldDates: "streakShieldDates",
  displayName: "displayName",
  reviewMode: "reviewMode",
  onboardedAt: "onboardedAt",
  cefrGoal: "cefrGoal",
  /**
   * Whether the Estonian letter bar is drawn under text fields.
   *
   * Asked at first run and changed in Settings or from the bar itself. Only
   * ever consulted on a desktop: see lib/ux/letterBar.ts for why it is a
   * question at all, and app/globals.css for where the answer is applied.
   */
  letterBar: "letterBar",
  /**
   * The level the learner is at, as opposed to the one they are aiming for.
   *
   * Separate from cefrGoal on purpose: what somebody wants to reach and where
   * they are now are different facts, and the course needs the second one to
   * decide what to open and where to send them next. Written by the placement
   * ladder, by a level checkpoint when one is passed, and by the fuller
   * assessment at /assess, which is the better instrument of the three.
   */
  cefrPlacement: "cefrPlacement",
  /**
   * When `cefrPlacement` was last written, as an ISO timestamp.
   *
   * There are two answers to "what level is this learner" and until now the
   * measurement always won: `courseLevelFor` read the most recent level check
   * first and fell back to this setting only when there had never been one. So
   * a learner who sat a check in March and then said in Settings that they had
   * moved up was told, by every screen that reads a level, that they had not.
   *
   * A date is what settles it. Whichever of the two was stated later is the
   * one the app holds, so changing it by hand takes effect immediately and
   * sitting a new check takes it back. A row with no timestamp is older than
   * any measurement, which is exactly the behaviour every deployment already
   * had.
   */
  cefrPlacementAt: "cefrPlacementAt",

  /*
    Why this person is here, what they want to reach, and by when. Asked once
    at first run and editable in Settings. Five keys rather than one JSON blob
    so a single answer can be changed without reading and rewriting the rest.
  */
  goalReason: "goalReason",
  goalTarget: "goalTarget",
  goalDeadline: "goalDeadline",
  goalDays: "goalDays",
  goalNote: "goalNote",

  /**
   * The learner's own timezone, as an IANA name, reported by their browser.
   *
   * Every screen that leads with a day boundary — the streak, the daily goal,
   * the quests, the heatmap — is rendered on the server, and a server has no
   * idea what midnight means to the person reading it. Without this it used
   * the deployment's own zone, which on Vercel is UTC, and a learner in
   * Tallinn who studied at one in the morning had it filed under yesterday.
   * See lib/time/day.ts.
   *
   * Written by the browser rather than asked for, because nobody should have
   * to answer a question their device already knows the answer to, and it is
   * re-checked on every load so it follows somebody who moves.
   */
  timeZone: "timeZone",

  /**
   * The week of their course the learner says they are in.
   *
   * It was a literal in `app/actions.ts`, which is a `"use server"` file, so
   * the constant holding it could not be exported: every export there is a
   * public endpoint and a string is not one. That was fine while one file read
   * it and stopped being fine the moment Today wanted to say which week you are
   * in, because the only way to read it from a second place was to type
   * "currentWeek" again. Keys live here for exactly that reason.
   */
  currentWeek: "currentWeek",

  /**
   * How Estonian is read aloud: which of the speech service's voices, whether
   * a card reads itself when it appears, and whether an answer makes a sound.
   * The values and their defaults live in lib/audio/voice.ts; a missing row
   * reads as the behaviour everybody had before the question existed.
   */
  ttsVoice: "ttsVoice",
  autoplayAudio: "autoplayAudio",
  feedbackSounds: "feedbackSounds",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const DEFAULT_DAILY_GOAL = 15;

/** How a review session asks its questions. */
export type ReviewMode = "flip" | "type";
export const DEFAULT_REVIEW_MODE: ReviewMode = "type";

/**
 * ONE READ OF THIS LEARNER'S SETTINGS PER REQUEST, HOWEVER MANY ASK.
 *
 * Every helper below used to go to the database on its own, and that is fine
 * read one at a time and wrong read the way the app actually reads them.
 * Measured on Today, which is the page somebody opens every morning: eight
 * separate `SELECT ... FROM "Setting" WHERE "ownerId" = $1` in one render.
 * The shell wants the letter bar and the timezone, `learnerDayClock` wants the
 * timezone again, `dailySummary` wants the daily goal, `resolveStreakFor`
 * wants the shields, the page wants four more, `courseLevelFor` wants the
 * placement and `wordOfDay` wants its own. Each is one indexed row and costs
 * nothing at all against a socket on the same machine; against a hosted
 * Postgres each is a round trip, and the round trips are the page.
 *
 * So the table is read once per learner per request and every helper is served
 * from that. Fifteen rows is the whole of what a learner has, which is smaller
 * than the eight `IN` lists it replaces.
 *
 * `cache()` is React's request-scoped memo and it holds the *container* rather
 * than the answer, which is what makes a write able to correct it: a Server
 * Action that stores a value and then reads it back in the same request has to
 * see what it just wrote, and `resolveStreakFor` banking a shield followed by
 * `awardBadges` reading the count is exactly that, on the busiest page here.
 * Outside a request React does not memoize at all, so a script, a test and a
 * seed get a fresh map per call and the old behaviour with it.
 */
const settingsScope = cache((): Map<string, Promise<Map<string, string>>> => new Map());

function loadAll(ownerId: string): Promise<Map<string, string>> {
  const scope = settingsScope();
  const held = scope.get(ownerId);
  if (held) return held;
  const loading = prisma.setting
    .findMany({ where: { ownerId }, select: { key: true, value: true } })
    .then((rows) => new Map(rows.map((row) => [row.key, row.value])))
    // A failed read must not be remembered as this learner's settings, or one
    // bad moment at the database is answered with defaults for the rest of the
    // request. Same `finally` argument as lib/cache/singleFlight.ts.
    .catch((error: unknown) => {
      scope.delete(ownerId);
      throw error;
    });
  scope.set(ownerId, loading);
  return loading;
}

/** Reads several settings in one query. Missing keys are simply absent. */
export async function readSettings(
  ownerId: string,
  keys: readonly SettingKey[],
): Promise<Partial<Record<SettingKey, string>>> {
  const all = await loadAll(ownerId);
  const out: Partial<Record<SettingKey, string>> = {};
  // Only what was asked for, which keeps the contract this had before: a
  // caller reading two keys may not quietly start seeing the other thirteen.
  for (const key of keys) {
    const value = all.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export async function readSetting(ownerId: string, key: SettingKey): Promise<string | null> {
  return (await loadAll(ownerId)).get(key) ?? null;
}

export async function writeSetting(ownerId: string, key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { ownerId_key: { ownerId, key } },
    create: { ownerId, key, value },
    update: { value },
  });
  rememberWrite(ownerId, key, value);
}

/**
 * Drop what this request remembers about a learner's settings.
 *
 * For the three paths that write the table without coming through
 * `writeSetting`: setting the course week to nothing (a delete, which is not a
 * value), restoring a backup, and erasing an account. All three are bulk
 * changes rather than one key, so correcting the held map in place would mean
 * describing the write twice, and all three end the request straight after.
 */
export function forgetSettings(ownerId: string): void {
  settingsScope().delete(ownerId);
}

/**
 * What a write leaves behind for the rest of the request.
 *
 * Corrected in place rather than dropped, because dropping it means the next
 * reader pays for the whole table again to learn one value we are holding.
 * Awaiting the held promise is what keeps a write that lands mid-read honest:
 * the map it patches is the one the outstanding read is about to resolve to.
 */
function rememberWrite(ownerId: string, key: SettingKey, value: string): void {
  const held = settingsScope().get(ownerId);
  if (!held) return;
  void held.then((all) => all.set(key, value)).catch(() => undefined);
}

/** A stored number, or the fallback when it is absent or unparseable. */
export function numberSetting(value: string | undefined | null, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function dailyGoalFrom(value: string | undefined | null): number {
  const n = numberSetting(value, DEFAULT_DAILY_GOAL);
  return n > 0 ? n : DEFAULT_DAILY_GOAL;
}

export function reviewModeFrom(value: string | undefined | null): ReviewMode {
  return value === "flip" || value === "type" ? value : DEFAULT_REVIEW_MODE;
}

/** Every key the goal answers live under, for a single read. */
export const GOAL_KEYS = [
  SETTING_KEYS.goalReason,
  SETTING_KEYS.goalTarget,
  SETTING_KEYS.goalDeadline,
  SETTING_KEYS.goalDays,
  SETTING_KEYS.goalNote,
] as const;
