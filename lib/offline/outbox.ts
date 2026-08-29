import type { RatingValue } from "@/lib/srs/scheduler";

/**
 * The rules for grades taken while the connection was gone.
 *
 * Review is the daily path and CLAUDE.md requires it to work offline, but
 * grading is a server action, so until now a lost connection lost the session.
 *
 * What makes this tractable is the append-only review log. A grade is a fact
 * about a moment — "at 08:41 I rated this Good" — not a request to compute
 * something. Facts commute with waiting: replaying them later, in order, with
 * their original timestamps, produces exactly the state that would have existed
 * had the network never dropped, because `grade()` takes `now` as a parameter.
 * There is no conflict to resolve and no merge to get wrong. That is the payoff
 * for the discipline of never updating a Review row.
 *
 * This module is pure so the ordering and clamping rules can be tested without a
 * browser; `lib/offline/db.ts` is the thin IndexedDB layer beneath it.
 */

export interface PendingGrade {
  /** Client-generated, so a replay that half-succeeds cannot duplicate a row. */
  id: string;
  cardId: string;
  rating: RatingValue;
  durationMs: number;
  /** Epoch milliseconds, from the learner's device. Untrusted; see `clampReviewedAt`. */
  reviewedAt: number;
}

/** A grade recorded more than this long ago is too stale to trust as a timestamp. */
export const MAX_BACKDATE_DAYS = 30;

/**
 * Brings a device-supplied timestamp into a range the server can accept.
 *
 * The clock on a phone is whatever its owner set it to, and `reviewedAt` decides
 * an interval, so it cannot be taken at face value. A future timestamp would
 * schedule a card into the past; one from years ago would compute an enormous
 * elapsed interval and blow up the card's stability. Both clamp to something
 * sane rather than being rejected — the learner did do the review, and losing it
 * to a wrong clock would be the worse outcome.
 */
export function clampReviewedAt(reviewedAt: number, now: number): number {
  if (!Number.isFinite(reviewedAt)) return now;
  const floor = now - MAX_BACKDATE_DAYS * 86_400_000;
  if (reviewedAt > now) return now;
  if (reviewedAt < floor) return floor;
  return reviewedAt;
}

/**
 * Puts a batch into the order the server must apply it in.
 *
 * Strictly chronological, because two grades of the *same* card compound: an
 * Again followed by a Good is a different schedule from a Good followed by an
 * Again. Ties break on id so the order is total and a retry replays identically.
 */
export function orderForReplay(pending: PendingGrade[]): PendingGrade[] {
  return [...pending].sort(
    (a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id),
  );
}

/**
 * Drops entries already known to the server.
 *
 * A replay can be interrupted after the server committed but before the client
 * heard so. Re-sending is therefore normal, and the server answers with the ids
 * it has; those are settled and must not be applied twice.
 */
export function withoutSettled(pending: PendingGrade[], settledIds: string[]): PendingGrade[] {
  const settled = new Set(settledIds);
  return pending.filter((p) => !settled.has(p.id));
}

/** Guards the queue against a corrupted or hand-edited IndexedDB row. */
export function isValidPending(value: unknown): value is PendingGrade {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" && v.id.length > 0 &&
    typeof v.cardId === "string" && v.cardId.length > 0 &&
    (v.rating === 1 || v.rating === 2 || v.rating === 3 || v.rating === 4) &&
    typeof v.durationMs === "number" && Number.isFinite(v.durationMs) &&
    typeof v.reviewedAt === "number" && Number.isFinite(v.reviewedAt)
  );
}

/** Batches so one failure costs a small retry rather than the whole backlog. */
export const REPLAY_BATCH = 50;

export function nextBatch(pending: PendingGrade[]): PendingGrade[] {
  return orderForReplay(pending).slice(0, REPLAY_BATCH);
}
