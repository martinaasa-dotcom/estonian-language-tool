import { prisma } from "@/lib/db";
import { grade, type RatingValue } from "@/lib/srs/scheduler";
import { REPLAY_BATCH, clampReviewedAt, isValidPending, orderForReplay } from "@/lib/offline/outbox";

export interface ReplayItem {
  id: string;
  cardId: string;
  rating: RatingValue;
  durationMs: number;
  reviewedAt: number;
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

  // Sequential on purpose. Each grade reads the state the previous one left
  // behind, which is exactly what makes a replay equal to having been online.
  for (const item of orderForReplay(batch.filter(isValidPending))) {
    const existing = await prisma.review.findUnique({
      where: { id: item.id },
      select: { ownerId: true },
    });
    if (existing) {
      // Settle it only if it is genuinely this user's, so a guessed id cannot be
      // used to probe whether someone else's review exists.
      if (existing.ownerId === ownerId) settled.push(item.id);
      continue;
    }

    const card = await prisma.card.findFirst({ where: { id: item.cardId, ownerId } });
    if (!card) {
      // The card was deleted while the device was away. The grade has nowhere to
      // land; settling it stops the client retrying forever.
      settled.push(item.id);
      continue;
    }

    const reviewedAt = new Date(clampReviewedAt(item.reviewedAt, now));

    await prisma.review.create({
      data: {
        id: item.id,
        ownerId,
        cardId: card.id,
        lexemeId: card.lexemeId,
        rating: item.rating,
        durationMs: Math.min(Math.max(item.durationMs, 0), 600_000),
        stateBefore: card.state,
        targetCase: card.targetCase,
        reviewedAt,
      },
    });

    const next = grade(
      {
        due: card.due, stability: card.stability, difficulty: card.difficulty,
        elapsedDays: card.elapsedDays, scheduledDays: card.scheduledDays,
        reps: card.reps, lapses: card.lapses, state: card.state,
        lastReview: card.lastReview, learningSteps: card.learningSteps,
      },
      item.rating,
      // The moment the learner actually answered, not the moment we heard about
      // it. Passing `now` here would silently stretch every offline interval.
      reviewedAt,
    );

    await prisma.card.update({
      where: { id: card.id },
      data: {
        due: next.due, stability: next.stability, difficulty: next.difficulty,
        elapsedDays: next.elapsedDays, scheduledDays: next.scheduledDays,
        reps: next.reps, lapses: next.lapses, state: next.state,
        learningSteps: next.learningSteps, lastReview: next.lastReview,
      },
    });

    settled.push(item.id);
  }

  return { ok: true, settled };
}
