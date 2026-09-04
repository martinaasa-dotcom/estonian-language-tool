/**
 * What happened outside the app.
 *
 * One reading for Progress, derived on every request from rows that are
 * facts rather than counters (ADR-014): the encounters the learner reported
 * from Today's errands over the last thirty days, by outcome. How many
 * conversations, how many understood, how often the other person switched
 * to English. A level is what the app measures and the readiness panel is
 * its forecast; this is what a person cares about, which is whether they got
 * through the conversation at the counter.
 */
import { prisma } from "@/lib/db";
import { OUTCOMES, type Outcome } from "@/lib/collections/errands";
import type { DayClock } from "@/lib/time/day";

export const OUT_THERE_DAYS = 30;

export interface OutThere {
  readonly days: number;
  readonly total: number;
  readonly byOutcome: Readonly<Record<Outcome, number>>;
  /** The run of days ending today with at least one reported conversation. */
  readonly streak: number;
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
  for (const r of rows) {
    if ((OUTCOMES as readonly string[]).includes(r.outcome)) byOutcome[r.outcome as Outcome] += 1;
    days.add(clock.dayKey(r.createdAt));
  }
  let streak = 0;
  for (const day of clock.recentDayKeys(OUT_THERE_DAYS, now).reverse()) {
    if (!days.has(day)) break;
    streak += 1;
  }
  return { days: OUT_THERE_DAYS, total: rows.length, byOutcome, streak };
}
