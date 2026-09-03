import type { Card } from "@prisma/client";

import { prisma } from "@/lib/db";
import { grade, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";
import { isKnownSlot, slotOfCard } from "@/lib/srs/slots";

/**
 * Writing one grade down.
 *
 * ONE ANSWER TO ONE QUESTION, WHICH IT WAS NOT.
 *
 * A grade arrives by two doors: `gradeCard` when the connection is up, and
 * `applyGradeBatch` when a device comes back. Both wrote the Review row and
 * then the card's new scheduling, and the two copies had drifted on the one
 * thing that is actually hard about this, which moment the grade is recorded
 * at.
 *
 * `gradeCard` floors it at the card's own creation, with a comment saying why:
 * a review dated before the card existed is a review of something that was not
 * there, and the streak, the heatmap and every "reviews this week" figure read
 * that column and cannot tell a replayed grade from a forged one. The replay
 * path had no such floor, and it is the path that carries a device's own
 * timestamps, so the fix was written on the door nobody was coming through.
 *
 * `Review` is append-only, so a bad row is permanent. That is the whole reason
 * this is one function rather than two that agree today.
 *
 * Kept out of `app/actions.ts` so it can be exercised against a real database
 * without a session, the same shape `applyGradeBatch` already takes: the owner
 * is a parameter here precisely because this module is not a public endpoint.
 */

/**
 * The moment a grade is recorded at.
 *
 * A device's clock is whatever its owner set it to, so the answer is bounded at
 * both ends: never after now, and never before the card it is about existed.
 * An unparseable date is treated as now rather than rejected, because the
 * learner did do the review and losing it to a wrong clock is the worse
 * outcome.
 */
export function reviewMoment(at: Date, createdAt: Date, now: Date): Date {
  if (Number.isNaN(at.getTime()) || at > now) return now;
  return at < createdAt ? createdAt : at;
}

export interface GradeWrite {
  /** The card row, already read and already checked to be this owner's. */
  card: Card;
  rating: RatingValue;
  durationMs: number;
  /** When the learner answered. Bounded by `reviewMoment` on the way in. */
  reviewedAt: Date;
  now?: Date;
  /**
   * The facet of the word this answer was about, where the round asked for one
   * the card is not itself about.
   *
   * The flash round asks a word the learner has met for a form no card of
   * theirs carries, and grades the nearest card they do have (ADR-016). The
   * card then says the answer was about a meaning when it was about the
   * kaasaütlev, and the variety half of mastery is counted off exactly that.
   * So the round says what it asked and this writes it down. Anything else, and
   * anything the closed list in `lib/srs/slots.ts` does not recognise, falls
   * back to what the card itself is about, because a slot nobody can read is
   * worse than the one fact we are sure of.
   */
  practisedSlot?: string | null;
  /**
   * The client-generated Review id, on the offline path.
   *
   * That path is idempotent because the id comes from the device, so a replay
   * interrupted after the commit re-sends a row that already exists. Online
   * there is nothing to be idempotent about and the database picks the id.
   */
  reviewId?: string;
}

/** Records the grade and returns the scheduling it wrote. */
export async function writeGrade(ownerId: string, write: GradeWrite): Promise<SchedulingState> {
  const { card, rating, durationMs, reviewId } = write;
  const at = reviewMoment(write.reviewedAt, card.createdAt, write.now ?? new Date());

  // The Review row goes first: the log is append-only and is the one thing
  // that cannot be reconstructed, so it must never be lost to a later failure.
  await prisma.review.create({
    data: {
      ...(reviewId ? { id: reviewId } : {}),
      ownerId,
      cardId: card.id,
      lexemeId: card.lexemeId,
      rating,
      reviewedAt: at,
      durationMs: Math.min(Math.max(durationMs, 0), 600_000),
      stateBefore: card.state,
      targetCase: card.targetCase,
      slot: slotFor(card, write.practisedSlot),
    },
  });

  const next = grade(
    {
      due: card.due, stability: card.stability, difficulty: card.difficulty,
      elapsedDays: card.elapsedDays, scheduledDays: card.scheduledDays,
      reps: card.reps, lapses: card.lapses, state: card.state,
      lastReview: card.lastReview, learningSteps: card.learningSteps,
    },
    rating,
    // The moment the learner actually answered, not the moment we heard about
    // it. Passing the clock here would silently stretch every offline interval.
    at,
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

  return next;
}

/**
 * The slot one answer goes down as.
 *
 * `targetCase` is untouched above and stays the case the *card* is about, which
 * is what the case charts read. This is the narrower question the flash round
 * can answer and an ordinary review cannot: which form was actually asked.
 */
function slotFor(card: Card, practised: string | null | undefined): string {
  if (practised && isKnownSlot(practised)) return practised;
  return slotOfCard(card);
}
