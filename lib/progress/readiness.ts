import { cache } from "react";
import { prisma } from "@/lib/db";
import { dictionaryLemmas, lemmasByCardLexeme } from "@/lib/dict/facts";
import { caseAccuracy } from "@/lib/stats/history";
import { caseReviewsFor } from "@/lib/progress/cases";
import { latestFor } from "@/lib/progress/assessment";
import { recentAttempts } from "@/lib/progress/exam";
import { courseLevelFor } from "@/lib/progress/level";
import type { Level } from "@/lib/collections/syllabus";
import { wordEvidence, type ReviewRow, type WordEvidence } from "@/lib/readiness/evidence";
import {
  readSituation, summarise, type Context, type Reading, type Summary,
} from "@/lib/readiness/rungs";
import { SITUATIONS, situationById } from "@/lib/readiness/situations";
import { slotOfCard } from "@/lib/srs/slots";

/**
 * The learner's readiness for every situation the course promises, read off
 * the log.
 *
 * Nothing is stored (ADR-014). Every reading is derived on the request from
 * the append-only review log, the learner's cases over the shared half-year
 * window, the most recent level check and the mock papers they have sat.
 * Five reads that do not need each other, at once, and one that does.
 *
 * WHY THE CASES COME THROUGH `caseReviewsFor`. "Your weakest cases" is one
 * question and the app has learned the hard way that a second query behind
 * the same calculation is a second answer (lib/progress/cases.ts). The rung a
 * situation's cases block is decided from the same rows Progress prints, so
 * a learner told the osastav is at 55 percent on one screen is told the same
 * on this one.
 */

const CAP = 20_000;

export interface ReadinessPicture {
  level: Level;
  readings: Reading[];
  summary: Summary;
  /** Reviews behind the whole picture. Zero means the page has nothing to say. */
  totalReviews: number;
  /** What the log says about each word, keyed on the lemma. One reading, shared with the detail page. */
  evidence: ReadonlyMap<string, WordEvidence>;
}

async function evidenceByLemma(ownerId: string, now: Date): Promise<Map<string, WordEvidence>> {
  /*
    The log and the deck, at once.

    `Review.slot` says what a card asked and is null on every row written
    before the column existed, which on a deployment this new is most of them.
    Read as recognition, which is the safe direction, those rows would put a
    learner who had produced every word of a unit at "follow it" for as long
    as the old rows outnumber the new ones. The card the row points at still
    knows its type and its case, so a row with no slot takes the card's,
    exactly as `lib/srs/mastery.ts` reads `slotOfCard`. `Review` has no
    relation to `Card` on purpose, so this is a lookup and not a join, and a
    card since deleted leaves its rows as they were.
  */
  const [reviews, cards] = await Promise.all([
    // The most recent twenty thousand, ordered, for the reason every other
    // truncated read here is: a slice the planner chose moves on its own.
    prisma.review.findMany({
      where: { ownerId, lexemeId: { not: null } },
      select: {
        cardId: true, lexemeId: true, rating: true, slot: true, targetCase: true, durationMs: true, reviewedAt: true,
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
      take: CAP,
    }),
    prisma.card.findMany({
      where: { ownerId },
      select: { id: true, cardType: true, targetCase: true },
    }),
  ]);
  const entries = await lemmasByCardLexeme(reviews.map((r) => r.lexemeId));
  const slotByCard = new Map(cards.map((c) => [c.id, slotOfCard(c)]));

  const byLemma = new Map<string, ReviewRow[]>();
  for (const row of reviews) {
    const lemma = row.lexemeId === null ? undefined : entries.get(row.lexemeId)?.lemma;
    if (!lemma) continue;
    const held = byLemma.get(lemma) ?? [];
    held.push({ ...row, slot: row.slot ?? slotByCard.get(row.cardId) ?? null });
    byLemma.set(lemma, held);
  }

  const out = new Map<string, WordEvidence>();
  for (const [lemma, rows] of byLemma) out.set(lemma, wordEvidence(rows, now));
  return out;
}

/** Memoised for the render: Progress, the list and a unit page may all ask. */
export const readinessPicture = cache(async (ownerId: string, now = new Date()): Promise<ReadinessPicture> => {
  const [evidence, available, caseRows, placement, attempts, level] = await Promise.all([
    evidenceByLemma(ownerId, now),
    dictionaryLemmas(),
    caseReviewsFor(ownerId, now),
    latestFor(ownerId),
    recentAttempts(ownerId),
    courseLevelFor(ownerId),
  ]);

  const cases = new Map(caseAccuracy(caseRows, 1).map((c) => [c.grammCase, { pct: c.accuracy, reviews: c.total }]));

  const ctx: Context = {
    evidence,
    available,
    cases,
    listening: {
      placed: placement?.listening ?? null,
      sittings: attempts.filter((a) => typeof a.parts?.listening === "number").length,
    },
  };

  const readings = SITUATIONS.map((s) => readSituation(s, ctx));
  let totalReviews = 0;
  for (const e of evidence.values()) totalReviews += e.recognise.asked + e.produce.asked;

  return { level, readings, summary: summarise(readings, level), totalReviews, evidence };
});

/** One situation's reading, for the unit page and the detail page. */
export async function readingFor(ownerId: string, unitId: string): Promise<Reading | null> {
  if (!situationById(unitId)) return null;
  const picture = await readinessPicture(ownerId);
  return picture.readings.find((r) => r.situation.id === unitId) ?? null;
}
