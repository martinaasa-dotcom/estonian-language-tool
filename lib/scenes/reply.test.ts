import { describe, expect, it } from "vitest";
import { FALLBACK_PHRASE, REACTIONS } from "./catalogue";
import { fallbackLine, type SpokenLine } from "./line";
import { datumLine, replyFor, reaction, stageFor, wantsFreshLine, type ReplyInput } from "./reply";
import type { RoleCard } from "./props";
import type { BeatSpec } from "./types";

const ASK: BeatSpec = {
  id: "where", goal: "Say where it hurts.", they: "They ask where it hurts.", move: "ask",
  topic: ["pea"], needs: [{ kind: "lemma", oneOf: ["pea"] }],
  required: true, patience: 2, shape: "sentence",
};
const GREET: BeatSpec = { ...ASK, id: "greet", move: "greet", they: "They say hello." };
const OFFER: BeatSpec = {
  ...ASK, id: "offer", move: "offer", they: "They offer you an appointment at {time}.",
  needs: [{ kind: "datum", slot: "time" }],
};

const CARD: RoleCard = {
  you: "You are a patient.",
  props: [{ slot: "time", card: "The time you were given: 14:30", literal: ["14:30"], lemmas: [], value: "14:30" }],
};

const FRESH: SpokenLine = { text: "Kus teil valutab?", provenance: "scripted" };
const NOTHING = fallbackLine(FALLBACK_PHRASE);

function input(over: Partial<ReplyInput> = {}): ReplyInput {
  return {
    beat: ASK, answered: GREET, response: "answer", reading: "complete",
    line: FRESH, heard: "Tere!", card: CARD, translates: false, acknowledges: true, met: 1, hurdle: null,
    ...over,
  };
}

const texts = (lines: readonly SpokenLine[]) => lines.map((l) => l.text);

describe("the opening line", () => {
  it("is the move alone, with no reaction to a turn nobody has taken", () => {
    const lines = replyFor(input({ answered: null, response: null, reading: null, heard: null }));
    expect(lines).toEqual([FRESH]);
  });
});

describe("a turn that landed", () => {
  it("is acknowledged, and then they move on", () => {
    const lines = replyFor(input({ answered: ASK, beat: OFFER, line: FRESH }));
    expect(lines).toHaveLength(2);
    expect(lines[0]?.reaction).toBe(true);
    expect(lines[0]?.provenance).toBe("attested");
    expect(lines[1]).toEqual(FRESH);
  });

  it("is not acknowledged after a greeting, since the next line answers it", () => {
    expect(replyFor(input({ answered: GREET }))).toEqual([FRESH]);
  });

  it("rotates the acknowledgement so the same word does not come back every time", () => {
    const seen = new Set<string>();
    for (let met = 0; met < REACTIONS.acknowledge.length; met += 1) {
      seen.add(replyFor(input({ answered: ASK, met }))[0]!.text);
    }
    expect(seen.size).toBe(REACTIONS.acknowledge.length);
  });

  it("is not acknowledged by a persona who does not, and the move still comes", () => {
    expect(replyFor(input({ answered: ASK, acknowledges: false }))).toEqual([FRESH]);
  });

  it("owes nothing once the scene is over", () => {
    expect(replyFor(input({ beat: undefined, answered: ASK, line: null }))).toEqual([]);
  });

  /*
    THE REPAIR PHRASE IS NEVER PRINTED AT A TURN THAT LANDED. That is the bug
    this module was written against: the ladder had nothing for the next beat
    and the learner was told "I do not understand" about a perfect `Tere`.
  */
  it("never says the repair phrase, whatever the ladder had", () => {
    const lines = replyFor(input({ answered: ASK, line: NOTHING }));
    expect(texts(lines)).not.toContain(FALLBACK_PHRASE);
    expect(lines.at(-1)?.provenance).toBe("unspoken");
    expect(lines.at(-1)?.text).toBe("They ask where it hurts.");
  });
});

describe("a turn nobody could read", () => {
  it("gets the repair phrase and the same question again, not a fresh one", () => {
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "repeat", reading: "unrecognised",
      heard: "Kus teil valutab?", line: null,
    }));
    expect(texts(lines)).toEqual([FALLBACK_PHRASE, "Kus teil valutab?"]);
    expect(lines[0]?.provenance).toBe("fallback");
    expect(lines[0]?.reaction).toBe(true);
    expect(lines[1]?.provenance).toBe("again");
  });

  it("treats their own line handed back the same way", () => {
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "repeat", reading: "echo", heard: "Kus teil valutab?", line: null,
    }));
    expect(lines[0]?.text).toBe(FALLBACK_PHRASE);
  });

  it("falls to the stage direction where there was never an Estonian line to repeat", () => {
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "repeat", reading: "unrecognised", heard: null, line: NOTHING,
    }));
    expect(texts(lines)).toEqual([FALLBACK_PHRASE, "They ask where it hurts."]);
  });

  it("does not want a fresh line from the ladder, so no booking is spent on one", () => {
    expect(wantsFreshLine("repeat", "Kus teil valutab?")).toBe(false);
    expect(wantsFreshLine("repeat", null)).toBe(true);
    expect(wantsFreshLine("answer", "Kus teil valutab?")).toBe(true);
    expect(wantsFreshLine("wait", null)).toBe(false);
  });
});

describe("a turn that was understood and missed the point", () => {
  it("is asked again in other words where the ladder has some", () => {
    const other: SpokenLine = { text: "Kas teil on pea valus?", provenance: "scripted" };
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "narrow", reading: "offtarget", heard: "Kus teil valutab?", line: other,
    }));
    expect(lines).toEqual([other]);
  });

  it("is asked the same question again where it has none", () => {
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "narrow", reading: "incomplete", heard: "Kus teil valutab?", line: NOTHING,
    }));
    expect(lines).toEqual([{ text: "Kus teil valutab?", provenance: "again" }]);
  });

  it("is never told they were not understood", () => {
    for (const reading of ["offtarget", "incomplete"] as const) {
      const lines = replyFor(input({ answered: ASK, beat: ASK, response: "narrow", reading, line: NOTHING }));
      expect(texts(lines)).not.toContain(FALLBACK_PHRASE);
    }
  });
});

describe("one word where a sentence was due", () => {
  it("gets a look and a wait: one word with a question mark, and no new question", () => {
    const lines = replyFor(input({ answered: ASK, beat: ASK, response: "wait", reading: "fragment" }));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toMatch(/^[A-ZÕÄÖÜ][a-zõäöü]+\?$/);
    expect(lines[0]?.reaction).toBe(true);
  });
});

describe("a turn in English", () => {
  it("is answered with the same question in Estonian by a brisk persona", () => {
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "english", reading: "english", heard: "Kus teil valutab?", line: null,
    }));
    expect(lines).toEqual([{ text: "Kus teil valutab?", provenance: "again" }]);
  });

  it("and translated by a helpful one, in English, after the Estonian", () => {
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "english", reading: "english",
      heard: "Kus teil valutab?", line: null, translates: true,
    }));
    expect(texts(lines)).toEqual(["Kus teil valutab?", "They ask where it hurts."]);
    expect(lines[1]?.provenance).toBe("unspoken");
  });
});

describe("running out of patience", () => {
  it("says so in English and moves to the next beat's line, with no acknowledgement", () => {
    const lines = replyFor(input({ answered: ASK, beat: OFFER, response: "moveOn", reading: "offtarget", line: FRESH }));
    expect(lines[0]?.provenance).toBe("unspoken");
    expect(lines[1]).toEqual(FRESH);
    expect(lines.some((l) => l.reaction)).toBe(false);
  });
});

describe("the stage direction", () => {
  it("names the value off the card where the beat's line has to", () => {
    expect(stageFor(OFFER, CARD)).toBe("They offer you an appointment at 14:30.");
  });

  it("leaves the slot visible rather than inventing a value where the card has none", () => {
    expect(stageFor(OFFER, null)).toBe("They offer you an appointment at {time}.");
  });

  it("is English and not offered as Estonian", () => {
    const lines = replyFor(input({ answered: ASK, beat: OFFER, line: NOTHING }));
    const stage = lines.at(-1)!;
    expect(stage.provenance).toBe("unspoken");
    expect(stage.text).toMatch(/^[A-Za-z0-9 ,.:']+$/);
  });
});

describe("a reaction", () => {
  it("is the course's own word, capitalised, with the mark that makes it the move", () => {
    expect(reaction("hästi", ".")).toMatchObject({ text: "Hästi.", provenance: "attested", from: "hästi", reaction: true });
    expect(reaction("jah", "?").text).toBe("Jah?");
  });
});

describe("a line off the card", () => {
  const offers: BeatSpec = { ...OFFER, says: { lemma: "kell", slot: "time" } };

  it("is one course word and the value the card dealt, asked", () => {
    expect(datumLine(offers, CARD)).toMatchObject({ text: "Kell 14:30?", provenance: "attested", from: "kell" });
  });

  it("is nothing where the beat says none or the card holds no such value", () => {
    expect(datumLine(OFFER, CARD)).toBeNull();
    expect(datumLine(offers, null)).toBeNull();
    expect(datumLine({ ...offers, says: { lemma: "kell", slot: "floor" } }, CARD)).toBeNull();
  });
});

describe("a curveball in the way", () => {
  const hurdle: BeatSpec = {
    ...ASK, id: "hurdle:missing-document", goal: "Say you do not have it.",
    they: "They ask for something you were not given.", needs: [{ kind: "negation" }],
  };

  it("is what they say instead of the beat, in Estonian where a line was built", () => {
    const line: SpokenLine = { text: "Kas teil on dokument kaasas?", provenance: "scripted" };
    const lines = replyFor(input({ answered: ASK, hurdle: { beat: hurdle, line } }));
    expect(lines.at(-1)).toEqual(line);
    expect(texts(lines)).not.toContain(FRESH.text);
  });

  it("and in English as a stage direction where none was", () => {
    const lines = replyFor(input({ answered: ASK, hurdle: { beat: hurdle, line: null } }));
    expect(lines.at(-1)).toMatchObject({ provenance: "unspoken", text: "They ask for something you were not given." });
  });

  it("is said in English, as a line, where the curveball is the switch to English", () => {
    const lines = replyFor(input({ answered: ASK, hurdle: { beat: hurdle, line: null, said: "Sorry, what was that?" } }));
    expect(lines.at(-1)).toEqual({ text: "Sorry, what was that?", provenance: "english" });
  });
});
