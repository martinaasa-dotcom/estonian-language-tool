import { describe, expect, it } from "vitest";
import { answerCount, learningQueue, LEARN_BATCH } from "./learn";

/** A step, written the way it reads in a failure message. `*` teaches. */
const shape = <T>(steps: { card: T; teach: boolean }[]) =>
  steps.map((s) => `${s.card}${s.teach ? "*" : ""}`).join(" ");

/** Cards named "word:slot", so a batch can be read at a glance. */
const wordOf = (card: string) => card.split(":")[0]!;

describe("learningQueue", () => {
  it("teaches a batch and then asks that same batch back", () => {
    expect(shape(learningQueue([], ["a", "b", "c"], { batch: 3 })))
      .toBe("a* b* c* a b c");
  });

  it("puts due cards first and never teaches them", () => {
    // A due card has a schedule and the schedule is what brought it here.
    const steps = learningQueue(["due1", "due2"], ["new1"]);
    expect(shape(steps)).toBe("due1 due2 new1* new1");
    expect(steps.filter((s) => s.teach).map((s) => s.card)).toEqual(["new1"]);
  });

  it("splits more new words than one batch into groups, each taught then asked", () => {
    expect(shape(learningQueue([], ["a", "b", "c", "d", "e", "f"], { batch: 2 })))
      .toBe("a* b* a b c* d* c d e* f* e f");
  });

  it("asks a short last group rather than padding or dropping it", () => {
    expect(shape(learningQueue([], ["a", "b", "c"], { batch: 2 }))).toBe("a* b* a b c* c");
  });

  it("hands back the same card object rather than a copy", () => {
    const card = { id: "x" };
    const [first, second] = learningQueue([], [card]);
    expect(first!.card).toBe(card);
    expect(second!.card).toBe(card);
  });

  it("is empty for an empty sitting", () => {
    expect(learningQueue([], [])).toEqual([]);
  });

  it("teaches one word at a time rather than looping forever on a bad batch size", () => {
    expect(shape(learningQueue([], ["a", "b"], { batch: 0 }))).toBe("a* a b* b");
    expect(shape(learningQueue([], ["a", "b"], { batch: -3 }))).toBe("a* a b* b");
  });

  it("defaults to five, which is the size the batching argument is about", () => {
    expect(LEARN_BATCH).toBe(5);
    const steps = learningQueue([], ["a", "b", "c", "d", "e", "f"]);
    expect(steps.slice(0, 5).every((s) => s.teach)).toBe(true);
    expect(steps[5]!.teach).toBe(false);
  });
});

describe("learningQueue, batching words rather than cards", () => {
  /*
    The correction that came out of driving this in a browser. A word carries
    several cards, so `Euroopa` alone is five of them, and batching by card
    taught Euroopa five times in a row on five screens that differ only in a
    line at the bottom. That is one word five times, not five new words.
  */
  it("introduces a word once however many cards it has", () => {
    const cards = ["euroopa:rec", "euroopa:prod", "euroopa:sees", "euroopa:seest"];
    expect(shape(learningQueue([], cards, { batch: 5, wordOf })))
      .toBe("euroopa:rec* euroopa:rec euroopa:prod euroopa:sees euroopa:seest");
  });

  it("counts a batch in words, so five cards of one word is not a full batch", () => {
    const cards = ["a:1", "a:2", "a:3", "b:1", "b:2"];
    const steps = learningQueue([], cards, { batch: 2, wordOf });
    // Two words, so one group: two introductions then all five cards.
    expect(shape(steps)).toBe("a:1* b:1* a:1 a:2 a:3 b:1 b:2");
  });

  it("never splits a word's cards across two groups", () => {
    const cards = ["a:1", "a:2", "b:1", "c:1", "c:2"];
    const steps = learningQueue([], cards, { batch: 2, wordOf });
    // a and b fill the first group; c starts the second, with its cards intact.
    expect(shape(steps)).toBe("a:1* b:1* a:1 a:2 b:1 c:1* c:1 c:2");
  });

  it("introduces on the first card the caller gave for a word", () => {
    // The page hands new cards down through `inTeachingOrder`, so the first
    // card of a word is its recognition card. Introducing on a later one would
    // make a conjugation card somebody's first sight of a verb.
    const steps = learningQueue([], ["v:rec", "v:conj"], { wordOf });
    expect(steps[0]).toEqual({ card: "v:rec", teach: true });
  });

  it("treats a card with no word of its own as its own word", () => {
    // Reading a missing lemma as one shared key would collapse every such card
    // into a single word, so one introduction would stand for all of them and
    // the rest would be asked having never been shown.
    const steps = learningQueue([], ["x", "y"], { batch: 5, wordOf: () => null });
    expect(shape(steps)).toBe("x* y* x y");
  });
});

describe("answerCount", () => {
  it("counts the answers and not the introductions", () => {
    const steps = learningQueue(
      Array.from({ length: 10 }, (_, i) => `d${i}`),
      Array.from({ length: 10 }, (_, i) => `n${i}`),
    );
    // Ten due, plus ten new taught in two batches of five and then asked.
    expect(answerCount(steps)).toBe(20);
    expect(steps).toHaveLength(30);
  });

  it("is nought for a sitting with nothing in it", () => {
    expect(answerCount([])).toBe(0);
  });
});
