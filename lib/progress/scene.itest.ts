import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sceneById } from "@/lib/scenes/catalogue";
import { planRun } from "@/lib/scenes/run";
import { dataFor, finishRun, recencyFor, sceneContext } from "./scene";

/**
 * A scene against the real dictionary, because most of what could go wrong here
 * is a question about the seed rather than about the rules.
 *
 * The rules have unit tests: `turn.test.ts` marks a turn, `state.test.ts`
 * advances a scene, `grades.test.ts` decides what reaches the review log. What
 * only a database can answer is whether a scene's units resolve to enough words
 * to hold a conversation at all, whether the recency read gives back what the
 * last runs used, and whether the server's own reading of a transcript is the
 * one that gets written.
 */
const OWNER = "itest-owner-scene";
const DOCTOR = sceneById("arsti-aeg")!;

async function wipe() {
  await prisma.sceneGap.deleteMany({ where: { ownerId: OWNER } });
  await prisma.sceneRun.deleteMany({ where: { ownerId: OWNER } });
  await prisma.review.deleteMany({ where: { ownerId: OWNER } });
  await prisma.card.deleteMany({ where: { ownerId: OWNER } });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("a scene against the dictionary", () => {
  it("resolves enough of its units to hold a conversation", async () => {
    const context = await sceneContext(DOCTOR.id);
    expect(context, "the scene could not be built at all").not.toBeNull();
    /*
      A few hundred lemmas, which is the whole point of the closed list: vouching
      against the dictionary would pass any Estonian word in the language, and
      vouching against a list this size means the model is choosing inside a box.
    */
    expect(context!.lexicon.byLemma.size).toBeGreaterThan(150);
    expect(context!.lexicon.forms.size).toBeGreaterThan(1_000);

    // And the machinery the marker needs, which is what the units for the words
    // between the words were added for.
    expect(context!.marker.questionWords.size, "no question words").toBeGreaterThan(10);
    expect(context!.marker.negators.size, "no negator").toBeGreaterThan(0);
    expect(context!.marker.registerForms.size, "no register to check").toBeGreaterThan(3);
    expect(context!.gate.wrongRegister.size, "nothing to catch the wrong register")
      .toBeGreaterThan(3);
  });

  it("has a way out that is a real phrase rather than an empty string", async () => {
    const context = await sceneContext(DOCTOR.id);
    expect(context!.fallback.length, "the way out is empty").toBeGreaterThan(3);
  });

  it("finds recorded sentences for the beats that carry the encounter", async () => {
    const context = await sceneContext(DOCTOR.id);
    let withLines = 0;
    for (const beat of DOCTOR.beats) {
      if ((context!.pool.get(beat.id) ?? []).length > 0) withLines += 1;
    }
    /*
      Not every beat, and §25 is why: a lexicographer records a sentence to
      illustrate a word rather than to ask a question about it, so retrieval
      fills the moves every conversation shares and the composer is
      load-bearing. What this checks is that the first rung is not empty.
    */
    expect(withLines, "no beat had a recorded sentence to draw on").toBeGreaterThan(2);
  });

  it("knows which spellings count as each fact on the card", async () => {
    const context = await sceneContext(DOCTOR.id);
    const run = planRun(DOCTOR, "itest", "A2", "ordinary");
    const data = dataFor(run.card, context!.lexicon);

    for (const prop of run.card.props) {
      expect(data.get(prop.slot)?.size, `${prop.slot} accepts nothing at all`)
        .toBeGreaterThan(0);
    }
    // A time is accepted as digits, which is how anybody writes one down.
    expect([...(data.get("time") ?? [])].some((v) => /\d/.test(v))).toBe(true);
    // A word prop resolves to the dictionary's forms rather than to the lemma.
    expect((data.get("symptom") ?? new Set()).size).toBeGreaterThan(3);
  });

  it("marks the run itself rather than believing what it was sent", async () => {
    const context = await sceneContext(DOCTOR.id);
    const run = planRun(DOCTOR, "itest-mark", "A2", "textbook");
    const symptom = run.card.props.find((p) => p.slot === "symptom")!;
    const greeting = DOCTOR.beats[0]!;

    const finished = await finishRun({
      ownerId: OWNER,
      sceneId: DOCTOR.id,
      seed: "itest-mark",
      level: "A2",
      difficulty: "textbook",
      walkedOut: false,
      asked: [],
      turns: [
        { beatId: greeting.id, said: "Tere!", helped: false },
        { beatId: "reason", said: `Mul on ${symptom.value}.`, helped: false },
      ],
    });

    expect(finished).not.toBeNull();
    expect(finished!.objectives.met, "the greeting was not read as a greeting")
      .toContain("greet");
    // And the server wrote what it read, not what it was told.
    const stored = await prisma.sceneRun.findUnique({ where: { id: finished!.runId } });
    expect(stored?.ownerId).toBe(OWNER);
    const outcome = JSON.parse(stored!.outcome) as { met: string[] };
    expect(outcome.met).toEqual(finished!.objectives.met);
    void context;
  });

  it("refuses to credit a beat the learner never met", async () => {
    const finished = await finishRun({
      ownerId: OWNER,
      sceneId: DOCTOR.id,
      seed: "itest-miss",
      level: "A2",
      difficulty: "textbook",
      walkedOut: false,
      asked: [],
      turns: [{ beatId: "greet", said: "qqqq wwww", helped: false }],
    });
    expect(finished!.objectives.met, "an unmet beat was credited").toEqual([]);
    expect(finished!.objectives.missed.length).toBeGreaterThan(0);
  });

  it("writes down the words the run needed and the learner did not have", async () => {
    const finished = await finishRun({
      ownerId: OWNER,
      sceneId: DOCTOR.id,
      seed: "itest-gaps",
      level: "A2",
      difficulty: "textbook",
      walkedOut: false,
      asked: [{ lemma: "valutama", lexemeId: null }],
      turns: [{ beatId: "greet", said: "Tere!", helped: false }],
    });

    const gaps = await prisma.sceneGap.findMany({
      where: { ownerId: OWNER, runId: finished!.runId },
      orderBy: { id: "asc" },
    });
    expect(gaps.some((g) => g.kind === "ASKED" && g.lemma === "valutama")).toBe(true);
    expect(finished!.gaps).toContain("valutama");
  });

  it("gives back what the last runs used, so a draw can avoid it", async () => {
    const first = await finishRun({
      ownerId: OWNER, sceneId: DOCTOR.id, seed: "r1", level: "A2",
      difficulty: "ordinary", walkedOut: true, asked: [], turns: [],
    });
    expect(first).not.toBeNull();

    const recency = await recencyFor(OWNER, DOCTOR.id);
    const run = planRun(DOCTOR, "r1", "A2", "ordinary");
    /*
      Derived from the append-only log rather than counted (ADR-014): the run
      that just happened is what the next one is told to avoid, with no stored
      counter that could drift or outlive its row.
    */
    expect(recency.personas, "the recency read forgot who was behind the desk")
      .toContain(run.persona.id);
    for (const prop of run.card.props) expect(recency.props).toContain(prop.value);
  });

  it("says nothing about another learner's runs", async () => {
    await finishRun({
      ownerId: "itest-owner-scene-other", sceneId: DOCTOR.id, seed: "theirs",
      level: "A2", difficulty: "ordinary", walkedOut: true, asked: [], turns: [],
    });
    const recency = await recencyFor(OWNER, DOCTOR.id);
    expect(recency.personas.size).toBe(0);
    await prisma.sceneRun.deleteMany({ where: { ownerId: "itest-owner-scene-other" } });
  });
});
