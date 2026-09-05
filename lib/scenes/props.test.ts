import { describe, expect, it } from "vitest";
import { drawCard, drawProp, propBySlot, type PropSpec } from "./props";

function seeded(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 0x1_0000_0000;
  };
}

const WORD: PropSpec = {
  kind: "word", slot: "symptom", oneOf: ["valu", "palavik", "haigus"],
  says: "What is wrong with you today.",
};
const TIME: PropSpec = { kind: "time", slot: "time", from: 9, to: 16 };
const DAY: PropSpec = {
  kind: "weekday", slot: "since", oneOf: ["esmaspäev", "teisipäev", "kolmapäev"],
  says: "It started earlier this week.",
};

describe("the role card", () => {
  it("draws a word off the scene's own list and hands the lemma on to be resolved", () => {
    const drawn = drawProp(WORD, seeded(4));
    expect(WORD.oneOf).toContain(drawn.value);
    expect(drawn.lemmas).toEqual([drawn.value]);
    /*
      No forms here. A prop names a lemma and the caller resolves it against the
      dictionary, which is what keeps this file free of Estonian a lexicographer
      did not write (ADR-005).
    */
    expect(drawn.literal).toEqual([]);
  });

  it("accepts a time the way somebody writes one down", () => {
    const drawn = drawProp(TIME, seeded(11));
    expect(drawn.value).toMatch(/^\d\d:(00|30)$/);
    expect(drawn.literal).toContain(drawn.value);
    expect(drawn.literal).toContain(drawn.value.replace(":", "."));
    expect(drawn.lemmas, "a time reached for a word this module may not write").toEqual([]);
  });

  it("keeps a time inside the window it was given", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const hour = Number(drawProp(TIME, seeded(seed)).value.slice(0, 2));
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(16);
    }
  });

  it("supplies a fictional reference and never asks for a real one", () => {
    const drawn = drawProp({ kind: "code", slot: "ref", says: "Your reference:" }, seeded(2));
    /*
      An identity code typed into a practice app is the one thing this module
      could collect that nobody could ever take back (§3), so the card supplies
      one and its shape is visibly not a real register's.
    */
    expect(drawn.value).toMatch(/^KK-\d{4}$/);
    expect(drawn.card).toContain(drawn.value);
  });

  it("prefers a value the last runs did not use, and draws one anyway when it must", () => {
    const recent = new Set(["valu", "palavik"]);
    let fresh = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      if (!recent.has(drawProp(WORD, seeded(seed), recent).value)) fresh += 1;
    }
    expect(fresh, "the recency rule did nothing").toBe(60);

    // Every candidate seen lately is still a draw rather than an empty card.
    const all = new Set(WORD.oneOf);
    const drawn = drawProp(WORD, seeded(9), all);
    expect(WORD.oneOf).toContain(drawn.value);
  });

  it("is the same card for the same seed", () => {
    const you = "You are booking for yourself.";
    const a = drawCard(you, [WORD, TIME, DAY], seeded(21));
    const b = drawCard(you, [WORD, TIME, DAY], seeded(21));
    expect(a).toEqual(b);
    expect(a.you).toBe(you);
    expect(a.props.map((p) => p.slot)).toEqual(["symptom", "time", "since"]);
  });

  it("gives a different card on a different seed", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      seen.add(JSON.stringify(drawCard("x", [WORD, TIME, DAY], seeded(seed)).props.map((p) => p.value)));
    }
    expect(seen.size, "every run handed out the same card").toBeGreaterThan(10);
  });

  it("finds a prop by the slot a beat names", () => {
    const card = drawCard("x", [WORD, TIME], seeded(5));
    expect(propBySlot(card, "time")?.slot).toBe("time");
    expect(propBySlot(card, "nothing-like-this")).toBeUndefined();
  });

  it("says something on the card for every prop, because the card is what you read", () => {
    const card = drawCard("You are a patient.", [WORD, TIME, DAY], seeded(6));
    for (const prop of card.props) {
      expect(prop.card.length, `${prop.slot} prints nothing on the card`).toBeGreaterThan(5);
    }
  });
});

describe("the other side's facts", () => {
  it("are drawn and stored like the learner's, and marked as theirs so the card never prints them", () => {
    const theirs = drawProp({ ...DAY, slot: "day", theirs: true }, seeded(2));
    expect(theirs.theirs).toBe(true);
    expect(DAY.oneOf).toContain(theirs.value);
    expect(drawProp(DAY, seeded(2)).theirs).toBeUndefined();
  });
});

describe("a second offer's slot", () => {
  it("never repeats the first, whichever seed drew them", () => {
    const specs: PropSpec[] = [TIME, { ...TIME, slot: "time2", differentFrom: "time" }];
    for (let seed = 1; seed < 200; seed += 1) {
      const card = drawCard("you", specs, seeded(seed));
      expect(propBySlot(card, "time2")?.value).not.toBe(propBySlot(card, "time")?.value);
    }
    const days: PropSpec[] = [DAY, { ...DAY, slot: "day2", differentFrom: "since", theirs: true }];
    for (let seed = 1; seed < 100; seed += 1) {
      const card = drawCard("you", days, seeded(seed));
      expect(propBySlot(card, "day2")?.value).not.toBe(propBySlot(card, "since")?.value);
    }
  });
});
