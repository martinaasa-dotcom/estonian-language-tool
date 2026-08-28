import { describe, expect, it } from "vitest";
import { BADGES, badgeByKey, computeStreak, earnedBadgeKeys, type BadgeStats } from "./badges";

const base: BadgeStats = {
  streak: 0,
  totalReviews: 0,
  cardsKnown: 0,
  totalWords: 0,
  bestCaseAccuracy: null,
  sprintBest: 0,
};

describe("BADGES", () => {
  it("every key is unique and resolvable", () => {
    const keys = BADGES.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(badgeByKey(key)).toBeDefined();
  });

  it("returns undefined for an unknown key", () => {
    expect(badgeByKey("not_a_real_badge")).toBeUndefined();
  });
});

describe("earnedBadgeKeys", () => {
  it("earns nothing from zero stats", () => {
    expect(earnedBadgeKeys(base)).toEqual([]);
  });

  it("earns first_review at exactly one review", () => {
    expect(earnedBadgeKeys({ ...base, totalReviews: 1 })).toContain("first_review");
  });

  it("earns streak badges at their thresholds, not before", () => {
    expect(earnedBadgeKeys({ ...base, streak: 2 })).not.toContain("streak_3");
    expect(earnedBadgeKeys({ ...base, streak: 3 })).toContain("streak_3");
    expect(earnedBadgeKeys({ ...base, streak: 7 })).toEqual(
      expect.arrayContaining(["streak_3", "streak_7"]),
    );
    expect(earnedBadgeKeys({ ...base, streak: 7 })).not.toContain("streak_30");
  });

  it("earns review-count badges cumulatively", () => {
    const keys = earnedBadgeKeys({ ...base, totalReviews: 1000 });
    expect(keys).toEqual(expect.arrayContaining(["reviews_100", "reviews_500", "reviews_1000"]));
  });

  it("earns case_master only at 90%+ on the tracked case", () => {
    expect(
      earnedBadgeKeys({ ...base, bestCaseAccuracy: { grammCase: "INESSIVE", accuracy: 89 } }),
    ).not.toContain("case_master");
    expect(
      earnedBadgeKeys({ ...base, bestCaseAccuracy: { grammCase: "INESSIVE", accuracy: 90 } }),
    ).toContain("case_master");
  });

  it("earns perfect_session only for a large, flawless session", () => {
    expect(earnedBadgeKeys({ ...base, session: { count: 5, accuracy: 100 } })).not.toContain("perfect_session");
    expect(earnedBadgeKeys({ ...base, session: { count: 10, accuracy: 90 } })).not.toContain("perfect_session");
    expect(earnedBadgeKeys({ ...base, session: { count: 10, accuracy: 100 } })).toContain("perfect_session");
  });

  it("earns sprint_ace at a score of 15", () => {
    expect(earnedBadgeKeys({ ...base, sprintBest: 14 })).not.toContain("sprint_ace");
    expect(earnedBadgeKeys({ ...base, sprintBest: 15 })).toContain("sprint_ace");
  });
});

describe("computeStreak", () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  };

  it("is zero with no reviews", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("counts today plus consecutive prior days", () => {
    expect(computeStreak([day(0), day(-1), day(-2)])).toBe(3);
  });

  it("still counts yesterday's streak as alive before today's first review", () => {
    expect(computeStreak([day(-1), day(-2)])).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(computeStreak([day(0), day(-1), day(-3)])).toBe(2);
  });
});
