import { describe, expect, it } from "vitest";
import { shuffle } from "./shuffle";

/** A generator with a fixed sequence, so nothing here depends on a clock. */
function fixed(values: number[]): () => number {
  let at = 0;
  return () => values[at++ % values.length]!;
}

describe("shuffle", () => {
  it("leaves the input alone", () => {
    const source = [1, 2, 3, 4];
    shuffle(source, fixed([0.9, 0.1, 0.5]));
    expect(source).toEqual([1, 2, 3, 4]);
  });

  it("keeps every element exactly once", () => {
    const out = shuffle([..."abcdefghij"], fixed([0.13, 0.77, 0.42, 0.05, 0.91]));
    expect([...out].sort()).toEqual([..."abcdefghij"].sort());
  });

  it("is a function of the generator it was given", () => {
    const seq = [0.31, 0.68, 0.02, 0.55, 0.87, 0.44];
    expect(shuffle([1, 2, 3, 4, 5, 6], fixed(seq)))
      .toEqual(shuffle([1, 2, 3, 4, 5, 6], fixed(seq)));
  });

  it("handles the empty and single cases without asking for a number", () => {
    const never = () => { throw new Error("asked for a random number it did not need"); };
    expect(shuffle([], never)).toEqual([]);
    expect(shuffle(["only"], never)).toEqual(["only"]);
  });

  /*
    The two draws whose answer is known, which is how you tell a Fisher-Yates
    from something that merely looks like one.

    Every draw at the bottom picks index 0 each pass, which walks the first
    element all the way to the end and shifts everything else down one: a left
    rotation. Every draw at the top picks `i` each pass, so every swap is with
    itself and the array is untouched. That second one is the identity, and
    expecting it to be a rotation is what this test asserted first.
  */
  it("rotates left when every draw is the bottom of its range", () => {
    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], fixed([0])))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  });

  it("is the identity when every draw is the top of its range", () => {
    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], fixed([0.999])))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("is uniform enough that the first element does not favor its own place", () => {
    // A deterministic generator, so this measures the algorithm and not a clock.
    let state = 12345;
    const rng = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    const base = [...Array(10).keys()];
    let stayedFirst = 0;
    const runs = 20_000;
    for (let n = 0; n < runs; n++) if (shuffle(base, rng)[0] === 0) stayedFirst++;
    const pct = (100 * stayedFirst) / runs;
    // Uniform is 10%. The comparator version measured 19.6% here.
    expect(pct).toBeGreaterThan(8.5);
    expect(pct).toBeLessThan(11.5);
  });
});
