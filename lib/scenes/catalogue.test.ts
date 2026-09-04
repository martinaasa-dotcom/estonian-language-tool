/**
 * What a scene file is allowed to say.
 *
 * `docs/21-situations.md` §21 named this as invariant 1 and named it wrongly:
 * "no file under the catalogue contains an Estonian letter", modelled on the
 * tripwire over `lib/estonian/grammar.ts`. Building the catalogue is what
 * showed the rule was incoherent, because a scene has to name the words its
 * beats are about, and a check keyed on `õäöüšž` would allow `valu` and reject
 * `küte`, which is not a distinction about anything.
 *
 * What holds instead is stronger and is what is asserted here: every lemma a
 * scene names is a word one of its own declared units already teaches. A scene
 * cannot introduce vocabulary at all, only point at vocabulary the Ekilex
 * harvest already brought back, so a typo in this catalogue fails here rather
 * than becoming a word the app believes in. That is exactly the standing
 * `lib/collections/syllabus/` has, one layer up: a lemma is a request, and
 * `syllabus.test.ts` fails when the harvest did not honour it.
 */
import { describe, expect, it } from "vitest";
import { SCENES, sceneById } from "./catalogue";
import { curveballById } from "./curveballs";
import { NUMBER_LEMMAS, WEEKDAY_LEMMAS } from "./props";
import { QUESTION_SHAPE } from "./types";
import { VOICES } from "@/lib/audio/voice";
import { LEVELS, unitById } from "@/lib/collections/syllabus";

/**
 * Every lemma a scene names: its beats' topics and requirements, the beats
 * of every curveball it admits, and the words a prop can draw.
 */
function lemmasOf(scene: (typeof SCENES)[number]): string[] {
  const out: string[] = [];
  const beats = [
    ...scene.beats,
    ...scene.curveballs.map((id) => curveballById(id)?.beat).filter((b): b is NonNullable<typeof b> => Boolean(b)),
  ];
  for (const beat of beats) {
    out.push(...beat.topic);
    for (const need of beat.needs) {
      if (need.kind === "lemma") out.push(...need.oneOf);
      if (need.kind === "case") out.push(need.lemma);
    }
  }
  for (const prop of scene.props) {
    if (prop.kind === "weekday") out.push(...WEEKDAY_LEMMAS);
    if (prop.kind === "number") out.push(...NUMBER_LEMMAS);
  }
  return out;
}

describe("the scene catalogue", () => {
  it("has scenes", () => {
    expect(SCENES.length).toBeGreaterThan(0);
    expect(sceneById(SCENES[0]!.id)?.title).toBe(SCENES[0]!.title);
  });

  it("gives every scene a unique id", () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names only units that exist", () => {
    for (const scene of SCENES) {
      for (const id of scene.units) {
        expect(unitById(id), `${scene.id} names unit ${id}`).toBeDefined();
      }
    }
  });

  /*
    The one that matters. A scene may not write Estonian; it may point at
    Estonian the course already teaches, and this is what makes that mechanical
    rather than a promise in a comment.
  */
  it("names only words its own units teach", () => {
    for (const scene of SCENES) {
      const taught = new Set<string>();
      for (const id of scene.units) {
        for (const lemma of unitById(id)?.lemmas ?? []) taught.add(lemma);
      }
      const strangers = [...new Set(lemmasOf(scene))].filter((lemma) => !taught.has(lemma));
      expect(strangers, `${scene.id} names words none of its units teach`).toEqual([]);
    }
  });

  /*
    A scene exists to check one of the course's own claims, so it says which.
    Without this the catalogue drifts into a list of situations somebody thought
    sounded useful, which is the failure mode that has no test.
  */
  it("tests a unit it draws on", () => {
    for (const scene of SCENES) {
      expect(unitById(scene.tests), `${scene.id} tests ${scene.tests}`).toBeDefined();
      expect(scene.units, `${scene.id} tests a unit it does not draw on`).toContain(scene.tests);
      expect(unitById(scene.tests)?.canDo).toBeTruthy();
    }
  });

  it("gives every beat a goal, a known move and a unique id", () => {
    for (const scene of SCENES) {
      const ids = scene.beats.map((b) => b.id);
      expect(new Set(ids).size, `${scene.id} repeats a beat id`).toBe(ids.length);
      for (const beat of scene.beats) {
        expect(beat.goal.length, `${scene.id}/${beat.id} has no goal`).toBeGreaterThan(0);
        expect(QUESTION_SHAPE[beat.move]).toBeDefined();
        expect(beat.topic.length, `${scene.id}/${beat.id} is about nothing`).toBeGreaterThan(0);
        expect(beat.needs.length, `${scene.id}/${beat.id} asks for nothing`).toBeGreaterThan(0);
        expect(beat.patience).toBeGreaterThan(0);
      }
    }
  });

  it("draws only on units at or below its own level", () => {
    for (const scene of SCENES) {
      for (const id of scene.units) {
        const unit = unitById(id)!;
        expect(LEVELS.indexOf(unit.level), `${scene.id} at ${scene.level} leans on ${id} at ${unit.level}`)
          .toBeLessThanOrEqual(LEVELS.indexOf(scene.level));
      }
    }
  });

  it("admits only curveballs the catalogue holds, and gives each a way out its words can say", () => {
    for (const scene of SCENES) {
      for (const id of scene.curveballs) {
        const c = curveballById(id);
        expect(c, `${scene.id} admits an unknown curveball ${id}`).toBeDefined();
        if (c?.beat) expect(c.beat.needs.length, `${id} has no out`).toBeGreaterThan(0);
        if (c && !c.beat) expect(c.effect, `${id} neither speaks nor changes anything`).not.toBeNull();
      }
    }
  });

  it("puts a real voice behind every persona, and no voice twice in one scene", () => {
    const known = new Set(VOICES.map((v) => v.id));
    for (const scene of SCENES) {
      expect(scene.personas.length, `${scene.id} has nobody behind the desk`).toBeGreaterThan(1);
      const voices = scene.personas.map((p) => p.voice);
      for (const v of voices) expect(known.has(v), `${scene.id} names a voice ${v} the service does not have`).toBe(true);
      expect(new Set(voices).size).toBe(voices.length);
    }
  });

  /*
    A role card fact that names a slot the scene does not draw would print
    "{since}" on somebody's screen; a datum requirement over a slot nobody
    draws can never be met.
  */
  it("draws every prop its card and its beats mention", () => {
    for (const scene of SCENES) {
      const slots = new Set(scene.props.map((p) => p.id));
      for (const fact of scene.role.facts) {
        for (const m of fact.matchAll(/\{(\w+)\}/g)) {
          expect(slots.has(m[1]!), `${scene.id} card names {${m[1]}} and draws no such prop`).toBe(true);
        }
      }
      for (const beat of scene.beats) {
        for (const need of beat.needs) {
          if (need.kind === "datum") expect(slots.has(need.slot), `${scene.id}/${beat.id} wants ${need.slot}`).toBe(true);
        }
      }
      for (const id of scene.curveballs) {
        const c = curveballById(id);
        for (const need of c?.beat?.needs ?? []) {
          if (need.kind === "datum") expect(slots.has(need.slot), `${scene.id} admits ${id} and draws no ${need.slot}`).toBe(true);
        }
      }
    }
  });

  /*
    An outcome names required beats, and the last outcome names none, so a
    run that met nothing still ends in a sentence rather than in silence. At
    least one outcome is a failure, because a module where trying always
    works has stopped simulating anything.
  */
  it("can end well and can end badly, and always ends in a sentence", () => {
    for (const scene of SCENES) {
      const required = new Set(scene.beats.filter((b) => b.required).map((b) => b.id));
      expect(scene.outcomes.length).toBeGreaterThan(1);
      for (const o of scene.outcomes) {
        for (const id of o.when) expect(required.has(id), `${scene.id} outcome ${o.id} names ${id}`).toBe(true);
        expect(o.says.length).toBeGreaterThan(0);
      }
      expect(scene.outcomes[scene.outcomes.length - 1]?.when).toEqual([]);
    }
  });

  /*
    A scene that cannot be failed is not a simulation of anything, and one
    without a way in or out is not an encounter. Both ends are required.
  */
  it("opens, closes, and has something to get done", () => {
    for (const scene of SCENES) {
      const first = scene.beats[0];
      const last = scene.beats[scene.beats.length - 1];
      expect(first?.move, `${scene.id} does not open with a greeting`).toBe("greet");
      expect(last?.move, `${scene.id} does not end`).toBe("close");
      expect(scene.beats.filter((b) => b.required).length).toBeGreaterThan(2);
    }
  });
});
