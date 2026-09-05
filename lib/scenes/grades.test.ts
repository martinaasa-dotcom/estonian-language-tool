import { describe, expect, it } from "vitest";
import { advance, startScene, type SceneState } from "./state";
import { gradesFor, stalledWords } from "./grades";
import type { Evidence, TurnReading } from "./turn";
import type { SceneSpec } from "./types";

const SCENE: SceneSpec = {
  id: "fixture", title: "A fixture", place: "Nowhere", level: "A2",
  tests: "keha-ja-tervis", units: ["tervitused"], register: "teie",
  role: "You are somebody, and it is not you.", props: [], curveballs: [],
  beats: [
    {
      id: "reason", goal: "Say what is wrong.", they: "They say something.", move: "ask", topic: ["valu"],
      needs: [{ kind: "lemma", oneOf: ["valu", "haigus"] }],
      required: true, patience: 3, shape: "word",
    },
    {
      id: "where", goal: "Say where.", they: "They say something.", move: "ask", topic: ["pea"],
      needs: [{ kind: "case", lemma: "pea", grammCase: "INESSIVE" }],
      required: true, patience: 3, shape: "word",
    },
    {
      id: "close", goal: "Say goodbye.", they: "They say something.", move: "close", topic: ["Head aega!"],
      needs: [{ kind: "question" }],
      required: true, patience: 2, shape: "word",
    },
  ],
  outcomes: [
    { id: "done", when: ["reason", "where", "close"], says: "Done." },
    { id: "left", when: [], says: "You left." },
  ],
};

function evidence(reading: TurnReading, met: readonly boolean[], slips: Evidence["slips"] = []): Evidence {
  return { reading, met, missing: met.flatMap((ok, i) => (ok ? [] : [i])), words: [], matched: [], satisfiedBy: [], slips, asked: null };
}

/** Plays the turns given, in order, and hands back where it got to. */
function play(
  turns: { reading: TurnReading; met: boolean[]; helped?: boolean; slips?: Evidence["slips"] }[],
): SceneState {
  let state = startScene(SCENE);
  for (const turn of turns) {
    ({ state } = advance(SCENE, state, evidence(turn.reading, turn.met, turn.slips), "x", turn.helped));
  }
  return state;
}

describe("what a conversation writes into the review log", () => {
  it("grades a word the beat asked for, Good on the first attempt", () => {
    const grades = gradesFor(SCENE, play([{ reading: "complete", met: [true] }]));
    expect(grades).toEqual([
      { lemma: "valu", grammCase: null, reachedCase: null, rating: 3, beatId: "reason" },
    ]);
  });

  it("grades Hard after a repair, and never Easy", () => {
    const grades = gradesFor(SCENE, play([
      { reading: "incomplete", met: [false] },
      { reading: "complete", met: [true] },
    ]));
    expect(grades[0]?.rating, "a conversation cannot tell easy from lucky").toBe(2);
    for (const grade of grades) expect(grade.rating).toBeLessThan(4);
  });

  it("grades Hard where the word was understood with a slip, and never Again for it", () => {
    /*
      `pood` for `poodi` is the word had and the form not yet: the other side
      understood, so it is not a miss, and the form was not produced, so it
      is not a recall the scheduler should stretch an interval on.
    */
    const grades = gradesFor(SCENE, play([{
      reading: "complete", met: [true],
      slips: [{ kind: "case", said: "valu", form: "valus", lemma: "valu", grammCase: "INESSIVE" }],
    }]));
    expect(grades[0]?.rating).toBe(2);
  });

  it("grades Again where the other side handed the word over unasked", () => {
    /*
      Saying "I do not understand" and being given the word is help, exactly
      as pressing the button is, so the scheduler may not stretch an interval
      on a word it had just supplied.
    */
    const grades = gradesFor(SCENE, play([
      { reading: "lost", met: [false] },
      { reading: "complete", met: [true] },
    ]));
    expect(grades[0]?.rating).toBe(1);
  });

  it("grades Again where the app had to supply the word", () => {
    const grades = gradesFor(SCENE, play([{ reading: "complete", met: [true], helped: true }]));
    expect(grades[0]?.rating).toBe(1);
  });

  it("does not count a fragment or an echo as a repair", () => {
    /*
      Neither cost patience in `advance`, because neither was a turn: a learner
      who answered in one word, was waited at, and then said the sentence has
      not repaired anything.
    */
    const grades = gradesFor(SCENE, play([
      { reading: "fragment", met: [false] },
      { reading: "echo", met: [false] },
      { reading: "complete", met: [true] },
    ]));
    expect(grades[0]?.rating).toBe(3);
  });

  it("carries the case, so the weak-case charts see a conversation too", () => {
    let state = startScene(SCENE);
    ({ state } = advance(SCENE, state, evidence("complete", [true]), "x"));
    ({ state } = advance(SCENE, state, evidence("complete", [true]), "x"));
    const grades = gradesFor(SCENE, state);
    expect(grades).toContainEqual({
      lemma: "pea", grammCase: "INESSIVE", reachedCase: null, rating: 3, beatId: "where",
    });
  });

  /*
    And the case that came back instead travels with it, so the pair somebody
    mixes up at a counter is counted beside the pair they mix up on a card.
  */
  it("carries the case that came back instead, where exactly one case spells it", () => {
    const slip = { kind: "case" as const, said: "peast", form: "peas", lemma: "pea", grammCase: "INESSIVE" as const, reached: "ELATIVE" as const };
    let state = startScene(SCENE);
    ({ state } = advance(SCENE, state, evidence("complete", [true]), "x"));
    ({ state } = advance(SCENE, state, evidence("complete", [true], [slip]), "x"));
    const grades = gradesFor(SCENE, state);
    expect(grades.find((g) => g.lemma === "pea")?.reachedCase).toBe("ELATIVE");
    // Never the case that was asked for: that is a right answer wearing a confusion's clothes.
    const same = { ...slip, reached: "INESSIVE" as const };
    let other = startScene(SCENE);
    ({ state: other } = advance(SCENE, other, evidence("complete", [true]), "x"));
    ({ state: other } = advance(SCENE, other, evidence("complete", [true], [same]), "x"));
    expect(gradesFor(SCENE, other).find((g) => g.lemma === "pea")?.reachedCase).toBeNull();
  });

  it("writes nothing for a beat that asked for no word", () => {
    let state = startScene(SCENE);
    for (let i = 0; i < 3; i += 1) {
      ({ state } = advance(SCENE, state, evidence("complete", [true]), "x"));
    }
    // `close` asks for a question mark, which is a thing they did and not a
    // word they hold a card for.
    expect(gradesFor(SCENE, state).map((g) => g.beatId)).toEqual(["reason", "where"]);
  });

  it("writes nothing at all for an abandoned run", () => {
    const grades = gradesFor(SCENE, play([
      { reading: "unrecognised", met: [false] },
      { reading: "unrecognised", met: [false] },
    ]));
    expect(grades, "an abandoned scene wrote to the review log").toEqual([]);
  });

  it("grades one row per requirement, not one per word it would have taken", () => {
    // `oneOf` is a choice and the turn does not say which was taken, so a row
    // per candidate would credit a word nobody used.
    const grades = gradesFor(SCENE, play([{ reading: "complete", met: [true] }]));
    expect(grades).toHaveLength(1);
  });
});

describe("the words a run needed and the learner did not have", () => {
  it("names the words of a beat that ran out of patience", () => {
    const state = play([
      { reading: "unrecognised", met: [false] },
      { reading: "unrecognised", met: [false] },
      { reading: "unrecognised", met: [false] },
    ]);
    expect(stalledWords(SCENE, state)).toEqual(["valu", "haigus"]);
  });

  it("says nothing about a beat that was met, or one nobody reached", () => {
    expect(stalledWords(SCENE, play([{ reading: "complete", met: [true] }]))).toEqual([]);
    expect(stalledWords(SCENE, startScene(SCENE))).toEqual([]);
  });

  it("names a few of a beat's words rather than all of them", () => {
    /*
      A `lemma` requirement lists every word that would satisfy it, and for
      "say where it hurts" that is eleven body parts. Writing all of them down
      handed somebody eleven words under a heading saying the conversation had
      needed them, each with a button to put it in their deck. It had needed
      one.
    */
    const wide: SceneSpec = {
      ...SCENE,
      beats: [{
        ...SCENE.beats[0]!,
        needs: [{
          kind: "lemma",
          oneOf: ["pea", "kõrv", "käsi", "jalg", "selg", "silm", "nina", "suu"],
        }],
      }],
    };
    const stalled = stalledWords(wide, play([
      { reading: "unrecognised", met: [false] },
      { reading: "unrecognised", met: [false] },
      { reading: "unrecognised", met: [false] },
    ]));
    expect(stalled.length, "a stalled beat handed over its whole vocabulary")
      .toBeLessThanOrEqual(3);
    // And the head of the list, so what is offered is the beat's own first
    // word rather than whichever three a set happened to iterate.
    expect(stalled[0]).toBe("pea");
  });
});
