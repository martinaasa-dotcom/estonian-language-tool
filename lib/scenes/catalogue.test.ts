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
import { FALLBACK_PHRASE, SCENES, sceneById } from "./catalogue";
import { curveballById } from "./curveballs";
import { LEFT_OUTCOME, QUESTION_SHAPE } from "./types";
import { unitById } from "@/lib/collections/syllabus";

/** Every lemma a scene names, from its beats' topics and its requirements. */
function lemmasOf(scene: (typeof SCENES)[number]): string[] {
  const out: string[] = [];
  for (const beat of scene.beats) {
    out.push(...beat.topic);
    for (const need of beat.needs) {
      if (need.kind === "lemma") out.push(...need.oneOf);
      if (need.kind === "case") out.push(need.lemma);
    }
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

  /*
    THE OUTCOME LIST IS WHERE A SCENE STOPS BEING A DRILL.

    Three rules, and the middle one is the one worth having. Every `when` names
    beats the scene actually has, or an outcome is unreachable and nobody finds
    out. Every scene has at least one outcome that is **not the learner's
    fault**, because a real encounter has those and a module where trying hard
    enough always works has stopped simulating anything: the test for it is an
    outcome reachable without every required beat, which is exactly what "you
    did most of it and it still did not come off" is. And every scene lets
    somebody leave, because leaving is a real option in a real conversation.

    Fullest first, because `outcomeOf` takes the first that fits: a list in the
    other order would hand everybody the thinnest ending they qualified for.
  */
  it("can end well, can end badly through nobody's fault, and can be walked out of", () => {
    for (const scene of SCENES) {
      const beats = new Set(scene.beats.map((b) => b.id));
      const required = scene.beats.filter((b) => b.required).map((b) => b.id);

      for (const outcome of scene.outcomes) {
        for (const id of outcome.when) {
          expect(beats, `${scene.id}/${outcome.id} waits on a beat that is not there`)
            .toContain(id);
        }
        expect(outcome.says.length, `${scene.id}/${outcome.id} says nothing`).toBeGreaterThan(10);
      }

      const ids = scene.outcomes.map((o) => o.id);
      expect(new Set(ids).size, `${scene.id} repeats an outcome id`).toBe(ids.length);
      expect(ids, `${scene.id} cannot be walked out of`).toContain(LEFT_OUTCOME);

      const best = scene.outcomes.find((o) => required.every((id) => o.when.includes(id)));
      expect(best, `${scene.id} has no outcome for doing all of it`).toBeDefined();

      const short = scene.outcomes.filter(
        (o) => o.id !== LEFT_OUTCOME && !required.every((id) => o.when.includes(id)),
      );
      expect(short.length, `${scene.id} always works if you keep trying`).toBeGreaterThan(0);

      const sizes = scene.outcomes.map((o) => o.when.length);
      expect([...sizes].sort((a, b) => b - a), `${scene.id} lists its outcomes thinnest first`)
        .toEqual(sizes);
    }
  });

  /*
    THE CARD IS WHAT MAKES `datum` MARKABLE, so every slot a beat asks for has
    to be a slot the card carries. A beat waiting on a prop nobody drew is a
    beat that can never be met, and it would look exactly like a learner who
    kept getting it wrong.
  */
  it("has a way out every scene's own units teach", () => {
    /*
      The fallback is Estonian, so it is a lemma request like every other word
      in this file: a misspelled one would fail to arrive and the way out would
      be an empty string on somebody's screen. Every scene, because a scene
      that could not say it is a scene with no way out of a failed beat.
    */
    for (const scene of SCENES) {
      const taught = new Set(scene.units.flatMap((id) => unitById(id)?.lemmas ?? []));
      expect(taught, `${scene.id} has no way to say it did not catch that`)
        .toContain(FALLBACK_PHRASE);
    }
  });

  it("hands out a card that answers every datum its beats ask for", () => {
    for (const scene of SCENES) {
      const slots = new Set(scene.props.map((p) => p.slot));
      for (const beat of scene.beats) {
        for (const need of beat.needs) {
          if (need.kind !== "datum") continue;
          expect(slots, `${scene.id}/${beat.id} waits on a prop the card does not carry`)
            .toContain(need.slot);
        }
      }
      expect(new Set(scene.props.map((p) => p.slot)).size, `${scene.id} repeats a prop slot`)
        .toBe(scene.props.length);
      expect(scene.role.length, `${scene.id} hands out no role at all`).toBeGreaterThan(20);
    }
  });

  /*
    A CURVEBALL WITH NO OUT IS A TRAP (§9), and the out has to be sayable
    *inside this scene*: a requirement naming a word the scene's units do not
    teach is difficulty a learner cannot answer, which is a bug in a costume.

    Every out in the catalogue today is a question, a negation, a register or
    `any`, all of which the units in `COMMON` supply for every scene. That is
    why this check is worth writing now rather than when it first fires: it is
    the entry that names a lemma which would break it, and nobody adding one
    would think to look.
  */
  it("admits only curveballs whose way out its own words can say", () => {
    for (const scene of SCENES) {
      const taught = new Set(scene.units.flatMap((id) => unitById(id)?.lemmas ?? []));
      expect(new Set(scene.curveballs).size, `${scene.id} admits one twice`)
        .toBe(scene.curveballs.length);

      for (const id of scene.curveballs) {
        const ball = curveballById(id);
        expect(ball, `${scene.id} admits ${id}, which is not in the catalogue`).toBeDefined();
        for (const need of ball?.needs ?? []) {
          if (need.kind === "lemma") {
            for (const lemma of need.oneOf) {
              expect(taught, `${scene.id} admits ${id}, whose out needs ${lemma}, which it does not teach`)
                .toContain(lemma);
            }
          }
          if (need.kind === "case") {
            expect(taught, `${scene.id} admits ${id}, whose out needs ${need.lemma}, which it does not teach`)
              .toContain(need.lemma);
          }
          if (need.kind === "datum") {
            expect(scene.props.map((p) => p.slot), `${scene.id} admits ${id}, whose out needs a prop it has not drawn`)
              .toContain(need.slot);
          }
        }
      }
    }
  });

  /*
    A CARD THAT POINTS AT SOMETHING HAS TO SHOW IT, and for a while none of
    them did. Six props across three scenes said "the word below" or "the day
    below" and printed nothing below, so a learner could not know whether they
    had been dealt a fever or a sore throat, and the beat that asks for it was
    unanswerable except by guessing. Two of the doctor scene's three props were
    in that state and the third only worked because a time prints itself.

    The fix was the briefing carrying the English of what was dealt, so what
    this holds is the copy that was covering for its absence: a card may not
    tell somebody to read a word off a place, because there is no "below" any
    more, there is the line and the meaning under it.
  */
  it("does not send a learner looking for a word somewhere else on the card", () => {
    for (const scene of SCENES) {
      for (const prop of scene.props) {
        const says = "says" in prop ? prop.says : "";
        expect(says, `${scene.id}'s ${prop.slot} points somewhere instead of saying what it is`)
          .not.toMatch(/\b(below|above|beside|opposite)\b/i);
      }
    }
  });

  /*
    And a word prop names words the scene teaches, which is what makes the
    gloss reachable at all: the briefing looks the drawn lemma up, and a lemma
    no unit of this scene declares comes back with nothing to print, which is
    the unanswerable card again wearing a different cause.
  */
  it("draws its words from the units it declares", () => {
    for (const scene of SCENES) {
      const taught = new Set(scene.units.flatMap((id) => unitById(id)?.lemmas ?? []));
      for (const prop of scene.props) {
        if (prop.kind !== "word" && prop.kind !== "weekday") continue;
        for (const lemma of prop.oneOf) {
          expect(taught, `${scene.id}'s ${prop.slot} can draw ${lemma}, which no unit of it teaches`)
            .toContain(lemma);
        }
      }
    }
  });
});
