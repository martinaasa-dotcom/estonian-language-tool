import { describe, expect, it } from "vitest";
import {
  ANSWERS_FAIR, ANSWERS_GOOD, CONVERSATIONAL_MS, MIN_CASE_REVIEWS, SLOW_MS,
  readSituation, summarise, wordStanding, type Context,
} from "./rungs";
import { SITUATIONS, situationById } from "./situations";
import type { WordEvidence, Tally } from "./evidence";

/**
 * A word's evidence, written in the terms a scenario is: how many times it was
 * recognised, how many produced, at what pace, and whether the last answer
 * held. Everything right unless said otherwise.
 */
function word(over: {
  rec?: number; prod?: number; wrong?: number; ms?: number | null; forms?: number; lastRight?: boolean; days?: number;
} = {}): WordEvidence {
  const rec = over.rec ?? 0;
  const prod = over.prod ?? 0;
  const wrong = over.wrong ?? 0;
  const tally = (asked: number): Tally => ({
    asked,
    right: Math.max(0, asked - wrong),
    medianMs: asked === 0 ? null : over.ms === undefined ? 2_500 : over.ms,
    lastRight: asked === 0 ? null : over.lastRight ?? true,
  });
  return {
    recognise: tally(rec),
    produce: tally(prod),
    formsRight: over.forms ?? (prod >= 3 ? 1 : 0),
    daysSince: rec + prod === 0 ? null : over.days ?? 1,
  };
}

const DOCTOR = situationById("keha-ja-tervis")!;
const HOME = situationById("kodu")!;

/** A context where every word the course names exists, and nothing else is known. */
function context(over: Partial<Context> = {}): Context {
  return {
    evidence: new Map(),
    available: new Set(SITUATIONS.flatMap((s) => s.lemmas)),
    cases: new Map(),
    listening: { placed: null, sittings: 0 },
    ...over,
  };
}

/** Every word of a situation, and its machinery, at one standing. */
function everyWord(situation: typeof DOCTOR, e: WordEvidence, ctx = context()): Context {
  const evidence = new Map(ctx.evidence);
  const lemmas = [
    ...situation.lemmas,
    ...situation.machineryUnits.flatMap((id) => situationById(id)?.lemmas ?? []),
  ];
  for (const lemma of lemmas) evidence.set(lemma, e);
  return { ...ctx, evidence };
}

/** Everything a lead reading asks for beyond the words: cases measured and good, an ear. */
function leadReady(situation: typeof DOCTOR): Context {
  return everyWord(situation, word({ rec: 4, prod: 6, forms: 2 }), context({
    cases: new Map(situation.cases.map((c) => [c, { pct: 90, reviews: MIN_CASE_REVIEWS + 4 }])),
    listening: { placed: "B1", sittings: 1 },
  }));
}

describe("where one word stands", () => {
  it("is unmet with no evidence and met with evidence that cleared nothing", () => {
    expect(wordStanding(undefined)).toBe("unmet");
    expect(wordStanding(word({ rec: 3, wrong: 3 }))).toBe("met");
  });

  it("follows on recognition alone", () => {
    expect(wordStanding(word({ rec: 2 }))).toBe("follow");
  });

  it("never takes part on recognition alone, however much of it there is", () => {
    // THE ONE PROMISE. A hundred flips of a card is still following.
    expect(wordStanding(word({ rec: 100 }))).toBe("follow");
  });

  it("takes part once produced right more than once, with the last one right", () => {
    expect(wordStanding(word({ prod: 2 }))).toBe("takePart");
    expect(wordStanding(word({ prod: 5, lastRight: false }))).toBe("follow");
  });

  it("counts a word produced right once as at least followed, with no recognition card at all", () => {
    expect(wordStanding(word({ prod: 1 }))).toBe("follow");
  });

  it("leads only with variety, or with a lot of the same for a word that has no forms", () => {
    expect(wordStanding(word({ prod: 3, forms: 1 }))).toBe("lead");
    expect(wordStanding(word({ prod: 3, forms: 0 }))).toBe("takePart");
    expect(wordStanding(word({ prod: 4, forms: 0 }))).toBe("lead");
  });
});

describe("a situation, rung by rung", () => {
  it("is unmet when none of its words has come up", () => {
    const r = readSituation(DOCTOR, context());
    expect(r.rung).toBe("unmet");
    expect(r.struggles.map((s) => s.id)).toEqual(["unmet"]);
    expect(r.tryThis).toBeNull();
  });

  it("is lost when a few words are known and most are not", () => {
    const evidence = new Map<string, WordEvidence>();
    for (const lemma of DOCTOR.lemmas.slice(0, 3)) evidence.set(lemma, word({ rec: 3, prod: 3 }));
    const r = readSituation(DOCTOR, context({ evidence }));
    expect(r.rung).toBe("lost");
  });

  it("follows on recognition of every word and offers nothing to try", () => {
    const r = readSituation(DOCTOR, everyWord(DOCTOR, word({ rec: 3 })));
    expect(r.uncapped).toBe("follow");
    expect(r.tryThis).toBeNull();
  });

  it("names the freeze: recognised throughout, produced nowhere", () => {
    const r = readSituation(DOCTOR, everyWord(DOCTOR, word({ rec: 3 })));
    expect(r.struggles.some((s) => s.id === "freeze" && s.blocks === "takePart")).toBe(true);
  });

  it("takes part on reliable production, and then offers the real thing", () => {
    const r = readSituation(DOCTOR, everyWord(DOCTOR, word({ rec: 1, prod: 2, forms: 0 })));
    expect(r.rung).toBe("takePart");
    expect(r.tryThis).toBe(DOCTOR.tryThis);
  });

  it("leads only when everything the encounter leans on is there too", () => {
    expect(readSituation(DOCTOR, leadReady(DOCTOR)).rung).toBe("lead");
  });

  it("holds a live exchange off lead until the ear has been measured", () => {
    const ctx = { ...leadReady(DOCTOR), listening: { placed: null, sittings: 0 } };
    const r = readSituation(DOCTOR, ctx);
    expect(r.rung).toBe("takePart");
    expect(r.struggles.find((s) => s.id === "ear")?.blocks).toBe("lead");
  });

  it("holds a live exchange off lead when listening measured below the situation", () => {
    const ctx = { ...leadReady(DOCTOR), listening: { placed: "A1", sittings: 0 } };
    const r = readSituation(DOCTOR, ctx);
    expect(r.rung).toBe("takePart");
    expect(r.struggles.find((s) => s.id === "ear")?.title).toContain("A1");
  });

  it("does not ask an own-pace situation about the ear or about pace", () => {
    const ctx = { ...leadReady(HOME), listening: { placed: null, sittings: 0 } };
    const r = readSituation(HOME, ctx);
    expect(r.rung).toBe("lead");
    expect(r.struggles.map((s) => s.id)).not.toContain("ear");
    expect(r.struggles.map((s) => s.id)).not.toContain("pace");
  });

  it("holds off lead on pace, and says the seconds", () => {
    const slow = everyWord(DOCTOR, word({ rec: 4, prod: 6, forms: 2, ms: SLOW_MS + 2_000 }), leadReady(DOCTOR));
    const r = readSituation(DOCTOR, slow);
    expect(r.rung).toBe("takePart");
    const pace = r.struggles.find((s) => s.id === "pace")!;
    expect(pace.blocks).toBe("lead");
    expect(pace.title).toMatch(/10 seconds/);
    expect(pace.href).toBe("/review/sprint");

    const steady = everyWord(DOCTOR, word({ rec: 4, prod: 6, forms: 2, ms: CONVERSATIONAL_MS + 1_000 }), leadReady(DOCTOR));
    expect(readSituation(DOCTOR, steady).rung).toBe("takePart");
  });

  it("holds off lead when nothing is timed, rather than assuming", () => {
    const untimed = everyWord(DOCTOR, word({ rec: 4, prod: 6, forms: 2, ms: null }), leadReady(DOCTOR));
    const r = readSituation(DOCTOR, untimed);
    expect(r.rung).toBe("takePart");
    expect(r.struggles.some((s) => s.id === "untimed")).toBe(true);
  });

  it("holds off lead on a case the encounter turns on", () => {
    const ctx = leadReady(DOCTOR);
    const cases = new Map(ctx.cases);
    cases.set("ADESSIVE", { pct: 50, reviews: 20 });
    const r = readSituation(DOCTOR, { ...ctx, cases });
    expect(r.rung).toBe("takePart");
    const c = r.struggles.find((s) => s.id === "case-ADESSIVE")!;
    expect(c.title).toContain("alalütlev");
    expect(c.href).toBe("/grammar/adessive");
  });

  it("holds off lead on a case that has hardly been asked, and says so rather than guessing", () => {
    const ctx = leadReady(DOCTOR);
    const cases = new Map(ctx.cases);
    cases.set("ADESSIVE", { pct: 100, reviews: 2 });
    const r = readSituation(DOCTOR, { ...ctx, cases });
    expect(r.rung).toBe("takePart");
    expect(r.struggles.find((s) => s.id === "case-ADESSIVE")?.title).toContain("hardly been asked");
  });

  it("holds off lead on machinery the encounter runs on", () => {
    const ctx = leadReady(DOCTOR);
    const evidence = new Map(ctx.evidence);
    for (const lemma of situationById("arvud")!.lemmas) evidence.delete(lemma);
    // The doctor scene needs the clock and question words, not numbers; take
    // one it does need away.
    for (const lemma of situationById("kusisonad")!.lemmas) evidence.delete(lemma);
    const r = readSituation(DOCTOR, { ...ctx, evidence });
    expect(r.rung).toBe("takePart");
    expect(r.struggles.find((s) => s.id === "needs-questions")?.href).toBe("/learn/kusisonad");
  });

  it("mentions words that went wrong last time, and words gone stale", () => {
    const shaky = everyWord(DOCTOR, word({ rec: 3, prod: 3, lastRight: false }));
    expect(readSituation(DOCTOR, shaky).struggles.some((s) => s.id === "shaky")).toBe(true);
    const stale = everyWord(DOCTOR, word({ rec: 3, prod: 3, days: 45 }));
    expect(readSituation(DOCTOR, stale).struggles.some((s) => s.id === "stale")).toBe(true);
  });

  it("puts what blocks the next rung first", () => {
    const r = readSituation(DOCTOR, everyWord(DOCTOR, word({ rec: 3, days: 45 })));
    const blocks = r.struggles.map((s) => s.blocks);
    expect(blocks).toEqual([...blocks].sort((a, b) => ["unmet", "lost", "follow", "takePart", "lead"].indexOf(a) - ["unmet", "lost", "follow", "takePart", "lead"].indexOf(b)));
  });
});

describe("thin evidence caps the rung", () => {
  it("says no more than follow under a dozen answers, whatever they were", () => {
    // A situation of four words, each produced right twice: eight answers,
    // every one of them right, and the log still may not say "take part".
    const few = new Set(HOME.lemmas.slice(0, 4));
    const evidence = new Map<string, WordEvidence>();
    for (const lemma of few) evidence.set(lemma, word({ prod: 2, forms: 0 }));
    const r = readSituation(HOME, context({ evidence, available: few }));
    expect(r.answers).toBeLessThan(ANSWERS_FAIR);
    expect(r.uncapped).toBe("takePart");
    expect(r.rung).toBe("follow");
    expect(r.struggles[0]?.id).toBe("evidence");
  });

  it("says no more than take part under forty, and names the cap", () => {
    const few = new Set(HOME.lemmas.slice(0, 6));
    const ctx = leadReady(HOME);
    const evidence = new Map<string, WordEvidence>();
    for (const lemma of few) evidence.set(lemma, word({ prod: 6, forms: 2 }));
    const r = readSituation(HOME, { ...ctx, evidence, available: few });
    expect(r.answers).toBe(36);
    expect(r.answers).toBeLessThan(ANSWERS_GOOD);
    expect(r.uncapped).toBe("lead");
    expect(r.rung).toBe("takePart");
    expect(r.struggles[0]?.id).toBe("evidence");
  });

  it("never lowers the rung when answers are added", () => {
    // Monotone in the count: the same standing on more answers is never read
    // as less, which is what makes "come back in a week" a promise.
    let previous = 0;
    for (const prod of [1, 2, 3, 4, 6, 10]) {
      const ctx = everyWord(HOME, word({ rec: 1, prod, forms: 2 }), leadReady(HOME));
      const r = readSituation(HOME, ctx);
      const rank = ["unmet", "lost", "follow", "takePart", "lead"].indexOf(r.rung);
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe("the summary over a level", () => {
  it("counts situations at a level by rung and lists what is worth trying", () => {
    const readings = SITUATIONS.map((s) =>
      readSituation(s, s.id === DOCTOR.id ? leadReady(DOCTOR) : context()));
    const summary = summarise(readings, "A2");
    expect(summary.total).toBe(SITUATIONS.filter((s) => s.level === "A2").length);
    expect(summary.counts.lead).toBe(1);
    expect(summary.counts.unmet).toBe(summary.total - 1);
    expect(summary.couldTry.map((r) => r.situation.id)).toEqual([DOCTOR.id]);
  });

  it("names the commonest struggle only when it recurs", () => {
    const ctx = context({ evidence: new Map(SITUATIONS.flatMap((s) => s.lemmas).map((l) => [l, word({ rec: 3 })])) });
    const readings = SITUATIONS.map((s) => readSituation(s, ctx));
    const summary = summarise(readings, "A1");
    expect(summary.commonest?.id).toBe("freeze");
    expect(summary.commonest!.times).toBeGreaterThan(1);
  });
});
