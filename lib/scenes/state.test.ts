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
    satisfiedBy: [],
    slips: [],
    asked: null,
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

describe("waiting", () => {
  it("waits once for the rest of a sentence, and the second fragment in a row spends a try", () => {
    const start = advance(SCENE, startScene(SCENE), evidence("complete"), "Tere!").state;
    const first = advance(SCENE, start, evidence("fragment", [false]), "valu");
    expect(first.response).toBe("wait");
    expect(first.state.patience).toBe(2);
    const second = advance(SCENE, first.state, evidence("fragment", [false]), "valu");
    expect(second.response).not.toBe("wait");
    expect(second.state.patience).toBe(1);
    // And a scene is never held for ever by one word repeated at it.
    let state = second.state;
    for (let i = 0; i < 20 && !isOver(SCENE, state); i += 1) {
      state = advance(SCENE, state, evidence("fragment", [false]), "valu").state;
    }
    expect(isOver(SCENE, state)).toBe(true);
  });
});

describe("a one-word answer said twice", () => {
  it("is taken the second time where it meets the beat, because a person waits once", () => {
    /*
      Asked what is wrong, a learner who says `pea`, is looked at, and says
      `pea` again has answered, and any receptionist takes it. The second
      fragment used to spend a try like a miss and the third ran the beat
      out, over an answer that was the right one.
    */
    const start = advance(SCENE, startScene(SCENE), evidence("complete"), "Tere!").state;
    const first = advance(SCENE, start, evidence("fragment", [true]), "valu");
    expect(first.response).toBe("wait");
    const second = advance(SCENE, first.state, evidence("fragment", [true]), "valu");
    expect(second.response).toBe("answer");
    expect(second.state.done).toContain("reason");
  });

  it("is still a miss the second time where it does not meet the beat", () => {
    const start = advance(SCENE, startScene(SCENE), evidence("complete"), "Tere!").state;
    const first = advance(SCENE, start, evidence("fragment", [false]), "ilm");
    const second = advance(SCENE, first.state, evidence("fragment", [false]), "ilm");
    expect(second.response).not.toBe("answer");
    expect(second.state.done).not.toContain("reason");
  });
});

describe("saying you are not following", () => {
  it("costs nothing the first time, and the other side offers the word", () => {
    const start = startScene(SCENE);
    const { state, response } = advance(SCENE, start, evidence("lost", [false]), "ma ei tea");
    expect(response).toBe("help");
    expect(state.patience, "asking for help cost a try").toBe(2);
    expect(state.beat).toBe(0);
  });

  it("costs a try the second time in a row, so a scene cannot be held for ever by one phrase", () => {
    let state = startScene(SCENE);
    let response;
    ({ state, response } = advance(SCENE, state, evidence("lost", [false]), "ma ei tea"));
    ({ state, response } = advance(SCENE, state, evidence("lost", [false]), "ma ei tea"));
    expect(response).not.toBe("help");
    for (let i = 0; i < 30 && !isOver(SCENE, state); i += 1) {
      ({ state } = advance(SCENE, state, evidence("lost", [false]), "ma ei tea"));
    }
    expect(isOver(SCENE, state)).toBe(true);
  });
});

describe("a curveball echoed at", () => {
  it("is asked again once, and the second echo in a row spends a try", () => {
    const raised = { ...startScene(SCENE), beat: 1, hurdle: { id: "missing-document" as const, beat: 1, tries: 0 } };
    const first = advanceHurdle(SCENE, raised, evidence("echo", [false]), "Kas teil on dokument?");
    expect(first.response).toBe("repeat");
    expect(first.state.hurdle?.tries).toBe(0);
    const second = advanceHurdle(SCENE, first.state, evidence("echo", [false]), "Kas teil on dokument?");
    expect(second.state.hurdle?.tries ?? HURDLE_TRIES).toBeGreaterThan(0);
  });
});

describe("an offer that is turned down", () => {
  const offer = {
    ...SCENE.beats[1]!,
    id: "offer", move: "offer" as const,
    counter: { they: "They offer another time.", replaces: [["time", "time2"]] as const },
  };
  const scene = { ...SCENE, beats: [SCENE.beats[0]!, offer, ...SCENE.beats.slice(2)] };
  const atOffer = { ...startScene(scene), beat: 1, patience: offer.patience };

  it("gets a second offer once, at no cost to patience, and the beat waits", () => {
    const first = advance(scene, atOffer, evidence("declined", [false]), "Ei sobi");
    expect(first.response).toBe("counter");
    expect(first.state.beat).toBe(1);
    expect(first.state.patience).toBe(offer.patience);
    expect(first.state.countered).toEqual(["offer"]);
    expect(first.state.done).not.toContain("offer");
  });

  it("and a second no is the learner saying it will not do, which meets the beat", () => {
    const first = advance(scene, atOffer, evidence("declined", [false]), "Ei sobi");
    const second = advance(scene, first.state, evidence("declined", [false]), "Ei");
    expect(second.response).toBe("answer");
    expect(second.state.beat).toBe(2);
    expect(second.state.done).toContain("offer");
  });

  it("a yes to the second offer meets the beat like any other answer", () => {
    const first = advance(scene, atOffer, evidence("declined", [false]), "Ei sobi");
    const yes = advance(scene, first.state, evidence("complete"), "Sobib");
    expect(yes.response).toBe("answer");
    expect(yes.state.done).toContain("offer");
  });

  it("on a beat with nothing else to offer, a no read as declined is an answer", () => {
    const plain = { ...SCENE, beats: [SCENE.beats[0]!, { ...offer, counter: undefined }, ...SCENE.beats.slice(2)] };
    const out = advance(plain, atOffer, evidence("declined", [false]), "Ei");
    expect(out.response).toBe("answer");
    expect(out.state.done).toContain("offer");
  });
});
