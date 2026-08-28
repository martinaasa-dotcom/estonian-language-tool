import Link from "next/link";
import { Flame, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { CEFR_LEVELS } from "@/lib/estonian/types";
import { xpFromRatingCounts } from "@/lib/gamification/xp";
import { dailySummary, deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import {
  bestStudyHour, buildForecast, buildHeatmap, caseAccuracy, dailyLoad, ratingBreakdown,
} from "@/lib/stats/history";
import { ButtonLink } from "@/components/Button";
import { Heatmap } from "@/components/Heatmap";
import { Card, Chip, Empty, Meter, Note, Page, Ring, SectionTitle, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const HEATMAP_DAYS = 182;
const TREND_DAYS = 30;
const FORECAST_DAYS = 14;

export default async function ProgressPage() {
  const ownerId = await requireUserId();
  const now = new Date();
  const snapshot = await deckSnapshot(ownerId, now);

  const [summary, units, reviews, dueDates, cefrRows, learnerSettings] = await Promise.all([
    dailySummary(ownerId, snapshot, now),
    pathWithProgress(ownerId, snapshot),
    prisma.review.findMany({
      where: { card: { ownerId }, reviewedAt: { gte: new Date(now.getTime() - HEATMAP_DAYS * 86_400_000) } },
      select: { reviewedAt: true, rating: true, targetCase: true },
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
  ]);

  const heatmap = buildHeatmap(reviews.map((r) => r.reviewedAt), HEATMAP_DAYS, now);
  const forecast = buildForecast(dueDates.map((c) => c.due), FORECAST_DAYS, now);
  const trend = dailyLoad(reviews, TREND_DAYS, now);
  const breakdown = ratingBreakdown(reviews);
  const cases = caseAccuracy(reviews);
  const hour = bestStudyHour(reviews);
  const optedIn = learnerSettings[SETTING_KEYS.leaderboard] === "1";
  const leaderboard = optedIn ? await weeklyLeaderboard(now) : [];

  // Vocabulary reach by CEFR: known words per level, against what the deck holds.
  const byLevel = new Map<string, { total: Set<string>; known: Set<string> }>();
  for (const card of cefrRows) {
    const lemma = card.lexeme?.lemma;
    if (!lemma) continue;
    const level = card.lexeme?.cefr ?? "—";
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
      <Page title="Progress" lead="Everything here is computed from your review log — nothing is stored, so nothing can drift.">
        <Empty
          title="No history yet"
          body="Charts appear after your first review. Start a unit and come back tomorrow — the interesting part is the shape over weeks."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  return (
    <Page
      title="Progress"
      lead="Computed live from the review log. Nothing here is a stored score, so it cannot drift from what you actually did."
    >
      <div className="flex flex-col gap-6">
        <Card className="flex flex-wrap items-center gap-6">
          <Ring pct={summary.level.pct} size={78} label={`Level ${summary.level.level}, ${summary.level.pct}% to the next`}>
            <span className="est tnum text-[20px] font-bold" style={{ color: "var(--ink)" }}>
              {summary.level.level}
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p lang="et" className="est text-[20px] font-semibold" style={{ color: "var(--ink)" }}>
              {summary.level.title}
            </p>
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {summary.level.gloss} · {summary.level.totalXp} XP total · {summary.level.remaining} to level {summary.level.level + 1}
            </p>
            <div className="mt-2 max-w-sm">
              <Meter pct={summary.level.pct} label="Level progress" />
            </div>
          </div>
          <div className="flex flex-wrap gap-7">
            <Stat
              value={<span className="inline-flex items-center gap-1.5">{summary.streak}<Flame size={18} aria-hidden style={{ color: "var(--hard)" }} /></span>}
              label="Day streak"
            />
            <Stat value={snapshot.knownCards} label="Cards known" tone="var(--good)" />
            <Stat value={breakdown.accuracy === null ? "—" : `${breakdown.accuracy}%`} label="Recall rate" />
          </div>
        </Card>

        <section>
          <SectionTitle hint={`last ${HEATMAP_DAYS} days`}>Study history</SectionTitle>
          <Card>
            <Heatmap days={heatmap} />
            {hour !== null && (
              <p className="mt-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
                You study most at {formatHour(hour)}. Reviews done at a consistent time are the ones
                that survive a busy week.
              </p>
            )}
          </Card>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section>
            <SectionTitle hint={`next ${FORECAST_DAYS} days`}>What&rsquo;s coming</SectionTitle>
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
                    <span className="text-[9px]" style={{ color: "var(--ink-3)" }}>
                      {f.offset === 0 ? "now" : f.offset % 2 === 0 ? f.offset : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                {dueDates.length === 0
                  ? "Nothing scheduled yet — this fills in as cards graduate out of the learning steps."
                  : "Overdue cards are counted as today, because that is when the work is. A flat-ish shape means the scheduler has settled; a spike means a big day was added at once."}
              </p>
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
                <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  No reviews in this window yet. Each bar is a day, coloured by how much you recalled.
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

        <div className="grid gap-5 md:grid-cols-2">
          <section>
            <SectionTitle hint="weakest first">Cases</SectionTitle>
            <Card>
              {cases.length === 0 ? (
                <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                  No case-form cards answered yet. Add a noun unit from the{" "}
                  <Link href="/learn" className="underline" style={{ color: "var(--accent)" }}>path</Link>{" "}
                  and this becomes the most useful chart here.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cases.map((c) => (
                    <li key={c.grammCase}>
                      <Link
                        href={`/review?case=${c.grammCase}`}
                        className="flex items-center gap-3 rounded px-1 py-1 text-[13.5px] transition-opacity hover:opacity-75"
                      >
                        <span className="w-24" style={{ color: "var(--ink-2)" }}>{c.grammCase.toLowerCase()}</span>
                        <span className="flex-1">
                          <Meter
                            pct={c.accuracy}
                            label={`${c.grammCase.toLowerCase()}: ${c.accuracy}%`}
                            tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                            height={5}
                          />
                        </span>
                        <span className="tnum w-16 text-right text-[12px]" style={{ color: "var(--ink-3)" }}>
                          {c.accuracy}% · {c.total}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle hint={`${pathKnown} of ${pathTotal} path words`}>Vocabulary reach</SectionTitle>
            <Card>
              <ul className="flex flex-col gap-2">
                {CEFR_LEVELS.map((level) => {
                  const entry = byLevel.get(level);
                  if (!entry || entry.total.size === 0) return null;
                  const pct = Math.round((entry.known.size / entry.total.size) * 100);
                  return (
                    <li key={level} className="flex items-center gap-3 text-[13.5px]">
                      <span className="w-8" style={{ color: "var(--ink-2)" }}>{level}</span>
                      <span className="flex-1">
                        <Meter pct={pct} label={`${level}: ${entry.known.size} of ${entry.total.size} known`} height={5} />
                      </span>
                      <span className="tnum w-16 text-right text-[12px]" style={{ color: "var(--ink-3)" }}>
                        {entry.known.size}/{entry.total.size}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                Only counts words in your own deck, and only once every card made from them has
                graduated. It is a floor on what you know, never a flattering estimate.
              </p>
            </Card>
          </section>
        </div>

        <section>
          <SectionTitle hint="this week">Class leaderboard</SectionTitle>
          <Card>
            {!optedIn ? (
              <>
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Off by default. Turn it on and everyone else who has opted in — your class, say —
                  sees the name you choose and your XP for the week. Nothing else is shared: no
                  email, no word lists, no history.
                </p>
                <ButtonLink href="/settings" className="mt-4">Set a name and join</ButtonLink>
              </>
            ) : leaderboard.length <= 1 ? (
              <Note tone="accent">
                You are in. Nobody else has joined yet — share the app with your class and this fills
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
                    <span className="tnum w-6 text-[13px]">{i + 1}</span>
                    {i === 0 ? (
                      <Trophy size={15} aria-hidden style={{ color: "var(--hard)" }} />
                    ) : (
                      <Users size={15} aria-hidden style={{ opacity: 0.5 }} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[14px]">{row.name}</span>
                    <span className="tnum text-[13px]">{row.xp} XP</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>
      </div>
    </Page>
  );
}

function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

/**
 * This week's XP for everyone who has opted in.
 *
 * Only opted-in learners are read at all, and only their chosen display name
 * and a number leave the query — a leaderboard that leaked email addresses
 * would be a privacy incident, not a feature. Capped at a class-sized group,
 * since the whole thing is tallied in memory.
 */
async function weeklyLeaderboard(now: Date) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const optedIn = await prisma.setting.findMany({
    where: { key: SETTING_KEYS.leaderboard, value: "1" },
    select: { ownerId: true },
    take: 200,
  });
  const ids = optedIn.map((s) => s.ownerId);
  if (ids.length === 0) return [];

  const [names, reviews] = await Promise.all([
    prisma.setting.findMany({
      where: { key: SETTING_KEYS.displayName, ownerId: { in: ids } },
      select: { ownerId: true, value: true },
    }),
    prisma.review.findMany({
      where: { reviewedAt: { gte: since }, card: { ownerId: { in: ids } } },
      select: { rating: true, card: { select: { ownerId: true } } },
    }),
  ]);

  const nameByOwner = new Map(names.map((n) => [n.ownerId, n.value]));
  const tally = new Map<string, Record<number, number>>();
  for (const r of reviews) {
    const owner = r.card.ownerId;
    const counts = tally.get(owner) ?? {};
    counts[r.rating] = (counts[r.rating] ?? 0) + 1;
    tally.set(owner, counts);
  }

  return ids
    .map((ownerId) => ({
      ownerId,
      name: nameByOwner.get(ownerId)?.trim() || "A learner",
      xp: xpFromRatingCounts(tally.get(ownerId) ?? {}),
    }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 20);
}
