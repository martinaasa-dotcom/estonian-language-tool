import { describe, expect, it } from "vitest";
import { FOUND_FOOTING, PANELS, shows, stageOf, TODAY_CARDS, type Panel } from "./disclosure";

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
  it("gives a beginner three things that are true on an empty log", () => {
    const led = PANELS.filter((p) => shows("arriving", p));
    expect(led).toEqual(["review", "next", "word"]);
  });

  it("holds the quest back until there is a weakness to name", () => {
    // The round is drawn from which cases the learner is worst at, so on a
    // thin log the card promises something the round cannot deliver.
    expect(shows("arriving", "quest")).toBe(false);
    expect(shows("starting", "quest")).toBe(false);
    expect(shows("settled", "quest")).toBe(true);
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
    const furniture: Panel[] = ["streak", "tasks", "quest", "errand"];
    for (const panel of furniture) expect(shows("arriving", panel)).toBe(false);
  });

  it("gives day one something to read that is not a nought", () => {
    // A home page with two cards on it reads as an app with nothing in it,
    // which is the fault the other half of this table caused.
    expect(shows("arriving", "word")).toBe(true);
    expect(shows("arriving", "next")).toBe(true);
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

describe("TODAY_CARDS", () => {
  it("leaves room for the hero and no more than six boxes in all", () => {
    // The number the redesign was asked for: a screen somebody glances at
    // before a bus, rather than one they scroll.
    expect(TODAY_CARDS + 1).toBeLessThanOrEqual(6);
  });

  it("cannot draw more cards than a settled learner has panels for", () => {
    // A cap above the supply is a cap that never fires, which is the same
    // thing as not having one.
    expect(TODAY_CARDS).toBeLessThan(PANELS.length);
  });
});
