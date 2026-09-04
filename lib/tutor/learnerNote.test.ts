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

  /*
    A tutor told "B1" and nothing else treats a guess and a measurement alike.
    The note says which it was, and for a measured check with uneven skills it
    says so, because a learner who reads at B2 and listens at A1 should not be
    spoken to at the average.
  */
  it("says how the level is known, and names uneven skills", () => {
    const measured = learnerNote({
      level: "B1", weakestCase: null, unit: null,
      standing: { source: "measured", skills: { reading: "B2", listening: "A1", writing: "B2" } },
    });
    expect(measured).toContain("measured by the level check (reading B2, listening A1, writing B2)");
    expect(measured).toContain("The skills are uneven");
    const even = learnerNote({
      level: "B1", weakestCase: null, unit: null,
      standing: { source: "measured", skills: { reading: "B1", listening: "B1", writing: "B1" } },
    });
    expect(even).not.toContain("uneven");
    const guessed = learnerNote({ level: "B1", weakestCase: null, unit: null, standing: { source: "estimated" } });
    expect(guessed).toContain("their own estimate rather than a measurement");
  });

  it("tells her what Estonian the learner already lives in, in the plan's own words", () => {
    const note = learnerNote({
      level: "A2", weakestCase: null, unit: null, situation: "live in Estonia and have Estonian at home",
    });
    expect(note).toContain("They live in Estonia and have Estonian at home");
    expect(note).toContain("point them at using it");
    expect(learnerNote({ level: "A2", weakestCase: null, unit: null, situation: null })).toBe("");
  });

  it("stays out of the static prompt, which is what keeps that prompt cacheable", () => {
    const prompt = buildSystemPrompt("B1");
    expect(prompt).not.toContain("ABOUT THIS LEARNER");
    expect(prompt).toContain("Their current level is B1");
  });
});
