import { describe, expect, it } from "vitest";
import { SCENES, sceneById } from "./catalogue";
import { BUDGETS, curveballById, type Difficulty } from "./curveballs";
import { PERSONAS, patienceFor, personaById, voicesAreReal } from "./personas";
import { curveballAt, minutesFor, planRun, RECENCY_WINDOW, type Recency } from "./run";

const DOCTOR = sceneById("arsti-aeg")!;
const LEVELS = ["A2", "B1"];

/** The last N runs, as the caller would hand them in. */
function recencyFrom(runs: { persona: string; props: string[]; curveballs: string[] }[]): Recency {
  const last = (n: number) => runs.slice(-n);
  return {
    personas: new Set(last(RECENCY_WINDOW.personas).map((r) => r.persona)),
    props: new Set(last(RECENCY_WINDOW.props).flatMap((r) => r.props)),
    curveballs: new Set(last(RECENCY_WINDOW.curveballs).flatMap((r) => r.curveballs)),
  };
}

describe("the personas", () => {
  it("name a voice the speech route will accept", () => {
    // A voice not on the allowlist is silently swapped for the default, so a
    // typo here would make two personas sound identical and nothing would say so.
    expect(voicesAreReal()).toBe(true);
  });

  it("give every persona an agenda that shows up as something happening", () => {
    for (const persona of PERSONAS) {
      expect(persona.who.length, `${persona.id} is nobody`).toBeGreaterThan(20);
      expect(persona.leans.length, `${persona.id} leans nowhere`).toBeGreaterThan(0);
      for (const id of persona.leans) {
        expect(curveballById(id), `${persona.id} leans on ${id}, which is not a curveball`)
          .toBeDefined();
      }
      expect(personaById(persona.id)?.id).toBe(persona.id);
    }
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
  });

  it("never leaves a beat with no tries at all", () => {
    for (const persona of PERSONAS) {
      for (const beatPatience of [1, 2, 3]) {
        expect(patienceFor(beatPatience, persona), `${persona.id} left a beat unanswerable`)
          .toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("planning a run", () => {
  it("is the same run for the same seed and a different one otherwise", () => {
    const a = planRun(DOCTOR, "abc", "A2", "ordinary");
    const b = planRun(DOCTOR, "abc", "A2", "ordinary");
    expect(a).toEqual(b);

    const shapes = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const run = planRun(DOCTOR, `seed-${i}`, "A2", "ordinary");
      shapes.add(JSON.stringify([
        run.persona.id,
        run.card.props.map((p) => p.value),
        run.curveballs,
      ]));
    }
    expect(shapes.size, "every seed gave the same encounter").toBeGreaterThan(20);
  });

  it("changes with the difficulty and with the level", () => {
    const seed = "same";
    const textbook = planRun(DOCTOR, seed, "A2", "textbook");
    expect(textbook.curveballs, "textbook is not textbook").toEqual([]);
    for (const level of LEVELS) {
      for (const difficulty of Object.keys(BUDGETS) as Difficulty[]) {
        const run = planRun(DOCTOR, seed, level, difficulty);
        const spent = run.curveballs.reduce((n, c) => n + (curveballById(c.id)?.cost ?? 0), 0);
        expect(spent).toBeLessThanOrEqual(BUDGETS[difficulty]);
      }
    }
  });

  it("hands out a card whose every prop the scene declared", () => {
    for (const scene of SCENES) {
      const run = planRun(scene, "x", scene.level, "ordinary");
      expect(run.card.props.map((p) => p.slot)).toEqual(scene.props.map((p) => p.slot));
      expect(run.card.you).toBe(scene.role);
      expect(run.patience).toHaveLength(scene.beats.length);
      for (const one of run.patience) expect(one).toBeGreaterThanOrEqual(1);
    }
  });

  it("draws only curveballs the scene admits, whatever the persona leans on", () => {
    for (const scene of SCENES) {
      for (let i = 0; i < 40; i += 1) {
        const run = planRun(scene, `s${i}`, scene.level, "bad");
        for (const drawn of run.curveballs) {
          expect(scene.curveballs, `${scene.id} drew ${drawn.id}, which it does not admit`)
            .toContain(drawn.id);
        }
      }
    }
  });

  it("lets an agenda be something that happens rather than a label", () => {
    /*
      A persona's leans are a preference and not a filter, so the check is that
      they show up far more often than chance rather than that nothing else
      does. The one following the form draws `their-order`; the brisk one draws
      `faster`. Without the preference these would sit at about one in nine.
    */
    let leaned = 0;
    let total = 0;
    for (let i = 0; i < 200; i += 1) {
      const run = planRun(DOCTOR, `lean-${i}`, "A2", "good");
      for (const drawn of run.curveballs) {
        total += 1;
        if (run.persona.leans.includes(drawn.id)) leaned += 1;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(leaned / total, "the persona's agenda changed nothing").toBeGreaterThan(0.5);
  });

  /*
    §5 PROMISES THREE THINGS AND THEY ARE MEASURED RATHER THAN ASSERTED IN
    PROSE. A run is handed what the last few used, so the memory is derived from
    the append-only log rather than kept as a counter (ADR-014).
  */
  it("does not repeat a prop value inside three runs, or a persona inside three", () => {
    const history: { persona: string; props: string[]; curveballs: string[] }[] = [];
    for (let i = 0; i < 20; i += 1) {
      const run = planRun(DOCTOR, `day-${i}`, "A2", "ordinary", recencyFrom(history));
      const props = run.card.props.map((p) => p.value);

      for (const older of history.slice(-RECENCY_WINDOW.props)) {
        for (const value of props) {
          expect(older.props, `run ${i} repeated the prop ${value}`).not.toContain(value);
        }
      }
      for (const older of history.slice(-RECENCY_WINDOW.personas)) {
        expect(older.persona, `run ${i} met the same person again`).not.toBe(run.persona.id);
      }
      history.push({ persona: run.persona.id, props, curveballs: run.curveballs.map((c) => c.id) });
    }
    expect(history).toHaveLength(20);
  });

  it("does not repeat a curveball inside five, or says it could not help it", () => {
    /*
      THE PROMISE, OR THE SHORTFALL, AND NEVER SILENCE.

      A scene admitting nine curveballs and drawing two a run cannot keep a
      five-run promise once the window fills: after three runs the memory holds
      six of the nine and the draw has to reuse one. §5 is explicit that a pool
      too thin is reported the way `paper.ts` reports a shortfall rather than
      papered over, so `repeats` is what this asserts against. A repeat that
      nothing named would be the quiet cycle the design forbids, and asserting
      the flat promise here would be asserting something no catalog this size
      can do.
    */
    const history: { persona: string; props: string[]; curveballs: string[] }[] = [];
    let reported = 0;
    for (let i = 0; i < 20; i += 1) {
      const run = planRun(DOCTOR, `cb-${i}`, "A2", "good", recencyFrom(history));
      const recent = new Set(history.slice(-RECENCY_WINDOW.curveballs).flatMap((r) => r.curveballs));
      const repeated = run.curveballs.filter((c) => recent.has(c.id));
      if (repeated.length > 0) {
        expect(run.repeats, `run ${i} threw ${repeated[0]!.id} again and said nothing`)
          .toContain("curveball");
        reported += 1;
      } else {
        expect(run.repeats, `run ${i} claimed a shortfall it did not have`)
          .not.toContain("curveball");
      }
      history.push({
        persona: run.persona.id,
        props: run.card.props.map((p) => p.value),
        curveballs: run.curveballs.map((c) => c.id),
      });
    }
    // And the shortfall is real rather than the check never firing.
    expect(reported, "no run ever had to reuse one, so this check proved nothing")
      .toBeGreaterThan(0);
  });

  it("finds the curveball attached to a beat, and none on the first", () => {
    for (let i = 0; i < 40; i += 1) {
      const run = planRun(DOCTOR, `at-${i}`, "A2", "bad");
      expect(curveballAt(run, 0), "a scene ambushed somebody at the door").toBeUndefined();
      for (const drawn of run.curveballs) {
        expect(curveballAt(run, drawn.at)?.id).toBe(drawn.id);
      }
    }
  });

  it("says how long a scene takes, and never says it takes no time", () => {
    for (const scene of SCENES) {
      expect(minutesFor(scene)).toBeGreaterThanOrEqual(3);
      expect(minutesFor(scene)).toBeLessThan(20);
    }
  });
});
