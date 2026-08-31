import Link from "next/link";
import { Compass, Flame, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { CEFR_LEVELS } from "@/lib/estonian/types";
import { xpFromRatingCounts } from "@/lib/gamification/xp";
import { dailySummary, deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { classRoster } from "@/lib/classroom/roster";
import {
  bestStudyHour, buildForecast, buildHeatmap, caseAccuracy, dailyLoad, ratingBreakdown,
  retentionReading,
} from "@/lib/stats/history";
import { stickingPoints } from "@/lib/stats/sticking";
import { ButtonLink } from "@/components/Button";
import { DrillLink } from "@/components/DrillLink";
import { Heatmap } from "@/components/Heatmap";
import { ShareProgress } from "@/components/ShareProgress";
import { StickingPoints } from "@/components/StickingPoints";
import { WeakestCases } from "@/components/WeakestCases";
import { caseReviewsFor } from "@/lib/progress/cases";
import { Card, Chip, Empty, Meter, Note, Page, Ring, SectionTitle, Stack, Stat } from "@/components/ui";
import { NO_VALUE } from "@/lib/copy/values";
import { formatHour } from "@/lib/time/clock";

export const metadata = { title: "Progress" };

export const dynamic = "force-dynamic";

const HEATMAP_DAYS = 182;
const TREND_DAYS = 30;
const FORECAST_DAYS = 14;

export default async function ProgressPage() {
  const ownerId = await requireUserId();
  const now = new Date();
  // Every figure below is a fact about a *day*, and this page renders on the
  // server, whose midnight is the deployment's. See lib/time/day.ts.
  const clock = await learnerDayClock(ownerId);
  const snapshot = await deckSnapshot(ownerId, now);

  const [summary, units, reviews, dueDates, cefrRows, learnerSettings, caseReviews] = await Promise.all([
    dailySummary(ownerId, snapshot, now, clock),
    pathWithProgress(ownerId, snapshot),
    prisma.review.findMany({
      where: { ownerId, reviewedAt: { gte: new Date(now.getTime() - HEATMAP_DAYS * 86_400_000) } },
      select: { reviewedAt: true, rating: true, targetCase: true, stateBefore: true, cardId: true },
      orderBy: { reviewedAt: "asc" },
    }),
    prisma.card.findMany({
      where: { ownerId, suspended: false, state: { not: 0 } },
      select: { due: true },
    }),
    prisma.card.findMany({
      where: { ownerId },
      select: { state: true, lexeme: { select: { lemma: true, cefr: true } } },
    }),
    readSettings(ownerId, [SETTING_KEYS.leaderboard, SETTING_KEYS.displayName]),
    /*
      Read separately from the charts above, and on purpose.

      This page's reading of the panel was the considered one, over the last
      half-year, and Practice and the grammar index each answered it over an
      arbitrary five thousand rows of all time. So the same learner could be
      told 100% here and 50% there about the same case on the same day. The
      panel is one component and one calculation already; this makes it one
      input too, and the window is the one this page already used.
    */
    caseReviewsFor(ownerId, now),
  ]);

  // The cards that keep coming back. Lapses live on the card's own FSRS state;
  // the accuracy beside them is counted from the log above.
  const deck = await prisma.card.findMany({
    where: { ownerId },
    select: {
      id: true, front: true, back: true, cardType: true, targetCase: true,
      lapses: true, reps: true, suspended: true,
      lexeme: { select: { lemma: true } },
    },
  });
  const sticking = stickingPoints(
    deck.map((c) => ({
      id: c.id, lemma: c.lexeme?.lemma ?? null, front: c.front, back: c.back,
      cardType: c.cardType, targetCase: c.targetCase,
      lapses: c.lapses, reps: c.reps, suspended: c.suspended,
    })),
    reviews,
  );

  const heatmap = buildHeatmap(reviews.map((r) => r.reviewedAt), HEATMAP_DAYS, now, clock);
  const forecast = buildForecast(dueDates.map((c) => c.due), FORECAST_DAYS, now, clock);
  const trend = dailyLoad(reviews, TREND_DAYS, now, clock);
  const breakdown = ratingBreakdown(reviews);
  // The narrower, more useful number: how often a card the scheduler believed
  // you knew actually came back. The recall rate above counts first sights too.
  const retention = retentionReading(reviews);
  const cases = caseAccuracy(caseReviews);
  const hour = bestStudyHour(reviews, 20, clock);
  const optedIn = learnerSettings[SETTING_KEYS.leaderboard] === "1";
  // A class you have joined is the leaderboard that means something: real people
  // you sit next to, and joining was itself the consent. The instance-wide
  // opt-in board is the fallback for someone studying alone.
  const membership = await prisma.classroomMember.findFirst({
    where: { ownerId, classroom: { archived: false } },
    include: { classroom: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const classBoard = membership ? await classRoster(membership.classroomId, now) : null;
  const leaderboard = !membership && optedIn ? await weeklyLeaderboard(now) : [];

  // Vocabulary reach by CEFR: known words per level, against what the deck holds.
  const byLevel = new Map<string, { total: Set<string>; known: Set<string> }>();
  for (const card of cefrRows) {
    const lemma = card.lexeme?.lemma;
    if (!lemma) continue;
    const level = card.lexeme?.cefr ?? NO_VALUE;
    const entry = byLevel.get(level) ?? { total: new Set<string>(), known: new Set<string>() };
    entry.total.add(lemma);
    if (snapshot.knownLemmas.has(lemma)) entry.known.add(lemma);
    byLevel.set(level, entry);
  }

  const busiest = Math.max(1, ...forecast.map((f) => f.count));
  const trendPeak = Math.max(1, ...trend.map((d) => d.reviews));
  const pathKnown = units.reduce((s, u) => s + u.known, 0);
  const pathTotal = units.reduce((s, u) => s + u.available, 0);

  if (reviews.length === 0 && snapshot.totalCards === 0) {
    return (
      <Page title="Progress" lead="Computed live from your review log, never stored, so it cannot drift.">
        <Empty
          title="No history yet"
          body="Charts appear after your first review."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  return (
    <Page
      title="Progress"
      lead="Computed live from your review log, never stored, so it cannot drift."
      actions={
        <ButtonLink href="/assess">
          <Compass size={15} aria-hidden /> Level check
        </ButtonLink>
      }
    >
      <Stack>
        <Card className="flex flex-wrap items-center gap-6">
          <Ring pct={summary.level.pct} size={78} label={`Level ${summary.level.level}, ${summary.level.pct}% to the next`}>
            <span className="tnum text-lg font-bold" style={{ color: "var(--ink)" }}>
              {summary.level.level}
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p lang="et" className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
              {summary.level.title}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              {summary.level.gloss} · {summary.level.totalXp} XP total · {summary.level.remaining} to level {summary.level.level + 1}
            </p>
            <div className="mt-2 max-w-sm">
              <Meter pct={summary.level.pct} label="Level progress" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-7">
            <Stat
              value={<span className="inline-flex items-center gap-1.5">{summary.streak}<Flame size={18} aria-hidden style={{ color: "var(--hard-ink)" }} /></span>}
              label="Day streak"
            />
            <Stat value={snapshot.knownCards} label="Cards known" tone="var(--good-ink)" />
            <Stat value={breakdown.accuracy === null ? NO_VALUE : `${breakdown.accuracy}%`} label="Recall rate" />
            <ShareProgress />
          </div>
        </Card>

        {/* The number FSRS is actually steering, and what it means. Placed
            above the charts because it is the one that changes what to do. */}
        <section>
          <SectionTitle hint="cards the scheduler thought you knew">True retention</SectionTitle>
          <Card tone={
            retention.verdict === "below" ? "peach"
              : retention.verdict === "above" ? "butter"
                : retention.verdict === "on-target" ? "mint" : "plain"
          }>
            <div className="flex flex-wrap items-center gap-6">
              <Ring
                pct={retention.retention ?? 0}
                size={78}
                tone={
                  retention.verdict === "below" ? "var(--again)"
                    : retention.verdict === "above" ? "var(--hard)" : "var(--good)"
                }
                label={
                  retention.retention === null
                    ? "Not enough mature reviews to measure retention yet"
                    : `${retention.retention}% of mature cards recalled, against a ${retention.target}% target`
                }
              >
                <span className="tnum text-lg font-bold" style={{ color: "var(--ink)" }}>
                  {retention.retention === null ? NO_VALUE : `${retention.retention}%`}
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="text-md font-bold" style={{ color: "var(--ink)" }}>
                  {retention.headline}
                </p>
                <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {retention.advice}
                </p>
                <p className="tnum mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                  {retention.recalled} recalled of {retention.reviews} mature reviews · target {retention.target}%
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/*
          The hour used to be a sentence under the chart explaining that a
          consistent time survives a busy week. The section title already has
          a slot on the right for exactly this kind of fact, and a reader
          skimming a column of charts reads the labels, not the footnotes.
        */}
        <section>
          <SectionTitle hint={hour === null ? `last ${HEATMAP_DAYS} days` : `${HEATMAP_DAYS} days · most at ${formatHour(hour)}`}>
            Study history
          </SectionTitle>
          <Card>
            <Heatmap days={heatmap} />
          </Card>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section>
            <SectionTitle hint={`next ${FORECAST_DAYS} days · overdue counted as today`}>What&rsquo;s coming</SectionTitle>
            <Card>
              <div className="flex h-28 items-end gap-1.5">
                {forecast.map((f) => (
                  <div key={f.day} className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className="w-full rounded-t-[2px]"
                      style={{
                        height: `${Math.max(2, (f.count / busiest) * 88)}px`,
                        background: f.offset === 0 ? "var(--accent)" : "var(--accent-soft)",
                      }}
                      title={`${f.day}: ${f.count} card${f.count === 1 ? "" : "s"} due`}
                    />
                    <span className="text-2xs" style={{ color: "var(--ink-3)" }}>
                      {f.offset === 0 ? "now" : f.offset % 2 === 0 ? f.offset : ""}
                    </span>
                  </div>
                ))}
              </div>
              {dueDates.length === 0 && (
                <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                  This fills in as cards graduate out of the learning steps.
                </p>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle hint={`last ${TREND_DAYS} days`}>Reviews and recall</SectionTitle>
            <Card>
              <div className="flex h-28 items-end gap-[3px]">
                {trend.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col justify-end" title={`${d.day}: ${d.reviews} reviews${d.accuracy === null ? "" : `, ${d.accuracy}% recalled`}`}>
                    <span
                      className="w-full rounded-t-[2px]"
                      style={{
                        height: `${Math.max(2, (d.reviews / trendPeak) * 88)}px`,
                        background:
                          d.accuracy === null ? "var(--raised)"
                          : d.accuracy >= 85 ? "var(--good)"
                          : d.accuracy >= 65 ? "var(--hard)" : "var(--again)",
                      }}
                    />
                  </div>
                ))}
              </div>
              {breakdown.total === 0 && (
                <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                  No reviews yet. Each bar is a day, coloured by how much you recalled.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone="again">{breakdown.again} again</Chip>
                <Chip tone="hard">{breakdown.hard} hard</Chip>
                <Chip tone="good">{breakdown.good} good</Chip>
                <Chip tone="accent">{breakdown.easy} easy</Chip>
              </div>
            </Card>
          </section>
        </div>

        {sticking.length > 0 && (
          <section>
            <SectionTitle hint="learned and forgotten more than once">Sticking points</SectionTitle>
            <StickingPoints points={sticking} />
            {/* The drill for exactly the cards listed above it. It used to be
                on the practice menu, five rows from anything saying which of
                your cards keep failing. */}
            <div className="mt-3">
              <DrillLink href="/review/clinic" />
            </div>
          </section>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <section>
            <SectionTitle hint="weakest first">Cases</SectionTitle>
            <Card>
              <WeakestCases
                cases={cases}
                empty={
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    No case-form cards answered yet. Add a noun unit from the{" "}
                    <Link href="/learn" className="underline" style={{ color: "var(--accent-deep)" }}>path</Link>.
                  </p>
                }
              />
            </Card>
          </section>

          <section>
            <SectionTitle hint={`${pathKnown} of ${pathTotal} path words · your deck only`}>Vocabulary reach</SectionTitle>
            <Card>
              <ul className="flex flex-col gap-2">
                {CEFR_LEVELS.map((level) => {
                  const entry = byLevel.get(level);
                  if (!entry || entry.total.size === 0) return null;
                  const pct = Math.round((entry.known.size / entry.total.size) * 100);
                  return (
                    <li key={level} className="flex items-center gap-3 text-sm">
                      <span className="w-8" style={{ color: "var(--ink-2)" }}>{level}</span>
                      <span className="flex-1">
                        <Meter pct={pct} label={`${level}: ${entry.known.size} of ${entry.total.size} known`} height={5} />
                      </span>
                      <span className="tnum w-16 text-right text-xs" style={{ color: "var(--ink-3)" }}>
                        {entry.known.size}/{entry.total.size}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                Counted once every card from a word has graduated, so it is a floor.
              </p>
            </Card>
          </section>
        </div>

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
      </Stack>
    </Page>
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
