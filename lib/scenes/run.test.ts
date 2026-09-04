import { describe, expect, it } from "vitest";
import { sceneById } from "./catalogue";
import { debriefOf } from "./debrief";
import { drawPlan } from "./draw";
import { NARRATION, pickAttested, sceneLine } from "./line";
import { advance, askedForHelp, currentBeat, objectives, otherSaid, startRun, walkOut } from "./run";
import type { Evidence } from "./turn";

const scene = sceneById("arsti-aeg")!;
const plan = drawPlan({ scene, seed: "run", difficulty: 0, glossOf: (l) => l });

const complete = (n: number): Evidence => ({
  outcome: "complete", met: Array.from({ length: n }, () => ({ met: true, with: "x" })), recognised: ["x"], unknown: [],
});
const miss: Evidence = { outcome: "unrecognised", met: [{ met: false, with: null }], recognised: [], unknown: ["zz"] };

describe("a run", () => {
  it("moves through the beats on complete turns and finishes on the last", () => {
    let state = startRun(plan);
    let steps = 0;
    while (!state.finished) {
      const beat = currentBeat(state)!;
      state = otherSaid(state, { beatId: beat.id, text: "…", provenance: "narrated", lemma: null, repair: false, quick: false, slow: false });
      const r = advance(state, "ok", complete(beat.needs.length));
      state = r.state;
      steps++;
      if (steps > 30) throw new Error("did not finish");
    }
    expect(Object.values(state.met).every(Boolean)).toBe(true);
    expect(objectives(state).every((o) => o.status === "done")).toBe(true);
    const d = debriefOf(scene, state);
    expect(d.done).toBe(d.of);
    expect(d.outcome).toBe(scene.outcomes[0]!.says);
    expect(d.grades.every((g) => g.rating === 3)).toBe(true);
  });

  it("repairs while patience lasts, then moves on and marks the beat missed", () => {
    let state = startRun(plan);
    const beat = currentBeat(state)!;
    let next = advance(state, "zz", miss);
    expect(next.next.kind).toBe("repair");
    for (let i = 0; i < beat.patience; i++) {
      state = otherSaid(next.state, { beatId: beat.id, text: "…", provenance: "narrated", lemma: null, repair: true, quick: false, slow: false });
      next = advance(state, "zz", miss);
    }
    expect(next.next.kind).toBe("moveOn");
    expect(next.state.met[beat.id]).toBe(false);
    expect(next.state.index).toBe(1);
    const d = debriefOf(scene, next.state);
    expect(d.objectives[0]?.met).toBe(false);
  });

  it("does not spend patience on English or on a repeat, and counts the English", () => {
    const state = startRun(plan);
    const en: Evidence = { ...miss, outcome: "english" };
    const rep: Evidence = { ...miss, outcome: "repeat" };
    let r = advance(state, "sorry what", en);
    expect(r.next.kind).toBe("repair");
    expect(r.state.english).toBe(1);
    r = advance(r.state, "tere", rep);
    expect(r.next.kind).toBe("repair");
    expect(r.state.asked).toBe(0);
  });

  it("writes nothing for a walk-out and everything else it can for a finished run", () => {
    const left = walkOut(startRun(plan));
    const d = debriefOf(scene, left);
    expect(d.grades).toEqual([]);
    expect(d.walkedOut).toBe(true);
    expect(d.outcome).toMatch(/left/);
  });

  it("grades a word the help button supplied as Again, and a repaired one as Hard", () => {
    let state = startRun(plan);
    state = askedForHelp(state, "valu");
    // greet, then reason with one miss then a hit.
    let r = advance(state, "Tere!", complete(1));
    r = advance(r.state, "zz", miss);
    r = advance(r.state, "Mul on valu.", complete(1));
    const d = debriefOf(scene, r.state);
    const valu = d.grades.find((g) => g.lemma === "valu");
    expect(valu?.rating).toBe(1);
    expect(d.gaps.some((g) => g.lemma === "valu" && g.kind === "ASKED")).toBe(true);
    const tere = d.grades.find((g) => g.lemma === "Tere!");
    expect(tere?.rating).toBe(3);
  });

  it("never grades Easy", () => {
    let state = startRun(plan);
    while (!state.finished) state = advance(state, "ok", complete(currentBeat(state)!.needs.length)).state;
    for (const g of debriefOf(scene, state).grades) expect(g.rating).toBeLessThan(4);
  });
});

describe("the line ladder", () => {
  const beat = plan.beats[1]!;
  it("takes an attested line first, avoiding one already said", async () => {
    const lines = [{ text: "A?", lemma: "valu", cefr: "A2" }, { text: "B?", lemma: "valu", cefr: "A2" }];
    const used = new Set(["A?"]);
    expect(pickAttested(lines, used, () => 0)?.text).toBe("B?");
    const spoken = await sceneLine({ beat, sources: { attested: () => lines }, used, random: () => 0, recent: [], repair: null });
    expect(spoken.provenance).toBe("attested");
    expect(spoken.text).toBe("B?");
  });

  it("composes when nothing is recorded, and narrates when that is withheld", async () => {
    const composed = await sceneLine({
      beat, sources: { attested: () => [], compose: async () => "Mis teil viga on?" }, used: new Set(), random: () => 0, recent: [], repair: null,
    });
    expect(composed.provenance).toBe("composed");
    const withheld = await sceneLine({
      beat, sources: { attested: () => [], compose: async () => null }, used: new Set(), random: () => 0, recent: [], repair: null,
    });
    expect(withheld.provenance).toBe("narrated");
    expect(withheld.text).toBe("");
    const keyless = await sceneLine({ beat, sources: { attested: () => [] }, used: new Set(), random: () => 0, recent: [], repair: null });
    expect(keyless.provenance).toBe("narrated");
  });

  it("holds an English line for the curveball that speaks English", async () => {
    const english = { ...beat, english: "Sorry, do you speak English?" };
    const spoken = await sceneLine({ beat: english, sources: { attested: () => [{ text: "X?", lemma: "x", cefr: null }] }, used: new Set(), random: () => 0, recent: [], repair: null });
    expect(spoken.provenance).toBe("english");
  });

  it("narrates every way a turn can fail, in English, and never the success", () => {
    expect(NARRATION.complete).toBe("");
    for (const [k, v] of Object.entries(NARRATION)) {
      if (k === "complete") continue;
      expect(v.length).toBeGreaterThan(5);
      expect(v).not.toMatch(/[õäöüšž]/);
    }
  });
});
