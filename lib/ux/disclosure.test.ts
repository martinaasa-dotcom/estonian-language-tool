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
  it("gives a beginner four things that are true on an empty log", () => {
    const led = PANELS.filter((p) => shows("arriving", p));
    expect(led).toEqual(["review", "next", "word", "practice"]);
  });

  it("holds the exam countdown back until its own number is worth printing", () => {
    // The confidence is capped by the evidence behind it, so on a thin log it
    // is a figure the app has to caveat rather than one it can lead with.
    expect(shows("arriving", "exam")).toBe(false);
    expect(shows("starting", "exam")).toBe(false);
    expect(shows("settled", "exam")).toBe(true);
  });

  it("never withholds the daily loop from anybody", () => {
    for (const stage of ["arriving", "starting", "settled"] as const) {
      expect(shows(stage, "review")).toBe(true);
    }
  });

  it("holds back every figure computed from an empty log", () => {
    // The ones that read as a nought on day one, which is what this module is
    // for. Not the word of the day: that is a dictionary lookup keyed on the
    // date and it reads the same on the first morning as in the second year.
    const furniture: Panel[] = ["streak", "level", "quests", "tasks", "struggle", "exam"];
    for (const panel of furniture) expect(shows("arriving", panel)).toBe(false);
  });

  it("gives day one something to read that is not a nought", () => {
    // A home page with two cards on it reads as an app with nothing in it,
    // which is the fault the other half of this table caused.
    expect(shows("arriving", "word")).toBe(true);
    expect(shows("arriving", "practice")).toBe(true);
  });

  it("holds the charts and the sticking points back until they mean something", () => {
    expect(shows("starting", "level")).toBe(false);
    expect(shows("starting", "struggle")).toBe(false);
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
    expect(practiceTiles("starting")).toBe(4);
    expect(practiceTiles("settled")).toBe(6);
  });

  it("never leaves a hole in a grid that is two across", () => {
    for (const stage of ["arriving", "starting", "settled"] as const) {
      expect(practiceTiles(stage) % 2).toBe(0);
    }
  });
});
