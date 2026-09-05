import { describe, expect, it } from "vitest";
import { BUDGETS, CURVEBALLS, curveballById, drawCurveballs, type CurveballId } from "./curveballs";

/** A generator with no clock and no `Math.random` in it, so a draw is a fact. */
function seeded(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 0x1_0000_0000;
  };
}

const ALL = CURVEBALLS.map((c) => c.id);

describe("the curveball catalog", () => {
  it("gives every entry a cost, a way out, and a way to mark the way out", () => {
    for (const ball of CURVEBALLS) {
      expect(ball.cost, `${ball.id} is free`).toBeGreaterThan(0);
      expect(ball.says.length, `${ball.id} says nothing`).toBeGreaterThan(10);
      expect(ball.out.length, `${ball.id} has no way out, which is a trap`).toBeGreaterThan(5);
      /*
        A curveball a learner cannot answer is not difficulty, it is a bug in a
        costume. The one exception is the queue, whose whole effect is one
        number and no words, and `silent` is what says that is deliberate
        rather than a missing out.
      */
      if (!ball.silent) {
        expect(ball.needs.length, `${ball.id} cannot be answered`).toBeGreaterThan(0);
      }
    }
  });

  it("has one entry per id and no id without an entry", () => {
    expect(new Set(ALL).size).toBe(CURVEBALLS.length);
    for (const id of ALL) expect(curveballById(id)?.id).toBe(id);
  });
});

describe("the draw", () => {
  it("never puts one on the first beat, because hello is answered", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const drawn = drawCurveballs(ALL, 8, BUDGETS.bad, "B1", seeded(seed));
      for (const one of drawn) {
        expect(one.at, "a scene ambushed somebody at the door").toBeGreaterThan(0);
      }
    }
  });

  it("spends no more than the budget, and textbook spends nothing", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const [name, budget] of Object.entries(BUDGETS)) {
        const drawn = drawCurveballs(ALL, 8, budget, "B1", seeded(seed));
        const spent = drawn.reduce((n, one) => n + (curveballById(one.id)?.cost ?? 0), 0);
        expect(spent, `${name} overspent on seed ${seed}`).toBeLessThanOrEqual(budget);
      }
      expect(drawCurveballs(ALL, 8, BUDGETS.textbook, "B1", seeded(seed))).toEqual([]);
    }
  });

  it("draws no two of a kind and keeps them apart", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const drawn = drawCurveballs(ALL, 10, BUDGETS.bad, "B1", seeded(seed));
      const ids = drawn.map((d) => d.id);
      expect(new Set(ids).size, `seed ${seed} drew the same one twice`).toBe(ids.length);
      for (let i = 1; i < drawn.length; i += 1) {
        expect(drawn[i]!.at - drawn[i - 1]!.at, `seed ${seed} stacked two on top of each other`)
          .toBeGreaterThan(2);
      }
    }
  });

  it("keeps the step to Ordinary day a step rather than a cliff", () => {
    // At most one expensive one below Ordinary, which is what stops Good day
    // being a bad day with a smaller number on it.
    for (let seed = 1; seed <= 60; seed += 1) {
      const drawn = drawCurveballs(ALL, 10, BUDGETS.good, "B1", seeded(seed));
      const dear = drawn.filter((d) => (curveballById(d.id)?.cost ?? 0) >= 3).length;
      expect(dear, `seed ${seed} put two hard ones in a good day`).toBeLessThanOrEqual(1);
    }
  });

  it("holds the B2 one back below B2", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const low = drawCurveballs(ALL, 10, BUDGETS.bad, "A2", seeded(seed)).map((d) => d.id);
      expect(low, `seed ${seed} contradicted an A2 learner`).not.toContain("contradiction");
    }
    const high = new Set<CurveballId>();
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const one of drawCurveballs(ALL, 10, BUDGETS.bad, "B2", seeded(seed))) high.add(one.id);
    }
    expect(high, "the B2 one is never drawn at B2 either").toContain("contradiction");
  });

  it("draws only what the scene admits", () => {
    const admits: CurveballId[] = ["small-talk", "queue"];
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const one of drawCurveballs(admits, 10, BUDGETS.bad, "B1", seeded(seed))) {
        expect(admits, `seed ${seed} drew one the scene does not admit`).toContain(one.id);
      }
    }
  });

  it("is the same draw for the same seed and a different one otherwise", () => {
    const a = drawCurveballs(ALL, 8, BUDGETS.ordinary, "B1", seeded(7));
    const b = drawCurveballs(ALL, 8, BUDGETS.ordinary, "B1", seeded(7));
    expect(a).toEqual(b);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      seen.add(JSON.stringify(drawCurveballs(ALL, 8, BUDGETS.ordinary, "B1", seeded(seed))));
    }
    expect(seen.size, "every seed gave the same conversation").toBeGreaterThan(5);
  });

  it("prefers one the last runs did not have", () => {
    /*
      §5 promises no curveball repeats within five runs, and the promise is
      kept by preference rather than by refusing to draw: a catalog thinner
      than the window is a fact about the catalog and not a reason for a run
      to have nothing in it.
    */
    const recent = new Set(["small-talk", "queue", "faster"]);
    let fresh = 0;
    let total = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const one of drawCurveballs(ALL, 10, BUDGETS.good, "B1", seeded(seed), recent)) {
        total += 1;
        if (!recent.has(one.id)) fresh += 1;
      }
    }
    expect(total).toBeGreaterThan(20);
    expect(fresh / total, "the recency preference did nothing").toBeGreaterThan(0.9);
  });

  it("places nothing it cannot fit, rather than crowding a short scene", () => {
    const drawn = drawCurveballs(ALL, 2, BUDGETS.bad, "B1", seeded(3));
    expect(drawn.length).toBeLessThanOrEqual(1);
    for (const one of drawn) expect(one.at).toBe(1);
  });
});
