import { describe, expect, it } from "vitest";
import {
  CUMULATIVE_HOURS, ESTONIAN_FACTOR, FACTS, FOUND_HOURS_PER_WEEK, GUIDED_LEARNING_HOURS, MIN_PACE_WEEKS,
  countedBySkill, foundHours, hoursBetween, hoursFor, project, sustainableNewCardsPerDay, weeklyExposure,
  distanceLine, weeksNeeded, weeksToLearn, type PlanInput, type Standing, type Verdict,
} from "./plan";
import { REASONS, reasonsFor } from "./goals";
import { BANDS, PRE_A1, type Band, type Level } from "./types";
import { formatDuration, formatDurationRange } from "@/lib/time/duration";
import { ICONS } from "@/components/icons";

/** A level a paper measured, with an even profile: the plain table, no widening. */
const at = (level: Level): Standing => ({ level, source: "measured" });
/** A level the learner ticked themselves. */
const guessed = (level: Level): Standing => ({ level, source: "estimated" });
const NONE = foundHours([]);
const step = (band: Band): { low: number; high: number } => {
  const i = BANDS.indexOf(band);
  const below = i === 0 ? { low: 0, high: 0 } : CUMULATIVE_HOURS[BANDS[i - 1]!];
  return { low: CUMULATIVE_HOURS[band].low - below.low, high: CUMULATIVE_HOURS[band].high - below.high };
};

describe("the hours table", () => {
  it("only ever goes up", () => {
    for (let i = 1; i < BANDS.length; i++) {
      const lower = CUMULATIVE_HOURS[BANDS[i - 1]!];
      const higher = CUMULATIVE_HOURS[BANDS[i]!];
      expect(higher.low).toBeGreaterThan(lower.low);
      expect(higher.high).toBeGreaterThan(lower.high);
    }
  });

  it("is a range, never a single number pretending to be a fact", () => {
    for (const band of BANDS) {
      expect(CUMULATIVE_HOURS[band].high).toBeGreaterThan(CUMULATIVE_HOURS[band].low);
    }
  });

  /*
    The table is the published hours with a surcharge per step, and the
    surcharge is a judgement, so its shape is asserted rather than remembered:
    every step is dearer than the language the hours were published for, none
    is more than double, and the whole climb to C1 stays within what the
    Foreign Service Institute's ratio for Estonian allows.
  */
  it("is the published hours with a surcharge on every step, and never more than double", () => {
    let low = 0;
    let high = 0;
    let previous = { low: 0, high: 0 };
    for (const band of BANDS) {
      const published = GUIDED_LEARNING_HOURS[band];
      const factor = ESTONIAN_FACTOR[band];
      expect(factor.low).toBeGreaterThan(1);
      expect(factor.high).toBeLessThanOrEqual(2);
      expect(factor.high).toBeGreaterThan(factor.low);
      low += (published.low - previous.low) * factor.low;
      high += (published.high - previous.high) * factor.high;
      previous = published;
      expect(Math.abs(CUMULATIVE_HOURS[band].low - low)).toBeLessThanOrEqual(5);
      expect(Math.abs(CUMULATIVE_HOURS[band].high - high)).toBeLessThanOrEqual(5);
    }
    const ratio = CUMULATIVE_HOURS.C1.high / GUIDED_LEARNING_HOURS.C1.high;
    expect(ratio).toBeLessThanOrEqual(1100 / 600 + 0.05);
  });

  /*
    The point of recalibrating it. The first table doubled every step, so a
    B1 speaker was told B2 was 300 to 350 hours off, further than A2 had been
    from B1. The surcharge sits where the morphology is: A2 to B1 is the
    longest step, B1 to B2 is shorter than it, and a beginner's road to C1 is
    still the best part of a thousand hours.
  */
  it("puts the hard part in the middle: B1 to B2 is shorter than A2 to B1", () => {
    expect(step("B2").low).toBeLessThan(step("B1").low);
    expect(step("B2").high).toBeLessThan(step("B1").high);
    expect(step("B1").low).toBeGreaterThan(step("A2").low);
    expect(ESTONIAN_FACTOR.B1.high).toBeGreaterThan(ESTONIAN_FACTOR.B2.high);
  });

  it("still makes A1 to C1 a long road and A1 the cheapest step", () => {
    expect(hoursBetween("A1", "C1").low).toBeGreaterThanOrEqual(900);
    expect(hoursBetween(PRE_A1, "C1").high).toBeGreaterThanOrEqual(1300);
    for (const band of BANDS.slice(1)) expect(step(band).low).toBeGreaterThan(step("A1").low);
  });

  it("counts only the hours still to do", () => {
    expect(hoursBetween("A2", "B1")).toEqual(step("B1"));
    expect(hoursBetween(PRE_A1, "A1")).toEqual(CUMULATIVE_HOURS.A1);
    expect(hoursBetween("B2", "A2")).toEqual({ low: 0, high: 0 });
  });

  it("makes a B1 speaker's distance to B2 well under half a beginner's", () => {
    const speaker = hoursBetween("B1", "B2");
    const beginner = hoursBetween(PRE_A1, "B2");
    expect(speaker.high).toBeLessThan(beginner.high / 2);
  });
});

describe("where the learner stands", () => {
  it("reads a measured level with an even profile straight off the table", () => {
    expect(hoursFor({ level: "B1", source: "measured", skills: ["B1", "B1", "B1"] }, "B2"))
      .toEqual(hoursBetween("B1", "B2"));
    expect(hoursFor(at("B1"), "B2")).toEqual(hoursBetween("B1", "B2"));
    expect(countedBySkill({ level: "B1", source: "measured", skills: ["B1", "B1", "B1"] }, "B2")).toBe(false);
  });

  /*
    Reading B2, listening A1, writing B2 averages to B1 and is not B1's
    distance from B2: two skills are done and one has three bands to cover.
    The mean of the three distances is what it costs, and a skill past the
    target counts nothing.
  */
  it("counts a measured but uneven profile skill by skill", () => {
    const uneven: Standing = { level: "B1", source: "measured", skills: ["B2", "A1", "B2"] };
    const far = hoursBetween("A1", "B2");
    expect(hoursFor(uneven, "B2")).toEqual({ low: far.low / 3, high: far.high / 3 });
    expect(countedBySkill(uneven, "B2")).toBe(true);
  });

  it("lets a skill already at the target pull the distance down, and one far behind pull it up", () => {
    const plain = hoursBetween("B1", "B2");
    const oneDone: Standing = { level: "B1", source: "measured", skills: ["B2", "B1", "B1"] };
    const oneBehind: Standing = { level: "B1", source: "measured", skills: ["B1", "B1", "A1"] };
    expect(hoursFor(oneDone, "B2").low).toBeLessThan(plain.low);
    expect(hoursFor(oneBehind, "B2").low).toBeGreaterThan(plain.low);
    const behind = hoursBetween("A1", "B2");
    expect(hoursFor(oneBehind, "B2")).toEqual({ low: (2 * plain.low + behind.low) / 3, high: (2 * plain.high + behind.high) / 3 });
  });

  it("widens a guessed level downward only, by half a band", () => {
    const stated = hoursBetween("A1", "B2");
    const lower = hoursBetween(PRE_A1, "B2");
    expect(hoursFor(guessed("A1"), "B2")).toEqual({ low: stated.low, high: (stated.high + lower.high) / 2 });
    expect(hoursFor(guessed("B1"), "B2").low).toBe(hoursBetween("B1", "B2").low);
    expect(hoursFor(guessed("B1"), "B2").high).toBeGreaterThan(hoursBetween("B1", "B2").high);
    expect(hoursFor(guessed("B1"), "B2").high).toBeLessThan(hoursBetween("A2", "B2").high);
  });

  it("has nothing below A1 to widen towards", () => {
    expect(hoursFor(guessed(PRE_A1), "A2")).toEqual(hoursBetween(PRE_A1, "A2"));
  });

  it("is zero once the overall is at the target, whatever the skills say", () => {
    expect(hoursFor({ level: "B2", source: "measured", skills: ["C1", "A2", "B2"] }, "B2")).toEqual({ low: 0, high: 0 });
    expect(hoursFor(guessed("C1"), "B1")).toEqual({ low: 0, high: 0 });
  });
});

describe("what a learner's week already holds", () => {
  const by = (...ids: string[]) => reasonsFor(ids.join(" "));

  it("is the baseline alone for somebody whose reasons put no Estonian in their week", () => {
    expect(weeklyExposure([])).toEqual({ low: 0, high: 0 });
    expect(weeklyExposure(by("curiosity", "travel", "citizenship"))).toEqual({ low: 0, high: 0 });
    expect(foundHours(by("curiosity"))).toEqual({ low: FOUND_HOURS_PER_WEEK, high: FOUND_HOURS_PER_WEEK });
  });

  it("counts the largest situation whole and each further one half", () => {
    const family = REASONS.find((r) => r.id === "family")!.exposure;
    const living = REASONS.find((r) => r.id === "living")!.exposure;
    expect(weeklyExposure(by("living", "family"))).toEqual({
      low: family.low + living.low / 2,
      high: family.high + living.high / 2,
    });
    expect(weeklyExposure(by("family", "living"))).toEqual(weeklyExposure(by("living", "family")));
  });

  it("never lets a goal count as exposure", () => {
    expect(weeklyExposure(by("living", "citizenship"))).toEqual(weeklyExposure(by("living")));
  });

  it("starts from the baseline and adds the situation on top", () => {
    const found = foundHours(by("work"));
    const work = REASONS.find((r) => r.id === "work")!.exposure;
    expect(found).toEqual({ low: FOUND_HOURS_PER_WEEK + work.low, high: FOUND_HOURS_PER_WEEK + work.high });
  });
});

describe("project", () => {
  const base: PlanInput = { standing: at("A2"), to: "B1", minutesPerDay: 15, daysPerWeek: 5, weeksAvailable: null, found: NONE };

  it("says how long the app alone would take, which is the sobering number", () => {
    const plan = project(base);
    expect(plan.appHoursPerWeek).toBeCloseTo(1.25, 10);
    expect(plan.weeksOnAppAlone.low).toBeGreaterThan(150);
    expect(plan.verdict).toBe("open");
    expect(plan.paceSource).toBe("stated");
  });

  /*
    The pace used to be rounded to one decimal before anything divided by it,
    which is a display decision leaking into arithmetic. Three minutes a day
    three days a week is 0.15 hours and was shown and used as 0.2, a third more
    study than the learner said they would do, and it took a quarter off the
    weeks the app alone would need. Every figure here is exact now, and the
    panel rounds on the way to a tile.
  */
  it("never rounds a pace before dividing by it", () => {
    const plan = project({ ...base, standing: at("A1"), to: "A2", minutesPerDay: 3, daysPerWeek: 3 });
    const hours = hoursBetween("A1", "A2");
    expect(plan.appHoursPerWeek).toBeCloseTo(0.15, 10);
    expect(plan.weeksOnAppAlone).toEqual({ low: Math.ceil(hours.low / 0.15), high: Math.ceil(hours.high / 0.15) });
  });

  it("turns a deadline into hours a week to find elsewhere", () => {
    const plan = project({ ...base, weeksAvailable: 26 });
    expect(plan.appHoursAvailable).toBeCloseTo(32.5, 10);
    expect(plan.otherHoursPerWeek?.low).toBeCloseTo((hoursBetween("A2", "B1").low - 32.5) / 26, 10);
    expect(plan.verdict).toBe("short");
  });

  it("calls an impossible deadline impossible", () => {
    const plan = project({ ...base, standing: at(PRE_A1), to: "C1", weeksAvailable: 12 });
    expect(plan.verdict).toBe("short");
  });

  it("calls a deadline the app alone can meet comfortable", () => {
    const plan = project({ ...base, minutesPerDay: 240, daysPerWeek: 7, weeksAvailable: 52 });
    expect(plan.verdict).toBe("comfortable");
    expect(plan.otherHoursPerWeek).toEqual({ low: 0, high: 0 });
  });

  it("says so when the target is already behind you", () => {
    const plan = project({ ...base, standing: at("B2"), weeksAvailable: 12 });
    expect(plan.verdict).toBe("arrived");
    expect(plan.hours).toEqual({ low: 0, high: 0 });
    expect(plan.weeksWithFound).toEqual({ low: 0, high: 0 });
  });

  it("survives a pace of nothing without dividing by it", () => {
    const plan = project({ ...base, minutesPerDay: 0, weeksAvailable: 10 });
    expect(plan.weeksOnAppAlone).toEqual({ low: 0, high: 0 });
    expect(Number.isFinite(plan.otherHoursPerWeek?.low ?? 0)).toBe(true);
  });

  /*
    A deadline that has gone leaves nothing to divide by. It used to be floored
    at one week, so the screen said "in 0 weeks your daily goal puts in about
    0.4 of those hours" over a note asking for 1 099 hours a week.
  */
  it("says a date has gone rather than dividing the distance by no time", () => {
    const plan = project({ ...base, to: "C1", minutesPerDay: 5, weeksAvailable: 0 });
    expect(plan.verdict).toBe("passed");
    expect(plan.otherHoursPerWeek).toBeNull();
    expect(plan.appHoursAvailable).toBe(0);
  });

  /*
    The learner in the screenshot that started this: living in Estonia with an
    Estonian partner, A1 by their own estimate, B2 in two years, five minutes a
    day. Told "not by that date" and sent to find a class, by a plan that could
    not see the language was already in their kitchen. The same answers with
    the week read off the reasons is a plan that fits if they use it.
  */
  it("reads the Estonian already in a learner's week and says the date could fit", () => {
    const input: PlanInput = { ...base, standing: guessed("A1"), to: "B2", minutesPerDay: 5, weeksAvailable: 104 };
    const abroad = project(input);
    const athome = project({ ...input, found: foundHours(reasonsFor("living family")) });
    expect(abroad.verdict).toBe("short");
    expect(athome.verdict).toBe("possible");
    expect(athome.hours).toEqual(abroad.hours);
    expect(athome.weeksWithFound.low).toBeLessThan(abroad.weeksWithFound.low);
  });

  it("can only call a plan possible where the week holds more than the baseline", () => {
    for (const standing of [PRE_A1, ...BANDS].map((l) => at(l as Level))) {
      for (const to of BANDS) {
        for (const weeks of [13, 26, 52, 104]) {
          const p = project({ ...base, standing, to, weeksAvailable: weeks });
          expect(p.verdict).not.toBe("possible");
        }
      }
    }
  });

  const RANK: Record<Verdict, number> = { short: 0, possible: 1, tight: 2, comfortable: 3, arrived: 4, open: 4, passed: 0 };

  it("never gives a worse verdict to a learner with more Estonian around them", () => {
    const situations = [[], ["curiosity"], ["living"], ["family"], ["living", "family"], ["living", "family", "work"]];
    for (const standing of [PRE_A1, "A1", "A2", "B1", "B2"].map((l) => at(l as Level))) {
      for (const to of BANDS) {
        for (const weeks of [26, 52, 104]) {
          let previous = -1;
          for (const ids of situations) {
            const p = project({ ...base, standing, to, weeksAvailable: weeks, found: foundHours(reasonsFor(ids.join(" "))) });
            expect(RANK[p.verdict]).toBeGreaterThanOrEqual(previous);
            previous = RANK[p.verdict];
          }
        }
      }
    }
  });

  /*
    The headline and the sentence under it are one claim. "It fits" is only
    said where the found hours the note goes on to quote actually land inside
    the deadline, which is what drawing every band at the pessimistic end buys:
    tight at the least the week holds, possible at the most.
  */
  it("never calls a plan tight or possible that its own found-hours figure cannot make", () => {
    const FROMS: Level[] = [PRE_A1, ...BANDS];
    const cases: string[] = [];
    for (const from of FROMS) {
      for (const source of ["measured", "estimated"] as const) {
        for (const to of BANDS as readonly Band[]) {
          for (const minutes of [3, 5, 8, 13]) {
            for (const days of [2, 3, 4, 5, 6, 7]) {
              for (const weeks of [13, 26, 52, 104]) {
                for (const ids of ["", "family", "living family work"]) {
                  const plan = project({
                    standing: { level: from, source }, to, minutesPerDay: minutes, daysPerWeek: days,
                    weeksAvailable: weeks, found: foundHours(reasonsFor(ids)),
                  });
                  const where = `${source} ${from}->${to} ${minutes}min x${days}d in ${weeks}wk [${ids}]`;
                  if (plan.verdict === "tight" && plan.weeksWithFound.high > weeks) cases.push(where);
                  if (plan.verdict === "possible" && plan.weeksWithFound.low > weeks) cases.push(where);
                }
              }
            }
          }
        }
      }
    }
    expect(cases).toEqual([]);
  });

  it("keeps every figure finite, positive and the right way round, whatever is clicked", () => {
    const FROMS: Level[] = [PRE_A1, ...BANDS];
    for (const from of FROMS) {
      for (const source of ["measured", "estimated"] as const) {
        for (const to of BANDS as readonly Band[]) {
          for (const minutes of [3, 5, 8, 13]) {
            for (const days of [2, 3, 4, 5, 6, 7]) {
              for (const weeks of [null, 0, 13, 26, 52, 104]) {
                const p = project({
                  standing: { level: from, source }, to, minutesPerDay: minutes, daysPerWeek: days,
                  weeksAvailable: weeks, found: foundHours(reasonsFor("living work")),
                });
                const figures = [
                  p.appHoursPerWeek, p.weeksOnAppAlone.low, p.weeksOnAppAlone.high,
                  p.appHoursAvailable ?? 0, p.otherHoursPerWeek?.low ?? 0, p.otherHoursPerWeek?.high ?? 0,
                  p.weeksWithFound.low, p.weeksWithFound.high, p.found.low, p.found.high,
                ];
                for (const n of figures) {
                  expect(Number.isFinite(n)).toBe(true);
                  expect(n).toBeGreaterThanOrEqual(0);
                }
                expect(p.hours.low).toBeLessThanOrEqual(p.hours.high);
                expect(p.weeksOnAppAlone.low).toBeLessThanOrEqual(p.weeksOnAppAlone.high);
                expect(p.weeksWithFound.low).toBeLessThanOrEqual(p.weeksWithFound.high);
                if (p.otherHoursPerWeek) {
                  expect(p.otherHoursPerWeek.low).toBeLessThanOrEqual(p.otherHoursPerWeek.high);
                }
              }
            }
          }
        }
      }
    }
  });

  /*
    An hour is the wrong unit for the figures at the small end of this screen.
    Nine minutes a week was printed as "0.2h", which is twelve, and a real
    0.0218 hours a week still to find was printed as "0 hours a week" under a
    headline saying there was study left to do. Every duration the plan can
    print is swept here, because the fault is only visible at the ends.
  */
  it("prints no duration in a unit that rounds it away", () => {
    const FROMS: Level[] = [PRE_A1, ...BANDS];
    const wrong: string[] = [];
    for (const from of FROMS) {
      for (const to of BANDS as readonly Band[]) {
        for (const minutes of [3, 5, 8, 13]) {
          for (const days of [2, 3, 4, 5, 6, 7]) {
            for (const weeks of [null, 0, 13, 26, 52, 104]) {
              const p = project({ ...base, standing: guessed(from), to, minutesPerDay: minutes, daysPerWeek: days, weeksAvailable: weeks });
              const where = `${from}->${to} ${minutes}min x${days}d in ${weeks}wk`;

              // The pace is a real amount of practice, so it never reads as none.
              const pace = formatDuration(p.appHoursPerWeek);
              if (p.appHoursPerWeek > 0 && /^0 /.test(pace)) wrong.push(`${where}: pace "${pace}"`);
              // And it is read in minutes wherever an hour would be the wrong unit.
              if (p.appHoursPerWeek < 1 && !pace.endsWith("min")) wrong.push(`${where}: pace "${pace}"`);

              // The note only renders on a real shortfall, so it may not read as none either.
              const other = p.otherHoursPerWeek;
              if (!other || other.high <= 0) continue;
              const found = formatDurationRange(other.low, other.high, "long");
              if (/^0 (minutes?|hours?)$/.test(found)) wrong.push(`${where}: shortfall "${found}"`);
              if (/to 0 (minutes?|hours?)$/.test(found)) wrong.push(`${where}: shortfall "${found}"`);
            }
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("never makes more practice take longer", () => {
    for (const to of BANDS as readonly Band[]) {
      for (const minutes of [3, 5, 8, 13]) {
        let previous = Infinity;
        for (const days of [2, 3, 4, 5, 6, 7]) {
          const p = project({ ...base, standing: at(PRE_A1), to, minutesPerDay: minutes, daysPerWeek: days });
          expect(p.weeksOnAppAlone.high).toBeLessThanOrEqual(previous);
          previous = p.weeksOnAppAlone.high;
        }
      }
    }
  });
});

describe("the learner's own pace", () => {
  const base: PlanInput = { standing: at("A2"), to: "B1", minutesPerDay: 15, daysPerWeek: 5, weeksAvailable: 52, found: NONE };

  it("replaces what they said with what they did, once the log covers enough weeks", () => {
    const plan = project({ ...base, pace: { hoursPerWeek: 0.5, daysPerWeek: 2, weeks: 4, cardsPerMinute: 2 } });
    expect(plan.paceSource).toBe("measured");
    expect(plan.appHoursPerWeek).toBe(0.5);
    expect(plan.paceWeeks).toBe(4);
    expect(plan.appHoursAvailable).toBeCloseTo(26, 10);
  });

  it("goes on trusting the promise while the log is younger than a fortnight", () => {
    const plan = project({ ...base, pace: { hoursPerWeek: 3, daysPerWeek: 7, weeks: MIN_PACE_WEEKS - 0.5, cardsPerMinute: 3 } });
    expect(plan.paceSource).toBe("stated");
    expect(plan.appHoursPerWeek).toBeCloseTo(1.25, 10);
    expect(plan.paceWeeks).toBeNull();
  });

  /*
    A window that held nothing is a fact too, and a different one from having
    no log: the stated pace stands rather than a pace of nothing, which would
    make every figure on the screen zero or infinite, and the source says why.
  */
  it("keeps the stated pace when the log is there and empty, and says so", () => {
    const plan = project({ ...base, pace: { hoursPerWeek: 0, daysPerWeek: 0, weeks: 4, cardsPerMinute: null } });
    expect(plan.paceSource).toBe("lapsed");
    expect(plan.appHoursPerWeek).toBeCloseTo(1.25, 10);
    expect(plan.paceWeeks).toBe(4);
  });

  it("lets a real pace move the verdict either way", () => {
    const keen = project({ ...base, to: "A2", standing: at("A1"), pace: { hoursPerWeek: 6, daysPerWeek: 6, weeks: 4, cardsPerMinute: 3 } });
    const lazy = project({ ...base, to: "A2", standing: at("A1"), minutesPerDay: 120, daysPerWeek: 7, pace: { hoursPerWeek: 0.2, daysPerWeek: 1, weeks: 4, cardsPerMinute: 3 } });
    expect(keen.verdict).toBe("comfortable");
    expect(lazy.verdict).not.toBe("comfortable");
  });
});

describe("the distance in one sentence", () => {
  const base: PlanInput = { standing: at("A2"), to: "B1", minutesPerDay: 15, daysPerWeek: 5, weeksAvailable: 52, found: NONE };

  it("quotes the projection's own weeks and the date, and names the pace for what it is", () => {
    const p = project(base);
    const line = distanceLine(p);
    expect(line).toContain(`${p.weeksWithFound.low} to ${p.weeksWithFound.high} weeks away`);
    expect(line).toContain("52 weeks off");
    expect(line).toContain("the pace you said");
    expect(distanceLine(project({ ...base, pace: { hoursPerWeek: 1, daysPerWeek: 3, weeks: 4, cardsPerMinute: 3 } })))
      .toContain("the pace you have kept");
    expect(distanceLine(project({ ...base, pace: { hoursPerWeek: 0, daysPerWeek: 0, weeks: 4, cardsPerMinute: null } })))
      .toContain("nothing has been reviewed here lately");
  });

  it("says a different last sentence for every verdict, and each one is the verdict", () => {
    const lines = new Map<Verdict, string>();
    lines.set("open", distanceLine(project({ ...base, weeksAvailable: null })));
    lines.set("passed", distanceLine(project({ ...base, weeksAvailable: 0 })));
    lines.set("short", distanceLine(project({ ...base, weeksAvailable: 10 })));
    lines.set("tight", distanceLine(project({ ...base, minutesPerDay: 60, daysPerWeek: 7, weeksAvailable: 40 })));
    lines.set("possible", distanceLine(project({ ...base, standing: guessed("A1"), to: "B2", minutesPerDay: 5, weeksAvailable: 104, found: foundHours(reasonsFor("living family")) })));
    lines.set("comfortable", distanceLine(project({ ...base, minutesPerDay: 240, daysPerWeek: 7 })));
    lines.set("arrived", distanceLine(project({ ...base, standing: at("B2") })));
    const seen = new Set(lines.values());
    expect(seen.size).toBe(lines.size);
    expect(lines.get("open")).toContain("No date is set");
    expect(lines.get("passed")).toContain("has gone");
    expect(lines.get("short")).toContain("something has to move");
    expect(lines.get("tight")).toContain("It fits");
    expect(lines.get("possible")).toContain("It could fit");
    expect(lines.get("comfortable")).toContain("this app alone covers it");
    // The target, not the standing: "already B1" is the level the plan is about.
    expect(lines.get("arrived")).toContain("already B1");
  });

  it("checks each verdict really is the one it printed", () => {
    expect(project({ ...base, weeksAvailable: 10 }).verdict).toBe("short");
    expect(project({ ...base, minutesPerDay: 60, daysPerWeek: 7, weeksAvailable: 40 }).verdict).toBe("tight");
    expect(project({ ...base, minutesPerDay: 240, daysPerWeek: 7 }).verdict).toBe("comfortable");
  });
});

describe("what a deadline would have to move to", () => {
  it("counts the app hours and the found hours together", () => {
    expect(weeksNeeded({ low: 100, high: 200 }, 2, 3)).toEqual({ low: 20, high: 40 });
    expect(weeksNeeded({ low: 100, high: 200 }, 0, 0)).toEqual({ low: 0, high: 0 });
  });

  it("is what the projection quotes, at the most and the least the week holds", () => {
    const found = { low: 5, high: 9 };
    const p = project({ standing: at("A1"), to: "B1", minutesPerDay: 15, daysPerWeek: 5, weeksAvailable: 52, found });
    expect(p.weeksWithFound.low).toBe(weeksNeeded(p.hours, p.appHoursPerWeek, 9).low);
    expect(p.weeksWithFound.high).toBe(weeksNeeded(p.hours, p.appHoursPerWeek, 5).high);
  });
});

describe("the daily goal a learner can actually sustain", () => {
  it("divides a review quota by the reviews a new card will cost", () => {
    expect(sustainableNewCardsPerDay(15)).toBe(2);
    expect(sustainableNewCardsPerDay(40)).toBe(4);
  });

  it("never says zero new cards a day, which would be advice to stop", () => {
    expect(sustainableNewCardsPerDay(1)).toBe(1);
  });

  it("turns a card count into weeks at the sustainable rate", () => {
    // 15 a day sustains 2 new cards, 5 days a week, so 100 cards is 10 weeks.
    expect(weeksToLearn(100, 15, 5)).toBe(10);
    expect(weeksToLearn(0, 15, 5)).toBe(0);
  });

  /*
    The regression this signature exists for. It took words and doubled them,
    which is the card count for a unit that drills nothing; a real A1 unit is
    nearer nine cards a word, so the old call understated a starter deck by a
    factor of four and a half and told a beginner nine weeks where the answer
    was forty.
  */
  it("counts the cards it was given rather than doubling them", () => {
    // The A1 starter deck, measured: 52 words build 404 cards, not 104.
    expect(weeksToLearn(404, 25, 5)).toBe(27);
    expect(weeksToLearn(50, 15, 5)).toBe(5);
  });

  it("is faster at a higher goal, which is what the copy now says", () => {
    expect(weeksToLearn(400, 40, 5)).toBeLessThan(weeksToLearn(400, 10, 5));
  });
});

describe("the facts shown to a learner", () => {
  it("every one of them names where it came from", () => {
    expect(FACTS.length).toBeGreaterThan(3);
    for (const fact of FACTS) {
      expect(fact.source.length).toBeGreaterThan(10);
      expect(fact.claim.length).toBeGreaterThan(40);
    }
  });

  // `icon()` falls back to a sparkle for a name it does not know, silently.
  it("asks only for icons the app has registered", () => {
    for (const fact of FACTS) {
      expect(Object.hasOwn(ICONS, fact.icon), `${fact.id} asks for the unregistered icon ${fact.icon}`).toBe(true);
    }
  });
});
