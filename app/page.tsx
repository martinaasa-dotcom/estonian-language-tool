import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BookOpen, Flame, Grid2x2, Headphones, Shield, Sparkles, Zap,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { awardBadges, buildBadgeStats } from "@/lib/progress/achievements";
import { dailySummary, deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { dayKey, recentDayKeys } from "@/lib/time/day";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Card, Chip, Empty, Meter, Note, Page, Ring, SectionTitle, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { TaskRow } from "@/components/TaskRow";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const ownerId = await requireUserId();
  const now = new Date();

  const snapshot = await deckSnapshot(ownerId, now);
  const settings = await readSettings(ownerId, [SETTING_KEYS.onboardedAt, SETTING_KEYS.displayName]);

  // A brand-new learner gets the wizard instead of an empty dashboard. Anyone
  // with a deck or a finished setup never sees it again.
  if (!settings[SETTING_KEYS.onboardedAt] && snapshot.totalCards === 0) redirect("/welcome");

  const [summary, units, tasks, weekReviews, wordOfDay, learner] = await Promise.all([
    dailySummary(ownerId, snapshot, now),
    pathWithProgress(ownerId, snapshot),
    prisma.task.findMany({
      where: { ownerId, completed: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 4,
    }),
    prisma.review.findMany({
      where: { card: { ownerId }, reviewedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
      select: { reviewedAt: true },
    }),
    pickWordOfDay(ownerId),
    currentLearner(),
  ]);

  // Streak and deck-size badges can be earned just by reaching a milestone, so
  // Today checks on every load. Idempotent, and it reuses the data this page
  // already loaded rather than asking for it all over again.
  const stats = await buildBadgeStats(ownerId, { snapshot, summary, units });
  const newBadges = await awardBadges(ownerId, stats);

  const tutorReady = resolveProvider() !== null;
  const toReview = Math.min(snapshot.dueCount + Math.min(snapshot.newCount, 10), 60);
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now).length;
  const name = settings[SETTING_KEYS.displayName]?.trim() || (learner.name === "you" ? "" : learner.name);
  const nextUnit = units.find((u) => u.state === "learning") ?? units.find((u) => u.state === "new");

  const reviewedDays = new Set(weekReviews.map((r) => dayKey(r.reviewedAt)));
  const week = recentDayKeys(7, now).map((day) => ({
    day,
    done: reviewedDays.has(day),
    isToday: day === summary.dayKey,
  }));

  return (
    <Page
      title={name ? `${greeting()}, ${name}` : greeting()}
      lead={
        toReview > 0
          ? `${toReview} card${toReview === 1 ? "" : "s"} waiting — about ${Math.max(1, Math.round(toReview / 6))} minutes.`
          : "Nothing due right now. A good moment to meet some new words."
      }
    >
      <div className="grid gap-5 md:grid-cols-[1.45fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* The one thing the app exists to get you to do. */}
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-7">
                <Stat value={snapshot.dueCount} label="Due" tone={snapshot.dueCount > 0 ? "var(--accent)" : undefined} />
                <Stat value={Math.min(snapshot.newCount, 10)} label="New" />
                <Stat
                  value={<span className="inline-flex items-center gap-1.5">{summary.streak}<Flame size={19} aria-hidden style={{ color: summary.streak > 0 ? "var(--hard)" : "var(--ink-3)" }} /></span>}
                  label="Day streak"
                />
              </div>
              <Ring pct={summary.goalPct} size={62} label={`${summary.reviewsToday} of ${summary.dailyGoal} reviews toward today's goal`}>
                <span className="tnum text-[12.5px] font-bold" style={{ color: "var(--ink)" }}>
                  {summary.goalPct}%
                </span>
              </Ring>
            </div>

            {snapshot.totalCards === 0 ? (
              <Empty
                title="Your deck is empty"
                body="Start a unit on the path and you get real cards — full paradigm, audio, and both directions — in one click."
                action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
              />
            ) : toReview > 0 ? (
              <ButtonLink href="/review" variant="primary" className="w-full py-3 text-[15px]">
                Start reviewing <ArrowRight size={16} aria-hidden />
              </ButtonLink>
            ) : (
              <Note tone="good">
                Caught up. Reviewing early doesn&rsquo;t help memory — try a game below, or add new
                words for tomorrow.
              </Note>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="label-xs" style={{ color: "var(--ink-3)" }}>
                  Level {summary.level.level} · <span lang="et">{summary.level.title}</span>
                </span>
                <span className="tnum text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {summary.level.into}/{summary.level.span} XP
                </span>
              </div>
              <Meter
                pct={summary.level.pct}
                label={`Level ${summary.level.level}, ${summary.level.remaining} XP to the next level`}
              />
              <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {summary.xpToday > 0 ? `+${summary.xpToday} XP today. ` : ""}
                {summary.level.remaining} XP to level {summary.level.level + 1}.
              </p>
            </div>

            {/* A week at a glance — the streak, made concrete. */}
            <div className="flex items-center justify-between gap-2">
              {week.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold"
                    style={{
                      background: d.done ? "var(--accent)" : "var(--raised)",
                      color: d.done ? "var(--accent-ink)" : "var(--ink-3)",
                      outline: d.isToday ? "2px solid var(--accent)" : "none",
                      outlineOffset: 2,
                    }}
                    aria-hidden
                  >
                    {d.done ? "✓" : "·"}
                  </span>
                  <span className="sr-only">
                    {d.day}: {d.done ? "reviewed" : "no reviews"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>{weekdayLetter(d.day)}</span>
                </div>
              ))}
            </div>

            {summary.shieldsAvailable > 0 && (
              <p className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                <Shield size={13} aria-hidden style={{ color: "var(--accent)" }} />
                {summary.shieldsAvailable} streak shield{summary.shieldsAvailable === 1 ? "" : "s"} banked — one
                missed day won&rsquo;t break your streak.
              </p>
            )}
          </Card>

          <section>
            <SectionTitle hint={`${summary.questsDone} of ${summary.quests.length} done`}>
              Today&rsquo;s quests
            </SectionTitle>
            <ul className="flex flex-col gap-2">
              {summary.quests.map((q) => {
                const Icon = icon(q.icon);
                return (
                  <li
                    key={q.key}
                    className="flex items-center gap-3.5 rounded-lg border px-4 py-3"
                    style={{
                      borderColor: q.done ? "transparent" : "var(--rule)",
                      background: q.done ? "var(--good-soft)" : "var(--surface)",
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: q.done ? "var(--surface)" : "var(--raised)",
                        color: q.done ? "var(--good)" : "var(--ink-3)",
                      }}
                    >
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[14.5px] font-medium" style={{ color: "var(--ink)" }}>{q.title}</span>
                        <span className="tnum text-[12px]" style={{ color: "var(--ink-3)" }}>
                          {q.progress}/{q.target}
                        </span>
                      </span>
                      <span className="mt-1.5 block">
                        <Meter
                          pct={(q.progress / q.target) * 100}
                          label={`${q.title}: ${q.progress} of ${q.target}`}
                          tone={q.done ? "var(--good)" : "var(--accent)"}
                          height={4}
                        />
                      </span>
                      <span className="mt-1 block text-[12px]" style={{ color: "var(--ink-3)" }}>
                        {q.detail} · +{q.reward} XP
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

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
          {nextUnit && (
            <Card>
              <SectionTitle hint={nextUnit.unit.cefr}>Next on the path</SectionTitle>
              <div className="flex items-center gap-3">
                <NextUnitIcon name={nextUnit.unit.icon} />
                <div className="min-w-0">
                  <p lang="et" className="est text-[19px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
                    {nextUnit.unit.title}
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{nextUnit.unit.subtitle}</p>
                </div>
              </div>
              <p className="mt-3 text-[13.5px]" style={{ color: "var(--ink-2)" }}>{nextUnit.unit.blurb}</p>
              <div className="mt-3">
                <Meter pct={nextUnit.pct} label={`${nextUnit.unit.title}: ${nextUnit.pct}% complete`} />
              </div>
              <ButtonLink href="/learn" className="mt-4 w-full">
                {nextUnit.state === "new" ? "Start this unit" : "Continue the path"}
              </ButtonLink>
            </Card>
          )}

          <Card>
            <SectionTitle hint="quick rounds">Practice</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/review/sprint"><Zap size={15} aria-hidden /> Sprint</ButtonLink>
              <ButtonLink href="/review/match"><Grid2x2 size={15} aria-hidden /> Match</ButtonLink>
              <ButtonLink href="/review/listening"><Headphones size={15} aria-hidden /> Listening</ButtonLink>
              <ButtonLink href="/practice">All modes</ButtonLink>
            </div>
          </Card>

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

function NextUnitIcon({ name }: { name: string }) {
  const Icon = icon(name);
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      <Icon size={20} aria-hidden />
    </span>
  );
}

function weekdayLetter(day: string): string {
  // Estonian weekday initials — E T K N R L P, the ones on every timetable here.
  const letters = ["P", "E", "T", "K", "N", "R", "L"];
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return letters[date.getDay()] ?? "?";
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
