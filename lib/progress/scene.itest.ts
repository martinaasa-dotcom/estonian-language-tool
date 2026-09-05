import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SCENES, sceneById } from "@/lib/scenes/catalogue";
import { planRun } from "@/lib/scenes/run";
import { beatNow, beginRun, dataFor, finishRun, recencyFor, sceneContext } from "./scene";

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

  it("reads the sentences off the column the way the app reads them", async () => {
    /*
      `Lexeme.examples` is a JSON string column and the scene used to split it
      on newlines, so a word with no sentences produced one line reading `[]`
      and a word with sentences produced one line of raw JSON. `naturalSentence`
      threw every one of them away, so the attested rung had never once
      answered on any beat of any scene, and it looked exactly like a
      dictionary too thin to hold a conversation.

      Asked here rather than in a unit test because the shape of that column is
      a fact about the seed. A parser fixture would have agreed with the broken
      version, since the bug was reading the wrong shape and not reading a
      shape wrongly.
    */
    const context = await sceneContext(DOCTOR.id);
    const every = DOCTOR.beats.flatMap((beat) => context!.pool.get(beat.id) ?? []);
    expect(every.length, "no beat drew a single line").toBeGreaterThan(0);
    for (const line of every) {
      expect(line.text, "a line is raw JSON rather than a sentence").not.toMatch(/^[[{]/);
      expect(line.text.length, "an empty line reached the pool").toBeGreaterThan(2);
    }
  });

  it("opens with a greeting rather than with not understanding", async () => {
    /*
      Ekilex records a usage against a *word*, to show it doing its job in a
      sentence, and holds none for `Tere!` because that already is the
      sentence: the whole A1 greetings unit is phrases with no usage between
      them. So the beat every scene opens with had nothing, the ladder fell all
      the way through, and keyless the receptionist said "I do not understand"
      before the learner had said a word.

      A phrase is its own line. It is retrieval rather than composition: the
      lemma is a headword a lexicographer wrote down.
    */
    const context = await sceneContext(DOCTOR.id);
    const greeting = DOCTOR.beats[0]!;
    const pool = context!.pool.get(greeting.id) ?? [];
    expect(pool.length, "the opening beat has nothing to say").toBeGreaterThan(0);
    expect(pool.some((line) => line.text === line.lemma),
      "no phrase was taken as its own line").toBe(true);
  });

  it("draws a recorded line only where the phrase is the line, or a person pinned one", async () => {
    /*
      A USAGE IS ABOUT A WORD, NOT ABOUT A BEAT (§32). The first version of
      this asked that more than two beats have a recorded sentence, and the
      sentences it was counting were `Aeg ei peatu.` offered as an
      appointment and `Aastas on 365 päeva.` reading it back. The pool holds
      the phrases the course teaches, which are their own line, and a usage a
      person pinned on the beat by its text, and nothing a lexicographer wrote
      to illustrate a word.
    */
    for (const scene of SCENES) {
      const context = await sceneContext(scene.id);
      for (const beat of scene.beats) {
        for (const line of context!.pool.get(beat.id) ?? []) {
          const pinned = beat.lines?.includes(line.text) ?? false;
          expect(
            line.text === line.lemma || pinned,
            `${scene.id}/${beat.id} draws on "${line.text}", which is a usage nobody chose for it`,
          ).toBe(true);
        }
      }
    }
    // And a pinned usage the dictionary still holds does reach its beat.
    const shop = await sceneContext("poodi-piima");
    const going = shop!.pool.get("going") ?? [];
    expect(going.map((line) => line.text)).toContain("Kuhu sa lähed?");
  });

  it("knows which spellings count as each fact on the card", async () => {
    const context = await sceneContext(DOCTOR.id);
    const run = planRun(DOCTOR, "itest", "A2", "ordinary");
    const data = dataFor(run.card, context!.lexicon);

    for (const prop of run.card.props) {
      expect(data.get(prop.slot)?.size, `${prop.slot} accepts nothing at all`)
        .toBeGreaterThan(0);
    }
    // A time is accepted as digits, which is how anybody writes one down, and in words, which is how anybody says one.
    expect([...(data.get("time") ?? [])].some((v) => /\d/.test(v))).toBe(true);
    expect([...(data.get("time") ?? [])].some((v) => /^[a-zõäöü ]+$/.test(v) && !/\d/.test(v))).toBe(true);
    // A word prop resolves to the dictionary's forms rather than to the lemma.
    expect((data.get("symptom") ?? new Set()).size).toBeGreaterThan(3);
  });

  it("marks the run itself rather than believing what it was sent", async () => {
    const context = await sceneContext(DOCTOR.id);
    const greeting = DOCTOR.beats[0]!;

    const opened = await beginRun({
      ownerId: OWNER, sceneId: DOCTOR.id, level: "A2", difficulty: "textbook",
    });
    const drawn = opened!.run.card.props.find((p) => p.slot === "symptom")!;
    const finished = await finishRun({
      ownerId: OWNER,
      runId: opened!.runId,
      walkedOut: false,
      asked: [],
      turns: [
        { beatId: greeting.id, said: "Tere!", helped: false },
        { beatId: "reason", said: `Mul on ${drawn.value}.`, helped: false },
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
    const opened = await beginRun({
      ownerId: OWNER, sceneId: DOCTOR.id, level: "A2", difficulty: "textbook",
    });
    const finished = await finishRun({
      ownerId: OWNER,
      runId: opened!.runId,
      walkedOut: false,
      asked: [],
      turns: [{ beatId: "greet", said: "qqqq wwww", helped: false }],
    });
    expect(finished!.objectives.met, "an unmet beat was credited").toEqual([]);
    expect(finished!.objectives.missed.length).toBeGreaterThan(0);
  });

  it("writes down the words the run needed and the learner did not have", async () => {
    const context = await sceneContext(DOCTOR.id);
    // A word this scene really is about, taken from the scene rather than
    // typed here: the debrief lists what the conversation needed, so a word it
    // never needed has no business on it.
    const needed = DOCTOR.beats.flatMap((beat) => beat.topic)
      .find((lemma) => context!.lexicon.byLemma.has(lemma))!;
    expect(needed, "the scene declares no word the dictionary has").toBeTruthy();

    const opened = await beginRun({
      ownerId: OWNER, sceneId: DOCTOR.id, level: "A2", difficulty: "textbook",
    });
    const finished = await finishRun({
      ownerId: OWNER,
      runId: opened!.runId,
      walkedOut: false,
      asked: [{ lemma: needed, lexemeId: null }],
      turns: [{ beatId: "greet", said: "Tere!", helped: false }],
    });

    const gaps = await prisma.sceneGap.findMany({
      where: { ownerId: OWNER, runId: finished!.runId },
      orderBy: { id: "asc" },
    });
    expect(gaps.some((g) => g.kind === "ASKED" && g.lemma === needed)).toBe(true);
    /*
      With the entry resolved, because the debrief offers to keep the word and
      `AddWordButton` adds by id. The caller sent `null` and the server found
      it, which is the point: a client naming an id would be a client choosing
      which entry a learner is offered.
    */
    const asked = finished!.gaps.find((gap) => gap.lemma === needed);
    expect(asked, "the word the run needed is not on the debrief").toBeTruthy();
    expect(asked!.lexemeId, "the entry was never resolved").toBeTruthy();
  });

  it("keeps only the words the scene actually has", async () => {
    /*
      `asked` arrives off the wire, and every export of `app/actions.ts` is a
      public endpoint. `sceneHelp` hands out a lemma from the beat's own topic;
      anything else is a client writing whatever it likes into a table, and a
      debrief listing words the conversation never needed is the visible half
      of that.
    */
    const opened = await beginRun({
      ownerId: OWNER, sceneId: DOCTOR.id, level: "A2", difficulty: "textbook",
    });
    const finished = await finishRun({
      ownerId: OWNER,
      runId: opened!.runId,
      walkedOut: false,
      asked: [{ lemma: "kodukeelmitteolemassonatest", lexemeId: null }],
      turns: [{ beatId: "greet", said: "Tere!", helped: false }],
    });
    expect(finished!.gaps.map((gap) => gap.lemma))
      .not.toContain("kodukeelmitteolemassonatest");
    const rows = await prisma.sceneGap.findMany({ where: { ownerId: OWNER, kind: "ASKED" } });
    expect(rows.length, "a word the scene never had was written down").toBe(0);
  });

  it("hands the help button a word off the beat it is on", async () => {
    const opened = await beginRun({
      ownerId: OWNER, sceneId: DOCTOR.id, level: "A2", difficulty: "textbook",
    });
    const beat = await beatNow({ ownerId: OWNER, runId: opened!.runId, turns: [] });
    expect(beat, "a fresh run is on no beat at all").not.toBeNull();
    expect(beat!.id).toBe(DOCTOR.beats[0]!.id);

    // And it moves with the conversation rather than staying where it opened.
    const after = await beatNow({
      ownerId: OWNER,
      runId: opened!.runId,
      turns: [{ beatId: DOCTOR.beats[0]!.id, said: "Tere!", helped: false }],
    });
    expect(after!.id, "the beat did not move after a turn that landed")
      .not.toBe(beat!.id);

    // Another learner's run is not readable, which is the same rule the
    // recency read is held to.
    const theirs = await beatNow({
      ownerId: "itest-owner-scene-other", runId: opened!.runId, turns: [],
    });
    expect(theirs, "one learner read another's run").toBeNull();
  });

  it("gives back what the last runs used, so a draw can avoid it", async () => {
    const opened = await beginRun({
      ownerId: OWNER, sceneId: DOCTOR.id, level: "A2", difficulty: "ordinary",
    });
    expect(opened).not.toBeNull();
    await finishRun({
      ownerId: OWNER, runId: opened!.runId, walkedOut: true, asked: [], turns: [],
    });

    const recency = await recencyFor(OWNER, DOCTOR.id);
    const run = opened!.run;
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
    await beginRun({
      ownerId: "itest-owner-scene-other", sceneId: DOCTOR.id,
      level: "A2", difficulty: "ordinary",
    });
    const recency = await recencyFor(OWNER, DOCTOR.id);
    expect(recency.personas.size).toBe(0);
    await prisma.sceneRun.deleteMany({ where: { ownerId: "itest-owner-scene-other" } });
  });
});
