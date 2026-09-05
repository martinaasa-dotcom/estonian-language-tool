import { describe, expect, it } from "vitest";
import { BANK } from "./bank";
import { SCENES, FALLBACK_PHRASE, sceneById } from "./catalogue";
import { passes, runGate } from "./gate";
import { words } from "./lexicon";
import { beatById, scriptable, scriptedFor, sceneBeats } from "./scripted";
import { answerForms, keylessContext, lacksFiniteVerb } from "../../scripts/lib/sceneDraft";

/**
 * The bank is Estonian a model wrote, so it is held to the gate every time
 * the suite runs and not only on the day it was drafted.
 *
 * The context is built from the shipped dictionary rather than a database,
 * the way `scripts/eval-scene.ts` builds it, which is what lets this run on
 * any checkout: a scene edited after a row was drafted, a unit that lost a
 * word in a reseed, or a gate that grew a fifth check all show up here as a
 * row that no longer passes, which is the row a learner would otherwise meet.
 */
describe("the scripted bank", () => {
  it("names only scenes and beats the catalogue has", () => {
    for (const row of BANK) {
      const scene = sceneById(row.scene);
      expect(scene, `${row.scene} is not a scene`).toBeDefined();
      expect(scene ? sceneBeats(scene).map((b) => b.id) : [], `${row.scene}/${row.beat} is not a beat`).toContain(row.beat);
    }
  });

  it("holds no line for a beat whose value is drawn per run", () => {
    for (const row of BANK) {
      const scene = sceneById(row.scene)!;
      const beat = beatById(scene, row.beat)!;
      expect(scriptable(scene, beat), `${row.scene}/${row.beat} draws a value per run`).toBe(true);
    }
  });

  it("passes the gate today, against its scene's own word list", () => {
    const contexts = new Map(SCENES.map((scene) => [scene.id, keylessContext(scene)]));
    for (const row of BANK) {
      const scene = sceneById(row.scene)!;
      const beat = beatById(scene, row.beat)!;
      const verdict = runGate(row.text, beat, contexts.get(scene.id)!.gate);
      expect(passes(verdict), `${row.scene}/${row.beat}: "${row.text}" fails ${verdict.failed.join(", ")} [${verdict.unknown.join(" ")}]`)
        .toBe(true);
    }
  });

  it("never hands over the form the beat is about to ask for", () => {
    /*
      The answer printed in the question, which is the fault `audit:questions`
      hunts on every card. "Kas sa tahad piima osta?" before a beat that wants
      `piima` was the first thing the drafter produced, three times over.
    */
    const contexts = new Map(SCENES.map((scene) => [scene.id, keylessContext(scene)]));
    for (const row of BANK) {
      const scene = sceneById(row.scene)!;
      const beat = beatById(scene, row.beat)!;
      const answers = answerForms(beat, contexts.get(scene.id)!.lexicon);
      const given = words(row.text).filter((w) => answers.has(w));
      expect(given, `${row.scene}/${row.beat}: "${row.text}" hands over ${given.join(" ")}`).toEqual([]);
    }
  });

  it("has a finite verb in every line long enough to need one, which is the fault the gate cannot see", () => {
    // "Kus pood praegu olema?" passes all four checks and is not a sentence anybody says.
    for (const row of BANK) {
      const scene = sceneById(row.scene)!;
      const beat = beatById(scene, row.beat)!;
      expect(lacksFiniteVerb(row.text, beat), `${row.scene}/${row.beat}: "${row.text}" has no finite verb`).toBe(false);
    }
  });

  it("holds no digit, no dash and never the way out", () => {
    for (const row of BANK) {
      expect(row.text, `${row.scene}/${row.beat} holds a digit`).not.toMatch(/\d/);
      expect(row.text, `${row.scene}/${row.beat} holds a dash or colon`).not.toMatch(/[\u2013\u2014:;]/);
      expect(words(row.text).join(" ")).not.toBe(words(FALLBACK_PHRASE).join(" "));
    }
  });

  it("says who drafted each line and when, and whether a person has read it", () => {
    for (const row of BANK) {
      expect(row.model.length).toBeGreaterThan(0);
      expect(row.draftedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof row.reviewed).toBe("boolean");
    }
  });

  it("never repeats a line within one beat", () => {
    const seen = new Set<string>();
    for (const row of BANK) {
      const key = `${row.scene}|${row.beat}|${row.text.toLowerCase()}`;
      expect(seen.has(key), `${key} twice`).toBe(false);
      seen.add(key);
    }
  });

  it("is read through the scriptable rule rather than trusted", () => {
    // A beat that draws a time can have no scripted line, whatever the bank holds.
    const doctor = sceneById("arsti-aeg")!;
    const offer = doctor.beats.find((b) => b.id === "offer")!;
    expect(scriptable(doctor, offer)).toBe(false);
    expect(scriptedFor(doctor, offer)).toEqual([]);
    // And one that does not is scriptable, whether or not anything was drafted yet.
    const shop = sceneById("poodi-piima")!;
    expect(scriptable(shop, shop.beats[1]!)).toBe(true);
  });
});
