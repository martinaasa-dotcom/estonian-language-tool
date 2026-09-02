import { describe, expect, it } from "vitest";
import { BADGES, badgeByKey, computeStreak, computeStreakWithShields, earnedBadgeKeys, type BadgeStats } from "./badges";
import { dayKey as localDayKey } from "@/lib/time/day";

const base: BadgeStats = {
  streak: 0,
  totalReviews: 0,
  cardsKnown: 0,
  totalWords: 0,
  bestCaseAccuracy: null,
  sprintBest: 0,
  matchBestSeconds: 0,
  unitsCompleted: 0,
  level: 1,
  questsDoneToday: 0,
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

  it("earns match_ace only for a round that was actually finished quickly", () => {
    expect(earnedBadgeKeys({ ...base, matchBestSeconds: 0 })).not.toContain("match_ace");
    expect(earnedBadgeKeys({ ...base, matchBestSeconds: 46 })).not.toContain("match_ace");
    expect(earnedBadgeKeys({ ...base, matchBestSeconds: 45 })).toContain("match_ace");
  });

  it("earns path badges as units are finished", () => {
    expect(earnedBadgeKeys({ ...base, unitsCompleted: 1 })).toContain("unit_done");
    expect(earnedBadgeKeys({ ...base, unitsCompleted: 1 })).not.toContain("units_5");
    expect(earnedBadgeKeys({ ...base, unitsCompleted: 5 })).toContain("units_5");
  });

  it("earns level badges at their thresholds", () => {
    expect(earnedBadgeKeys({ ...base, level: 4 })).not.toContain("level_5");
    expect(earnedBadgeKeys({ ...base, level: 5 })).toContain("level_5");
    expect(earnedBadgeKeys({ ...base, level: 10 })).toContain("level_10");
  });

  it("earns all_quests only when every daily quest is done", () => {
    expect(earnedBadgeKeys({ ...base, questsDoneToday: 2 })).not.toContain("all_quests");
    expect(earnedBadgeKeys({ ...base, questsDoneToday: 3 })).toContain("all_quests");
  });

  it("earns the hour badges only when an hour is actually reported", () => {
    expect(earnedBadgeKeys(base)).not.toContain("early_bird");
    expect(earnedBadgeKeys({ ...base, reviewHours: [6] })).toContain("early_bird");
    expect(earnedBadgeKeys({ ...base, reviewHours: [7] })).not.toContain("early_bird");
    expect(earnedBadgeKeys({ ...base, reviewHours: [23] })).toContain("night_owl");
    expect(earnedBadgeKeys({ ...base, reviewHours: [22] })).not.toContain("night_owl");
  });

  /*
    A SESSION HAS A BEGINNING AND AN END, AND THE BADGES SAY SO.

    One number used to be reported, the hour the check ran, which is the hour
    the session ended. Somebody who sat down at half past six and carried on
    past seven was denied "review before 7am", which is the learner it is most
    obviously about. Both ends are reported now.
  */
  it("earns the morning badge from a session that began before seven", () => {
    expect(earnedBadgeKeys({ ...base, reviewHours: [6, 7] })).toContain("early_bird");
  });

  it("earns both from a session that crossed midnight", () => {
    const crossed = earnedBadgeKeys({ ...base, reviewHours: [23, 0] });
    expect(crossed).toContain("night_owl");
    expect(crossed).toContain("early_bird");
  });

  it("earns neither from an ordinary afternoon", () => {
    const afternoon = earnedBadgeKeys({ ...base, reviewHours: [14, 15] });
    expect(afternoon).not.toContain("early_bird");
    expect(afternoon).not.toContain("night_owl");
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

describe("computeStreakWithShields", () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  };
  const dayKey = (offset: number) => localDayKey(day(offset));

  it("matches computeStreak with zero shields available", () => {
    const dates = [day(0), day(-1), day(-2)];
    expect(computeStreakWithShields(dates, 0).streak).toBe(computeStreak(dates));
  });

  it("bridges a single missed day when a shield is available", () => {
    // Reviewed today, yesterday and three days ago — missed only two days ago.
    const dates = [day(0), day(-1), day(-3)];
    const r = computeStreakWithShields(dates, 1);
    expect(r.streak).toBe(4);
    expect(r.newlyShieldedDates).toEqual([dayKey(-2)]);
    expect(r.shieldsRemaining).toBe(0);
  });

  it("can bridge two consecutive missed days if two shields are in stock", () => {
    // Reviewed today and four days ago — missed the three days between.
    const dates = [day(0), day(-4)];
    const r = computeStreakWithShields(dates, 2);
    // Only 2 of the 3 missing days can be covered, so the streak stops there.
    expect(r.streak).toBe(3);
    expect(r.newlyShieldedDates).toEqual([dayKey(-1), dayKey(-2)]);
    expect(r.shieldsRemaining).toBe(0);
  });

  it("never spends a shield when there is nothing to bridge", () => {
    const dates = [day(0), day(-1), day(-2)];
    const r = computeStreakWithShields(dates, 3);
    expect(r.streak).toBe(3);
    expect(r.newlyShieldedDates).toEqual([]);
    expect(r.shieldsRemaining).toBe(3);
  });

  it("treats a previously-shielded day as covered without spending another shield", () => {
    const dates = [day(0), day(-2)];
    const r = computeStreakWithShields(dates, 2, [dayKey(-1)]);
    expect(r.streak).toBe(3);
    expect(r.newlyShieldedDates).toEqual([]);
    expect(r.shieldsRemaining).toBe(2);
  });

  it("stops immediately with no shields and a gap", () => {
    const dates = [day(0)];
    const r = computeStreakWithShields(dates, 0);
    expect(r.streak).toBe(1);
    expect(r.newlyShieldedDates).toEqual([]);
  });

  it("never bridges past the earliest known review or shielded day", () => {
    // Only one real review, ever. A shield must not manufacture pre-history.
    const dates = [day(0)];
    const r = computeStreakWithShields(dates, 10);
    expect(r.streak).toBe(1);
    expect(r.newlyShieldedDates).toEqual([]);
    expect(r.shieldsRemaining).toBe(10);
  });
});
