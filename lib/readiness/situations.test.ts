import { describe, expect, it } from "vitest";
import { MACHINERY_UNITS, SITUATIONS, SITUATION_FACTS, situationById } from "./situations";
import { SYLLABUS, unitById } from "@/lib/collections/syllabus";
import { CASES } from "@/lib/estonian/cases";
import { findTells } from "@/lib/copy/voice";

/**
 * What the situation table is allowed to say.
 *
 * It is the one authored half of readiness and it is English throughout: a
 * situation names a unit id, a case key and a piece of machinery, never a word,
 * so a typo fails here rather than silently asking about nothing. And every
 * unit has an entry, because a unit that fell through to a default would be
 * wrong in one direction or the other without anybody having decided which.
 */
describe("the situation table", () => {
  it("has an entry for every unit and no entry for anything else", () => {
    const ids = new Set(SYLLABUS.map((u) => u.id));
    for (const id of Object.keys(SITUATION_FACTS)) {
      expect(ids.has(id), `${id} is not a unit`).toBe(true);
    }
    for (const unit of SYLLABUS) {
      expect(SITUATION_FACTS[unit.id], `${unit.id} has no situation facts`).toBeDefined();
    }
    expect(SITUATIONS.length).toBe(SYLLABUS.length);
  });

  it("names cases by their keys", () => {
    const keys = new Set(CASES.map((c) => c.key));
    for (const s of SITUATIONS) {
      for (const key of s.cases) expect(keys.has(key), `${s.id} names ${key}`).toBe(true);
      expect(new Set(s.cases).size, `${s.id} names a case twice`).toBe(s.cases.length);
    }
  });

  it("names machinery by units that exist", () => {
    for (const ids of Object.values(MACHINERY_UNITS)) {
      for (const id of ids) expect(unitById(id), `${id} is not a unit`).toBeDefined();
    }
    for (const s of SITUATIONS) {
      for (const id of s.machineryUnits) expect(unitById(id)).toBeDefined();
      expect(s.machineryUnits).not.toContain(s.id);
    }
  });

  it("carries the course's own claim and its words, never a copy", () => {
    for (const s of SITUATIONS) {
      const unit = unitById(s.id)!;
      expect(s.claim).toBe(unit.canDo);
      expect(s.lemmas).toBe(unit.lemmas);
      expect(s.level).toBe(unit.level);
    }
  });

  it("gives every situation something real to try, in the app's own voice", () => {
    for (const s of SITUATIONS) {
      expect(s.tryThis.length, `${s.id} has no tryThis`).toBeGreaterThan(20);
      expect(s.tryThis.endsWith("."), `${s.id}: tryThis ends without a full stop`).toBe(true);
      expect(findTells(s.tryThis), `${s.id}: tryThis reads as generated`).toEqual([]);
      if (s.expect) {
        expect(s.expect.endsWith("."), `${s.id}: expect ends without a full stop`).toBe(true);
        expect(findTells(s.expect), `${s.id}: expect reads as generated`).toEqual([]);
      }
    }
  });

  it("writes no Estonian: no word with a letter an English keyboard lacks, and no quoted word", () => {
    /*
      The table may name a unit id, which is ASCII by construction, and may
      not name a word. A word with õ, ä, ö, ü, š or ž in it is Estonian for
      certain; a quoted word is the shape a gloss takes when somebody slips
      one in. Neither is a complete test and the second is the one that
      caught a draft of this file.
    */
    for (const s of SITUATIONS) {
      for (const text of [s.tryThis, s.expect ?? ""]) {
        expect(text, `${s.id} writes Estonian`).not.toMatch(/[õäöüšž]/i);
        expect(text, `${s.id} quotes a word`).not.toMatch(/["“”]/);
      }
    }
  });

  it("only gives a live exchange something to expect, and every live exchange something", () => {
    for (const s of SITUATIONS) {
      if (!s.live) expect(s.expect, `${s.id} is not live and expects something`).toBeUndefined();
      // Knowing what is coming is useful before you are ready for it, and it
      // held for all 45 by care alone; a 46th without one would be the first
      // live situation that sends somebody out unwarned.
      else expect(s.expect, `${s.id} is live and expects nothing`).toBeTruthy();
    }
    // And most of the early course is live, which is what the screen is for.
    const a1 = SITUATIONS.filter((s) => s.level === "A1");
    expect(a1.filter((s) => s.live).length).toBeGreaterThan(a1.length / 2);
  });

  it("finds a situation by id", () => {
    expect(situationById("keha-ja-tervis")?.live).toBe(true);
    expect(situationById("no-such-unit")).toBeUndefined();
  });
});
