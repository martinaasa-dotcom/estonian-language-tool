/**
 * What happened outside the app.
 *
 * Two readings over one table, derived on every request from rows that are
 * facts rather than counters (ADR-014): the answers the learner gave Today
 * over the last thirty days. `outThere` is the panel on Progress, and
 * `outThereToday` is what Today's card needs, which is whether the question
 * has been answered yet and how much has been said this month. A level is
 * what the app measures and the readiness panel is its forecast; this is what
 * a person cares about, which is whether they got through the conversation at
 * the counter.
 *
 * A DAY THAT WAS ANSWERED IS NOT A DAY THAT HELD A CONVERSATION, and the
 * count used to read every row as one. Today asks whether any Estonian was
 * spoken yesterday and takes "not yesterday" for an answer, so a fortnight of
 * honest noes would have been reported back as a fortnight of real
 * conversations and a run of fourteen days. `isConversation` is the one place
 * that is decided and both figures here read it.
 */
import { prisma } from "@/lib/db";
import { isConversation, outcomeFrom, OUTCOMES, type Outcome } from "@/lib/collections/errands";
import type { DayClock } from "@/lib/time/day";

export const OUT_THERE_DAYS = 30;

export interface OutThere {
  readonly days: number;
  /** Conversations that happened. The days answered "not yesterday" are not in it. */
  readonly total: number;
  readonly byOutcome: Readonly<Record<Outcome, number>>;
  /** The run of days ending today with at least one conversation in them. */
  readonly streak: number;
}

/** What Today's card needs: whether the day's question is answered, and the month behind it. */
export interface OutThereToday {
  readonly days: number;
  /** The answer given today, about yesterday, or null where it has not been asked yet. */
  readonly answered: Outcome | null;
  /** Conversations in the window, this morning's answer included. */
  readonly conversations: number;
}

export async function outThere(ownerId: string, clock: DayClock, now = new Date()): Promise<OutThere> {
  const since = clock.startOfDay(now);
  since.setDate(since.getDate() - OUT_THERE_DAYS);
  const rows = await prisma.encounter.findMany({
    where: { ownerId, createdAt: { gte: since } },
    select: { outcome: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const byOutcome = { UNDERSTOOD: 0, SWITCHED: 0, BAILED: 0 } as Record<Outcome, number>;
  const days = new Set<string>();
  let total = 0;
  for (const r of rows) {
    if (!(OUTCOMES as readonly string[]).includes(r.outcome)) continue;
    const outcome = r.outcome as Outcome;
    byOutcome[outcome] += 1;
    if (!isConversation(outcome)) continue;
    total += 1;
    days.add(clock.dayKey(r.createdAt));
  }
  let streak = 0;
  for (const day of clock.recentDayKeys(OUT_THERE_DAYS, now).reverse()) {
    if (!days.has(day)) break;
    streak += 1;
  }
  return { days: OUT_THERE_DAYS, total, byOutcome, streak };
}

/**
 * Today's card, off one query.
 *
 * Today already read this table to find out whether the day had been answered
 * and could have had the month for the same round trip, which is what it does
 * now: a `findMany` over the window answers both, and the card is the one
 * screen where the count is worth printing, because it is the thing the
 * question is collecting.
 *
 * The answer is the last one given today, since the day's question is asked
 * once and a second row for one day can only come from two tabs.
 */
export async function outThereToday(ownerId: string, clock: DayClock, now = new Date()): Promise<OutThereToday> {
  const since = clock.startOfDay(now);
  since.setDate(since.getDate() - OUT_THERE_DAYS);
  const rows = await prisma.encounter.findMany({
    where: { ownerId, createdAt: { gte: since } },
    select: { outcome: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const startOfToday = clock.startOfDay(now);
  let answered: Outcome | null = null;
  let conversations = 0;
  for (const r of rows) {
    const outcome = outcomeFrom(r.outcome);
    if (!outcome) continue;
    if (isConversation(outcome)) conversations += 1;
    if (r.createdAt >= startOfToday) answered = outcome;
  }
  return { days: OUT_THERE_DAYS, answered, conversations };
}

