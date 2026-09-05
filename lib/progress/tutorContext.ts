import { pathWithProgress } from "@/lib/progress/summary";
import { caseReviewsFor } from "@/lib/progress/cases";
import { courseLevelFor, currentLevelAnswer } from "@/lib/progress/level";
import { goalsFor } from "@/lib/progress/assessment";
import { describeSituation, reasonsFor } from "@/lib/assessment/goals";
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
  /*
    Six reads, asked at once. The level and how it is known come from the
    same rule (`currentLevelAnswer`), which is what keeps her from being told
    "B1" about a learner the plan is treating as a guess; the situation comes
    off the reasons they gave, the same phrase the plan prints; and the last
    conversation they rehearsed comes off its own run.
  */
  const [level, answer, goals, reviews, units, lastRun] = await Promise.all([
    courseLevelFor(ownerId),
    currentLevelAnswer(ownerId),
    goalsFor(ownerId).catch(() => null),
    caseReviewsFor(ownerId, now),
    pathWithProgress(ownerId),
    /*
      The last conversation they rehearsed, and what it stalled on, so Anu can
      answer a question about the doctor's with the doctor's in mind.

      FINISHED, AND RECENT. `endedAt` is what `finishRun` writes and it was
      not in this query, so a run somebody opened and closed the tab on was
      handed to Anu as the conversation they had just had, with an empty
      `outcome` that parses to no missed beats and no gaps: the least useful
      shape this can take, since she is told a scene is current and told
      nothing about it. And a conversation from March is not what somebody is
      asking about today, so it is bounded, and the order is by when it ended
      rather than when it was opened, because that is what "the last one" is.
    */
    prisma.sceneRun.findFirst({
      where: { ownerId, endedAt: { not: null, gte: sceneSince(now) } },
      orderBy: [{ endedAt: "desc" }, { id: "desc" }],
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
  const standing: LearnerNote["standing"] = answer?.kind === "measured"
    ? {
        source: "measured",
        skills: Object.fromEntries(
          Object.entries(answer.bySkill).filter(([, l]) => l !== null),
        ) as Partial<Record<"reading" | "listening" | "writing", string>>,
      }
    : { source: "estimated" };
  return {
    level,
    standing,
    situation: goals ? describeSituation(reasonsFor(goals.reason)) : null,
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

/**
 * How far back a rehearsed conversation is still the one they had.
 *
 * The same thirty days `outThere` reads, and for the same reason: it is the
 * stretch a person means by "lately". Beyond it the scene is a fact about
 * last term and Anu is better told nothing than told it is current.
 */
const SCENE_DAYS = 30;
const sceneSince = (now: Date) => new Date(now.getTime() - SCENE_DAYS * 86_400_000);

/** A case answered right every time is not a weakness worth a sentence. */
const PERFECT = 100;
