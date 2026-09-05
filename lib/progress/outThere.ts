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
import { isConversation, outcomeFrom, type Outcome } from "@/lib/collections/errands";
import type { DayClock } from "@/lib/time/day";

export const OUT_THERE_DAYS = 30;

/** How the conversations went over a stretch of days. */
export interface OutThereWindow {
  /** Conversations that happened. The days answered "not yesterday" are not in it. */
  readonly total: number;
  readonly switched: number;
}

export interface OutThere {
  readonly days: number;
  /** Conversations that happened. The days answered "not yesterday" are not in it. */
  readonly total: number;
  readonly byOutcome: Readonly<Record<Outcome, number>>;
  /** The run of days ending yesterday with a conversation in each. */
  readonly streak: number;
  /** The thirty days before the window, for the switch to be read against. */
  readonly previous: OutThereWindow;
}

/** What Today's card needs: whether the day's question is answered, and the month behind it. */
export interface OutThereToday {
  readonly days: number;
  /** The answer given today, about yesterday, or null where it has not been asked yet. */
  readonly answered: Outcome | null;
  /** Conversations in the window, this morning's answer included. */
  readonly conversations: number;
}

/** One report per reporting day, keyed on the day it is about. */
interface Report {
  readonly reportedOn: string;
  readonly about: string;
  readonly outcome: Outcome;
}

/**
 * The reports over the last two windows, one per reporting day, last wins.
 *
 * Reports made on the last `days` reporting days, today included, are about
 * the `days` days ending yesterday, which is the window; the `days` reporting
 * days before those are the previous one. One `findMany` for both readers.
 */
async function reports(ownerId: string, clock: DayClock, now: Date): Promise<Report[]> {
  const since = clock.shiftDay(now, 2 * OUT_THERE_DAYS - 1);
  const rows = await prisma.encounter.findMany({
    where: { ownerId, createdAt: { gte: since } },
    select: { outcome: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const byDay = new Map<string, Report>();
  for (const r of rows) {
    const outcome = outcomeFrom(r.outcome);
    if (!outcome) continue;
    const reportedOn = clock.dayKey(r.createdAt);
    byDay.set(reportedOn, { reportedOn, about: clock.dayKey(clock.shiftDay(r.createdAt, 1)), outcome });
  }
  return [...byDay.values()];
}

export async function outThere(ownerId: string, clock: DayClock, now = new Date()): Promise<OutThere> {
  const all = await reports(ownerId, clock, now);
  const recent = new Set(clock.recentDayKeys(OUT_THERE_DAYS, now));
  const byOutcome = { UNDERSTOOD: 0, SWITCHED: 0, BAILED: 0 } as Record<Outcome, number>;
  const days = new Set<string>();
  let total = 0;
  const previous = { total: 0, switched: 0 };
  for (const r of all) {
    if (!recent.has(r.reportedOn)) {
      if (isConversation(r.outcome)) {
        previous.total += 1;
        if (r.outcome === "SWITCHED") previous.switched += 1;
      }
      continue;
    }
    byOutcome[r.outcome] += 1;
    if (!isConversation(r.outcome)) continue;
    total += 1;
    days.add(r.about);
  }
  let streak = 0;
  for (const day of clock.recentDayKeys(OUT_THERE_DAYS, clock.shiftDay(now, 1)).reverse()) {
    if (!days.has(day)) break;
    streak += 1;
  }
  return { days: OUT_THERE_DAYS, total, byOutcome, streak, previous };
}

/**
 * Today's card, off the same query.
 *
 * The answer is the one given today, about yesterday, and the count is the
 * window's, this morning's answer included, because the card is the one
 * screen where the count is worth printing: it is the thing the question is
 * collecting.
 */
export async function outThereToday(ownerId: string, clock: DayClock, now = new Date()): Promise<OutThereToday> {
  const all = await reports(ownerId, clock, now);
  const recent = new Set(clock.recentDayKeys(OUT_THERE_DAYS, now));
  const today = clock.dayKey(now);
  let answered: Outcome | null = null;
  let conversations = 0;
  for (const r of all) {
    if (!recent.has(r.reportedOn)) continue;
    if (isConversation(r.outcome)) conversations += 1;
    if (r.reportedOn === today) answered = r.outcome;
  }
  return { days: OUT_THERE_DAYS, answered, conversations };
}
