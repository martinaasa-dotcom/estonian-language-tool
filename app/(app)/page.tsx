import Link from "next/link";
import {
  ArrowRight, Award, BookOpen, Flame, Headphones, Layers, Shield, Sparkles, Zap,
} from "lucide-react";
import { checkAchievements, resolveStreak } from "@/app/actions";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { BADGES } from "@/lib/achievements/badges";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { badgeIcon } from "@/components/achievements/icons";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Page, SectionTitle, StatTile } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { TaskRow } from "@/components/TaskRow";

export const dynamic = "force-dynamic";

const DEFAULT_DAILY_GOAL = 15;
const ACTIVITY_DAYS = 14;

export default async function TodayPage() {
  const ownerId = await requireUserId();
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const activityFrom = new Date(startOfToday.getTime() - (ACTIVITY_DAYS - 1) * 86400000);

  const [
    dueCount, newCount, totalCards, tasks, reviewsThisWeek, streakResult, wordOfDay,
    reviewedToday, dailyGoalSetting, earnedBadges, activityRows,
  ] = await Promise.all([
    prisma.card.count({ where: { ownerId, suspended: false, due: { lte: now }, state: { not: 0 } } }),
    prisma.card.count({ where: { ownerId, suspended: false, state: 0 } }),
    prisma.card.count({ where: { ownerId } }),
    prisma.task.findMany({
      where: { ownerId, completed: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.review.count({ where: { reviewedAt: { gte: weekAgo }, card: { ownerId } } }),
    resolveStreak(),
    pickWordOfDay(ownerId),
    prisma.review.count({ where: { reviewedAt: { gte: startOfToday }, card: { ownerId } } }),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: "dailyGoal" } } }),
    prisma.achievement.findMany({ where: { ownerId }, select: { key: true } }),
    prisma.review.findMany({
      where: { reviewedAt: { gte: activityFrom }, card: { ownerId } },
      select: { reviewedAt: true },
    }),
  ]);

  const tutorReady = resolveProvider() !== null;
  const toReview = Math.min(dueCount + Math.min(newCount, 10), 60);
  const streak = streakResult.streak;
  const shieldsAvailable = streakResult.shieldsAvailable;
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now).length;
  const dailyGoal = dailyGoalSetting ? Number(dailyGoalSetting.value) || DEFAULT_DAILY_GOAL : DEFAULT_DAILY_GOAL;
  const goalPct = Math.min(100, Math.round((reviewedToday / dailyGoal) * 100));
  const goalMet = reviewedToday >= dailyGoal;
  const earnedKeys = new Set(earnedBadges.map((b) => b.key));
  const activity = bucketByDay(activityRows.map((r) => r.reviewedAt), startOfToday, ACTIVITY_DAYS);

  // Streak and deck-size badges can be earned just by reaching a milestone, so
  // Today checks on every load — checkAchievements() is idempotent, and a badge
  // already earned is never re-awarded.
  const { newBadges } = await checkAchievements();

  return (
    <Page
      eyebrow={now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      title={greeting()}
      lead={
        toReview > 0
          ? `${toReview} card${toReview === 1 ? "" : "s"} waiting — about ${Math.max(1, Math.round(toReview / 6))} minutes of your day.`
          : "Nothing due right now. A good moment to add a word you met this week."
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* The one thing the app exists to get her to do. */}
          <Card className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-3">
              <StatTile value={dueCount} label="Due now" tone="accent" />
              <StatTile value={Math.min(newCount, 10)} label="New today" tone="sky" />
              <StatTile
                value={streak}
                label="Day streak"
                tone="butter"
                icon={<Flame size={15} aria-hidden />}
              />
            </div>

            {shieldsAvailable > 0 && (
              <p className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                <Shield size={13} aria-hidden style={{ color: "var(--accent)" }} />
                {shieldsAvailable} streak shield{shieldsAvailable === 1 ? "" : "s"} banked — one missed day won&rsquo;t break your streak.
              </p>
            )}

            {totalCards === 0 ? (
              <Empty
                title="Your deck is empty"
                body="Search a word in the dictionary and add it — you get the full paradigm, audio, and two cards in one click."
                action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
              />
            ) : toReview > 0 ? (
              <ButtonLink href="/review" variant="primary" size="lg" className="w-full">
                Start reviewing <ArrowRight size={17} aria-hidden />
              </ButtonLink>
            ) : (
              <p
                className="rounded-[var(--r)] px-4 py-3.5 text-[14px]"
                style={{ background: "var(--good-soft)", color: "var(--good)" }}
              >
                Caught up. Reviewing early doesn&rsquo;t help memory — come back tomorrow.
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle hint={`${reviewsThisWeek} reviews in the last 7 days`}>
              Your fortnight
            </SectionTitle>
            <ActivityStrip days={activity} goal={dailyGoal} />
          </Card>

          <section>
            <SectionTitle hint={overdue > 0 ? `${overdue} overdue` : `${tasks.length} open`}>Tasks</SectionTitle>
            {tasks.length === 0 ? (
              <Card>
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Nothing outstanding.{" "}
                  <Link href="/tasks" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent)" }}>
                    Add homework
                  </Link>{" "}
                  to keep class work in one place.
                </p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={{
                      id: t.id, title: t.title, tag: t.tag, completed: t.completed,
                      classWeek: t.classWeek,
                      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <Card>
            <SectionTitle>Deck</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile value={totalCards} label="Cards" tone="mint" icon={<Layers size={15} aria-hidden />} />
              <StatTile value={reviewsThisWeek} label="Reviews / 7d" tone="accent" />
              <StatTile value={dueCount + newCount} label="In the queue" tone="peach" />
              <StatTile value={`${earnedKeys.size}/${BADGES.length}`} label="Badges" tone="blush" />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-5">
            <GoalRing pct={goalPct} />
            <div className="min-w-0 flex-1">
              <SectionTitle>Daily goal</SectionTitle>
              <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                {goalMet ? (
                  <>Goal met — <strong style={{ color: "var(--good)" }}>{reviewedToday}</strong> of {dailyGoal} reviews today.</>
                ) : (
                  <><strong style={{ color: "var(--ink)" }}>{reviewedToday}</strong> of {dailyGoal} reviews today.</>
                )}
              </p>
              <Link href="/settings" className="mt-1.5 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>
                Change goal
              </Link>
            </div>
          </Card>

          <Card>
            <SectionTitle hint="one minute each">Quick practice</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <PracticeTile
                href="/review/sprint"
                tone="butter"
                icon={<Zap size={17} aria-hidden />}
                title="Case Sprint"
                body="60 seconds, weak cards"
              />
              <PracticeTile
                href="/review/listening"
                tone="sky"
                icon={<Headphones size={17} aria-hidden />}
                title="Listening"
                body="Hear it, then answer"
              />
            </div>
          </Card>

          {wordOfDay && (
            <Card>
              <SectionTitle hint="from your weakest cards">Word to revisit</SectionTitle>
              <div className="flex items-center gap-2">
                <p lang="et" className="est text-[28px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
                  {wordOfDay.lemma}
                </p>
                <Speak text={wordOfDay.lemma} />
              </div>
              <p className="mt-1 text-[14px]" style={{ color: "var(--ink-2)" }}>{wordOfDay.translation}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {wordOfDay.cefr && <Chip tone="sky">{wordOfDay.cefr}</Chip>}
                {wordOfDay.gradationNote && <Chip tone="hard" caseSensitive>{wordOfDay.gradationNote}</Chip>}
              </div>
              <Link
                href={`/dictionary?q=${encodeURIComponent(wordOfDay.lemma)}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                <BookOpen size={14} aria-hidden /> See the full paradigm
              </Link>
            </Card>
          )}

          <Card>
            <SectionTitle hint={`${earnedKeys.size} of ${BADGES.length}`}>Badges</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => {
                const Icon = badgeIcon(b.icon);
                const earned = earnedKeys.has(b.key);
                return (
                  <span
                    key={b.key}
                    title={earned ? `${b.title} — earned` : `${b.title} — ${b.description}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{
                      background: earned ? "var(--accent-soft)" : "var(--raised)",
                      color: earned ? "var(--accent-deep)" : "var(--ink-3)",
                      opacity: earned ? 1 : 0.5,
                    }}
                  >
                    <Icon size={16} aria-hidden />
                    <span className="sr-only">{b.title}{earned ? " (earned)" : ""}</span>
                  </span>
                );
              })}
            </div>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              <Award size={14} aria-hidden /> See what&rsquo;s left to earn
            </Link>
          </Card>

          <Card tone="blush">
            <div className="flex items-center gap-2">
              <Sparkles size={16} aria-hidden style={{ color: "var(--blush)" }} />
              <h2 className="label-xs" style={{ color: "var(--blush)" }}>
                {tutorReady ? "Stuck on something?" : "Anu needs a key"}
              </h2>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {tutorReady
                ? "Anu explains Estonian grammar — which case to use, why a stem changed, whether your sentence is right."
                : "Anu can explain which case to use and why a stem changed. She needs a free API key first — about two minutes."}
            </p>
            <ButtonLink href={tutorReady ? "/tutor" : "/settings"} className="mt-4 w-full">
              {tutorReady ? "Ask Anu" : "Set Anu up"} <ArrowRight size={15} aria-hidden />
            </ButtonLink>
          </Card>
        </div>
      </div>
      <AchievementToasts badges={newBadges} />
    </Page>
  );
}

/**
 * Fourteen days of reviews as a bar per day.
 *
 * The point is not the count — it is seeing the gaps. A row of bars is the only
 * thing on Today that shows a week going wrong while there is still time to fix it.
 */
function ActivityStrip({ days, goal }: { days: { date: Date; count: number }[]; goal: number }) {
  const peak = Math.max(goal, ...days.map((d) => d.count));

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: 78 }}>
        {days.map(({ date, count }) => {
          const pct = peak > 0 ? Math.min(100, (count / peak) * 100) : 0;
          const met = count >= goal;
          return (
            <div
              key={date.toISOString()}
              className="flex h-full flex-1 items-end justify-center"
              title={`${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}: ${count} review${count === 1 ? "" : "s"}`}
            >
              <div
                className="flex h-full w-full max-w-[22px] items-end overflow-hidden rounded-full"
                style={{ background: "var(--raised)" }}
              >
                <div
                  className="w-full rounded-full transition-all duration-500"
                  style={{
                    height: `${count > 0 ? Math.max(12, pct) : 0}%`,
                    background: met ? "var(--mint)" : "var(--accent)",
                    opacity: met ? 1 : 0.7,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span>{days[0]?.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--mint)" }} /> goal met
        </span>
        <span>today</span>
      </div>
    </div>
  );
}

function GoalRing({ pct }: { pct: number }) {
  return (
    <div
      className="relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--raised) 0deg)`,
      }}
      role="img"
      aria-label={`${pct} percent of today's review goal`}
    >
      <div
        className="flex h-[58px] w-[58px] items-center justify-center rounded-full"
        style={{ background: "var(--surface)" }}
      >
        <span className="tnum est text-[16px] font-bold" style={{ color: pct >= 100 ? "var(--good)" : "var(--ink)" }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function PracticeTile({ href, tone, icon, title, body }: {
  href: string; tone: "butter" | "sky"; icon: React.ReactNode; title: string; body: string;
}) {
  return (
    <Link
      href={href}
      className="lift flex flex-col gap-1 rounded-[var(--r)] p-4"
      style={{ background: `var(--${tone}-soft)` }}
    >
      <span style={{ color: `var(--${tone})` }}>{icon}</span>
      <span className="est mt-1 text-[15.5px] font-bold" style={{ color: "var(--ink)" }}>{title}</span>
      <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>{body}</span>
    </Link>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 11) return "Tere hommikust";
  if (h < 18) return "Tere päevast";
  return "Tere õhtust";
}

/** Counts reviews into one bucket per local day, oldest first. */
function bucketByDay(timestamps: Date[], startOfToday: Date, days: number) {
  const buckets = Array.from({ length: days }, (_, i) => ({
    date: new Date(startOfToday.getTime() - (days - 1 - i) * 86400000),
    count: 0,
  }));
  for (const t of timestamps) {
    const day = new Date(t); day.setHours(0, 0, 0, 0);
    const index = days - 1 - Math.round((startOfToday.getTime() - day.getTime()) / 86400000);
    const bucket = buckets[index];
    if (bucket) bucket.count++;
  }
  return buckets;
}

/** Prefers a word the learner has actually struggled with over a random one. */
async function pickWordOfDay(ownerId: string) {
  const lapsed = await prisma.card.findFirst({
    where: { ownerId, lapses: { gt: 0 }, lexemeId: { not: null } },
    orderBy: { lapses: "desc" },
    include: { lexeme: true },
  });
  if (lapsed?.lexeme) return lapsed.lexeme;

  const count = await prisma.lexeme.count();
  if (count === 0) return null;
  // Stable through the day: the same word until midnight.
  const seed = Math.floor(Date.now() / 86400000) % count;
  const [word] = await prisma.lexeme.findMany({ skip: seed, take: 1, orderBy: { lemma: "asc" } });
  return word ?? null;
}
