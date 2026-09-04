import { describe, expect, it } from "vitest";
import { MIN_CONFUSIONS, confusions, type ConfusionPoint } from "./confusions";

/** `n` answers where `slot` was asked and `reached` came back instead. */
const mixed = (slot: string, reached: string, n: number): ConfusionPoint[] =>
  Array.from({ length: n }, () => ({ slot, reachedSlot: reached }));

describe("confusions", () => {
  it("names a pair the learner keeps mixing up", () => {
    expect(confusions(mixed("INESSIVE", "ELATIVE", MIN_CONFUSIONS))).toEqual([
      { pair: ["ELATIVE", "INESSIVE"], times: MIN_CONFUSIONS },
    ]);
  });

  it("says nothing about a single slip", () => {
    expect(confusions(mixed("INESSIVE", "ELATIVE", MIN_CONFUSIONS - 1))).toEqual([]);
  });

  it("counts both directions as one confusion", () => {
    /*
      The whole argument for an unordered pair. One each way is the same gap
      seen from two sides, and splitting them would leave a real confusion
      under the floor for twice as long while reading as two shallower ones.
    */
    const both = [
      ...mixed("INESSIVE", "ELATIVE", 1),
      ...mixed("ELATIVE", "INESSIVE", 1),
    ];
    expect(confusions(both)).toEqual([{ pair: ["ELATIVE", "INESSIVE"], times: 2 }]);
  });

  it("puts the commonest pair first", () => {
    const rows = [
      ...mixed("INESSIVE", "ELATIVE", 2),
      ...mixed("ALLATIVE", "ADESSIVE", 5),
    ];
    expect(confusions(rows).map((c) => c.times)).toEqual([5, 2]);
    expect(confusions(rows)[0]?.pair).toEqual(["ADESSIVE", "ALLATIVE"]);
  });

  it("skips a review written before the column existed rather than bucketing it", () => {
    /*
      An "unknown" bucket in a ranked list outranks the real rows by being
      everything that was never recorded, which is what the research export
      found the expensive way.
    */
    const rows: ConfusionPoint[] = [
      { slot: null, reachedSlot: null },
      { slot: "INESSIVE", reachedSlot: null },
      { slot: null, reachedSlot: "ELATIVE" },
      ...mixed("INESSIVE", "ELATIVE", MIN_CONFUSIONS),
    ];
    expect(confusions(rows)).toEqual([
      { pair: ["ELATIVE", "INESSIVE"], times: MIN_CONFUSIONS },
    ]);
  });

  it("refuses a pair that is not two forms, whatever the column holds", () => {
    // `writeGrade` will not write these. This reads a column, and a column
    // outlives the function that wrote it.
    expect(confusions(mixed("RECOGNITION", "INESSIVE", 5))).toEqual([]);
    expect(confusions(mixed("INESSIVE", "PRODUCTION", 5))).toEqual([]);
  });

  it("refuses a row that says a form was confused with itself", () => {
    expect(confusions(mixed("INESSIVE", "INESSIVE", 5))).toEqual([]);
  });

  it("pairs a verb form with a verb form", () => {
    expect(confusions(mixed("IndPrSg1", "IndPrSg3", MIN_CONFUSIONS))).toEqual([
      { pair: ["IndPrSg1", "IndPrSg3"], times: MIN_CONFUSIONS },
    ]);
  });
});
