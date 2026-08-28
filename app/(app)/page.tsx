import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BookOpen, Flame, Grid2x2, Headphones, Mic, Puzzle, Shield, Sparkles, Zap,
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
import { Card, Chip, Empty, Meter, Note, Page, Ring, SectionTitle, StatTile } from "@/components/ui";
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
  if (!settings[SETTING_KEYS.onboardedAt] && snapshot.totalCards === 0) redirect("/start");

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
      eyebrow={now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      title={name ? `${greeting()}, ${name}` : greeting()}
      lead={
        toReview > 0
          ? `${toReview} card${toReview === 1 ? "" : "s"} waiting — about ${Math.max(1, Math.round(toReview / 6))} minutes of your day.`
          : "Nothing due right now. A good moment to meet some new words."
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* The one thing the app exists to get you to do. */}
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid w-full grid-cols-3 gap-3 sm:w-auto sm:min-w-[260px] sm:flex-1">
                <StatTile value={snapshot.dueCount} label="Due now" tone="accent" />
                <StatTile value={Math.min(snapshot.newCount, 10)} label="New today" tone="sky" />
                <StatTile
                  value={summary.streak}
                  label="Day streak"
                  tone="butter"
                  icon={<Flame size={15} aria-hidden />}
                />
              </div>
              {/* On a phone the ring wraps onto its own line, where a bare
                  circle says nothing — so it is captioned there and only there. */}
              <div className="flex items-center gap-3">
                <Ring
                  pct={summary.goalPct}
                  size={74}
                  thickness={8}
                  label={`${summary.reviewsToday} of ${summary.dailyGoal} reviews toward today's goal`}
                >
                  <span
                    className="est tnum text-[15px] font-bold"
                    style={{ color: summary.goalPct >= 100 ? "var(--good)" : "var(--ink)" }}
                  >
                    {summary.goalPct}%
                  </span>
                </Ring>
                <div aria-hidden className="sm:hidden">
                  <p className="label-xs" style={{ color: "var(--ink-3)" }}>Daily goal</p>
                  <p className="tnum mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
                    {summary.reviewsToday} of {summary.dailyGoal} reviews
                  </p>
                </div>
              </div>
            </div>

            {snapshot.totalCards === 0 ? (
              <Empty
                title="Your deck is empty"
                body="Start a unit on the path and you get real cards — full paradigm, audio, and both directions — in one click."
                action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
              />
            ) : toReview > 0 ? (
              <ButtonLink href="/review" variant="primary" size="lg" className="w-full">
                Start reviewing <ArrowRight size={17} aria-hidden />
              </ButtonLink>
            ) : (
              <Note tone="good">
                Caught up. Reviewing early doesn&rsquo;t help memory — try a game below, or add new
                words for tomorrow.
              </Note>
            )}

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
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
              <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {summary.xpToday > 0 ? `+${summary.xpToday} XP today. ` : ""}
                {summary.level.remaining} XP to level {summary.level.level + 1}.
              </p>
            </div>

            {/* A week at a glance — the streak, made concrete. */}
            <div className="flex items-center justify-between gap-2">
              {week.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{
                      background: d.done ? "var(--mint)" : "var(--raised)",
                      color: d.done ? "var(--surface)" : "var(--ink-3)",
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
                  <span className="text-[10px] font-semibold" style={{ color: "var(--ink-3)" }}>
                    {weekdayLetter(d.day)}
                  </span>
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
                    className="flex items-center gap-3.5 rounded-[var(--r-lg)] border px-4 py-3.5"
                    style={{
                      borderColor: q.done ? "transparent" : "var(--rule)",
                      background: q.done ? "var(--mint-soft)" : "var(--surface)",
                      boxShadow: q.done ? "none" : "var(--shadow-sm)",
                    }}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: q.done ? "var(--surface)" : "var(--accent-soft)",
                        color: q.done ? "var(--good)" : "var(--accent-deep)",
                      }}
                    >
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[14.5px] font-semibold" style={{ color: "var(--ink)" }}>{q.title}</span>
                        <span className="tnum text-[12px]" style={{ color: "var(--ink-3)" }}>
                          {q.progress}/{q.target}
                        </span>
                      </span>
                      <span className="mt-1.5 block">
                        <Meter
                          pct={(q.progress / q.target) * 100}
                          label={`${q.title}: ${q.progress} of ${q.target}`}
                          tone={q.done ? "var(--good)" : "var(--accent)"}
                          height={5}
                        />
                      </span>
                      <span className="mt-1.5 block text-[12px]" style={{ color: "var(--ink-3)" }}>
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
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {nextUnit && (
            <Card>
              <SectionTitle hint={nextUnit.unit.cefr}>Next on the path</SectionTitle>
              <div className="flex items-center gap-3">
                <NextUnitIcon name={nextUnit.unit.icon} />
                <div className="min-w-0">
                  <p lang="et" className="est text-[20px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
                    {nextUnit.unit.title}
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{nextUnit.unit.subtitle}</p>
                </div>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{nextUnit.unit.blurb}</p>
              <div className="mt-3.5">
                <Meter pct={nextUnit.pct} label={`${nextUnit.unit.title}: ${nextUnit.pct}% complete`} />
              </div>
              <ButtonLink href="/learn" className="mt-4 w-full">
                {nextUnit.state === "new" ? "Start this unit" : "Continue the path"}
                <ArrowRight size={15} aria-hidden />
              </ButtonLink>
            </Card>
          )}

          <Card>
            <SectionTitle hint="a minute each">Quick practice</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <PracticeTile href="/review/sprint" tone="butter" icon={<Zap size={17} aria-hidden />}
                title="Sprint" body="60 seconds, weak cards" />
              <PracticeTile href="/review/match" tone="mint" icon={<Grid2x2 size={17} aria-hidden />}
                title="Match" body="Pair word to meaning" />
              <PracticeTile href="/review/sentences" tone="accent" icon={<Puzzle size={17} aria-hidden />}
                title="Sentences" body="Put the words in order" />
              <PracticeTile href="/review/speaking" tone="blush" icon={<Mic size={17} aria-hidden />}
                title="Speaking" body="Say it, then compare" />
              <PracticeTile href="/review/listening" tone="sky" icon={<Headphones size={17} aria-hidden />}
                title="Listening" body="Hear it, then answer" />
              <PracticeTile href="/practice" tone="peach" icon={<ArrowRight size={17} aria-hidden />}
                title="All modes" body="Everything in one place" />
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

function PracticeTile({ href, tone, icon: glyph, title, body }: {
  href: string;
  // Every hue in the palette, because there are six modes and each one owns a
  // colour on this grid — see docs/14-design-system.md §1.
  tone: "butter" | "sky" | "mint" | "peach" | "accent" | "blush";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="lift flex flex-col gap-1 rounded-[var(--r)] p-4"
      style={{ background: `var(--${tone}-soft)` }}
    >
      <span style={{ color: `var(--${tone})` }}>{glyph}</span>
      <span className="est mt-1 text-[15.5px] font-bold" style={{ color: "var(--ink)" }}>{title}</span>
      <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>{body}</span>
    </Link>
  );
}

function NextUnitIcon({ name }: { name: string }) {
  const Icon = icon(name);
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
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
