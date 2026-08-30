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
  leaderboard: "leaderboardOptIn",
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
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const DEFAULT_DAILY_GOAL = 15;

/** How a review session asks its questions. */
export type ReviewMode = "flip" | "type";
export const DEFAULT_REVIEW_MODE: ReviewMode = "type";

/** Reads several settings in one query. Missing keys are simply absent. */
export async function readSettings(
  ownerId: string,
  keys: readonly SettingKey[],
): Promise<Partial<Record<SettingKey, string>>> {
  const rows = await prisma.setting.findMany({
    where: { ownerId, key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const out: Partial<Record<SettingKey, string>> = {};
  for (const row of rows) out[row.key as SettingKey] = row.value;
  return out;
}

export async function readSetting(ownerId: string, key: SettingKey): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key } } });
  return row?.value ?? null;
}

export async function writeSetting(ownerId: string, key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { ownerId_key: { ownerId, key } },
    create: { ownerId, key, value },
    update: { value },
  });
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
