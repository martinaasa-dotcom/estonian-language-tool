import { describe, expect, it } from "vitest";
import {
  CHECKPOINTS, LEVELS, SYLLABUS, checkpointFor, courseWords, isUnitOpen, levelIndex,
  nextUnit, unitById, unitProgress, unitsAtLevel, wordsAtLevel, type Level, type SyllabusUnit,
} from "./index";
import { HARVESTED } from "@/prisma/data/harvested";
import { PHRASES } from "@/prisma/data/other";
import { grammarPoint } from "@/lib/estonian/grammar";

/**
 * The course references the dictionary by lemma, and a typo would silently
 * shrink a unit rather than fail loudly. So the words are checked here against
 * the data the seed actually writes — the harvested set for everything Ekilex
 * has a paradigm for, and the hand-checked phrase list for the greetings, which
 * are not headwords and so cannot be harvested.
 *
 * This is the test that makes the no-Estonian rule mechanical rather than
 * aspirational. A lemma invented in a unit file has nowhere to come from: the
 * harvest would have dropped it, so it is missing here, so this fails.
 */
const SEEDED = new Set<string>([
  ...HARVESTED.map((w) => `${w.lemma}|${w.pos}`),
  ...PHRASES.map((p) => `${p[0]}|PHRASE`),
]);

describe("the course", () => {
  it("runs A1 to C1 with every level populated", () => {
    for (const level of LEVELS) {
      expect(unitsAtLevel(level).length, `${level} has no units`).toBeGreaterThan(0);
    }
  });

  it("has unique unit ids", () => {
    const ids = SYLLABUS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only names words the dictionary actually carries", () => {
    const missing: string[] = [];
    for (const u of SYLLABUS) {
      for (const v of u.vocabulary) {
        if (!SEEDED.has(`${v.lemma}|${v.pos}`)) missing.push(`${u.id}: ${v.lemma} (${v.pos})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("never repeats a word inside one unit", () => {
    for (const u of SYLLABUS) {
      const keys = u.vocabulary.map((v) => `${v.lemma}|${v.pos}`);
      expect(new Set(keys).size, u.id).toBe(keys.length);
    }
  });

  it("keeps every unit to a sitting", () => {
    for (const u of SYLLABUS) {
      expect(u.words.length, u.id).toBeGreaterThanOrEqual(8);
      expect(u.words.length, u.id).toBeLessThanOrEqual(24);
    }
  });

  it("runs from easiest to hardest", () => {
    const levels = SYLLABUS.map((u) => levelIndex(u.level));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("only ever requires a unit that comes earlier", () => {
    // A prerequisite later in the course than the unit needing it is a deadlock:
    // the learner can never open either one first.
    const position = new Map(SYLLABUS.map((u, i) => [u.id, i]));
    for (const [i, u] of SYLLABUS.entries()) {
      for (const req of u.requires) {
        expect(position.has(req), `${u.id} requires unknown unit ${req}`).toBe(true);
        expect(position.get(req)!, `${u.id} requires the later unit ${req}`).toBeLessThan(i);
      }
    }
  });

  it("gives every unit a can-do statement and a grammar point", () => {
    for (const u of SYLLABUS) {
      expect(u.canDo.length, u.id).toBeGreaterThan(20);
      expect(u.grammar.length, u.id).toBeGreaterThan(0);
      expect(u.module.length, u.id).toBeGreaterThan(0);
    }
  });

  it("teaches enough words at every level to be worth the name", () => {
    // The old path had one B2 unit and one C1 unit, 14 words each, and still
    // called itself A1 to C1. A level with a token unit in it is the failure
    // this asserts against.
    for (const level of LEVELS) {
      expect(wordsAtLevel(level).length, `${level} is too thin`).toBeGreaterThanOrEqual(80);
    }
  });

  it("introduces every word exactly once, however many units drill it", () => {
    // A grammar unit reusing vocabulary from an earlier one is deliberate — the
    // object unit teaches a rule with verbs the learner already has. What must
    // not happen is two units both claiming to introduce the same word.
    const introductions = courseWords().map((w) => `${w.lemma}|${w.pos}`);
    expect(new Set(introductions).size).toBe(introductions.length);
  });
});

describe("checkpoints", () => {
  it("has one for every level", () => {
    expect(CHECKPOINTS.map((c) => c.level)).toEqual([...LEVELS]);
    for (const level of LEVELS) expect(checkpointFor(level).level).toBe(level);
  });

  it("asks for reliability rather than perfection", () => {
    for (const c of CHECKPOINTS) {
      expect(c.passMark).toBeGreaterThanOrEqual(70);
      expect(c.passMark).toBeLessThan(100);
      expect(c.questions).toBeGreaterThan(5);
    }
  });
});

describe("unitProgress", () => {
  it("is done only when every word has graduated", () => {
    const p = unitProgress({
      availableLemmas: ["a", "b"],
      startedLemmas: ["a", "b"],
      knownLemmas: ["a", "b"],
    });
    expect(p.state).toBe("done");
    expect(p.pct).toBe(100);
  });

  it("counts a started word as half learned", () => {
    const p = unitProgress({ availableLemmas: ["a", "b"], startedLemmas: ["a"], knownLemmas: [] });
    expect(p.pct).toBe(25);
    expect(p.state).toBe("learning");
  });

  it("locks a unit the dictionary cannot supply", () => {
    const p = unitProgress({ availableLemmas: [], startedLemmas: [], knownLemmas: [] });
    expect(p.state).toBe("locked");
  });
});

const unitOf = (id: string): SyllabusUnit => {
  const u = unitById(id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

describe("what is open to a learner", () => {
  it("never locks anything at or below their own level", () => {
    // The whole point of the placement test: a B1 learner is not made to walk
    // back through eleven A1 units before the app will show them anything.
    const a1 = unitOf("tervitused");
    const b1 = SYLLABUS.find((u) => u.level === "B1" && u.requires.length > 0)!;
    for (const unit of [a1, b1]) {
      expect(isUnitOpen({ unit, doneUnitIds: new Set(), placement: "B1" })).toBe(true);
    }
  });

  it("locks a unit above their level whose prerequisites are unmet", () => {
    const c1 = SYLLABUS.find((u) => u.level === "C1" && u.requires.length > 0)!;
    expect(isUnitOpen({ unit: c1, doneUnitIds: new Set(), placement: "A1" })).toBe(false);
  });

  it("opens it once the prerequisites are done", () => {
    const c1 = SYLLABUS.find((u) => u.level === "C1" && u.requires.length > 0)!;
    const done = new Set(c1.requires);
    expect(isUnitOpen({ unit: c1, doneUnitIds: done, placement: "A1" })).toBe(true);
  });
});

describe("nextUnit", () => {
  const empty = new Set<string>();

  it("starts a beginner at the very beginning", () => {
    expect(nextUnit({ doneUnitIds: empty, startedUnitIds: empty, placement: "A1" })?.id)
      .toBe(SYLLABUS[0]!.id);
  });

  it("starts a placed learner at their own level, not at greetings", () => {
    for (const placement of ["A2", "B1", "B2", "C1"] as Level[]) {
      const next = nextUnit({ doneUnitIds: empty, startedUnitIds: empty, placement });
      expect(next, placement).toBeTruthy();
      expect(levelIndex(next!.level), placement).toBeGreaterThanOrEqual(levelIndex(placement));
    }
  });

  it("prefers finishing something already started over opening something new", () => {
    const started = new Set([unitOf("kodu").id]);
    const next = nextUnit({ doneUnitIds: empty, startedUnitIds: started, placement: "B1" });
    expect(next?.id).toBe("kodu");
  });

  it("runs out honestly when the whole course is done", () => {
    const all = new Set(SYLLABUS.map((u) => u.id));
    expect(nextUnit({ doneUnitIds: all, startedUnitIds: empty, placement: "C1" })).toBeUndefined();
  });
});

describe("the harvested dictionary behind the course", () => {
  it("carries attested sentences for the overwhelming majority of words", () => {
    // The gap-fill, dictation and sentence-building modes are built entirely
    // from these. When this ratio falls, those modes quietly empty out.
    const withUsages = HARVESTED.filter((w) => w.usages.length > 0).length;
    expect(withUsages / HARVESTED.length).toBeGreaterThan(0.9);
  });

  it("holds principal parts, never a derived case", () => {
    // Storing a derived case would create the second source of truth the schema
    // notes forbid. Only the unpredictable forms belong here.
    const allowed = new Set([
      "NOM_SG", "GEN_SG", "PART_SG", "ILL_SG_SHORT", "PART_PL", "GEN_PL",
      "INF_MA", "INF_DA", "PRES_1SG", "PAST_1SG", "PART_TUD",
    ]);
    for (const w of HARVESTED) {
      for (const formType of Object.keys(w.parts)) {
        expect(allowed.has(formType), `${w.lemma}: ${formType}`).toBe(true);
      }
    }
  });

  it("gives every inflecting word the parts its paradigm is derived from", () => {
    for (const w of HARVESTED) {
      if (w.pos === "VERB") {
        for (const p of ["INF_MA", "INF_DA", "PRES_1SG", "PAST_1SG"]) {
          expect(w.parts[p], `${w.lemma} is missing ${p}`).toBeTruthy();
        }
      } else if (w.pos !== "ADVERB") {
        for (const p of ["NOM_SG", "GEN_SG", "PART_SG"]) {
          expect(w.parts[p], `${w.lemma} is missing ${p}`).toBeTruthy();
        }
      }
    }
  });
});

describe("the grammar the course promises", () => {
  it("names only grammar points the reference can actually explain", () => {
    // Before the topic notes existed, a B2 unit could say it taught the
    // impersonal while the app had no page saying what the impersonal was. A
    // course that can only mark an answer wrong is a test with a syllabus
    // attached, so every id a unit names has to resolve to something a learner
    // can go and read.
    const missing: string[] = [];
    for (const u of SYLLABUS) {
      for (const id of u.grammar) {
        if (!grammarPoint(id)) missing.push(`${u.id}: ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("introduces the grammar of a level somewhere in that level", () => {
    // A unit may revisit an earlier point, but a level whose grammar is all
    // borrowed from below is not teaching anything new.
    for (const level of LEVELS) {
      const units = unitsAtLevel(level);
      const points = new Set(units.flatMap((u) => [...u.grammar]));
      expect(points.size, `${level} teaches too little grammar`).toBeGreaterThanOrEqual(4);
    }
  });
});
