import { describe, expect, it } from "vitest";
import { SCENES, sceneById } from "./catalogue";
import { CURVEBALLS, budgetFor, curveballById } from "./curveballs";
import { chooseCurveballs, drawPlan, placeCurveballs } from "./draw";
import { mulberry32 } from "@/lib/random/seeded";

const gloss = (lemma: string) => `<${lemma}>`;

describe("the draw", () => {
  it("is the same for the same seed and different for another", () => {
    const scene = sceneById("arsti-aeg")!;
    const a = drawPlan({ scene, seed: "one", difficulty: 2, glossOf: gloss });
    const b = drawPlan({ scene, seed: "one", difficulty: 2, glossOf: gloss });
    expect(a).toEqual(b);
    const runs = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const p = drawPlan({ scene, seed: `s${i}`, difficulty: 2, glossOf: gloss });
      runs.add(JSON.stringify([p.persona, p.props.map((x) => x.display), p.curveballs]));
    }
    expect(runs.size).toBeGreaterThan(20);
  });

  it("never spends past the budget and never fires a curveball on the first beat", () => {
    for (const scene of SCENES) {
      for (let d = 0; d <= 3; d++) {
        for (let i = 0; i < 30; i++) {
          const plan = drawPlan({ scene, seed: `s${i}`, difficulty: d, glossOf: gloss });
          const spent = plan.curveballs.reduce((n, id) => n + (curveballById(id)?.cost ?? 0), 0);
          expect(spent).toBeLessThanOrEqual(budgetFor(d));
          expect(plan.beats[0]!.curveball).toBeNull();
          expect(plan.beats[0]!.id).toBe(scene.beats[0]!.id);
          // Required beats never move, and every one is still there.
          const required = plan.beats.filter((b) => b.required).map((b) => b.id);
          expect(required).toEqual(scene.beats.filter((b) => b.required).map((b) => b.id));
          if (d === 0) expect(plan.curveballs).toEqual([]);
        }
      }
    }
  });

  it("keeps two curveballs apart and never repeats one", () => {
    const scene = sceneById("ametiasutus")!;
    for (let i = 0; i < 60; i++) {
      const plan = drawPlan({ scene, seed: `s${i}`, difficulty: 3, glossOf: gloss });
      expect(new Set(plan.curveballs).size).toBe(plan.curveballs.length);
      const at = plan.beats.map((b, idx) => (b.curveball ? idx : -1)).filter((x) => x >= 0);
      for (let k = 1; k < at.length; k++) expect(at[k]! - at[k - 1]!).toBeGreaterThanOrEqual(2);
    }
  });

  it("allows at most one cost-3 below Ordinary day", () => {
    const admitted = CURVEBALLS.filter((c) => c.cost === 3);
    for (let i = 0; i < 50; i++) {
      const chosen = chooseCurveballs({ admitted, budget: budgetFor(1), random: mulberry32(i) });
      expect(chosen.filter((c) => c.cost === 3).length).toBeLessThanOrEqual(1);
    }
  });

  it("fills the role card and draws two different times", () => {
    const scene = sceneById("arsti-aeg")!;
    const plan = drawPlan({ scene, seed: "card", difficulty: 2, glossOf: gloss });
    for (const fact of plan.card.facts) expect(fact).not.toMatch(/\{\w+\}/);
    const times = plan.props.filter((p) => p.kind === "clock").map((p) => p.display);
    expect(times).toHaveLength(2);
    expect(times[0]).not.toBe(times[1]);
    const since = plan.props.find((p) => p.slot === "since")!;
    expect(since.lemma).toMatch(/päev$|reede/);
    expect(since.display).toBe(`<${since.lemma}>`);
  });

  it("makes every line quick after a brisk persona, and drops patience after a queue", () => {
    const scene = sceneById("arsti-aeg")!;
    const brisk = scene.personas.find((p) => p.agenda === "brisk")!;
    const placed = placeCurveballs(scene.beats, [curveballById("queue")!], mulberry32(3), brisk);
    expect(placed.fired).toEqual(["queue"]);
    const at = scene.beats.findIndex((b) => scene.beats[0] !== b);
    expect(at).toBeGreaterThan(0);
    // Somewhere after the queue formed, a beat has one less patience than the persona alone gives.
    const after = placed.beats.slice(1);
    expect(after.some((b, i) => b.patience < Math.max(1, scene.beats[i + 1]!.patience - 1) || b.patience === 1)).toBe(true);
  });
});
