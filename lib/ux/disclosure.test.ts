import { describe, expect, it } from "vitest";
import { FOUND_FOOTING, PANELS, practiceTiles, shows, stageOf, type Panel } from "./disclosure";

describe("stageOf", () => {
  it("calls a learner with no deck arriving", () => {
    expect(stageOf({ totalCards: 0, reviewsAllTime: 0 })).toBe("arriving");
  });

  it("calls a learner with a deck and no reviews arriving too", () => {
    // The wizard builds a deck before a single card has been graded, so cards
    // alone are not evidence that anything has happened yet.
    expect(stageOf({ totalCards: 60, reviewsAllTime: 0 })).toBe("arriving");
  });

  it("calls a deck that was emptied arriving again", () => {
    expect(stageOf({ totalCards: 0, reviewsAllTime: 900 })).toBe("arriving");
  });

  it("moves to starting on the first graded card", () => {
    expect(stageOf({ totalCards: 20, reviewsAllTime: 1 })).toBe("starting");
  });

  it("stays starting right up to the threshold", () => {
    expect(stageOf({ totalCards: 20, reviewsAllTime: FOUND_FOOTING - 1 })).toBe("starting");
  });

  it("settles at three days of the default goal", () => {
    expect(stageOf({ totalCards: 20, reviewsAllTime: FOUND_FOOTING })).toBe("settled");
  });
});

describe("shows", () => {
  it("leads a beginner with the way in and nothing else", () => {
    const led = PANELS.filter((p) => shows("arriving", p));
    expect(led).toEqual(["review", "next"]);
  });

  it("never withholds the daily loop from anybody", () => {
    for (const stage of ["arriving", "starting", "settled"] as const) {
      expect(shows(stage, "review")).toBe(true);
    }
  });

  it("holds back every figure computed from an empty log", () => {
    // The four that read as nought, or as a random pick, on day one.
    const meaningless: Panel[] = ["streak", "level", "word", "tasks"];
    for (const panel of meaningless) expect(shows("arriving", panel)).toBe(false);
  });

  it("holds the charts back until there is something to chart", () => {
    expect(shows("starting", "level")).toBe(false);
    expect(shows("starting", "word")).toBe(false);
  });

  it("shows everything once a learner is settled", () => {
    for (const panel of PANELS) expect(shows("settled", panel)).toBe(true);
  });

  it("only ever adds as a learner gets further in", () => {
    // A panel that appeared and then vanished would read as a bug rather than
    // as restraint, so each stage has to be a superset of the one before it.
    const arriving = PANELS.filter((p) => shows("arriving", p));
    const starting = PANELS.filter((p) => shows("starting", p));
    const settled = PANELS.filter((p) => shows("settled", p));
    expect(starting).toEqual(expect.arrayContaining(arriving));
    expect(settled).toEqual(expect.arrayContaining(starting));
  });
});

describe("practiceTiles", () => {
  it("offers a choice rather than the whole palette while starting", () => {
    expect(practiceTiles("starting")).toBe(3);
    expect(practiceTiles("settled")).toBe(4);
  });
});
