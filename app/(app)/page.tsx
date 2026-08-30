import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, Flame, Shield, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { supabaseConfigured } from "@/lib/auth/mode";
import { resolveProvider } from "@/lib/tutor/provider";
import { awardBadges, buildBadgeStats } from "@/lib/progress/achievements";
import { dailySummary, deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { nextUnit as pickNextUnit } from "@/lib/collections/syllabus";
import { courseLevelFor } from "@/lib/progress/level";
import type { DayClock } from "@/lib/time/day";
import { practiceTiles, shows, stageOf } from "@/lib/ux/disclosure";
import { QUICK_MODES, type PracticeMode } from "@/lib/ux/modes";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Card, Chip, Empty, Meter, Note, Page, Ring, SectionTitle, Stack, StatTile, toneInk } from "@/components/ui";
import { LocalDate } from "@/components/LocalDate";
import { Speak } from "@/components/Speak";
import { TaskRow } from "@/components/TaskRow";

export const metadata = { title: "Today" };

export const dynamic = "force-dynamic";

/**
 * Today.
 *
 * What it leads with depends on how far in the learner is — see
 * `lib/ux/disclosure.ts` for the rule and the argument. The short version: this
 * page used to render eleven panels to everybody, and on day one ten of them
 * were reporting on an empty review log. A streak of nought, a goal ring at
 * nought percent and a word drawn at random from a dictionary nobody has read
 * are not information, and somebody meeting the app for the first time has to
 * scroll past all of them to find the one button that matters.
 *
 * Nothing here is deleted for anybody. Every panel a stage holds back is one
 * click away in the rail, in the palette and on its own page.
 *
 * What each card is *about* is the other half of it. The first card used to
 * carry five unrelated things stacked with no headings between them: the due
 * counts, the goal ring, the button, the level bar, the week strip and a note
 * about shields. The streak was a number at the top and its own picture a
 * hundred pixels lower with an XP meter wedged in between, which is one thing
 * told in three places. So the do-now card is now only what to do now, and
 * everything that reports on the run of days is one card that says so.
 */
export default async function TodayPage() {
  const ownerId = await requireUserId();
  const now = new Date();
  /*
    The learner's own midnight, not this server's. Every day-shaped figure on
    this page reads it: the streak, the goal ring, the quests and the week
    strip. Without it they all break at the deployment's midnight, which on
    Vercel is UTC — see lib/time/day.ts for what that cost.
  */
  const clock = await learnerDayClock(ownerId);

  const snapshot = await deckSnapshot(ownerId, now);
  const settings = await readSettings(ownerId, [
    SETTING_KEYS.onboardedAt, SETTING_KEYS.displayName, SETTING_KEYS.cefrPlacement,
  ]);

  // A brand-new learner gets the wizard instead of an empty dashboard. Anyone
  // with a deck or a finished setup never sees it again.
  if (!settings[SETTING_KEYS.onboardedAt] && snapshot.totalCards === 0) redirect("/start");

  const [summary, units, tasks, weekReviews, learner] = await Promise.all([
    dailySummary(ownerId, snapshot, now, clock),
    pathWithProgress(ownerId, snapshot),
    prisma.task.findMany({
      where: { ownerId, completed: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 4,
    }),
    prisma.review.findMany({
      where: { ownerId, reviewedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
      select: { reviewedAt: true },
    }),
    currentLearner(),
  ]);

  const stage = stageOf({ totalCards: snapshot.totalCards, reviewsAllTime: summary.reviewsAllTime });
  // Asked for only where it is shown: it is two queries for a panel a beginner
  // does not get, and the point of this page is to stop doing work nobody reads.
  const wordOfDay = shows(stage, "word") ? await pickWordOfDay(ownerId) : null;

  // Streak and deck-size badges can be earned just by reaching a milestone, so
  // Today checks on every load. Idempotent, and it reuses the data this page
  // already loaded rather than asking for it all over again.
  const stats = await buildBadgeStats(ownerId, { snapshot, summary, units });
  const newBadges = await awardBadges(ownerId, stats);

  const tutorReady = resolveProvider() !== null;
  /*
    Whether the person reading this is the person who could fix it.
    With no Supabase keys the app is a single local learner (ADR-013), so they
    run it and the setup walkthrough is addressed to them. Hosted, they are a
    visitor, and telling them to go and get an API key sends them to a Settings
    page where the field does not exist, because the key is an environment
    variable on the deployment.
  */
  const readerCanConfigure = !supabaseConfigured();
  const toReview = Math.min(snapshot.dueCount + Math.min(snapshot.newCount, 10), 60);
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now).length;
  const name = settings[SETTING_KEYS.displayName]?.trim() || (learner.name === "you" ? "" : learner.name);
  /*
    The course decides what comes next, not this page. Its own rule respects
    where the learner placed: picking the first unfinished unit in order sent a
    B1 learner back to greetings, which is how somebody decides an app is not
    for them. `nextUnit` prefers finishing something already started, then the
    first open unit at or above their level.
  */
  const placement = await courseLevelFor(ownerId);
  const nextSyllabusUnit = pickNextUnit({
    doneUnitIds: new Set(units.filter((u) => u.state === "done").map((u) => u.unit.id)),
    startedUnitIds: new Set(units.filter((u) => u.state === "learning").map((u) => u.unit.id)),
    placement,
  });
  const nextUnit = nextSyllabusUnit
    ? units.find((u) => u.unit.id === nextSyllabusUnit.id)
    : undefined;

  const reviewedDays = new Set(weekReviews.map((r) => clock.dayKey(r.reviewedAt)));
  const week = clock.recentDayKeys(7, now).map((day) => ({
    day,
    done: reviewedDays.has(day),
    isToday: day === summary.dayKey,
  }));

  const modes = QUICK_MODES.slice(0, practiceTiles(stage));

  return (
    <Page
      eyebrow={
        <LocalDate
          iso={now.toISOString()}
          zone={clock.zone}
          options={{ weekday: "long", day: "numeric", month: "long" }}
          /*
            What the server writes, and what a reader sees if script never
            runs. Its zone is the learner's; only the shape of the reading is
            the deployment's until the browser has said otherwise.
          */
          fallback={new Intl.DateTimeFormat(undefined, {
            timeZone: clock.zone, weekday: "long", day: "numeric", month: "long",
          }).format(now)}
        />
      }
      title={name ? `${greeting(clock, now)}, ${name}` : greeting(clock, now)}
      lead={lead(stage, toReview)}
    >
      {/*
        One column while a learner is arriving. A two-column dashboard needs
        enough in it to be a dashboard, and at that point there is one card in
        the left column and one in the right, sitting a screen-width apart.
      */}
      <div className={stage === "arriving" ? "mx-auto max-w-xl" : "grid gap-6 lg:grid-cols-[1.45fr_1fr]"}>
        <Stack className="min-w-0">
          {/* The one thing the app exists to get you to do, and nothing else. */}
          <Card className="flex flex-col gap-5">
            {shows(stage, "streak") && (
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-[200px] sm:flex-1">
                  <StatTile value={snapshot.dueCount} label="Due now" tone="accent" />
                  <StatTile value={Math.min(snapshot.newCount, 10)} label="New today" tone="sky" />
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
                      className="est tnum text-base font-bold"
                      style={{ color: summary.goalPct >= 100 ? "var(--good-ink)" : "var(--ink)" }}
                    >
                      {summary.goalPct}%
                    </span>
                  </Ring>
                  <div aria-hidden className="sm:hidden">
                    <p className="label-xs" style={{ color: "var(--ink-3)" }}>Daily goal</p>
                    <p className="tnum mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
                      {summary.reviewsToday} of {summary.dailyGoal} reviews
                    </p>
                  </div>
                </div>
              </div>
            )}

            {snapshot.totalCards === 0 ? (
              <Empty
                title="Your deck is empty"
                body="Start a unit on the path and you get real cards, full paradigm, audio, and both directions, in one click."
                action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
              />
            ) : toReview > 0 ? (
              <ButtonLink href="/review" variant="primary" size="lg" className="w-full">
                {stage === "arriving" ? "Start your first review" : "Start reviewing"}{" "}
                <ArrowRight size={17} aria-hidden />
              </ButtonLink>
            ) : (
              <Note tone="good">
                Caught up. Reviewing early doesn&rsquo;t help memory. Try a game below, or add new
                words for tomorrow.
              </Note>
            )}

            {stage === "arriving" && snapshot.totalCards > 0 && toReview > 0 && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--ink-3)" }}>
                Answer honestly rather than generously. The scheduler uses your ratings to work out
                when to ask again, so a card you nearly knew is worth more to it than a card you
                said you knew.
              </p>
            )}
          </Card>

          {/*
            Everything that reports on the run of days, in one card that says
            so. The streak, the week it is drawn from, the shields that protect
            it and the XP the same reviews earned are one story, and they used
            to be told in three places inside the card above.
          */}
          {shows(stage, "streak") && (
            <Card className="flex flex-col gap-4">
              <SectionTitle hint={`${summary.reviewsToday} reviewed today`}>Keeping it up</SectionTitle>

              <div className="flex flex-wrap items-center gap-4">
                <StatTile
                  value={summary.streak}
                  label="Day streak"
                  tone="butter"
                  icon={<Flame size={15} aria-hidden />}
                />
                {/* A week at a glance: the streak, made concrete. */}
                <div className="flex min-w-[210px] flex-1 items-center justify-between gap-2">
                  {week.map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                        /*
                          The ring is what makes a reviewed day visible.

                          Mint on the card is 2.52:1 and the white tick inside
                          it is the same, which is under the 3:1 a graphic needs
                          to carry meaning. This is not a reason to repaint
                          mint: mint means "recalled" and that is the whole of
                          what this circle says. It is the case
                          `.choice-card[data-on]` in globals.css already solved,
                          in the words written there: where a fill would swallow
                          the contrast, double the rule instead. Three channels,
                          one of them hue.

                          `--mint-ink` gives the circle a 5.79:1 boundary in
                          light. In dark it is the mint itself, where the fill
                          already clears 11:1 and needs no help.
                        */
                        style={{
                          background: d.done ? "var(--mint)" : "var(--raised)",
                          color: d.done ? "var(--surface)" : "var(--ink-3)",
                          boxShadow: d.done ? "inset 0 0 0 1.5px var(--mint-ink)" : "none",
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
                      <span className="text-2xs font-semibold" style={{ color: "var(--ink-3)" }}>
                        {weekdayLetter(d.day)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {summary.shieldsAvailable > 0 && (
                <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
                  <Shield size={13} aria-hidden style={{ color: "var(--accent-deep)" }} />
                  {summary.shieldsAvailable} streak shield{summary.shieldsAvailable === 1 ? "" : "s"} banked, one
                  missed day won&rsquo;t break your streak.
                </p>
              )}

              {shows(stage, "level") && (
                <div className="border-t pt-4" style={{ borderColor: "var(--rule-soft)" }}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="label-xs" style={{ color: "var(--ink-3)" }}>
                      Level {summary.level.level} · <span lang="et">{summary.level.title}</span>
                    </span>
                    <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
                      {summary.level.into}/{summary.level.span} XP
                    </span>
                  </div>
                  <Meter
                    pct={summary.level.pct}
                    label={`Level ${summary.level.level}, ${summary.level.remaining} XP to the next level`}
                  />
                  <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                    {summary.xpToday > 0 ? `+${summary.xpToday} XP today. ` : ""}
                    {summary.level.remaining} XP to level {summary.level.level + 1}.
                  </p>
                </div>
              )}
            </Card>
          )}

          {shows(stage, "quests") && (
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
                          color: q.done ? "var(--good-ink)" : "var(--accent-deep)",
                        }}
                      >
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-base font-semibold" style={{ color: "var(--ink)" }}>{q.title}</span>
                          <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
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
                        <span className="mt-1.5 block text-xs" style={{ color: "var(--ink-3)" }}>
                          {q.detail} · +{q.reward} XP
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {shows(stage, "tasks") && (
            <section>
              <SectionTitle hint={overdue > 0 ? `${overdue} overdue` : undefined}>Tasks</SectionTitle>
              {tasks.length === 0 ? (
                <Card>
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    Nothing outstanding.{" "}
                    <Link href="/tasks" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
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
          )}
        </Stack>

        <Stack className="min-w-0">
          {shows(stage, "next") && nextUnit && (
            <Card>
              <SectionTitle hint={nextUnit.unit.cefr}>Next on the path</SectionTitle>
              <div className="flex items-center gap-3">
                <NextUnitIcon name={nextUnit.unit.icon} />
                <div className="min-w-0">
                  <p lang="et" className="est text-lg font-bold leading-tight" style={{ color: "var(--ink)" }}>
                    {nextUnit.unit.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>{nextUnit.unit.subtitle}</p>
                </div>
              </div>
              {/* The can-do statement, not the blurb: what you will be able to
                  do is a better reason to press the button than what the unit
                  is about. */}
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{nextUnit.unit.canDo}</p>
              <div className="mt-3.5">
                <Meter pct={nextUnit.pct} label={`${nextUnit.unit.title}: ${nextUnit.pct}% complete`} />
              </div>
              <ButtonLink href={`/learn/${nextUnit.unit.id}/lesson`} className="mt-4 w-full">
                {nextUnit.state === "learning" ? "Continue the lesson" : "Start the lesson"}
                <ArrowRight size={15} aria-hidden />
              </ButtonLink>
            </Card>
          )}

          {shows(stage, "practice") && (
            <Card>
              <SectionTitle hint="a minute each">Quick practice</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                {modes.map((m) => (
                  <PracticeTile key={m.href} mode={m} />
                ))}
              </div>
              {/* The hub rather than a seventh tile: six hues, six modes, and the
                  grid stays a grid. */}
              <Link
                href="/practice"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: "var(--accent-deep)" }}
              >
                Every mode, and a drill for your weakest case <ArrowRight size={13} aria-hidden />
              </Link>
            </Card>
          )}

          {shows(stage, "word") && wordOfDay && (
            <Card>
              <SectionTitle hint="from your weakest cards">Word to revisit</SectionTitle>
              <div className="flex items-center gap-2">
                <p lang="et" className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
                  {wordOfDay.lemma}
                </p>
                <Speak text={wordOfDay.lemma} />
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{wordOfDay.translation}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {wordOfDay.cefr && <Chip tone="sky">{wordOfDay.cefr}</Chip>}
                {wordOfDay.gradationNote && <Chip tone="hard" caseSensitive>{wordOfDay.gradationNote}</Chip>}
              </div>
              <Link
                href={`/dictionary?q=${encodeURIComponent(wordOfDay.lemma)}`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: "var(--accent-deep)" }}
              >
                <BookOpen size={14} aria-hidden /> See the full paradigm
              </Link>
            </Card>
          )}

          {shows(stage, "tutor") && (
            <Card tone="blush">
              <div className="flex items-center gap-2">
                <Sparkles size={16} aria-hidden style={{ color: "var(--blush-ink)" }} />
                <h2 className="label-xs" style={{ color: "var(--blush-ink)" }}>
                  {tutorReady ? "Stuck on something?" : readerCanConfigure ? "Anu needs a key" : "Anu is not available"}
                </h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {tutorReady
                  ? "Anu explains Estonian grammar, which case to use, why a stem changed, whether your sentence is right."
                  : readerCanConfigure
                    ? "Anu can explain which case to use and why a stem changed. She needs a free API key first, about two minutes."
                    : "Anu is not switched on for this site yet. Everything else here works without her."}
              </p>
              {(tutorReady || readerCanConfigure) && (
                <ButtonLink href={tutorReady ? "/tutor" : "/settings"} className="mt-4 w-full">
                  {tutorReady ? "Ask Anu" : "Set Anu up"} <ArrowRight size={15} aria-hidden />
                </ButtonLink>
              )}
            </Card>
          )}
        </Stack>
      </div>
      <AchievementToasts badges={newBadges} />
    </Page>
  );
}

function PracticeTile({ mode }: { mode: PracticeMode }) {
  const Glyph = icon(mode.icon);
  return (
    <Link
      href={mode.href}
      className="lift flex flex-col gap-1 rounded-[var(--r)] p-4"
      style={{ background: `var(--${mode.tone}-soft)` }}
    >
      <span style={{ color: toneInk(mode.tone) }}><Glyph size={17} aria-hidden /></span>
      <span className="est mt-1 text-base font-bold" style={{ color: "var(--ink)" }}>{mode.title}</span>
      <span className="text-2xs" style={{ color: "var(--ink-3)" }}>{mode.subtitle}</span>
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

/**
 * The line under the greeting.
 *
 * A beginner is told what to do; everybody else is told what is waiting. The
 * count and the minutes are the useful sentence once there is a routine, and
 * they are an instruction to nobody on the first morning.
 */
function lead(stage: "arriving" | "starting" | "settled", toReview: number): string {
  if (toReview === 0) return "Nothing due right now. A good moment to meet some new words.";
  const minutes = Math.max(1, Math.round(toReview / 6));
  if (stage === "arriving") {
    return `Your deck is ready. ${toReview} card${toReview === 1 ? "" : "s"} to meet, about ${minutes} minutes.`;
  }
  return `${toReview} card${toReview === 1 ? "" : "s"} waiting, about ${minutes} minutes of your day.`;
}

function weekdayLetter(day: string): string {
  // Estonian weekday initials — E T K N R L P, the ones on every timetable here.
  const letters = ["P", "E", "T", "K", "N", "R", "L"];
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return letters[date.getDay()] ?? "?";
}

/*
  Which greeting, on the learner's clock rather than the server's. Rendered on
  the server, so "Tere hommikust" was the deployment's morning: at two in the
  morning in Tallinn this said good evening.
*/
function greeting(clock: DayClock, now: Date): string {
  const h = clock.hourOf(now);
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
