import { describe, expect, it } from "vitest";

import { DEFAULT_SHAPE } from "./facts";
import { billFor } from "./model";
import { SERVICES } from "./services";
import { CONTINUITY, floorUsd, retrenchment, STAGES } from "./sustainability";

describe("what happens when the money stops", () => {
  it("names only services that exist, so a saving cannot be claimed twice over", () => {
    const ids = new Set(SERVICES.map((service) => service.id));
    for (const stage of STAGES) {
      for (const id of stage.drops) {
        expect(ids.has(id), `stage ${stage.id} drops ${id}, which is not a service`).toBe(true);
      }
    }
  });

  it("is cumulative, so a reader can follow one line down the page", () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      const above = STAGES[i - 1]?.drops ?? [];
      const here = STAGES[i]?.drops ?? [];
      for (const id of above) {
        expect(here, `${STAGES[i]?.id} put ${id} back`).toContain(id);
      }
    }
  });

  it("costs less at every step down, or the step is not a step", () => {
    const ladder = retrenchment(DEFAULT_SHAPE);
    expect(ladder.length).toBe(STAGES.length);
    for (let i = 1; i < ladder.length; i += 1) {
      const above = ladder[i - 1]?.usd ?? 0;
      const here = ladder[i]?.usd ?? 0;
      expect(here, `${ladder[i]?.stage.id} is not cheaper than ${ladder[i - 1]?.stage.id}`)
        .toBeLessThan(above);
    }
  });

  it("starts at the bill the cost page shows, so the two cannot disagree", () => {
    const ladder = retrenchment(DEFAULT_SHAPE);
    expect(ladder[0]?.stage.id).toBe("running");
    expect(ladder[0]?.usd).toBe(billFor(DEFAULT_SHAPE).totalUsd);
  });

  it("says what is lost at each step in the service's own words", () => {
    for (const step of retrenchment(DEFAULT_SHAPE)) {
      expect(step.lost.length).toBe(step.stage.drops.length);
      for (const lost of step.lost) {
        expect(lost.cost.length).toBeGreaterThan(20);
        // Quoted from the registry rather than restated here, so the two
        // descriptions of one service cannot drift apart.
        expect(SERVICES.some((s) => s.whenItIsGone === lost.cost)).toBe(true);
      }
    }
  });

  it("still costs something at the floor, because a server is not free", () => {
    /*
      The point of the number is that it is small and real. A floor of zero
      would mean the model had stopped counting something, which is the way
      this page is most likely to be wrong.
    */
    const floor = floorUsd(DEFAULT_SHAPE);
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(billFor(DEFAULT_SHAPE).totalUsd);
  });

  it("keeps the two nobody can switch off", () => {
    const last = STAGES[STAGES.length - 1];
    expect(last?.drops).not.toContain("hosting");
    expect(last?.drops).not.toContain("database");
  });

  it("never drops what is given, because dropping it saves nothing", () => {
    /*
      Ekilex, TartuNLP and Wiktionary are `given` and are in no total. A stage
      that named one would be claiming a saving of nought while telling a
      learner their dictionary had gone.
    */
    const given = SERVICES.filter((s) => s.bill(billFor(DEFAULT_SHAPE).volume, DEFAULT_SHAPE).kind === "given");
    expect(given.length).toBeGreaterThan(0);
    for (const stage of STAGES) {
      for (const service of given) {
        expect(stage.drops, `${stage.id} drops the gift ${service.id}`)
          .not.toContain(service.id);
      }
    }
  });

  it("keeps teaching at the floor, which is the whole claim", () => {
    /*
      The tutor is the one expensive thing a learner can see, so the floor
      switches it off. What must survive is everything the course is made of.
    */
    const floorStage = STAGES[STAGES.length - 1];
    expect(floorStage?.drops).toContain("model");
    expect(floorStage?.shape?.tutor).toBe("off");
    expect(floorStage?.drops).not.toContain("speech");
    expect(floorStage?.drops).not.toContain("dictionary");
  });

  it("points every continuity claim at something a reader can open", () => {
    expect(CONTINUITY.length).toBeGreaterThan(3);
    for (const item of CONTINUITY) {
      expect(item.claim.length).toBeGreaterThan(40);
      expect(item.checkableAt).toMatch(/^[A-Za-z0-9._/-]+$/);
    }
  });
});
