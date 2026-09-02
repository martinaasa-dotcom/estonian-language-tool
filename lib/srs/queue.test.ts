import { describe, expect, it } from "vitest";
import { requeue, SIBLING_GAP, spaceSiblings } from "./queue";

const word = (c: { w: string }) => c.w;
const cards = (...ws: string[]) => ws.map((w, i) => ({ w, i }));

/** How many places in a queue answer the card before them. */
const adjacentSiblings = (q: readonly { w: string | null }[]) =>
  q.filter((c, i) => i > 0 && c.w !== null && c.w === q[i - 1]!.w).length;

describe("spaceSiblings", () => {
  it("keeps every card it was given, once", () => {
    const given = cards("a", "a", "b", "b", "c", "a", "d");
    const out = spaceSiblings(given, word);
    expect(out).toHaveLength(given.length);
    expect([...out].sort((x, y) => x.i - y.i)).toEqual(given);
  });

  it("separates two cards of one word", () => {
    const out = spaceSiblings(cards("a", "a", "b", "c", "d", "e", "f", "g"), word);
    const first = out.findIndex((c) => c.w === "a");
    const second = out.findIndex((c, i) => c.w === "a" && i > first);
    expect(second - first).toBeGreaterThanOrEqual(SIBLING_GAP);
  });

  it("leaves an order that already spaces itself alone", () => {
    const given = cards("a", "b", "c", "d", "e", "f", "g", "a");
    expect(spaceSiblings(given, word)).toEqual(given);
  });

  it("does the best it can when every card is one word", () => {
    const given = cards("a", "a", "a");
    expect(spaceSiblings(given, word)).toEqual(given);
  });

  it("does not defer a card whose word is unknown", () => {
    const given = [{ w: null }, { w: null }, { w: null }];
    expect(spaceSiblings(given, (c) => c.w)).toEqual(given);
  });

  it("spreads the seven case cards of one word through a real session", () => {
    /*
      The shape measured on the demo deck: seven CASE_FORM cards of `Eesti`
      running consecutively inside a queue of 32. With that many other words
      to put between them, every pair clears the gap.
    */
    const others = Array.from({ length: 25 }, (_, i) => ({ w: `w${i}`, i: 100 + i }));
    const many = [...cards("a", "a", "a", "a", "a", "a", "a"), ...others];
    const out = spaceSiblings(many, word);
    const at = out.map((c, i) => (c.w === "a" ? i : -1)).filter((i) => i >= 0);
    const gaps = at.slice(1).map((n, i) => n - at[i]!);
    /*
      Seven cards six apart would need thirty-six others and there are
      twenty-five, so a session this size cannot hold the full gap all the way
      down. What it does is spend the room it has: most pairs get the gap, and
      the run of seven that arrived consecutively is gone.
    */
    expect(gaps.filter((g) => g >= SIBLING_GAP).length).toBeGreaterThanOrEqual(3);
    expect(adjacentSiblings(out)).toBeLessThan(adjacentSiblings(many));
    expect(out).toHaveLength(many.length);
  });

  it("keeps the set intact when a word crowds the whole session out", () => {
    // Half the queue is one word: some adjacency is arithmetic, not a choice.
    const many = [...cards("a", "a", "a", "a"), ...cards("b", "c")];
    const out = spaceSiblings(many, word);
    expect(out).toHaveLength(many.length);
    expect(out.filter((c) => c.w === "a")).toHaveLength(4);
  });
});

describe("requeue", () => {
  it("puts the card back five places on", () => {
    const q = cards("a", "b", "c", "d", "e", "f", "g");
    const out = requeue(q, { w: "z", i: 99 }, 1);
    expect(out[6]).toEqual({ w: "z", i: 99 });
    expect(out).toHaveLength(8);
  });

  it("puts it last when the queue is shorter than the gap", () => {
    const q = cards("a", "b");
    const out = requeue(q, { w: "z", i: 99 }, 1);
    expect(out[out.length - 1]).toEqual({ w: "z", i: 99 });
  });
});
