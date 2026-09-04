/**
 * What happened outside the app, and what the course promised it would.
 *
 * Two readings for Progress, both derived on every request from rows that
 * are facts rather than counters (ADR-014). The first is the encounters the
 * learner reported from Today's errands over the last thirty days, by
 * outcome: how many conversations, how many understood, how often the other
 * person switched to English. The second is the course's own "you can do
 * this" claims for the units this deck has started, each with the share of
 * its words learned and, where a situation tests the claim, how the last
 * run of it went. A level is what the app measures; what you can do at a
 * counter is what a person cares about.
 */
import { prisma } from "@/lib/db";
import { OUTCOMES, type Outcome } from "@/lib/collections/errands";
import { SYLLABUS, unitProgress } from "@/lib/collections/syllabus";
import { sceneTesting } from "@/lib/scenes/catalogue";
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

export interface CanDo {
  readonly unitId: string;
  readonly title: string;
  readonly level: string;
  readonly canDo: string;
  readonly pct: number;
  /** The scene that tests it, and how the last run went, or null. */
  readonly scene: { id: string; title: string; done: number | null; of: number | null } | null;
}

export async function canDoClaims(ownerId: string, deck: {
  startedLemmas: ReadonlySet<string>; knownLemmas: ReadonlySet<string>;
}, limit = 8): Promise<CanDo[]> {
  const started = SYLLABUS.filter((u) => u.lemmas.some((l) => deck.startedLemmas.has(l)));
  const sceneIds = started.map((u) => sceneTesting(u.id)?.id).filter((id): id is string => Boolean(id));
  const runs = sceneIds.length > 0
    ? await prisma.sceneRun.findMany({
      where: { ownerId, sceneId: { in: sceneIds } },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { sceneId: true, outcome: true },
    })
    : [];
  const latest = new Map<string, { done: number | null; of: number | null }>();
  for (const r of runs) {
    if (latest.has(r.sceneId)) continue;
    try {
      // `finishRun` writes the objectives whole: which required beats were
      // met and which were missed, and never a percentage (ADR-022).
      const o = JSON.parse(r.outcome) as { met?: string[]; missed?: string[] };
      const met = Array.isArray(o.met) ? o.met.length : null;
      const missed = Array.isArray(o.missed) ? o.missed.length : 0;
      latest.set(r.sceneId, { done: met, of: met === null ? null : met + missed });
    } catch {
      latest.set(r.sceneId, { done: null, of: null });
    }
  }
  return started
    .map((u) => {
      const progress = unitProgress({
        availableLemmas: [...u.lemmas],
        startedLemmas: [...deck.startedLemmas],
        knownLemmas: [...deck.knownLemmas],
      });
      const scene = sceneTesting(u.id);
      return {
        unitId: u.id, title: u.title, level: u.level, canDo: u.canDo, pct: progress.pct,
        scene: scene ? { id: scene.id, title: scene.title, ...(latest.get(scene.id) ?? { done: null, of: null }) } : null,
      };
    })
    // The claims closest to being true first, and a tested one ahead of an untested one at a tie.
    .sort((a, b) => b.pct - a.pct || Number(Boolean(b.scene)) - Number(Boolean(a.scene)))
    .slice(0, limit);
}
