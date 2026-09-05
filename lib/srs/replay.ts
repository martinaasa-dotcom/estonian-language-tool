import { prisma } from "@/lib/db";
import { writeGrade } from "@/lib/srs/grade";
import { type RatingValue } from "@/lib/srs/scheduler";
import { REPLAY_BATCH, clampReviewedAt, isValidPending, orderForReplay } from "@/lib/offline/outbox";

export interface ReplayItem {
  id: string;
  cardId: string;
  rating: RatingValue;
  durationMs: number;
  reviewedAt: number;
  /** See `PendingGrade.slot`. Checked against the closed list by `writeGrade`. */
  slot?: string;
  /** See `PendingGrade.reachedSlot`. Checked the same way, and more narrowly. */
  reachedSlot?: string;
}

export interface ReplayResult {
  ok: boolean;
  settled: string[];
  error?: string;
}

/**
 * Applies grades taken while the connection was down.
 *
 * Kept out of `app/actions.ts` so it can be exercised against a real database
 * without a session — the server action is a thin authentication wrapper over
 * this, the same shape as `addToDeck` over `addCardsFor`. The owner is a
 * parameter here precisely because this module is *not* a public endpoint;
 * nothing in it may be exported from a `"use server"` file.
 *
 * Idempotent by construction: the client generates each grade's `id` and the
 * Review row is written with it, so a replay interrupted after the server
 * committed but before the client heard about it re-sends rows that already
 * exist. Those come back as settled and the client stops resending them. This
 * is only safe because Review is append-only — there is no prior state to
 * reconcile, only facts that either landed or did not.
 */
export async function applyGradeBatch(
  ownerId: string,
  batch: ReplayItem[],
): Promise<ReplayResult> {
  if (batch.length === 0) return { ok: true, settled: [] };
  if (batch.length > REPLAY_BATCH) {
    return { ok: false, settled: [], error: "Too many grades in one batch." };
  }

  const now = Date.now();
  const settled: string[] = [];

  /*
    ONE QUESTION ASKED ONCE, NOT FIFTY TIMES.

    "Have I seen this grade before" was a `findUnique` per item. It is the one
    query in this loop that does not depend on what the previous grade did:
    a `Review` id is generated on the client and the only rows this loop
    creates are its own, so the answer for the whole batch can be read up
    front. Measured against a real database, and a *local* one where a round
    trip is a tenth of a millisecond: fifty grades took 420ms, and the check
    is a quarter of the queries. A deployment reaches its database over a
    pooler, where that quarter costs a great deal more, and this runs on
    reconnect when a learner is waiting to see their streak.

    The read-modify-write below stays per item, because that one *is* what the
    previous grade left behind.

    Deduplicated by id first, which was free before and is not now: a batch
    that repeats an id used to work by accident, since the second copy found
    the row the first had just written. Against a set read before the loop it
    would try to insert twice and fail the whole batch. `orderForReplay` sorts
    by time then id, so the copy kept is the earliest.
  */
  /*
    A ROW THAT CANNOT BE APPLIED IS STILL SETTLED, OR THE QUEUE NEVER EMPTIES.

    An item failing `isValidPending` was filtered out here and so never reached
    `settled`, which is the list the client drops from the outbox. The drain
    loop in `OfflineProvider` stops as soon as a pass settles nothing, so one
    corrupted or hand-edited IndexedDB row left the "grades pending" badge
    non-zero for ever and made the flush on sign-out permanently incomplete:
    the rail asks before losing a grade, so the learner was warned about a row
    that could never land.

    It is the same case as the deleted card below, which is settled with the
    reason that settling it stops the client retrying for ever, and it is not a
    probe: nothing is looked up, so it says nothing about whether anybody
    else's review exists. The id is safe to name because it is the store's own
    key, so every row that was written has one.
  */
  const usable = batch.filter(isValidPending);
  for (const item of batch) {
    if (usable.includes(item)) continue;
    const id = (item as { id?: unknown })?.id;
    if (typeof id === "string" && id.length > 0) settled.push(id);
  }

  const ordered = orderForReplay(usable);
  const wanted: typeof ordered = [];
  const seenIds = new Set<string>();
  for (const item of ordered) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    wanted.push(item);
  }

  const alreadyHere = new Map(
    (await prisma.review.findMany({
      where: { id: { in: wanted.map((i) => i.id) } },
      select: { id: true, ownerId: true },
    })).map((r) => [r.id, r.ownerId]),
  );

  // Sequential on purpose. Each grade reads the state the previous one left
  // behind, which is exactly what makes a replay equal to having been online.
  for (const item of wanted) {
    const existingOwner = alreadyHere.get(item.id);
    if (existingOwner !== undefined) {
      // Settle it only if it is genuinely this user's, so a guessed id cannot be
      // used to probe whether someone else's review exists.
      if (existingOwner === ownerId) settled.push(item.id);
      continue;
    }

    const card = await prisma.card.findFirst({ where: { id: item.cardId, ownerId } });
    if (!card) {
      // The card was deleted while the device was away. The grade has nowhere to
      // land; settling it stops the client retrying forever.
      settled.push(item.id);
      continue;
    }

    // Two floors, and they answer different questions. `clampReviewedAt` is
    // about a wrong device clock and knows nothing about the card; `writeGrade`
    // will not let a review predate the card it is about. Flooring is
    // monotonic, so neither can reorder a batch `orderForReplay` has sorted.
    await writeGrade(ownerId, {
      card,
      rating: item.rating,
      durationMs: item.durationMs,
      reviewedAt: new Date(clampReviewedAt(item.reviewedAt, now)),
      now: new Date(now),
      reviewId: item.id,
      practisedSlot: item.slot,
      reachedSlot: item.reachedSlot,
    });

    settled.push(item.id);
  }

  return { ok: true, settled };
}
