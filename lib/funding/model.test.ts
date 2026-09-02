import { describe, expect, it } from "vitest";

import {
  ASSUMPTIONS, DEFAULT_SHAPE, SCALE_LADDER, TUTOR_CAP_USD,
  billFor, computeFor, distinctClips, ladderFor, volumeOf, type Shape,
} from "./model";
import { COMPUTE, MEASURED, PRICE_REFS, SUPABASE, VERCEL } from "./facts";
import { INFRA, KIND_NOTE } from "./infra";
import { DEFAULT_LIMITS } from "@/lib/usage/quota";

const at = (over: Partial<Shape>): Shape => ({ ...DEFAULT_SHAPE, ...over });

describe("what the projection is built out of", () => {
  it("says how every measurement was taken", () => {
    for (const m of MEASURED) {
      expect(m.how.length, m.what).toBeGreaterThan(10);
      expect(m.value.length, m.what).toBeGreaterThan(0);
    }
    expect(MEASURED.length).toBeGreaterThan(8);
  });

  it("cites a page and a date for every price somebody else set", () => {
    for (const ref of PRICE_REFS) {
      expect(ref.source).toMatch(/^https:\/\//);
      expect(ref.checked).toMatch(/\d{4}$/);
    }
  });

  it("says why every assumption is the number it is", () => {
    for (const a of ASSUMPTIONS) {
      expect(a.why.length, a.id).toBeGreaterThan(20);
      expect(a.value, a.id).toBeGreaterThan(0);
    }
  });

  it("gives every piece of infrastructure a name, an owner and a failure", () => {
    for (const item of INFRA) {
      expect(item.who.length, item.id).toBeGreaterThan(2);
      expect(item.does.length, item.id).toBeGreaterThan(20);
      expect(item.whenItIsGone.length, item.id).toBeGreaterThan(20);
      expect(KIND_NOTE[item.kind], item.id).toBeTruthy();
    }
  });

  it("has an entry for the one part nobody can pay for", () => {
    expect(INFRA.some((i) => i.kind === "device")).toBe(true);
  });
});

describe("the bill", () => {
  it("adds up, so a reader can check it with their thumb", () => {
    for (const learners of SCALE_LADDER) {
      const bill = billFor(at({ learners }));
      const summed = Math.round(bill.lines.reduce((s, l) => s + l.usd, 0) * 100) / 100;
      expect(summed, `${learners} learners`).toBe(bill.totalUsd);
    }
  });

  it("charges one person running this for themselves nothing but the domain", () => {
    const bill = billFor(at({ learners: 1 }));
    const paid = bill.lines.filter((l) => l.usd > 0);
    expect(paid.map((l) => l.id)).toEqual(["domain"]);
  });

  /*
    THE COST PER LEARNER IS A SAWTOOTH, AND THAT IS THE FINDING.

    The obvious claim for a page like this is that it gets cheaper per learner
    the more learners there are. The first version of this test asserted it and
    failed twice, in two different places, and both failures were the model
    telling the truth.

    One person pays for a domain and nothing else. Ten people pay twenty-five
    dollars a month, because ten learners' worth of spoken words is already
    past the free tier's gigabyte, so the price per head is at its very worst
    at about ten. Then it falls for three decades. Then it goes back up between
    ten thousand and a hundred thousand, because the database instance ladder
    steps in nine-hundred-dollar increments and a tenfold rise in learners does
    not always cover one.

    So the shape is a sawtooth with a downward trend, not a curve, and the two
    things worth asserting are the trend and the teeth. A page claiming a
    smooth curve would be wrong in a way that flatters us.
  */
  it("is dearest per learner at the first size that has to pay for anything", () => {
    const each = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.perLearnerUsd);
    expect(SCALE_LADDER[each.indexOf(Math.max(...each))]).toBe(10);
  });

  it("is more than a hundred times cheaper per learner at its best than at its worst", () => {
    const each = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.perLearnerUsd);
    expect(Math.max(...each) / Math.min(...each)).toBeGreaterThan(100);
  });

  it("steps back up somewhere, which is what the page says and must stay true", () => {
    const each = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.perLearnerUsd);
    const rises = each.filter((v, i) => i > 0 && v > each[i - 1]!);
    expect(rises.length).toBeGreaterThan(0);
  });

  it("never gets cheaper in total as more people arrive", () => {
    const totals = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.totalUsd);
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!).toBeGreaterThanOrEqual(totals[i - 1]!);
    }
  });

  it("puts a school of thirty on a paid plan at any traffic at all", () => {
    const personal = billFor(at({ learners: 30 }));
    const school = billFor(at({ learners: 30, commercial: true }));
    expect(personal.lines.find((l) => l.id === "vercel")!.plan).toBe(VERCEL.hobby.name);
    expect(school.lines.find((l) => l.id === "vercel")!.plan).toBe(VERCEL.pro.name);
    expect(school.totalUsd).toBeGreaterThan(personal.totalUsd);
  });

  it("names the meter that took a service off its free tier", () => {
    const line = billFor(at({ learners: 10 })).lines.find((l) => l.id === "supabase")!;
    expect(line.plan).not.toBe(SUPABASE.free.name);
    expect(line.movedBy.length).toBeGreaterThan(0);
    expect(line.why).toContain(line.movedBy[0]!);
  });

  it("leaves movedBy empty while a service is still free", () => {
    for (const line of billFor(at({ learners: 1 })).lines) {
      expect(line.movedBy, line.id).toEqual([]);
    }
  });

  it("charges less with the speech switched off", () => {
    const loud = billFor(at({ learners: 10_000 }));
    const quiet = billFor(at({ learners: 10_000, audio: false }));
    expect(quiet.totalUsd).toBeLessThan(loud.totalUsd);
  });
});

describe("the tutor, which is the only line that could run away", () => {
  it("costs nothing on the free models a fresh install uses", () => {
    expect(billFor(at({ learners: 10_000, tutor: "free" })).lines
      .find((l) => l.id === "tutor")!.usd).toBe(0);
  });

  /*
    The app's ledger stops spending at a stated number of dollars a day and has
    no off switch (lib/usage/quota.ts). A funding page that projected the tutor
    past that would be describing an app this is not.
  */
  it("can never be projected past the cap the app itself enforces", () => {
    for (const learners of [1_000, 100_000, 10_000_000]) {
      const tutor = billFor(at({ learners, tutor: "paid" })).lines
        .find((l) => l.id === "tutor")!;
      expect(tutor.usd, `${learners} learners`).toBeLessThanOrEqual(TUTOR_CAP_USD);
    }
  });

  it("reads that cap off the app's own limits rather than a number of its own", () => {
    expect(TUTOR_CAP_USD).toBeCloseTo((DEFAULT_LIMITS.dailyMicrosGlobal / 1e6) * 30.44, 5);
  });

  it("says when the free allowance runs out rather than pretending it is free for ever", () => {
    expect(billFor(at({ learners: 100, tutor: "free" })).freeTutorRunsOut).toBe(false);
    expect(billFor(at({ learners: 100_000, tutor: "free" })).freeTutorRunsOut).toBe(true);
  });

  it("charges nothing and says so when no key is set", () => {
    const bill = billFor(at({ learners: 10_000, tutor: "off" }));
    expect(bill.volume.tutorCalls).toBe(0);
    expect(bill.lines.find((l) => l.id === "tutor")!.usd).toBe(0);
  });
});

describe("the database instance, which is the steepest step", () => {
  it("takes whichever of memory and connections asks for more", () => {
    // A small database with a lot of people on it is a connections problem.
    expect(computeFor(1, 2_500).name).toBe("4XL");
    // A large one with nobody on it is a memory problem.
    expect(computeFor(120, 1).name).toBe("XL");
  });

  it("never runs off the end of the ladder", () => {
    expect(computeFor(100_000, 1_000_000)).toBe(COMPUTE.sizes[COMPUTE.sizes.length - 1]);
  });

  it("climbs the ladder in order and never skips backwards", () => {
    const costs = [1, 10, 100, 1_000, 10_000, 100_000]
      .map((learners) => billFor(at({ learners })))
      .map((b) => computeFor(b.volume.databaseGb, b.volume.peakConcurrent).usd);
    for (let i = 1; i < costs.length; i += 1) expect(costs[i]!).toBeGreaterThanOrEqual(costs[i - 1]!);
  });
});

describe("what a month is made of", () => {
  it("grows the database with the years, because Review is append-only", () => {
    const one = volumeOf(at({ learners: 1_000, years: 1 })).databaseGb;
    const five = volumeOf(at({ learners: 1_000, years: 5 })).databaseGb;
    expect(five).toBeGreaterThan(one * 4);
  });

  it("counts a review as one request and a sitting as several pages", () => {
    const v = volumeOf(at({ learners: 1, sessionsPerWeek: 5, reviewsPerSession: 15 }));
    expect(Math.round(v.reviews)).toBe(326);
    expect(Math.round(v.pageViews)).toBe(130);
  });
});

describe("the speech, which is stored by its content rather than per person", () => {
  it("saturates at the number of things there are to say", () => {
    expect(distinctClips(0)).toBe(0);
    expect(distinctClips(1e9)).toBeLessThanOrEqual(15_000);
    expect(distinctClips(1e9)).toBeGreaterThan(14_900);
  });

  it("counts two learners asking for one word as one file", () => {
    expect(distinctClips(2_000)).toBeLessThan(2_000);
  });
});
