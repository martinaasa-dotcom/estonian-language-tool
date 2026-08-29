import Link from "next/link";
import { ArrowRight, Award, BookOpen, Shield, Sparkles } from "lucide-react";
import { checkAchievements, resolveStreak } from "@/app/actions";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { BADGES } from "@/lib/achievements/badges";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { ButtonLink } from "@/components/Button";
import { PracticeModes } from "@/components/PracticeModes";
import { Card, Chip, Empty, Page, SectionTitle, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { TaskRow } from "@/components/TaskRow";

export const dynamic = "force-dynamic";

const DEFAULT_DAILY_GOAL = 15;

export default async function TodayPage() {
  const ownerId = await requireUserId();
  const now = new Date();
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [
    dueCount, newCount, totalCards, tasks, reviewsThisWeek, streakResult, wordOfDay,
    reviewedToday, dailyGoalSetting, achievementCount,
  ] = await Promise.all([
    prisma.card.count({ where: { ownerId, suspended: false, due: { lte: now }, state: { not: 0 } } }),
    prisma.card.count({ where: { ownerId, suspended: false, state: 0 } }),
    prisma.card.count({ where: { ownerId } }),
    prisma.task.findMany({
      where: { ownerId, completed: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.review.count({ where: { ownerId, reviewedAt: { gte: weekAgo } } }),
    resolveStreak(),
    pickWordOfDay(ownerId),
    prisma.review.count({ where: { ownerId, reviewedAt: { gte: startOfToday } } }),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: "dailyGoal" } } }),
    prisma.achievement.count({ where: { ownerId } }),
  ]);

  const tutorReady = resolveProvider() !== null;
  const toReview = Math.min(dueCount + Math.min(newCount, 10), 60);
  const streak = streakResult.streak;
  const shieldsAvailable = streakResult.shieldsAvailable;
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now).length;
  const dailyGoal = dailyGoalSetting ? Number(dailyGoalSetting.value) || DEFAULT_DAILY_GOAL : DEFAULT_DAILY_GOAL;
  const goalPct = Math.min(100, Math.round((reviewedToday / dailyGoal) * 100));
  const goalMet = reviewedToday >= dailyGoal;

  // Streak and deck-size badges can be earned just by reaching a milestone, so
  // Today checks on every load — checkAchievements() is idempotent, and a badge
  // already earned is never re-awarded.
  const { newBadges } = await checkAchievements();

  return (
    <Page
      title={greeting()}
      lead={
        toReview > 0
          ? `${toReview} card${toReview === 1 ? "" : "s"} waiting. That's about ${Math.max(1, Math.round(toReview / 6))} minutes.`
          : "Nothing due right now — a good moment to add new words."
      }
    >
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* The one thing the app exists to get her to do. */}
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-8">
                <Stat value={dueCount} label="Due" tone={dueCount > 0 ? "var(--accent)" : undefined} />
                <Stat value={Math.min(newCount, 10)} label="New" />
                <Stat value={streak} label="Day streak" />
              </div>
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
              <ButtonLink href="/review" variant="primary" className="w-full py-3 text-[15px]">
                Start reviewing <ArrowRight size={16} aria-hidden />
              </ButtonLink>
            ) : (
              <p className="rounded-md px-4 py-3 text-[14px]" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
                Caught up. Reviewing early doesn&rsquo;t help memory — come back tomorrow.
              </p>
            )}
          </Card>

          <section>
            <SectionTitle hint={overdue > 0 ? `${overdue} overdue` : undefined}>Tasks</SectionTitle>
            {tasks.length === 0 ? (
              <Card>
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Nothing outstanding.{" "}
                  <Link href="/tasks" className="underline" style={{ color: "var(--accent)" }}>Add homework</Link>{" "}
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
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-4">
            <div
              className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(var(--accent) ${goalPct * 3.6}deg, var(--raised) 0deg)` }}
              role="img"
              aria-label={`${reviewedToday} of ${dailyGoal} reviews toward today's goal`}
            >
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full" style={{ background: "var(--surface)" }}>
                <span className="tnum text-[13px] font-bold" style={{ color: "var(--ink)" }}>{goalPct}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <SectionTitle>Daily goal</SectionTitle>
              <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                {goalMet
                  ? `Goal met — ${reviewedToday} of ${dailyGoal} reviews today.`
                  : `${reviewedToday} of ${dailyGoal} reviews today.`}
              </p>
              <Link href="/settings" className="mt-1 inline-block text-[12px]" style={{ color: "var(--accent)" }}>
                Change goal
              </Link>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SectionTitle>Badges</SectionTitle>
                <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                  {achievementCount} of {BADGES.length} earned.
                </p>
              </div>
              <Award size={22} aria-hidden style={{ color: "var(--accent)" }} />
            </div>
            <div className="mt-4">
              <ButtonLink href="/settings">See all badges</ButtonLink>
            </div>
          </Card>

          <PracticeModes />

          {wordOfDay && (
            <Card>
              <SectionTitle hint="from your weakest cards">Word to revisit</SectionTitle>
              <div className="flex items-center gap-2">
                <p lang="et" className="est text-[26px] font-semibold" style={{ color: "var(--ink)" }}>{wordOfDay.lemma}</p>
                <Speak text={wordOfDay.lemma} />
              </div>
              <p className="mt-1 text-[14px]" style={{ color: "var(--ink-2)" }}>{wordOfDay.translation}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {wordOfDay.cefr && <Chip>{wordOfDay.cefr}</Chip>}
                {wordOfDay.gradationNote && <Chip tone="hard" caseSensitive>{wordOfDay.gradationNote}</Chip>}
              </div>
              <Link
                href={`/dictionary?q=${encodeURIComponent(wordOfDay.lemma)}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13.5px]"
                style={{ color: "var(--accent)" }}
              >
                <BookOpen size={14} aria-hidden /> See the full paradigm
              </Link>
            </Card>
          )}

          <Card>
            <SectionTitle>This week</SectionTitle>
            <div className="flex gap-8">
              <Stat value={reviewsThisWeek} label="Reviews" />
              <Stat value={totalCards} label="Cards total" />
            </div>
          </Card>

          <Card>
            <SectionTitle hint={tutorReady ? undefined : "needs a key"}>Stuck on something?</SectionTitle>
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              {tutorReady
                ? "Anu explains Estonian grammar — which case to use, why a stem changed, whether your sentence is right."
                : "Anu can explain which case to use and why a stem changed. She needs a free API key first — it takes about two minutes."}
            </p>
            <ButtonLink href={tutorReady ? "/tutor" : "/settings"} className="mt-4 w-full">
              <Sparkles size={15} aria-hidden /> {tutorReady ? "Ask Anu" : "Set Anu up"}
            </ButtonLink>
          </Card>
        </div>
      </div>
      <AchievementToasts badges={newBadges} />
    </Page>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 11) return "Tere hommikust";
  if (h < 18) return "Tere päevast";
  return "Tere õhtust";
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
