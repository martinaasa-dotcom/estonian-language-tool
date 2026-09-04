import { pathWithProgress } from "@/lib/progress/summary";
import { caseReviewsFor } from "@/lib/progress/cases";
import { courseLevelFor } from "@/lib/progress/level";
import { caseAccuracy } from "@/lib/stats/history";
import type { LearnerNote } from "@/lib/tutor/prompt";
import { prisma } from "@/lib/db";
import { sceneById } from "@/lib/scenes/catalogue";

/**
 * What Anu is told about the person asking, worked out from their own log.
 *
 * Three reads, asked at once. The level is `courseLevelFor`, the same answer
 * every other screen gives, so a level check sat in March and a correction
 * made this morning reach her in the same order they reach Progress. The
 * weakest case is `caseAccuracy` over `caseReviewsFor`, the shared query, so
 * what she says about the partitive is the figure on the Progress page rather
 * than a fourth answer to that question. The unit is the first one the deck
 * has started and not finished, else the first one still open.
 *
 * Nothing here comes from the client. The chat used to post `level: "B1"`
 * for everybody and the route believed it.
 */
export async function learnerContextFor(ownerId: string, now = new Date()): Promise<LearnerNote> {
  const [level, reviews, units, lastRun] = await Promise.all([
    courseLevelFor(ownerId),
    caseReviewsFor(ownerId, now),
    pathWithProgress(ownerId),
    // The last conversation they rehearsed, and what it stalled on, so Anu
    // can answer a question about the doctor's with the doctor's in mind.
    prisma.sceneRun.findFirst({
      where: { ownerId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { id: true, sceneId: true, outcome: true },
    }).then(async (run) => {
      if (!run) return null;
      const gaps = await prisma.sceneGap.findMany({
        where: { ownerId, runId: run.id }, select: { lemma: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 8,
      });
      return { run, gaps: gaps.map((g) => g.lemma).filter((l): l is string => l !== null) };
    }),
  ]);
  let scene: LearnerNote["scene"] = null;
  if (lastRun) {
    const spec = sceneById(lastRun.run.sceneId);
    let missed: string[] = [];
    try {
      // The stored outcome names the required beats that were missed by id;
      // the goal is the English line the learner saw for each.
      const o = JSON.parse(lastRun.run.outcome) as { missed?: string[] };
      const ids = new Set(Array.isArray(o.missed) ? o.missed : []);
      missed = (spec?.beats ?? []).filter((b) => ids.has(b.id)).map((b) => b.goal);
    } catch {
      missed = [];
    }
    if (spec) scene = { title: spec.title, missed, gaps: lastRun.gaps };
  }
  const weakest = caseAccuracy(reviews, MIN_CASE_REVIEWS)[0] ?? null;
  const current = units.find((u) => u.state === "learning") ?? units.find((u) => u.state === "available");
  return {
    level,
    weakestCase: weakest && weakest.accuracy < PERFECT
      ? { grammCase: weakest.grammCase, accuracy: weakest.accuracy, total: weakest.total }
      : null,
    unit: current
      ? { title: current.unit.title, subtitle: current.unit.subtitle, level: current.unit.cefr }
      : null,
    scene,
  };
}

/**
 * Enough answers that "your weakest case" is a fact about the learner rather
 * than about one bad evening. Twelve rather than the Progress page's three,
 * because a teacher raising it in conversation is a stronger claim than a bar
 * on a chart.
 */
const MIN_CASE_REVIEWS = 12;

/** A case answered right every time is not a weakness worth a sentence. */
const PERFECT = 100;
