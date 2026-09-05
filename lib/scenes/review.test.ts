import { describe, expect, it } from "vitest";
import { reviewOf } from "./review";
import { startScene, type SceneState, type TurnRecord } from "./state";
import type { Slip } from "./turn";
import type { SceneSpec } from "./types";

const SCENE: SceneSpec = {
  id: "fixture", title: "A fixture", place: "Nowhere", level: "A2",
  tests: "keha-ja-tervis", units: ["tervitused"], register: "teie",
  role: "You are somebody, and it is not you.", props: [], curveballs: [],
  beats: [
    {
      id: "reason", goal: "Say what is wrong.", they: "They ask.", move: "ask", topic: ["valu"],
      needs: [{ kind: "lemma", oneOf: ["valu"] }], required: true, patience: 2, shape: "word",
    },
    {
      id: "where", goal: "Say where it hurts.", they: "They ask.", move: "ask", topic: ["pea"],
      needs: [{ kind: "case", lemma: "pea", grammCase: "INESSIVE" }], required: true, patience: 2, shape: "word",
    },
  ],
  outcomes: [{ id: "done", when: ["reason", "where"], says: "Done." }, { id: "left", when: [], says: "You left." }],
};

function turn(over: Partial<TurnRecord> = {}): TurnRecord {
  return { beatId: "reason", said: "x", reading: "complete", met: [true], helped: false, ...over };
}

function state(turns: TurnRecord[], done: string[] = ["reason", "where"]): SceneState {
  return { ...startScene(SCENE), turns, done };
}

const CASE_SLIP: Slip = { kind: "case", said: "pea", form: "peas", lemma: "pea", grammCase: "INESSIVE" };

describe("the review of a conversation", () => {
  it("leads on being understood, because that is the sentence somebody takes away", () => {
    const review = reviewOf(SCENE, state([turn(), turn(), turn()]));
    expect(review.lead).toMatch(/understood/);
    expect(review.lead).not.toMatch(/wrong|mistake|error/i);
  });

  it("counts turns the other side acted on, and not the ones it waited through", () => {
    const review = reviewOf(SCENE, state([turn(), turn({ reading: "fragment" }), turn({ reading: "echo" })]));
    expect(review.lead).toContain("The one thing you said");
  });

  it("says nothing came out wrong where nothing did", () => {
    expect(reviewOf(SCENE, state([turn(), turn()])).notes).toEqual([]);
  });

  it("names the case that came out as something else, the way a class names it", () => {
    const review = reviewOf(SCENE, state([turn({ slips: [CASE_SLIP] })]));
    const note = review.notes.find((n) => n.id === "case:INESSIVE");
    expect(note?.heading).toContain("seesütlev");
    // And the question it is taught by, which is what a learner will hear.
    expect(note?.heading).toContain("kus?");
    expect(note?.evidence).toEqual([{ said: "pea", form: "peas" }]);
  });

  it("ranks the case somebody got wrong most often first", () => {
    const other: Slip = { kind: "case", said: "pea", form: "peast", lemma: "pea", grammCase: "ELATIVE" };
    const review = reviewOf(SCENE, state([
      turn({ slips: [CASE_SLIP] }), turn({ slips: [CASE_SLIP] }), turn({ slips: [other] }),
    ]));
    expect(review.notes[0]?.id).toBe("case:INESSIVE");
    expect(review.notes[1]?.id).toBe("case:ELATIVE");
  });

  it("states the one rule that gets five forms for the price of one", () => {
    const slip: Slip = { kind: "person", said: "tulema", form: "tulen", lemma: "tulema" };
    const note = reviewOf(SCENE, state([turn({ slips: [slip] })])).notes.find((n) => n.id === "person");
    expect(note?.body).toContain("first");
    expect(note?.evidence).toEqual([{ said: "tulema", form: "tulen" }]);
  });

  it("names what was left undone, in the beat's own words", () => {
    const note = reviewOf(SCENE, state([turn()], ["reason"])).notes.find((n) => n.id === "missed");
    expect(note?.body).toContain("Say where it hurts.");
  });

  it("counts a turn in English without a word against it", () => {
    const note = reviewOf(SCENE, state([turn({ reading: "english" })])).notes.find((n) => n.id === "english");
    expect(note?.heading).toBe("One turn in English");
    expect(note?.body).not.toMatch(/should|must|avoid/i);
  });

  /*
    Every Estonian character in a review is the learner's own word or the
    dictionary's recast, and the case names are read off `CASES`. The body of
    a note is English about Estonian, which is `lib/estonian/grammar.ts`'s own
    standing.
  */
  it("puts no Estonian in a note's body", () => {
    const slips: Slip[] = [
      CASE_SLIP,
      { kind: "person", said: "tulema", form: "tulen", lemma: "tulema" },
      { kind: "form", said: "valudeks", form: "valusid", lemma: "valu" },
      { kind: "spelling", said: "korvas", form: "kõrvas", lemma: "kõrv" },
    ];
    const review = reviewOf(SCENE, state([turn({ slips })]));
    expect(review.notes.length).toBeGreaterThan(3);
    for (const note of review.notes) {
      expect(note.body, note.id).not.toMatch(/[õäöüšž]/i);
    }
  });

  it("says something kind and true about a run where nothing was said", () => {
    const review = reviewOf(SCENE, state([], []));
    expect(review.lead).toBeTruthy();
    expect(review.notes.some((n) => n.id === "missed")).toBe(true);
  });
});
