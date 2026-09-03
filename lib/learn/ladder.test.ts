import { describe, expect, it } from "vitest";
import { createEmptyCard, fsrs, generatorParameters, type Grade } from "ts-fsrs";
import {
  isLearningWord, LEARN_BATCH, orderByRung, ratingFor, rungOf, tally, type Rung,
} from "./ladder";

describe("rungOf", () => {
  it("starts a word it has never asked at the meeting", () => {
    expect(rungOf(0, 0)).toBe("meet");
  });

  it("puts a word that has been graded once at the gap", () => {
    expect(rungOf(1, 1)).toBe("gap");
  });

  it("drops a word back to the choice when the step was lost", () => {
    expect(rungOf(1, 0)).toBe("choice");
  });

  it("hands a graduated word to practice", () => {
    expect(rungOf(2, 0)).toBe("kept");
  });

  it("leaves a lapsed word to practice rather than teaching it again", () => {
    // Relearning. A memory that formed and slipped is a review problem, and
    // sending it back to a first meeting spends the slot on a known word.
    expect(rungOf(3, 0)).toBe("kept");
    expect(isLearningWord(3)).toBe(false);
  });
});

/*
  THE LADDER IS THE SCHEDULER'S OWN STEPS, WHICH IS A CLAIM ABOUT ts-fsrs
  RATHER THAN ABOUT US.

  Every rung above reads two fields FSRS writes, so the mapping is only true
  while FSRS keeps writing them that way. A default-steps change upstream would
  leave every rung above passing and the ladder silently flat: a word graded
  once would stay at the choice for ever and never reach a gap. So the walk is
  driven through the real scheduler rather than asserted from memory.
*/
describe("the rungs are the scheduler's learning steps", () => {
  const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }));
  const start = new Date("2026-09-02T10:00:00Z");

  const walk = (grades: readonly Grade[]): Rung => {
    let card = createEmptyCard(start);
    let at = start;
    for (const grade of grades) {
      card = scheduler.next(card, at, grade).card;
      at = new Date(at.getTime() + 10 * 60_000);
    }
    const steps = (card as { learning_steps?: number }).learning_steps ?? 0;
    return rungOf(card.state as number, steps);
  };

  it("climbs meet, choice, gap, kept on three good answers", () => {
    expect(walk([])).toBe("meet");
    expect(walk([3])).toBe("gap");
    expect(walk([3, 3])).toBe("kept");
  });

  it("sends a missed gap back to the choice", () => {
    expect(walk([3, 1])).toBe("choice");
    expect(walk([3, 1, 3])).toBe("gap");
  });

  it("keeps a near miss at the gap rather than starting again", () => {
    expect(walk([3, 2])).toBe("gap");
  });

  it("moves a word somebody already knows straight to practice", () => {
    expect(walk([ratingFor("known") as Grade])).toBe("kept");
  });
});

describe("ratingFor", () => {
  it("sends the four grades the scheduler defines", () => {
    expect(ratingFor("wrong")).toBe(1);
    expect(ratingFor("near")).toBe(2);
    expect(ratingFor("right")).toBe(3);
    expect(ratingFor("known")).toBe(4);
  });
});

describe("orderByRung", () => {
  it("teaches before it tests, and keeps the caller's order inside a rung", () => {
    const words = [
      { id: "a", rung: "gap" as Rung },
      { id: "b", rung: "meet" as Rung },
      { id: "c", rung: "choice" as Rung },
      { id: "d", rung: "meet" as Rung },
    ];
    expect(orderByRung(words, (w) => w.rung).map((w) => w.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("returns the same set it was given", () => {
    const words = [{ rung: "gap" as Rung }, { rung: "meet" as Rung }];
    expect(orderByRung(words, (w) => w.rung)).toHaveLength(words.length);
  });
});

describe("tally", () => {
  it("counts what moved on and what is coming back", () => {
    expect(tally(["kept", "kept", "choice", "gap"])).toEqual({ kept: 2, staying: 2 });
  });
});

describe("LEARN_BATCH", () => {
  it("is a round a learner can hold in their head", () => {
    expect(LEARN_BATCH).toBeGreaterThanOrEqual(3);
    expect(LEARN_BATCH).toBeLessThanOrEqual(8);
  });
});
