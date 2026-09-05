import { describe, expect, it } from "vitest";
import {
  HURDLE_TRIES, advance, advanceHurdle, currentBeat, hurdleBeat, isOver, objectivesOf, outcomeOf,
  raiseHurdle, startScene, walkOut, type Response, type SceneState,
} from "./state";
import type { Evidence, TurnReading } from "./turn";
import type { SceneSpec } from "./types";

/**
 * The machine, against a scene written here rather than one of the three.
 *
 * A fixture because these are questions about the machine and not about any
 * scene: patience, what advances, what an objective is, and what the run came
 * to. `catalogue.test.ts` is where the real three are checked, word by word,
 * against the units they declare.
 *
 * Every lemma is one of the three scenes' own, so this file introduces no
 * vocabulary either.
 */
const SCENE: SceneSpec = {
  id: "fixture", title: "A fixture", place: "Nowhere", level: "A2",
  tests: "keha-ja-tervis", units: ["tervitused"], register: "teie",
  role: "You are somebody, and it is not you.", props: [], curveballs: [],
  beats: [
    {
      id: "greet", goal: "Greet back.", they: "They say something.", move: "greet", topic: ["Tere!"],
      needs: [{ kind: "any" }], required: true, patience: 2, shape: "word",
    },
    {
      id: "reason", goal: "Say what is wrong.", they: "They say something.", move: "ask", topic: ["valu"],
      needs: [{ kind: "lemma", oneOf: ["valu"] }], required: true, patience: 2,
      shape: "sentence",
    },
    {
      id: "chat", goal: "Anything.", they: "They say something.", move: "ask", topic: ["ilm"],
      needs: [{ kind: "any" }], required: false, patience: 1, shape: "word",
    },
  ],
  outcomes: [
    { id: "done", when: ["greet", "reason"], says: "You got it done." },
    { id: "partial", when: ["greet"], says: "You said hello and no more." },
    { id: "left", when: [], says: "You walked out, which is allowed." },
  ],
};

function evidence(reading: TurnReading, met: readonly boolean[] = [true]): Evidence {
  return {
    reading, met,
    missing: met.flatMap((ok, i) => (ok ? [] : [i])),
    words: [],
    matched: [],
  };
}

describe("the scene machine", () => {
  it("starts on the first beat with its patience", () => {
    const state = startScene(SCENE);
    expect(currentBeat(SCENE, state)?.id).toBe("greet");
    expect(state.patience).toBe(2);
    expect(isOver(SCENE, state)).toBe(false);
  });

  it("advances on a complete turn and on nothing else", () => {
    const start = startScene(SCENE);
    const { state, response } = advance(SCENE, start, evidence("complete"), "Tere!");
    expect(response).toBe("answer");
    expect(currentBeat(SCENE, state)?.id).toBe("reason");
    expect(state.done).toEqual(["greet"]);
    // And its patience is the next beat's, not what was left of the last one's.
    expect(state.patience).toBe(2);
  });

  it("spends a try on a turn that missed, and says what kind of miss it was", () => {
    const start = startScene(SCENE);
    const incomplete = advance(SCENE, start, evidence("incomplete", [false]), "Tere");
    expect(incomplete.response).toBe("narrow");
    expect(incomplete.state.patience).toBe(1);
    expect(incomplete.state.beat).toBe(0);

    expect(advance(SCENE, start, evidence("unrecognised", [false]), "x").response).toBe("repeat");
    expect(advance(SCENE, start, evidence("english", [false]), "hello there").response).toBe("english");
  });

  it("spends nothing on a fragment or an echo, because neither was a turn", () => {
    /*
      A one-word answer where a sentence was due gets a look and a wait, and
      their own line handed back gets answered once. Spending patience on
      either would move a learner past a beat for saying too little, which is
      the opposite of what waiting is for.
    */
    const start = startScene(SCENE);
    for (const reading of ["fragment", "echo"] as const) {
      const { state, response } = advance(SCENE, start, evidence(reading, [false]), "valu");
      expect(state.patience, `${reading} cost a try`).toBe(2);
      expect(state.beat).toBe(0);
      expect(response).toBe(reading === "echo" ? "repeat" : "wait");
      expect(state.turns).toHaveLength(1);
    }
  });

  it("moves on when patience runs out, and does not credit the beat for persistence", () => {
    let state = startScene(SCENE);
    let response;
    for (let i = 0; i < 2; i += 1) {
      ({ state, response } = advance(SCENE, state, evidence("unrecognised", [false]), "x"));
    }
    expect(response).toBe("moveOn");
    expect(currentBeat(SCENE, state)?.id).toBe("reason");
    expect(state.done, "an unmet beat was marked done").toEqual([]);
  });

  it("records every turn, whatever it did to the state", () => {
    let state = startScene(SCENE);
    ({ state } = advance(SCENE, state, evidence("fragment", [false]), "valu"));
    ({ state } = advance(SCENE, state, evidence("complete"), "Tere!"));
    expect(state.turns.map((t) => t.reading)).toEqual(["fragment", "complete"]);
    expect(state.turns.every((t) => t.beatId === "greet")).toBe(true);
  });

  it("counts required beats and never a percentage", () => {
    let state = startScene(SCENE);
    ({ state } = advance(SCENE, state, evidence("complete"), "Tere!"));
    const objectives = objectivesOf(SCENE, state);
    expect(objectives.met).toEqual(["greet"]);
    // `chat` is optional, so it is in neither list.
    expect(objectives.missed).toEqual(["reason"]);
  });

  it("ends on the fullest outcome the run reached", () => {
    let state = startScene(SCENE);
    expect(outcomeOf(SCENE, state)?.id, "an empty run claimed an outcome it had not reached")
      .toBe("left");

    ({ state } = advance(SCENE, state, evidence("complete"), "Tere!"));
    expect(outcomeOf(SCENE, state)?.id).toBe("partial");

    ({ state } = advance(SCENE, state, evidence("complete"), "Mul on valu"));
    expect(outcomeOf(SCENE, state)?.id).toBe("done");
  });

  it("lets the learner leave, and the run still has an outcome", () => {
    let state = startScene(SCENE);
    ({ state } = advance(SCENE, state, evidence("complete"), "Tere!"));
    state = walkOut(state);
    expect(isOver(SCENE, state)).toBe(true);
    expect(outcomeOf(SCENE, state)?.id).toBe("left");
    // And nothing more can be advanced afterwards.
    const after = advance(SCENE, state, evidence("complete"), "Mul on valu");
    expect(after.state.turns).toHaveLength(1);
  });

  it("is over once the last beat is past", () => {
    let state = startScene(SCENE);
    for (const said of ["Tere!", "Mul on valu", "Ilus ilm"]) {
      ({ state } = advance(SCENE, state, evidence("complete"), said));
    }
    expect(isOver(SCENE, state)).toBe(true);
    expect(currentBeat(SCENE, state)).toBeUndefined();
  });
});

describe("a curveball in the way", () => {
  const drawn = [{ id: "missing-document", at: 1 }];

  it("is raised when the conversation reaches its beat, and not before", () => {
    const start = raiseHurdle(SCENE, startScene(SCENE), drawn);
    expect(start.hurdle).toBeNull();
    const { state } = advance(SCENE, start, evidence("complete"), "Tere!");
    const raised = raiseHurdle(SCENE, state, drawn);
    expect(raised.hurdle?.id).toBe("missing-document");
    expect(currentBeat(SCENE, raised)?.id, "the beat waits behind it").toBe("reason");
  });

  it("is a beat the marker can read: its way out is the goal and its needs are the curveball's", () => {
    const beat = hurdleBeat({ id: "missing-document", beat: 1, tries: 0 })!;
    expect(beat.goal).toBe("Say you do not have it.");
    expect(beat.needs).toEqual([{ kind: "negation" }]);
    expect(beat.they).toMatch(/not given/);
  });

  it("stands down once dealt with, and is written down as met", () => {
    const raised = { ...startScene(SCENE), beat: 1, hurdle: { id: "missing-document" as const, beat: 1, tries: 0 } };
    const { state, response } = advanceHurdle(SCENE, raised, evidence("complete"), "Mul ei ole.");
    expect(response).toBe("answer");
    expect(state.hurdle).toBeNull();
    expect(state.hurdles).toEqual([{ id: "missing-document", beat: 1, met: true }]);
    expect(currentBeat(SCENE, state)?.id, "the beat is still to be answered").toBe("reason");
  });

  it("is let go after its tries, written down as not met, and costs the beat nothing", () => {
    let state: SceneState = { ...startScene(SCENE), beat: 1, patience: 2, hurdle: { id: "missing-document", beat: 1, tries: 0 } };
    let response: Response | undefined;
    for (let i = 0; i < HURDLE_TRIES; i += 1) {
      ({ state, response } = advanceHurdle(SCENE, state, evidence("offtarget", [false]), "Mul on valu."));
    }
    expect(response).toBe("moveOn");
    expect(state.hurdle).toBeNull();
    expect(state.hurdles).toEqual([{ id: "missing-document", beat: 1, met: false }]);
    expect(state.patience).toBe(2);
  });

  it("is never raised twice on one beat", () => {
    const once = { ...startScene(SCENE), beat: 1, hurdles: [{ id: "missing-document" as const, beat: 1, met: false }] };
    expect(raiseHurdle(SCENE, once, drawn).hurdle).toBeNull();
  });

  it("a silent one takes a try off the beat and asks for nothing", () => {
    const state = raiseHurdle(SCENE, { ...startScene(SCENE), beat: 1, patience: 2 }, [{ id: "queue", at: 1 }]);
    expect(state.hurdle).toBeNull();
    expect(state.patience).toBe(1);
    expect(state.hurdles[0]?.met).toBe(true);
  });
});
