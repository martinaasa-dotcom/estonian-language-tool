import { describe, expect, it } from "vitest";
import { buildSystemPrompt, learnerNote } from "./prompt";

/**
 * What Anu is told about the person asking, and what she is not.
 *
 * The note is the one place a learner's own figures reach the model, so it
 * has to name the case the way a class does, carry the numbers exactly, and
 * say nothing at all when there is nothing worth saying: an empty note is
 * the honest shape for somebody on their first evening, not a sentence about
 * having no data.
 */
describe("learnerNote", () => {
  it("names the weakest case in Estonian first with its figures", () => {
    const note = learnerNote({
      level: "A2",
      weakestCase: { grammCase: "PARTITIVE", accuracy: 58, total: 120 },
      unit: { title: "Kodu", subtitle: "Home", level: "A1" },
    });
    expect(note).toContain("Their level is A2.");
    expect(note).toContain("osastav (Partitive)");
    expect(note).toContain("right 58% of 120 times");
    expect(note).toContain('"Kodu" (Home) at A1');
    // Offered for when it is relevant, never as a refrain.
    expect(note).toMatch(/Do not raise it unprompted/);
  });

  it("says nothing when there is nothing to say", () => {
    expect(learnerNote({ level: "B1", weakestCase: null, unit: null })).toBe("");
  });

  it("drops a case key it cannot name rather than inventing a name", () => {
    const note = learnerNote({
      level: "B1",
      weakestCase: { grammCase: "NOT_A_CASE", accuracy: 10, total: 30 },
      unit: null,
    });
    expect(note).toBe("");
  });

  it("stays out of the static prompt, which is what keeps that prompt cacheable", () => {
    const prompt = buildSystemPrompt("B1");
    expect(prompt).not.toContain("ABOUT THIS LEARNER");
    expect(prompt).toContain("Their current level is B1");
  });
});
