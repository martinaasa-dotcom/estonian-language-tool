import { describe, expect, it } from "vitest";
import { LEVEL_TITLES, levelFromXp, xpForLevel, xpForRating, xpFromRatingCounts } from "./xp";
import { questBonusXp, questsForDay, type QuestStats } from "./quests";

describe("xpForRating", () => {
  it("never awards zero for a review that happened", () => {
    for (const rating of [1, 2, 3, 4]) expect(xpForRating(rating)).toBeGreaterThan(0);
  });

  it("rewards a clean recall more than a lapse", () => {
    expect(xpForRating(4)).toBeGreaterThan(xpForRating(3));
    expect(xpForRating(3)).toBeGreaterThan(xpForRating(2));
    expect(xpForRating(2)).toBeGreaterThan(xpForRating(1));
  });

  it("ignores a rating that is not on the scale", () => {
    expect(xpForRating(9)).toBe(0);
  });
});

describe("xpFromRatingCounts", () => {
  it("sums a tally", () => {
    expect(xpFromRatingCounts({ 1: 2, 3: 3 })).toBe(2 * 4 + 3 * 10);
  });

  it("is zero for an empty log", () => {
    expect(xpFromRatingCounts({})).toBe(0);
  });
});

describe("levels", () => {
  it("starts everyone at level 1 with no XP", () => {
    const info = levelFromXp(0);
    expect(info.level).toBe(1);
    expect(info.title).toBe(LEVEL_TITLES[0]!.title);
    expect(info.pct).toBe(0);
  });

  it("needs strictly more XP for each level", () => {
    for (let l = 1; l < 20; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it("levels up exactly at the threshold, not before", () => {
    const threshold = xpForLevel(2);
    expect(levelFromXp(threshold - 1).level).toBe(1);
    expect(levelFromXp(threshold).level).toBe(2);
  });

  it("reports progress through the current level", () => {
    const floor = xpForLevel(3);
    const span = xpForLevel(4) - floor;
    const info = levelFromXp(floor + Math.floor(span / 2));
    expect(info.level).toBe(3);
    expect(info.pct).toBeGreaterThan(40);
    expect(info.pct).toBeLessThan(60);
    expect(info.remaining).toBeGreaterThan(0);
  });

  it("keeps the last title once the list runs out, rather than crashing", () => {
    const info = levelFromXp(xpForLevel(40));
    expect(info.level).toBe(40);
    expect(info.title).toBe(LEVEL_TITLES[LEVEL_TITLES.length - 1]!.title);
  });

  it("treats negative or fractional XP as zero-ish rather than breaking", () => {
    expect(levelFromXp(-100).level).toBe(1);
    expect(levelFromXp(10.7).totalXp).toBe(10);
  });
});

const stats: QuestStats = {
  reviewsToday: 0,
  newCardsToday: 0,
  recalledToday: 0,
  cardsAddedToday: 0,
  tasksDoneToday: 0,
  dueRemaining: 12,
  dailyGoal: 15,
};

describe("questsForDay", () => {
  it("always offers three quests", () => {
    expect(questsForDay("2026-08-28", stats)).toHaveLength(3);
  });

  it("is stable within a day and varies across days", () => {
    const a = questsForDay("2026-08-28", stats).map((q) => q.key);
    const again = questsForDay("2026-08-28", stats).map((q) => q.key);
    expect(again).toEqual(a);

    const differs = ["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"]
      .some((d) => questsForDay(d, stats).map((q) => q.key).join() !== a.join());
    expect(differs).toBe(true);
  });

  it("anchors the first quest to the learner's daily review goal", () => {
    const [first] = questsForDay("2026-08-28", { ...stats, dailyGoal: 25 });
    expect(first?.key).toBe("reviews_goal");
    expect(first?.target).toBe(25);
  });

  it("never repeats a quest within a day", () => {
    for (const day of ["2026-01-01", "2026-03-14", "2026-07-04", "2026-12-31"]) {
      const keys = questsForDay(day, stats).map((q) => q.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("marks a quest done once its target is met, and clamps the bar", () => {
    const done = questsForDay("2026-08-28", { ...stats, reviewsToday: 99 })[0]!;
    expect(done.done).toBe(true);
    expect(done.progress).toBe(done.target);
  });

  it("never asks for XP, which is the review count under another name", () => {
    for (const day of ["2026-01-01", "2026-03-14", "2026-07-04", "2026-12-31"]) {
      expect(questsForDay(day, stats).map((q) => q.key)).not.toContain("xp_burst");
    }
  });

  it("does not offer 'clear everything due' on a day with nothing due", () => {
    const keys = questsForDay("2026-08-28", { ...stats, dueRemaining: 0, reviewsToday: 0 })
      .map((q) => q.key);
    expect(keys).not.toContain("clear_due");
  });
});

describe("questBonusXp", () => {
  it("counts only the finished quests", () => {
    const quests = questsForDay("2026-08-28", { ...stats, reviewsToday: 99 });
    const expected = quests.filter((q) => q.done).reduce((s, q) => s + q.reward, 0);
    expect(questBonusXp(quests)).toBe(expected);
    expect(questBonusXp([])).toBe(0);
  });
});
