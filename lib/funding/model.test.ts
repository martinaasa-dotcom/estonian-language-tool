import { describe, expect, it } from "vitest";

import {
  ASSUMPTIONS, DEFAULT_SHAPE, MODEL_CAP_USD, SCALE_LADDER, SERVICES,
  billFor, ladderFor, volumeOf, type Shape,
} from "./model";
import {
  COMPUTE, DEVTOOLS, EMAIL, ERRORS, GIVING_BACK, MEASURED, PRICE_REFS, SPEECH_MARKET,
  SUPABASE, TUTOR_MODELS, VERCEL, computeFor, distinctClips,
} from "./facts";
import { DEFAULT_LIMITS } from "@/lib/usage/quota";

const at = (over: Partial<Shape>): Shape => ({ ...DEFAULT_SHAPE, ...over });
const lineFor = (id: string, shape = DEFAULT_SHAPE) =>
  billFor(shape).lines.find((l) => l.service.id === id)!;

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
});

/*
  THE REGISTRY IS THE ONLY LIST.

  What the app runs on, what a reader is told it runs on, and what appears on
  the bill were three lists, and the one certain to go stale is the bill:
  nothing fails when a line is missing from a total, it just comes out lower
  than the truth. These check that the bill is generated from the registry
  rather than assembled beside it, which is what makes adding a tool one edit.
*/
describe("the registry", () => {
  it("gives every service a name, an owner, a failure and a source", () => {
    for (const s of SERVICES) {
      expect(s.who.length, s.id).toBeGreaterThan(2);
      expect(s.does.length, s.id).toBeGreaterThan(20);
      expect(s.whenItIsGone.length, s.id).toBeGreaterThan(20);
      expect(s.ref.source, s.id).toMatch(/^https:\/\//);
    }
    expect(SERVICES.length).toBeGreaterThan(5);
  });

  it("has one bill line per service, always", () => {
    for (const learners of SCALE_LADDER) {
      const bill = billFor(at({ learners }));
      expect(bill.lines.map((l) => l.service.id)).toEqual(SERVICES.map((s) => s.id));
    }
  });

  it("gives every service exactly one of the three honest answers", () => {
    for (const { service, cost } of billFor(DEFAULT_SHAPE).lines) {
      expect(["charged", "partOf", "notOurs"], service.id).toContain(cost.kind);
      if (cost.kind === "partOf") {
        expect(SERVICES.map((s) => s.id), service.id).toContain(cost.line);
      }
    }
  });

  it("has an entry for the one part nobody here can pay for", () => {
    expect(billFor(DEFAULT_SHAPE).lines.some((l) => l.cost.kind === "notOurs")).toBe(true);
  });
});

/*
  NOTHING IS FREE.

  The rule the page is built on, and the one an innocent-looking change breaks
  most easily: a new service added with a zero, or a free tier reintroduced
  because it happens to fit at small scale.
*/
describe("nothing is counted as free", () => {
  it("charges for every service that is switched on and bills its own use", () => {
    for (const learners of SCALE_LADDER) {
      for (const { service, cost } of billFor(at({ learners })).lines) {
        if (cost.kind !== "charged") continue;
        expect(cost.usd, `${service.id} at ${learners} learners`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps no free tier for either paid platform", () => {
    expect(Object.keys(VERCEL)).not.toContain("hobby");
    expect(Object.keys(SUPABASE)).not.toContain("free");
  });

  it("puts a floor under the bill that one learner already pays in full", () => {
    const floor = VERCEL.pro.baseUsd + SUPABASE.pro.baseUsd;
    expect(billFor(at({ learners: 1 })).invoicedUsd).toBeGreaterThan(floor);
  });

  it("prices the two nobody invoices, and says which they are", () => {
    const bill = billFor(at({ learners: 1_000 }));
    const given = bill.lines.filter((l) => l.cost.kind === "charged" && l.cost.notInvoiced);
    expect(given.map((l) => l.service.id).sort()).toEqual(["dictionary", "speech"]);
    expect(bill.notInvoicedUsd).toBeGreaterThan(0);
  });
});

describe("the bill", () => {
  it("adds up, so a reader can check it with their thumb", () => {
    for (const learners of SCALE_LADDER) {
      const bill = billFor(at({ learners }));
      const summed = bill.lines.reduce(
        (s, l) => s + (l.cost.kind === "charged" ? l.cost.usd : 0), 0,
      );
      expect(Math.round(summed * 100) / 100, `${learners} learners`).toBe(bill.totalUsd);
      expect(Math.round((bill.invoicedUsd + bill.notInvoicedUsd) * 100) / 100).toBe(bill.totalUsd);
    }
  });

  it("never gets cheaper in total as more people arrive", () => {
    const totals = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.totalUsd);
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!).toBeGreaterThanOrEqual(totals[i - 1]!);
    }
  });

  /*
    With no free tier the shape is the honest one for a fixed-cost service: two
    base plans and a domain are paid before anybody arrives, so the cost per
    head falls steeply and keeps falling. It is worth asserting because it is
    the claim a funder is entitled to be suspicious of.
  */
  it("costs less per learner at every rung than at the one before it", () => {
    const each = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.perLearnerUsd);
    for (let i = 1; i < each.length; i += 1) {
      expect(each[i]!, `${SCALE_LADDER[i]} learners`).toBeLessThan(each[i - 1]!);
    }
  });

  it("is more than a hundred times cheaper per learner at its best than at its worst", () => {
    const each = ladderFor(DEFAULT_SHAPE).map((r) => r.bill.perLearnerUsd);
    expect(Math.max(...each) / Math.min(...each)).toBeGreaterThan(100);
  });

  it("charges less with the speech switched off", () => {
    expect(billFor(at({ learners: 10_000, audio: false })).totalUsd)
      .toBeLessThan(billFor(at({ learners: 10_000 })).totalUsd);
  });

  it("hands the donated part past the invoiced one at a size worth funding", () => {
    const big = billFor(at({ learners: 100_000 }));
    expect(big.notInvoicedUsd).toBeGreaterThan(big.invoicedUsd);
  });
});

describe("the model, which is the only line that could run away", () => {
  /*
    The app's ledger stops spending at a stated number of dollars a day and has
    no off switch (lib/usage/quota.ts). A funding page that projected past that
    would be describing an app this is not.
  */
  it("can never be projected past the cap the app itself enforces", () => {
    for (const learners of [1_000, 100_000, 10_000_000]) {
      const cost = lineFor("model", at({ learners })).cost;
      expect(cost.kind).toBe("charged");
      if (cost.kind === "charged") expect(cost.usd).toBeLessThanOrEqual(MODEL_CAP_USD);
    }
  });

  it("reads that cap off the app's own limits rather than a number of its own", () => {
    expect(MODEL_CAP_USD).toBeCloseTo((DEFAULT_LIMITS.dailyMicrosGlobal / 1e6) * 30.44, 5);
  });

  it("says when the cap rather than the traffic is what decided the figure", () => {
    expect(billFor(at({ learners: 100 })).modelCapBinds).toBe(false);
    expect(billFor(at({ learners: 100_000 })).modelCapBinds).toBe(true);
  });

  it("charges nothing and says so when no key is set", () => {
    const bill = billFor(at({ learners: 10_000, tutor: "off" }));
    expect(bill.volume.tutorCalls).toBe(0);
    expect(bill.volume.graderCalls).toBe(0);
    const cost = lineFor("model", at({ learners: 10_000, tutor: "off" })).cost;
    if (cost.kind === "charged") expect(cost.usd).toBe(0);
  });
});

describe("speech, which is the fastest-growing line once it is priced", () => {
  it("is priced per character at the published commercial rate", () => {
    const shape = at({ learners: 1_000 });
    const cost = lineFor("speech", shape).cost;
    const expected =
      (volumeOf(shape).spokenCharacters / 1e6) * SPEECH_MARKET.usdPerMillionCharacters;
    if (cost.kind === "charged") expect(cost.usd).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });

  it("outgrows every invoiced line by a hundred thousand learners", () => {
    const bill = billFor(at({ learners: 100_000 }));
    const speech = bill.lines.find((l) => l.service.id === "speech")!.cost;
    const invoiced = bill.lines
      .filter((l) => l.cost.kind === "charged" && !l.cost.notInvoiced)
      .map((l) => (l.cost.kind === "charged" ? l.cost.usd : 0));
    if (speech.kind === "charged") {
      expect(speech.usd).toBeGreaterThan(Math.max(...invoiced));
    }
  });
});

describe("the dictionaries, whose line is a commitment rather than a price", () => {
  it("never falls below the floor, however small the deployment", () => {
    const cost = lineFor("dictionary", at({ learners: 1 })).cost;
    if (cost.kind === "charged") expect(cost.usd).toBe(GIVING_BACK.monthlyFloorUsd);
  });

  it("grows with the use it is giving back for", () => {
    const small = lineFor("dictionary", at({ learners: 1_000 })).cost;
    const large = lineFor("dictionary", at({ learners: 100_000 })).cost;
    if (small.kind === "charged" && large.kind === "charged") {
      expect(large.usd).toBeGreaterThan(small.usd);
    }
  });
});

/*
  THE LINES THE FIRST VERSION FORGOT.

  A funding page is wrong in one direction by default: everything anybody
  forgets makes the number smaller. These three were all missing from the first
  pass, and two of them are among the largest lines on the bill at any size a
  person would actually run.
*/
describe("the lines that are easy to leave out", () => {
  it("bills for the tooling that writes the app, and does not scale it with learners", () => {
    const small = lineFor("devtools", at({ learners: 10 })).cost;
    const large = lineFor("devtools", at({ learners: 100_000 })).cost;
    if (small.kind === "charged" && large.kind === "charged") {
      expect(small.usd).toBe(DEVTOOLS.monthlyUsd);
      expect(large.usd).toBe(small.usd);
    }
  });

  it("bills for the mail that signs somebody in without a Google account", () => {
    const cost = lineFor("email", at({ learners: 10 })).cost;
    if (cost.kind === "charged") expect(cost.usd).toBe(EMAIL.pro.baseUsd);
  });

  it("charges for the mail over the plan's allowance", () => {
    const cost = lineFor("email", at({ learners: 100_000 })).cost;
    if (cost.kind === "charged") expect(cost.usd).toBeGreaterThan(EMAIL.pro.baseUsd);
  });

  it("bills for the error reporting the app already has a variable for", () => {
    const cost = lineFor("errors", at({ learners: 10 })).cost;
    if (cost.kind === "charged") expect(cost.usd).toBe(ERRORS.team.baseUsd);
  });

  /*
    The fixed part is most of the bill at the sizes anybody starts at, which is
    the single most useful thing on this page for somebody deciding whether to
    fund it. It is asserted so that adding a per-learner line cannot quietly
    turn a fixed-cost service into a variable-cost one without somebody noticing.
  */
  it("is mostly fixed cost at the size a real deployment starts at", () => {
    const bill = billFor(at({ learners: 100 }));
    const fixed = ["devtools", "email", "errors", "domain"]
      .map((id) => bill.lines.find((l) => l.service.id === id)!.cost)
      .reduce((sum, c) => sum + (c.kind === "charged" ? c.usd : 0), 0);
    expect(fixed / bill.totalUsd).toBeGreaterThan(0.5);
  });
});

describe("which model answers, which is what funding actually changes", () => {
  it("offers only models the app's own price table knows", () => {
    for (const model of TUTOR_MODELS) {
      const cheap = billFor(at({ learners: 500, tutorModel: model.id })).totalUsd;
      expect(cheap, model.id).toBeGreaterThan(0);
    }
  });

  it("costs more on a better model, in the order the price table has them", () => {
    const totals = TUTOR_MODELS.map(
      (m) => billFor(at({ learners: 500, tutorModel: m.id })).totalUsd,
    );
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!, TUTOR_MODELS[i]!.id).toBeGreaterThan(totals[i - 1]!);
    }
  });

  it("names the model on the line, so the figure can be checked against it", () => {
    const cost = lineFor("model", at({ learners: 100, tutorModel: "claude-haiku-4-5" })).cost;
    if (cost.kind === "charged") expect(cost.plan).toBe("Haiku");
  });
});

describe("the database instance, which is the steepest step", () => {
  it("takes whichever of memory and connections asks for more", () => {
    expect(computeFor(1, 2_500).name).toBe("4XL");
    expect(computeFor(120, 1).name).toBe("XL");
  });

  it("never runs off the end of the ladder", () => {
    expect(computeFor(100_000, 1_000_000)).toBe(COMPUTE.sizes[COMPUTE.sizes.length - 1]);
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

describe("the speech cache, which is keyed by content rather than by person", () => {
  it("saturates at the number of things there are to say", () => {
    expect(distinctClips(0)).toBe(0);
    expect(distinctClips(1e9)).toBeLessThanOrEqual(15_000);
    expect(distinctClips(1e9)).toBeGreaterThan(14_900);
  });

  it("counts two learners asking for one word as one file", () => {
    expect(distinctClips(2_000)).toBeLessThan(2_000);
  });
});
