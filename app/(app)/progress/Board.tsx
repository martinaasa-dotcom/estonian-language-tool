import { Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { classRoster } from "@/lib/classroom/roster";
import { xpFromRatingCounts } from "@/lib/gamification/xp";
import { SETTING_KEYS } from "@/lib/settings/store";
import { ButtonLink } from "@/components/Button";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Card, Note, SectionTitle, Skeleton } from "@/components/ui";

/**
 * WHO ELSE IS STUDYING, AT THE BOTTOM OF A PAGE OF CHARTS.
 *
 * Split out of the page for one reason: it is four round trips deep and
 * nothing above it needs a single one of them. Find the class this learner is
 * in, read its name through the relation, then the roster, or else read
 * everybody who has opted in, their names and their week. All of that used to
 * run before the first byte of a page whose first screen is a streak and a
 * heatmap, so a learner waited on a leaderboard to see their own numbers.
 *
 * Behind a `Suspense` boundary it is fetched while the rest of the page is
 * already on screen and being read, and a skeleton the size of the panel holds
 * its place so nothing under it jumps when it lands.
 *
 * Nothing about what it shows has changed, including the one thing worth
 * restating: a board carries a chosen display name and a number, and never an
 * address. See `weeklyLeaderboard` below and lib/classroom/roster.ts.
 */
export async function Board({ ownerId, now, optedIn }: {
  ownerId: string;
  now: Date;
  optedIn: boolean;
}) {
  /*
    A class you have joined is the leaderboard that means something: real
    people you sit next to, and joining was itself the consent. The
    instance-wide opt-in board is the fallback for somebody studying alone.
  */
  const membership = await prisma.classroomMember.findFirst({
    where: { ownerId, classroom: { archived: false } },
    include: { classroom: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const classBoard = membership ? await classRoster(membership.classroomId, now) : null;
  const leaderboard = !membership && optedIn ? await weeklyLeaderboard(now) : [];

  return (
    <section>
      <SectionTitle hint="this week">
        {classBoard ? membership?.classroom.name : "Class leaderboard"}
      </SectionTitle>
      <Card>
        {classBoard && membership ? (
          <>
            <ol className="flex flex-col gap-1.5">
              {classBoard.entries.slice(0, 8).map((row, i) => (
                <li
                  key={row.ownerId}
                  className="flex items-center gap-3 rounded-md px-3 py-2"
                  style={{
                    background: row.ownerId === ownerId ? "var(--accent-soft)" : "transparent",
                    color: row.ownerId === ownerId ? "var(--accent-deep)" : "var(--ink-2)",
                  }}
                >
                  <span className="tnum w-6 text-xs">{i + 1}</span>
                  {i === 0 && row.weeklyXp > 0
                    ? <Trophy size={15} aria-hidden style={{ color: "var(--hard-ink)" }} />
                    : <Users size={15} aria-hidden style={{ opacity: 0.5 }} />}
                  <span className="min-w-0 flex-1 truncate text-sm">{row.displayName}</span>
                  <span className="tnum text-xs">{row.weeklyXp} XP</span>
                </li>
              ))}
            </ol>
            <Link
              href={`/class/${membership.classroomId}`}
              className="mt-3 inline-block text-xs"
              style={{ color: "var(--accent-deep)" }}
            >
              Open the class
            </Link>
          </>
        ) : !optedIn ? (
          <>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              Off by default. Turn it on and everyone else who has opted in (your class, say)
              sees the name you choose and your XP for the week. Nothing else is shared: no
              email, no word lists, no history.
            </p>
            <ButtonLink href="/settings" className="mt-4">Set a name and join</ButtonLink>
          </>
        ) : leaderboard.length <= 1 ? (
          <Note tone="accent">
            You are in. Nobody else has joined yet. Share the app with your class and this fills
            up. Your XP this week: {leaderboard[0]?.xp ?? 0}.
          </Note>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {leaderboard.map((row, i) => (
              <li
                key={row.ownerId}
                className="flex items-center gap-3 rounded-[var(--r)] px-3 py-2"
                style={{
                  background: row.ownerId === ownerId ? "var(--accent-soft)" : "transparent",
                  color: row.ownerId === ownerId ? "var(--accent)" : "var(--ink-2)",
                }}
              >
                <span className="tnum w-6 text-xs">{i + 1}</span>
                {i === 0 ? (
                  <Trophy size={15} aria-hidden style={{ color: "var(--hard-ink)" }} />
                ) : (
                  <Users size={15} aria-hidden style={{ opacity: 0.5 }} />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                <span className="tnum text-xs">{row.xp} XP</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}

/**
 * The shape of the panel while it loads.
 *
 * Its own height rather than a spinner, so the page below does not move once
 * the answer lands. Same argument as app/(app)/loading.tsx one level up.
 */
export function BoardSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading the board">
      <SectionTitle hint="this week">Class leaderboard</SectionTitle>
      <Card>
        <Skeleton height={132} />
      </Card>
    </section>
  );
}
/** How many opted-in learners the weekly board is ranked from. */
const BOARD_CANDIDATES = 2000;

/**
 * This week's XP for everyone who has opted in.
 *
 * Only opted-in learners are read at all, and only their chosen display name
 * and a number leave the query — a leaderboard that leaked email addresses
 * would be a privacy incident, not a feature.
 *
 * The cap said it was there "since the whole thing is tallied in memory", and
 * the tallying was the reason it had to be so small: this read every review
 * every opted-in learner had written all week, which for two hundred people is
 * tens of thousands of rows fetched to produce four numbers each. Postgres
 * counts them now, so what comes back is at most four rows per learner and the
 * cap can be a bound on the `IN` list rather than on the work.
 */
async function weeklyLeaderboard(now: Date) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  /*
    Ordered, because which learners the board is drawn from was the plan's
    choice: past the cap somebody could be on it one week and gone the next
    having done nothing differently.

    There is nothing on `Setting` that ranks people, so this is stable rather
    than meaningful, and worth saying plainly: past the cap the board is the
    top twenty of a fixed two thousand opted-in learners rather than of the
    whole deployment. Ranking properly would mean tallying everybody first,
    which is the query this function just stopped doing.
  */
  const optedIn = await prisma.setting.findMany({
    where: { key: SETTING_KEYS.leaderboard, value: "1" },
    select: { ownerId: true },
    orderBy: { ownerId: "asc" },
    take: BOARD_CANDIDATES,
  });
  const ids = optedIn.map((s) => s.ownerId);
  if (ids.length === 0) return [];

  const [names, counts] = await Promise.all([
    prisma.setting.findMany({
      where: { key: SETTING_KEYS.displayName, ownerId: { in: ids } },
      select: { ownerId: true, value: true },
    }),
    prisma.review.groupBy({
      by: ["ownerId", "rating"],
      where: { reviewedAt: { gte: since }, ownerId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const nameByOwner = new Map(names.map((n) => [n.ownerId, n.value]));
  const tally = new Map<string, Record<number, number>>();
  for (const row of counts) {
    const owner = row.ownerId;
    const forOwner = tally.get(owner) ?? {};
    forOwner[row.rating] = (forOwner[row.rating] ?? 0) + row._count._all;
    tally.set(owner, forOwner);
  }

  return ids
    .map((ownerId) => ({
      ownerId,
      name: nameByOwner.get(ownerId)?.trim() || "A learner",
      xp: xpFromRatingCounts(tally.get(ownerId) ?? {}),
    }))
    // Total, so two learners level on the week are not ordered by whatever the
    // rows arrived in. Same rule as `bySubstance` in the dictionary: a
    // comparator that can return 0 for two different rows decides nothing.
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name) || a.ownerId.localeCompare(b.ownerId))
    .slice(0, 20);
}
