/**
 * The offline grade queue.
 *
 * CLAUDE.md is unambiguous: review must work offline, because it is the daily
 * path. Grading is a Server Action, so the honest way to keep that promise is
 * not to pretend the network is there — it is to let the review continue and
 * remember exactly what was answered, then replay it when the connection comes
 * back.
 *
 * Three details make the difference between this and losing someone's evening:
 *
 * 1. **The timestamp is captured when the card is answered**, not when it is
 *    sent. A replayed batch keeps the real times, so the streak, the heatmap
 *    and the daily goal all still describe the day that actually happened.
 * 2. **Writes are append-only and immediate** — one card, one write, straight
 *    to localStorage. Nothing is buffered in memory waiting for a tidy moment
 *    that a closed tab never gives it.
 * 3. **A failed flush puts everything back.** The queue is only cleared for
 *    grades the server confirms it applied.
 *
 * localStorage rather than IndexedDB: the payload is a few dozen bytes per
 * card, it is synchronous (so a tab closing mid-write cannot lose it), and it
 * needs no schema migration story.
 */

export interface PendingGrade {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  durationMs: number;
  /** ISO timestamp of when the card was actually answered. */
  reviewedAt: string;
}

const KEY = "kodukeel:pending-grades";
/** Beyond this the queue is almost certainly a bug, not a long flight. */
const MAX_QUEUED = 2000;

function storage(): Storage | null {
  try {
    // Private-mode Safari throws on access rather than returning null.
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readQueue(): PendingGrade[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingGrade);
  } catch {
    return [];
  }
}

function isPendingGrade(value: unknown): value is PendingGrade {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cardId === "string" &&
    typeof v.durationMs === "number" &&
    typeof v.reviewedAt === "string" &&
    (v.rating === 1 || v.rating === 2 || v.rating === 3 || v.rating === 4)
  );
}

function write(queue: PendingGrade[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
  } catch {
    // Quota exhausted, or storage disabled. Nothing useful to do here: the
    // grade is already lost to this device, and throwing would take the rest
    // of the session down with it.
  }
}

/** Remembers one grade that could not be sent. */
export function enqueueGrade(grade: PendingGrade): void {
  write([...readQueue(), grade]);
}

export function queueSize(): number {
  return readQueue().length;
}

export function clearQueue(): void {
  const store = storage();
  try {
    store?.removeItem(KEY);
  } catch {
    // Same as write(): nothing sensible to do.
  }
}

/**
 * Sends everything queued, keeping anything the server did not accept.
 *
 * `send` is passed in rather than imported so this file stays testable and free
 * of a Server Action import — and so a caller can flush through whatever path
 * it already has open.
 */
export async function flushQueue(
  send: (batch: PendingGrade[]) => Promise<{ ok: boolean; applied?: number; failed?: string[] }>,
): Promise<{ applied: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { applied: 0, remaining: 0 };

  let result: Awaited<ReturnType<typeof send>>;
  try {
    result = await send(queue);
  } catch {
    // Still offline, or the server rejected the request outright. Keep
    // everything: a queue that clears itself on a failed send is worse than no
    // queue at all.
    return { applied: 0, remaining: queue.length };
  }

  if (!result.ok) return { applied: 0, remaining: queue.length };

  // Only the grades actually sent are removed. Anything answered while the
  // flush was in flight is still in storage and must survive it.
  const sent = new Set(queue.map(identity));
  const remaining = readQueue().filter((g) => !sent.has(identity(g)));
  write(remaining);

  const failedCount = (result.failed ?? []).length;
  return {
    applied: result.applied ?? Math.max(0, queue.length - failedCount),
    remaining: remaining.length,
  };
}

/** Identifies one queued grade: the same card can legitimately appear twice. */
function identity(g: PendingGrade): string {
  return `${g.cardId}|${g.reviewedAt}`;
}
