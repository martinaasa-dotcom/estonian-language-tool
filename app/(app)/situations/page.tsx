import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Page, Stack } from "@/components/ui";
import { bandsAround } from "@/lib/collections/levels";
import { LEVELS, unitById } from "@/lib/collections/syllabus";
import { courseLevelFor } from "@/lib/progress/level";
import { SCENES } from "@/lib/scenes/catalogue";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { SceneList, type SceneRow } from "./SceneList";

export const metadata = { title: "Situations" };

export const dynamic = "force-dynamic";

/**
 * The scenes, at and around the learner's level, and how each went last time.
 *
 * Every scene is offered, ordered so the ones at this learner's band lead,
 * because a scene is as hard as the words in it and `bandsAround` is the same
 * table that decides what the drills draw from. Nothing here is a score: what
 * the row says about a past run is the outcome sentence and a count of things
 * got done.
 */
export default async function SituationsPage() {
  const ownerId = await requireUserId();
  const [level, runs, clock] = await Promise.all([
    courseLevelFor(ownerId),
    prisma.sceneRun.findMany({
      where: { ownerId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { sceneId: true, outcome: true, startedAt: true },
    }),
    learnerDayClock(ownerId),
  ]);

  const bands = bandsAround(level);
  const rank = (l: string) => (l === level ? 0 : bands.includes(l) ? 1 : 2 + Math.abs(LEVELS.indexOf(l as typeof LEVELS[number]) - LEVELS.indexOf(level)));
  const scenes: SceneRow[] = [...SCENES]
    .sort((a, b) => rank(a.level) - rank(b.level) || LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
    .map((s) => {
      const mine = runs.filter((r) => r.sceneId === s.id);
      const latest = mine[0];
      let last: SceneRow["last"] = null;
      if (latest) {
        try {
          const o = JSON.parse(latest.outcome) as { outcome?: string; done?: number; of?: number };
          const ago = Math.round((clock.startOfDay().getTime() - clock.startOfDay(latest.startedAt).getTime()) / 86_400_000);
          last = {
            outcome: o.outcome ?? "", done: o.done ?? 0, of: o.of ?? 0,
            when: ago <= 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`,
          };
        } catch {
          last = null;
        }
      }
      return {
        id: s.id, title: s.title, place: s.place, level: s.level,
        canDo: unitById(s.tests)?.canDo ?? "", required: s.beats.filter((b) => b.required).length,
        last, runs: mine.length,
      };
    });

  return (
    <Page
      title="Situations"
      lead="Somebody behind a desk, with an agenda of their own. Get done what you came for, in Estonian."
    >
      <Stack>
        <SceneList scenes={scenes} level={level} />
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          You play a role, never yourself, so nothing you type is about you. Every line the other side says is a
          sentence a lexicographer recorded or one composed inside the unit&rsquo;s own words and checked word by word,
          and the screen says which. Whether you were understood is decided by the dictionary, never by a model.
        </p>
      </Stack>
    </Page>
  );
}
