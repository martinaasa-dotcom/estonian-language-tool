import { describe, expect, it } from "vitest";
import { FALLBACK_PHRASE, REACTIONS } from "./catalogue";
import { fallbackLine, type SpokenLine } from "./line";
import { cardInPlay, counterBeat, datumLine, replyFor, reaction, stageFor, wantsFreshLine, type ReplyInput } from "./reply";
import { caseKeyFor, type Lexicon } from "./lexicon";
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
    line: FRESH, heard: "Tere!", card: CARD, translates: false, acknowledges: true, met: 1, hurdle: null, echo: null,
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

  it("rotates the acknowledgment so the same word does not come back every time", () => {
    const seen = new Set<string>();
    for (let met = 0; met < REACTIONS.acknowledge.length; met += 1) {
      seen.add(replyFor(input({ answered: ASK, met }))[0]!.text);
    }
    expect(seen.size).toBe(REACTIONS.acknowledge.length);
  });

  it("is not acknowledged by a persona who does not, and the move still comes", () => {
    expect(replyFor(input({ answered: ASK, acknowledges: false }))).toEqual([FRESH]);
  });

  it("repeats the learner's own word back before moving on, and never a number", () => {
    const lines = replyFor(input({ answered: ASK, echo: "poodi" }));
    expect(lines[0]).toMatchObject({ text: "Poodi.", reaction: true });
    expect(lines[1]).toEqual(FRESH);
    const numeric = replyFor(input({ answered: ASK, echo: "13:30" }));
    expect(numeric[0]?.text).not.toMatch(/\d/);
    const yes = replyFor(input({ answered: ASK, echo: "jah" }));
    expect(yes[0]?.text).not.toBe("Jah.");
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

describe("a word understood with a slip", () => {
  it("is said back put right, and labeled as the learner's word rather than as said again", () => {
    const lines = replyFor(input({ answered: ASK, beat: OFFER, echo: "poodi", recast: true }));
    expect(lines[0]).toEqual({ text: "Poodi.", provenance: "recast", reaction: true });
    expect(lines[1]).toEqual(FRESH);
  });

  it("is said back as the learner's own where nothing slipped", () => {
    const lines = replyFor(input({ answered: ASK, beat: OFFER, echo: "poodi" }));
    expect(lines[0]?.provenance).toBe("again");
  });

  it("is taken up before a narrower re-ask, so the part that landed is not ignored", () => {
    const other: SpokenLine = { text: "Aga millal?", provenance: "scripted" };
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "narrow", reading: "incomplete", echo: "poodi", recast: true, line: other,
    }));
    expect(texts(lines)).toEqual(["Poodi.", "Aga millal?"]);
    expect(lines[0]?.provenance).toBe("recast");
  });

  it("does not add an acknowledgment to a re-ask, since nothing has been settled yet", () => {
    const other: SpokenLine = { text: "Aga millal?", provenance: "scripted" };
    const lines = replyFor(input({
      answered: ASK, beat: ASK, response: "narrow", reading: "incomplete", line: other,
    }));
    expect(lines).toEqual([other]);
  });
});

describe("a question the scene did not anticipate", () => {
  const aside: SpokenLine = { text: "Otse edasi ja siis vasakule.", provenance: "scripted" };

  it("is answered first, and stands in for the echo and the hästi", () => {
    const lines = replyFor(input({ answered: ASK, beat: OFFER, echo: "pea", aside }));
    expect(texts(lines)).toEqual(["Otse edasi ja siis vasakule.", FRESH.text]);
    expect(lines[0]?.reaction).toBe(true);
  });

  it("is answered before a narrower re-ask too", () => {
    const other: SpokenLine = { text: "Kus teil valutab?", provenance: "scripted" };
    const lines = replyFor(input({ answered: ASK, beat: ASK, response: "narrow", reading: "incomplete", aside, line: other }));
    expect(texts(lines)).toEqual([aside.text, other.text]);
  });

  it("is not answered on a turn nobody understood, where the repair phrase is the whole reaction", () => {
    const lines = replyFor(input({ answered: ASK, beat: ASK, response: "repeat", reading: "unrecognised", aside, line: NOTHING }));
    expect(texts(lines)).not.toContain(aside.text);
    expect(texts(lines)).toContain(FALLBACK_PHRASE);
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
  it("says so in English and moves to the next beat's line, with no acknowledgment", () => {
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
  it("is the course's own word, capitalized, with the mark that makes it the move", () => {
    expect(reaction("hästi", ".")).toMatchObject({ text: "Hästi.", provenance: "attested", from: "hästi", reaction: true });
    expect(reaction("jah", "?").text).toBe("Jah?");
  });
});

describe("a line off the card", () => {
  const offers: BeatSpec = { ...OFFER, says: [{ lemma: "kell" }, { slot: "time" }] };

  it("is one course word and the value the card dealt, asked", () => {
    expect(datumLine(offers, CARD)).toMatchObject({ text: "Kell 14:30?", provenance: "attested", from: "kell" });
  });

  it("is nothing where the beat says none or the card holds no such value", () => {
    expect(datumLine(OFFER, CARD)).toBeNull();
    expect(datumLine(offers, null)).toBeNull();
    expect(datumLine({ ...offers, says: [{ lemma: "kell" }, { slot: "floor" }] }, CARD)).toBeNull();
  });

  /*
    The landlord's offer. "When can anybody come?" is answered with a day, and
    the line used to be `Kell 14:00?`, which a learner reported as agreeing to
    nothing in particular. The day is a word the card drew and the form is the
    dictionary's own, read off the lexicon's case table and never built here.
  */
  const withDay: RoleCard = {
    ...CARD,
    props: [...CARD.props, {
      slot: "day", card: "The day they can come.", literal: [], lemmas: ["teisipäev"], value: "teisipäev",
      theirs: true, english: "Tuesday",
    }],
  };
  const lexicon: Lexicon = {
    forms: new Set(), byLemma: new Map(), byCase: new Map(),
    caseForm: new Map([[caseKeyFor("teisipäev", "ADESSIVE"), "teisipäeval"]]),
    folded: new Map(), infinitives: new Map(), persons: new Map(),
  };
  const dated: BeatSpec = {
    ...OFFER,
    they: "They offer {day} next week at {time} and ask whether that works.",
    says: [{ slot: "day", grammCase: "ADESSIVE" }, { lemma: "kell" }, { slot: "time" }],
  };

  it("names the day in the case a day is said in, off the dictionary's own table", () => {
    expect(datumLine(dated, withDay, lexicon)).toMatchObject({ text: "Teisipäeval kell 14:30?", from: "kell" });
  });

  it("is withheld whole rather than said without the day where the table has no form", () => {
    expect(datumLine(dated, withDay)).toBeNull();
    expect(datumLine(dated, withDay, { ...lexicon, caseForm: new Map() })).toBeNull();
  });

  it("and the stage direction says the day in English, never the lemma", () => {
    expect(stageFor(dated, withDay)).toBe("They offer Tuesday next week at 14:30 and ask whether that works.");
  });
});

describe("a turn that asked them something", () => {
  const asksBack: BeatSpec = {
    ...ASK, id: "refuse", move: "refuse", they: "They say nobody can come this week.",
    needs: [{ kind: "question" }],
  };

  it("is answered by the move and never with a yes, since a question has no yes in it", () => {
    const lines = replyFor(input({ answered: asksBack, beat: OFFER, line: FRESH, met: 3 }));
    expect(lines).toEqual([FRESH]);
  });

  it("even where the question was one option among several", () => {
    const either: BeatSpec = { ...asksBack, needs: [{ kind: "anyOf", of: [{ kind: "question" }, { kind: "negation" }] }] };
    expect(replyFor(input({ answered: either, beat: OFFER, line: FRESH, met: 3 }))).toEqual([FRESH]);
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

describe("a second offer", () => {
  const offers: BeatSpec = {
    ...OFFER,
    says: [{ lemma: "kell" }, { slot: "time" }],
    counter: {
      they: "They offer {time2} instead and ask whether that one works.",
      says: [{ lemma: "kell" }, { slot: "time2" }],
      replaces: [["time", "time2"]],
    },
  };
  const card: RoleCard = {
    ...CARD,
    props: [...CARD.props, { slot: "time2", card: "", literal: ["10:00"], lemmas: [], value: "10:00" }],
  };

  it("is spoken as the beat's counter, under an id of its own, off the second slot", () => {
    const second = counterBeat(offers);
    expect(second.id).toBe("offer:counter");
    expect(datumLine(second, card)?.text).toBe("Kell 10:00?");
    expect(stageFor(second, card)).toBe("They offer 10:00 instead and ask whether that one works.");
    expect(counterBeat(OFFER)).toBe(OFFER);
  });

  it("is said fresh and never as the first offer again", () => {
    const line = datumLine(counterBeat(offers), card)!;
    const lines = replyFor(input({ beat: counterBeat(offers), answered: offers, response: "counter", reading: "declined", line, heard: "Kell 14:30?" }));
    expect(texts(lines)).toEqual(["Kell 10:00?"]);
    const none = replyFor(input({ beat: counterBeat(offers), answered: offers, response: "counter", reading: "declined", line: NOTHING, heard: "Kell 14:30?" }));
    expect(none.at(-1)).toMatchObject({ provenance: "unspoken" });
    expect(texts(none)).not.toContain("Kell 14:30?");
  });

  it("stands the second offer's values in for the first on every later line, and leaves the card itself alone", () => {
    const inPlay = cardInPlay(card, [offers], ["offer"])!;
    expect(inPlay.props.find((p) => p.slot === "time")?.value).toBe("10:00");
    expect(card.props.find((p) => p.slot === "time")?.value).toBe("14:30");
    expect(cardInPlay(card, [offers], [])).toBe(card);
    expect(cardInPlay(card, [offers], undefined)).toBe(card);
    expect(datumLine(offers, inPlay)?.text).toBe("Kell 10:00?");
  });
});
