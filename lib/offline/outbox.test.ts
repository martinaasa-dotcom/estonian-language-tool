import { describe, expect, it } from "vitest";
import {
  MAX_BACKDATE_DAYS, REPLAY_BATCH, clampReviewedAt, isValidPending, nextBatch,
  orderForReplay, withoutSettled, type PendingGrade,
} from "./outbox";

const NOW = Date.UTC(2026, 7, 29, 12, 0, 0);

function pending(over: Partial<PendingGrade> = {}): PendingGrade {
  return { id: "a", cardId: "c1", rating: 3, durationMs: 1200, reviewedAt: NOW, ...over };
}

describe("clampReviewedAt", () => {
  it("keeps a sane timestamp untouched", () => {
    const tenMinutesAgo = NOW - 600_000;
    expect(clampReviewedAt(tenMinutesAgo, NOW)).toBe(tenMinutesAgo);
  });

  it("pulls a future timestamp back to now", () => {
    // A device clock set ahead would otherwise schedule the card into the past.
    expect(clampReviewedAt(NOW + 86_400_000, NOW)).toBe(NOW);
  });

  it("floors a timestamp older than the backdate limit", () => {
    const ancient = NOW - 400 * 86_400_000;
    expect(clampReviewedAt(ancient, NOW)).toBe(NOW - MAX_BACKDATE_DAYS * 86_400_000);
  });

  it("substitutes now for a value that is not a number", () => {
    expect(clampReviewedAt(NaN, NOW)).toBe(NOW);
    expect(clampReviewedAt(Infinity, NOW)).toBe(NOW);
  });
});

describe("orderForReplay", () => {
  it("orders strictly by time, because two grades of one card compound", () => {
    const later = pending({ id: "b", reviewedAt: NOW + 5000 });
    const earlier = pending({ id: "a", reviewedAt: NOW });
    expect(orderForReplay([later, earlier]).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("breaks a tie on id so a retry replays identically", () => {
    const x = pending({ id: "x" });
    const b = pending({ id: "b" });
    expect(orderForReplay([x, b]).map((p) => p.id)).toEqual(["b", "x"]);
    expect(orderForReplay([b, x]).map((p) => p.id)).toEqual(["b", "x"]);
  });

  it("does not mutate its input", () => {
    const input = [pending({ id: "b", reviewedAt: NOW + 1 }), pending({ id: "a" })];
    const copy = [...input];
    orderForReplay(input);
    expect(input).toEqual(copy);
  });

  it("keeps both grades when one card was graded twice", () => {
    const first = pending({ id: "1", cardId: "same", rating: 1, reviewedAt: NOW });
    const second = pending({ id: "2", cardId: "same", rating: 3, reviewedAt: NOW + 60_000 });
    const ordered = orderForReplay([second, first]);
    expect(ordered.map((p) => p.rating)).toEqual([1, 3]);
  });
});

describe("withoutSettled", () => {
  it("drops ids the server already has", () => {
    const list = [pending({ id: "a" }), pending({ id: "b" })];
    expect(withoutSettled(list, ["a"]).map((p) => p.id)).toEqual(["b"]);
  });

  it("is a no-op when nothing settled", () => {
    const list = [pending({ id: "a" })];
    expect(withoutSettled(list, [])).toEqual(list);
  });

  it("empties the queue when everything settled", () => {
    expect(withoutSettled([pending({ id: "a" })], ["a", "b"])).toEqual([]);
  });
});

describe("isValidPending", () => {
  it("accepts a well-formed entry", () => {
    expect(isValidPending(pending())).toBe(true);
  });

  it.each([
    [null, "null"],
    [{}, "an empty object"],
    [pending({ id: "" }), "a blank id"],
    [{ ...pending(), rating: 5 }, "a rating outside 1-4"],
    [{ ...pending(), rating: "3" }, "a rating that is a string"],
    [{ ...pending(), reviewedAt: "yesterday" }, "a timestamp that is a string"],
    [{ ...pending(), durationMs: NaN }, "a duration that is NaN"],
    [{ ...pending(), cardId: undefined }, "a missing card id"],
  ])("rejects %j — %s", (value, _why) => {
    expect(isValidPending(value)).toBe(false);
  });
});

describe("nextBatch", () => {
  it("caps the batch so one failure costs a small retry", () => {
    const many = Array.from({ length: REPLAY_BATCH + 20 }, (_, i) =>
      pending({ id: String(i).padStart(4, "0"), reviewedAt: NOW + i }));
    expect(nextBatch(many)).toHaveLength(REPLAY_BATCH);
  });

  it("takes the oldest first, so the backlog drains in order", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      pending({ id: String(i).padStart(4, "0"), reviewedAt: NOW + i }));
    expect(nextBatch(many.reverse())[0]?.id).toBe("0000");
  });

  it("handles an empty queue", () => {
    expect(nextBatch([])).toEqual([]);
  });
});
