import { describe, expect, it } from "vitest";
import { ERRANDS, errandForDay, outcomeFrom } from "./errands";
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

  it("reads an outcome off the wire as one of three, or nothing", () => {
    expect(outcomeFrom("SWITCHED")).toBe("SWITCHED");
    expect(outcomeFrom("won")).toBeNull();
    expect(outcomeFrom(3)).toBeNull();
  });
});
