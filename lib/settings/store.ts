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
