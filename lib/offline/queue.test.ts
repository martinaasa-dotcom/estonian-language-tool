import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueue, enqueueGrade, flushQueue, queueSize, readQueue, type PendingGrade } from "./queue";

/** A minimal localStorage, so the queue can be tested without a browser. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

const grade = (cardId: string, at: string): PendingGrade => ({
  cardId, rating: 3, durationMs: 1200, reviewedAt: at,
});

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  clearQueue();
});

describe("the offline queue", () => {
  it("starts empty", () => {
    expect(readQueue()).toEqual([]);
    expect(queueSize()).toBe(0);
  });

  it("keeps grades in the order they were answered", () => {
    enqueueGrade(grade("a", "2026-08-28T10:00:00.000Z"));
    enqueueGrade(grade("b", "2026-08-28T10:00:05.000Z"));
    expect(readQueue().map((g) => g.cardId)).toEqual(["a", "b"]);
  });

  it("keeps the answer time, not the send time", () => {
    enqueueGrade(grade("a", "2026-08-28T10:00:00.000Z"));
    expect(readQueue()[0]!.reviewedAt).toBe("2026-08-28T10:00:00.000Z");
  });

  it("survives corrupt storage rather than throwing", () => {
    window.localStorage.setItem("kodukeel:pending-grades", "{not json");
    expect(readQueue()).toEqual([]);
  });

  it("drops entries that are not grades", () => {
    window.localStorage.setItem(
      "kodukeel:pending-grades",
      JSON.stringify([{ cardId: "a", rating: 9, durationMs: 1, reviewedAt: "x" }, grade("b", "t")]),
    );
    expect(readQueue().map((g) => g.cardId)).toEqual(["b"]);
  });
});

describe("flushQueue", () => {
  it("does nothing, successfully, on an empty queue", async () => {
    const send = vi.fn();
    await expect(flushQueue(send)).resolves.toEqual({ applied: 0, remaining: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("clears the queue once the server confirms", async () => {
    enqueueGrade(grade("a", "t1"));
    enqueueGrade(grade("b", "t2"));
    const result = await flushQueue(async () => ({ ok: true, applied: 2, failed: [] }));
    expect(result).toEqual({ applied: 2, remaining: 0 });
    expect(queueSize()).toBe(0);
  });

  it("keeps everything when the send throws — still offline", async () => {
    enqueueGrade(grade("a", "t1"));
    const result = await flushQueue(async () => { throw new Error("offline"); });
    expect(result).toEqual({ applied: 0, remaining: 1 });
    expect(queueSize()).toBe(1);
  });

  it("keeps everything when the server refuses the batch", async () => {
    enqueueGrade(grade("a", "t1"));
    await flushQueue(async () => ({ ok: false }));
    expect(queueSize()).toBe(1);
  });

  it("does not swallow grades answered while the flush was in flight", async () => {
    enqueueGrade(grade("a", "t1"));
    const result = await flushQueue(async () => {
      // A card graded mid-flush, exactly as it would be in a live session.
      enqueueGrade(grade("b", "t2"));
      return { ok: true, applied: 1, failed: [] };
    });
    expect(result.remaining).toBe(1);
    expect(readQueue().map((g) => g.cardId)).toEqual(["b"]);
  });

  it("does not retry a card the server could not apply", async () => {
    enqueueGrade(grade("gone", "t1"));
    const result = await flushQueue(async () => ({ ok: true, applied: 0, failed: ["gone"] }));
    expect(result).toEqual({ applied: 0, remaining: 0 });
    expect(queueSize()).toBe(0);
  });
});
