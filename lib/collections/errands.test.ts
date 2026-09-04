import { describe, expect, it } from "vitest";
import { ERRANDS, errandForDay, isConversation, outcomeFrom, OUTCOMES, OUTCOME_LABEL } from "./errands";
import { unitById } from "./syllabus";

describe("errands", () => {
  it("name units of the course and never words", () => {
    for (const e of ERRANDS) {
      expect(unitById(e.unit), `${e.id} names unit ${e.unit}`).toBeDefined();
      expect(e.id).toMatch(/^[a-z]+$/);
      expect(e.says).not.toMatch(/[õäöüšž]/);
    }
    expect(new Set(ERRANDS.map((e) => e.id)).size).toBe(ERRANDS.length);
  });

  it("offers only what the learner has started, and always something", () => {
    const nothing = errandForDay("2026-09-04", new Set());
    expect(nothing.unit).toBe("tervitused");
    const some = new Set(["sook-ja-jook", "aeg"]);
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) seen.add(errandForDay(`2026-09-${String(d).padStart(2, "0")}`, some).id);
    expect(seen.size).toBeGreaterThan(3);
    for (const id of seen) {
      const e = ERRANDS.find((x) => x.id === id)!;
      expect(e.unit === "tervitused" || some.has(e.unit)).toBe(true);
    }
  });

  it("does not repeat an errand two days running", () => {
    const all = new Set(ERRANDS.map((e) => e.unit));
    let last = "";
    for (let d = 1; d <= 28; d++) {
      const id = errandForDay(`2026-10-${String(d).padStart(2, "0")}`, all).id;
      expect(id).not.toBe(last);
      last = id;
    }
  });

  it("counts a conversation as one that happened, and a day with none as neither", () => {
    /*
      The card takes "not yesterday" for an answer, so this is the difference
      between a run of days out there and a run of days somebody was honest
      about. Progress prints both off it.
    */
    expect(isConversation("UNDERSTOOD")).toBe(true);
    expect(isConversation("SWITCHED")).toBe(true);
    expect(isConversation("BAILED")).toBe(false);
    expect(OUTCOMES.filter(isConversation)).toHaveLength(2);
  });

  it("labels the three as answers to a question about yesterday", () => {
    // Not as reports on the errand: the errand is what the card offers when
    // the answer is no, and a label reading "I did not manage it" would be
    // about a task nobody was set.
    for (const o of OUTCOMES) expect(OUTCOME_LABEL[o]).not.toMatch(/errand/i);
    expect(OUTCOME_LABEL.BAILED).toBe("Not yesterday");
  });

  it("reads an outcome off the wire as one of three, or nothing", () => {
    expect(outcomeFrom("SWITCHED")).toBe("SWITCHED");
    expect(outcomeFrom("won")).toBeNull();
    expect(outcomeFrom(3)).toBeNull();
  });
});
