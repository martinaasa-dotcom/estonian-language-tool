import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { redirect } from "next/navigation";
import { LEARN_BATCH } from "@/lib/learn/ladder";
import { ArrowRight, Flame, Shield, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { dailySummary, deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { measuredPaceFor } from "@/lib/progress/plan";
import { minutesForCards } from "@/lib/stats/pace";
import { wordOfDay, wordOfDayCollection } from "@/lib/progress/wordOfDay";
import { outThereToday } from "@/lib/progress/outThere";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { nextUnit as pickNextUnit } from "@/lib/collections/syllabus";
import { courseLevelFor } from "@/lib/progress/level";
import { caseAccuracy } from "@/lib/stats/history";
import { grammarTerm } from "@/lib/estonian/terms";
import { caseReviewsFor } from "@/lib/progress/cases";
import type { DayClock } from "@/lib/time/day";
import { shows, stageOf, TODAY_CARDS } from "@/lib/ux/disclosure";
import { orderTodayCards, todayOrderFrom } from "@/lib/ux/todayOrder";
import { modeAt } from "@/lib/ux/modes";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Card, Columns, Empty, Meter, Note, Page, Ring, SectionTitle, Stack, StatTile } from "@/components/ui";
import { LocalDate } from "@/components/LocalDate";
import { dateLine } from "@/lib/time/estonianDate";
import type { TaskView } from "@/components/TaskRow";
import { TodayPlan } from "@/components/TodayPlan";
import { eventsOn, kindFrom, span, weekdayOf, KIND_LABEL, KIND_TONE, WEEKDAY_LONG } from "@/lib/ux/schedule";
import { gameAfter, gameOn } from "@/lib/ux/weekGames";
import { WordOfDayCard } from "@/components/WordOfDay";
import { SayItToday } from "@/components/SayItToday";
import { errandForDay, startedUnits } from "@/lib/collections/errands";
import { unitById } from "@/lib/collections/syllabus";

export const metadata = { title: "Today" };

export const dynamic = "force-dynamic";

/**
 * Today. The home dashboard.
 *
 * A page of modules, each answering one question at a glance and each with a
 * way through to the screen that answers it properly: what is due now, what the
 * course does next, what is written down for today, what keeps going wrong, and
 * one word out of the dictionary chosen by the date. A learner should be able
 * to read this page in about fifteen seconds and know what their day looks
 * like, or press one button and start.
 *
 * The modules are declared first and laid out second, further down, which is
 * the shape this file wanted from the beginning: what a card *is* and which
 * column it sits in are two questions, and they were tangled together in one
 * six-hundred-line return statement.
 *
 * What it leads with depends on how far in the learner is — see
 * `lib/ux/disclosure.ts` for the rule and the argument. The short version: this
 * page used to render eleven panels to everybody, and on day one most of them
 * were reporting on an empty review log. A streak of nought, a goal ring at
 * nought percent and a "word to revisit" pulled from a deck nobody has read yet
 * are not information, and somebody meeting the app for the first time had to
 * scroll past all of them to find the one button that matters. Then the same
 * rule was drawn too wide and day one became two cards on an empty page, which
 * is the other way of getting it wrong.
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
    FOUR ANSWERS THAT NEED NOTHING FROM EACH OTHER, SO THEY ARE ASKED AT ONCE.

    Three of them were `await`s in a row and the fourth was read at the very
    end of the page, after everything else had finished. On a socket on the
    same machine that is a rounding error; against a hosted Postgres each one
    is a round trip, and this page made fourteen of them one after another,
    which was measured by giving every query a 20ms delay and watching the page
    take four hundred milliseconds to answer a database that was idle.

    The clock is a settings read and the settings are the same read, so those
    two are now one query between them (lib/settings/store.ts). What is left is
    the deck, and the level this learner placed at.
  */
  const [clock, snapshot, settings, placement] = await Promise.all([
    /*
      The learner's own midnight, not this server's. Every day-shaped figure on
      this page reads it: the streak, the goal ring, the quests and the week
      strip. Without it they all break at the deployment's midnight, which on
      Vercel is UTC — see lib/time/day.ts for what that cost.
    */
    learnerDayClock(ownerId),
    deckSnapshot(ownerId, now),
    readSettings(ownerId, [
      SETTING_KEYS.onboardedAt, SETTING_KEYS.displayName, SETTING_KEYS.cefrPlacement,
      SETTING_KEYS.todayOrder,
    ]),
    /*
      Which level the course opens at. It was read last, after everything else
      on the page had finished, and it depends on none of it: the placement and
      the latest level check, both of which this request can ask for straight
      away.
    */
    courseLevelFor(ownerId),
  ]);

  // A brand-new learner gets the wizard instead of an empty dashboard. Anyone
  // with a deck or a finished setup never sees it again.
  if (!settings[SETTING_KEYS.onboardedAt] && snapshot.totalCards === 0) redirect("/start");

  const [summary, units, tasks, events, weekReviews, learner, pace] = await Promise.all([
    dailySummary(ownerId, now, clock),
    pathWithProgress(ownerId, snapshot),
    /*
      Enough to group and to count what is left over, not enough to be a
      second tasks page. It is one indexed read on a small table and it stays
      in this batch rather than waiting for the stage, because knowing the
      stage needs the summary and a second round trip costs more than this
      query does.
    */
    prisma.task.findMany({
      where: { ownerId, completed: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 12,
    }),
    /*
      The learner's own calendar. In this batch for the same reason the tasks
      are: it is one indexed read on a small table, and a second round trip to
      decide whether to draw one card costs more than the read does. Which of
      them fall on today is `eventsOn`, which is pure and needs no query.
    */
    prisma.studyEvent.findMany({
      where: { ownerId },
      orderBy: [{ startMinute: "asc" }, { id: "asc" }],
      take: 50,
    }),
    prisma.review.findMany({
      where: { ownerId, reviewedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
      select: { reviewedAt: true },
    }),
    currentLearner(),
    /*
      How much of this app the learner actually does, off the log. Read here
      once for the two things below that quote a pace: the minutes the cards
      waiting will take, at this learner's own rate, and the countdown's line
      on whether that pace reaches the date.
    */
    measuredPaceFor(ownerId, now),
  ]);

  const stage = stageOf({ totalCards: snapshot.totalCards, reviewsAllTime: summary.reviewsAllTime });

  /*
    Everything below here is asked for only where it is shown. The point of the
    disclosure rule is to stop rendering panels nobody can read yet, and a page
    that still runs their queries has kept the cost and thrown away the reason.
  */
  const errand = shows(stage, "errand") ? errandForDay(summary.dayKey, startedUnits(snapshot.startedLemmas)) : null;
  /*
    ONE ROUND A DAY, AND THE WEEK TABLE ALREADY DECIDED WHICH.

    Today used to draw the daily quest every settled morning *and* the game of
    the day beside it, which is two cards for one decision: press something
    short. `lib/ux/weekGames.ts` gives Sunday to `/quest`, so the two are one
    slot and the table is what fills it. On the six days the table names a
    game, that is the round; on the seventh the quest is, and only then is the
    weakest case worth the query behind it.
  */
  const featured = gameOn(weekdayOf(summary.dayKey));
  const questDay = featured.href === "/quest" && shows(stage, "quest");
  const [word, collection, weakest, outside] = await Promise.all([
    shows(stage, "word") ? wordOfDay(ownerId, summary.dayKey, clock.startOfDay(now), placement) : null,
    shows(stage, "word") ? wordOfDayCollection(ownerId, now, clock) : { kept: 0, streak: 0 },
    questDay ? weakestCase(ownerId, now) : null,
    // Whether the day's question has been answered, and the month behind it,
    // off one read rather than one for each.
    errand ? outThereToday(ownerId, clock, now) : null,
  ]);

  const today = dateLine(now, clock.zone);
  /*
    What Practice will actually put in front of them.

    Due cards, plus the unseen ones a session trickles in, which is what it has
    always been. What changed is which unseen ones count: the ladder owns a
    word until its recognition card graduates, so every card of a word being
    learned is Learn's and none of them is offered here. Both figures draw the
    same line the review queue draws, so a number on this page is a number that
    screen will fill.
  */
  const toReview = Math.min(snapshot.dueCount + Math.min(snapshot.newForPractice, 10), 60);
  /** Words waiting on the ladder, in words rather than in cards. */
  const toLearn = snapshot.learnCount;
  const name = settings[SETTING_KEYS.displayName]?.trim() || (learner.name === "you" ? "" : learner.name);
  /*
    The course decides what comes next, not this page. Its own rule respects
    where the learner placed: picking the first unfinished unit in order sent a
    B1 learner back to greetings, which is how somebody decides an app is not
    for them. `nextUnit` prefers finishing something already started, then the
    first open unit at or above their level.
  */
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


  /*
    THE MODULES.

    Declared here and laid out below, because what a card is and which column
    it sits in are two questions and they had been one six-hundred-line return
    statement. Each is null when the disclosure rule says this learner is not
    ready for it, which lets the layout below be read as a layout rather than
    as a nest of conditions.
  */

  /*
    THE ONE THING THE APP EXISTS TO GET YOU TO DO, ACROSS THE WHOLE WIDTH.

    It spans both columns and is the only card that does, because it is the
    only card that is not one of several. On a wide screen it is a row rather
    than a stack: the figures on the left and the button on the right, so a
    wide card is not a wide empty card with a button in it. On the first
    morning there are no figures worth printing (`shows` holds a due count of
    nought and a goal ring at nought back, and it is right to), so the left
    half says what the button is going to do instead, in the ladder's own
    terms: meet, pick the meaning, put it back in its sentence.
  */
  const figures = shows(stage, "streak") ? (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-[200px] sm:flex-1">
        <StatTile value={snapshot.dueCount} label="Due now" tone="accent" />
        <StatTile value={toLearn} label="To learn" tone="mint" />
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
            className="tnum text-base font-bold"
            style={{ color: summary.goalPct >= 100 ? "var(--good-ink)" : "var(--ink)" }}
          >
            {summary.goalPct}%
          </span>
        </Ring>
        {/*
          Shown at every width. It was `sm:hidden`, so from 640 up the card
          carried two labelled tiles and one unlabelled circle reading
          100%, with the meaning in an aria-label and nowhere else. Past
          the goal it said "24 of 15 reviews", which reads as a counting
          fault rather than as a day gone well.
        */}
        <div aria-hidden>
          <p className="label-xs" style={{ color: "var(--ink-3)" }}>Daily goal</p>
          <p className="tnum mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
            {summary.reviewsToday >= summary.dailyGoal
              ? `Met, ${summary.reviewsToday} reviews`
              : `${summary.reviewsToday} of ${summary.dailyGoal} reviews`}
          </p>
        </div>
      </div>
    </div>
  ) : null;

  /*
    Which of the three days this is: words waiting to be learned, cards
    waiting to be reviewed, or neither. `learnFirst` is the first of those.

    THE FIRST BUTTON ON A DECK NOBODY HAS READ YET IS NOT "REVIEW". A deck
    arrives whole and every card in it is unseen, so on day one there is
    nothing due and there never was: the old page counted the new cards a
    review session would trickle in and called them due, which put "Start
    your first review" over a screen whose whole first minute is teaching.
    Learning is what there is to do, so that is what the button says, and it
    goes on saying it on any day the schedule is clear and there are still
    words waiting.
  */
  const learnFirst = toLearn > 0 && (toReview === 0 || stage === "arriving");
  const caughtUp = !learnFirst && toReview === 0;
  /*
    THE ONE CARD ON THE PAGE THAT EXISTS TO SAY WHAT TO DO NOW, SAYING IT.

    With nothing due this was a sentence and no control, and it pointed
    "below" at practice tiles that sat in the other column. The lead above
    already says there is nothing due. So the note is one line and the next
    unit is a button, which is the honest next thing on a day the learner has
    earned.
  */
  const caughtUpNote = (
    <Note tone="good">
      Caught up. Reviewing early does not help memory, so this is a good moment for
      something new.
    </Note>
  );
  const actions = learnFirst ? (
    <>
      <ButtonLink href="/learn/new" variant="primary" size="lg" className="w-full">
        {stage === "arriving" ? "Learn your first words" : `Learn ${Math.min(toLearn, LEARN_BATCH)} new words`}{" "}
        <ArrowRight size={17} aria-hidden />
      </ButtonLink>
      {toReview > 0 && (
        <ButtonLink href="/review" variant="secondary" className="w-full justify-center">
          Or review {toReview} due <ArrowRight size={16} aria-hidden />
        </ButtonLink>
      )}
    </>
  ) : !caughtUp ? (
    <>
      <ButtonLink href="/review" variant="primary" size="lg" className="w-full">
        Start reviewing <ArrowRight size={17} aria-hidden />
      </ButtonLink>
      {toLearn > 0 && (
        <ButtonLink href="/learn/new" variant="secondary" className="w-full justify-center">
          Or learn {Math.min(toLearn, LEARN_BATCH)} new words <ArrowRight size={16} aria-hidden />
        </ButtonLink>
      )}
    </>
  ) : (
    <>
      {/* The note sits beside the button where there are figures to fill the
          other half, and takes that half itself where there are none. */}
      {figures && caughtUpNote}
      {nextUnit ? (
        <ButtonLink href={`/learn/${nextUnit.unit.id}/lesson`} variant="secondary" className="w-full justify-center">
          Meet {nextUnit.unit.title} <ArrowRight size={16} aria-hidden />
        </ButtonLink>
      ) : (
        <ButtonLink href="/practice" variant="secondary" className="w-full justify-center">
          Open practice <ArrowRight size={16} aria-hidden />
        </ButtonLink>
      )}
    </>
  );

  /*
    What the left half says on a morning with no figures. Which is to say, on
    the first one: what the ladder will do with the words, or, where the deck
    already has cards to answer, how to answer them.
  */
  const opening = figures ? null : caughtUp ? caughtUpNote : learnFirst ? (
    <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
      {toLearn} word{toLearn === 1 ? "" : "s"} waiting, {LEARN_BATCH} at a time. You meet each one,
      pick out its meaning, then put it back into its sentence.
    </p>
  ) : (
    <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
      Type or pick where you can, and where a card just asks, say honestly whether you
      knew it. The scheduler works out when to ask again from that.
    </p>
  );

  const doNowCard = snapshot.totalCards === 0 ? (
    <Card>
      <Empty
        title="Your deck is empty"
        body="A unit becomes real cards, with every form and its audio."
        action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
      />
    </Card>
  ) : (
    <Card className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
      <div className="min-w-0 flex-1">{figures ?? opening}</div>
      {/*
        Nineteen rem, which is the width the primary button was always drawn
        at on a phone and is wide enough for "Or learn 5 new words" on one
        line. Fixed rather than a fraction, so the button is the same object
        on every morning whatever the other half holds.
      */}
      <div className="flex flex-col gap-3 lg:w-[19rem] lg:shrink-0">{actions}</div>
    </Card>
  );

  /*
    Everything that reports on the run of days, in one card that says so. The
    streak, the week it is drawn from, the shields that protect it and the XP
    the same reviews earned are one story, and they used to be told in three
    places inside the card above.
  */
  const streakCard = shows(stage, "streak") ? (

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
          {week.map((d, i) => (
            <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {/*
                Sized to the column it is in, up to 36px, rather than
                36px whatever the column turned out to be. Seven of
                these, six gaps and the card's own padding come to more
                than a 360px phone has, so the last circle was drawn 2px
                over the card's right border. `aspect-square` keeps it a
                circle at whatever width it ends up with.
              */}
              <span
                // A reviewed day pops in, one after another across the week,
                // so the run of days reads as a run rather than as seven dots.
                className={`${d.done ? "pop-in " : ""}flex aspect-square w-full max-w-9 items-center justify-center rounded-full text-xs font-bold`}
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
                  // `--on-mint`, not `--surface`: white on this fill is
                  // 2.52:1 and the tick is the channel carrying
                  // "reviewed" without relying on the colour.
                  color: d.done ? "var(--on-mint)" : "var(--ink-3)",
                  /*
                    Today was marked with a 2px outline at a 2px offset, which
                    is this app's focus ring exactly, sitting permanently on a
                    span nobody can focus. A reader who tabs sees the real one
                    move and this one stay, which reads as the page being
                    stuck. It is an inset ring instead: inside the circle,
                    where no focus ring in this app ever sits, and the letter
                    under it carries the same colour so the mark is not the
                    ring alone.
                  */
                  boxShadow: d.isToday
                    ? "inset 0 0 0 2px var(--accent-deep)"
                    : d.done
                      ? "inset 0 0 0 1.5px var(--mint-ink)"
                      : "none",
                  animationDelay: d.done ? `${i * 60}ms` : undefined,
                }}
                aria-hidden
              >
                {d.done ? "✓" : "·"}
              </span>
              <span className="sr-only">
                {d.day}{d.isToday ? " (today)" : ""}: {d.done ? "reviewed" : "no reviews"}
              </span>
              <span
                className="text-2xs font-semibold"
                style={{ color: d.isToday ? "var(--accent-deep)" : "var(--ink-3)" }}
              >
                {weekdayLetter(d.day)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {summary.shieldsAvailable > 0 && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
          <Shield size={13} aria-hidden style={{ color: "var(--accent-deep)" }} />
          {summary.shieldsAvailable} streak shield{summary.shieldsAvailable === 1 ? "" : "s"} banked. One
          missed day won&rsquo;t break your streak.
        </p>
      )}

      {/*
        THE XP AND THE LEVEL BAR ARE NOT HERE, AND THAT IS THE POINT OF THE
        CARD. A run of days is something to keep; a bar towards level 7 is a
        report on how much has been done, which is the question `/progress`
        exists for and already answers with the same figures, ring and all.
        Two readings of one number on two screens is how they start to
        disagree, and the one that goes is the one on the screen with two
        minutes to spend.
      */}
    </Card>
  ) : null;

  /* What a teacher has assigned, under headings rather than loose dates. Only
     drawn when there is something in it: the manual homework list is gone, so
     a learner studying alone has nothing to put here and no reason to see it. */
  const planCard = shows(stage, "tasks") && tasks.length > 0 ? (
    <TodayPlan tasks={tasks.map(taskView)} clock={clock} now={now} />
  ) : null;

  /*
     What is on today, from the learner's own calendar.
     
     Held to a day that actually has something on it rather than to a
     disclosure stage: an empty schedule card is a skeleton where an answer
     should be, and a learner with no calendar yet is told about it by the rail
     rather than by a card saying "nothing". It sits above the plan because a
     class at six decides what the evening looks like and a due date does not.
  */
  const todayEvents = eventsOn(
    events.map((e) => ({
      id: e.id, title: e.title, notes: e.notes, kind: kindFrom(e.kind),
      startMinute: e.startMinute, durationMinutes: e.durationMinutes,
      weekdays: e.weekdays, onDate: e.onDate,
    })),
    clock.dayKey(now),
  );
  const scheduleCard = todayEvents.length > 0 ? (
    <Card>
      <SectionTitle hint={todayEvents.length === 1 ? "one thing" : `${todayEvents.length} things`}>
        On today
      </SectionTitle>
      <ul className="flex flex-col gap-2">
        {todayEvents.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-[var(--r)] px-3.5 py-3"
            style={{ background: `var(--${KIND_TONE[e.kind]}-soft)` }}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {e.title}
              </span>
              <span className="text-xs" style={{ color: "var(--ink-2)" }}>
                {KIND_LABEL[e.kind]}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--ink-2)" }}>
              {span(e.startMinute, e.durationMinutes)}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/calendar"
        className="mt-3 inline-block text-sm font-semibold underline underline-offset-2"
        style={{ color: "var(--accent-deep)" }}
      >
        Open the week
      </Link>
    </Card>
  ) : null;

  /*
    A Card like every one of its neighbours. It was a bare `<section>`, so its
    heading sat 25px further left than the four above it and its rows read as
    three loose boxes under a heading belonging to nothing. The rows keep their
    own borders, because a quest that is done is drawn as a filled row and
    losing that would lose the only thing the panel says at a glance.
  */
  /*
     THE DAILY QUEST, ON THE SCREEN THAT KNOWS WHAT IS GOING WRONG.

     Held to `settled` rather than shown from day one, and the reason is the
     rule the disclosure module states: this is a figure computed from the
     learner's own log, and on a log with nothing in it the card would be a
     button promising two minutes on weaknesses nobody has measured yet. That
     is the "does this say something true and useful on an empty log" test, and
     this one fails it where the word of the day passes.
  */
  const questCard = questDay ? (
    <Card tone="accent">
      <SectionTitle hint="two minutes">Daily quest</SectionTitle>
      <p className="mt-1 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {weakest ? (
          <>
            Your{" "}
            {/* Named in Estonian, because that is what a class calls it and a
                learner who has only met "inessive" cannot follow their teacher. */}
            <span lang="et" className="font-semibold">
              {grammarTerm(weakest.grammCase)?.et ?? weakest.grammCase.toLowerCase()}
            </span>{" "}
            is at {weakest.accuracy}%. Two minutes on it.
          </>
        ) : (
          "Two minutes on the cards you get wrong most often."
        )}
      </p>
      <div className="mt-3">
        <ButtonLink href="/quest" variant="primary">
          <Target size={15} aria-hidden /> Start the quest
        </ButtonLink>
      </div>
    </Card>
  ) : null;

  /*
    The one panel that is about leaving the app. It asks whether any Estonian
    was spoken to anybody yesterday, and offers an errand drawn from the units
    this deck has started where the answer is no. See lib/collections/errands.ts.
  */
  const errandCard = errand && outside ? (
    <SayItToday
      errand={errand}
      answered={outside.answered}
      conversations={outside.conversations}
      days={outside.days}
      unitTitle={unitById(errand.unit)?.title ?? errand.unit}
    />
  ) : null;

  /* The one panel here that is not about this learner's own deck. */
  const wordCard = shows(stage, "word")
    ? <WordOfDayCard word={word} collection={collection} />
    : null;

  const nextCard = shows(stage, "next") && nextUnit ? (

    <Card>
      <SectionTitle hint={nextUnit.unit.cefr}>Next on the path</SectionTitle>
      <div className="flex items-center gap-3">
        <NextUnitIcon name={nextUnit.unit.icon} />
        <div className="min-w-0">
          <p lang="et" className="text-lg font-bold leading-tight" style={{ color: "var(--ink)" }}>
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
  ) : null;

  /*
    THE GAME OF THE DAY.

    Asked for in one line of the brief and given its own reason there: "it
    becomes predictable and also something to look forward to". Eleven rounds
    on a menu is a decision to make before you can start; one on the home page
    with a reason beside it is an invitation, and Thursday being Match every
    week is a thing somebody comes to know about their own Thursdays.

    `lib/ux/weekGames.ts` is the table and nothing is hidden by it: every round
    is still on /practice, in the palette and at its own URL, every day.

    Not drawn on the day the quest is featured, because that day's round *is*
    the quest and the quest card is the better drawing of it: it names the
    learner's own weakest case and what it is at. Two cards for one round is
    furniture, which is what this page had every other day of the week as
    well. The cost is the "tomorrow" line one day in seven, which is the right
    way round.
  */
  const featuredMode = modeAt(featured.href);
  const tomorrow = gameAfter(weekdayOf(summary.dayKey));
  const gameCard = featuredMode && featured.href !== "/quest" ? (
    <Card>
      <SectionTitle hint={WEEKDAY_LONG[weekdayOf(summary.dayKey)]}>Today&apos;s game</SectionTitle>
      <p className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>
        {featuredMode.title}
      </p>
      <p className="mt-1 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {featured.why}
      </p>
      <div className="mt-3">
        <ButtonLink href={featured.href} variant="primary">
          {featuredMode.title} <ArrowRight size={15} aria-hidden />
        </ButtonLink>
      </div>
      <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
        {tomorrow.weekday} is {modeAt(tomorrow.game.href)?.title ?? "another one"}.
      </p>
    </Card>
  ) : null;

  /*
    THE ONE SHORT ROUND, WHICHEVER OF THE TWO IT IS TODAY.

    Exactly one of these is ever non-null, because `questDay` and the game
    card's own condition are the same test read from opposite sides. Written
    as a slot rather than as two entries in the list below so that stays true
    the day somebody changes one of them: two rounds on this page is the thing
    the cap was added to stop.
  */
  const roundCard = gameCard ?? questCard;

  return (
    <Page
      /*
        THE ONE DATE IN THIS APP THAT IS NOT WRITTEN THE READER'S WAY.

        Everywhere else a date is something the app is reporting back and its
        shape belongs to whoever is reading it, which is what `LocalDate` is
        for. This one is the first Estonian a learner meets each morning:
        the weekday name and the month name are two of the nineteen words every
        course teaches in its first fortnight, and a date is the one piece of
        Estonian that needs no gloss to be useful, because the reader already
        knows what today is. See lib/time/estonianDate.ts, which reads it
        out of CLDR and writes none of it.

        AND IT IS THE ESTONIAN ALONE. The line carried the English weekday
        beside it as a cross-reference, which is the shape the grammar screens
        take with the Latin case names, and a date is the one place that shape
        buys nothing: the reader already knows what day it is, so the Estonian
        needs no gloss to be read, and printing "Saturday" beside `laupäev`
        answers a question nobody had while taking the guess that teaches the
        word. A build whose locale data has no Estonian gets the line it
        always had.
      */
      eyebrow={
        today ? (
          <span lang="et">{today}</span>
        ) : (
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
        )
      }
      title={name ? `${greeting(clock, now)}, ${name}` : greeting(clock, now)}
      lead={lead(stage, toReview, toLearn, pace?.cardsPerMinute ?? null)}
    >
      {/*
        ONE CARD ACROSS THE TOP, AND FIVE UNDER IT AT THE MOST.

        The page used to be two columns from the top, the wide one for today
        and the narrow one for what is ahead. That is a sound reading order and
        it made a poor picture, because how much each column holds depends on
        how far in the learner is. So the one card that is not one of several,
        the thing to do now, goes across the whole width, and everything under
        it is handed to `Columns`, which balances the two by height in the
        browser and never splits a card.

        WHAT IS NEW IS THE CAP, AND IT IS THE WHOLE OF THIS PASS. Everything a
        stage allowed was drawn, which on a settled morning was fourteen cards:
        the quest and the game of the day saying "press something short" twice
        over, the sticking points and the weakest cases that Progress already
        draws under their own headings, three quest meters, an XP bar, six
        practice tiles, an exam forecast the hub prints in full, and a standing
        pitch for a tutor whose button is in the corner of every screen. None
        of that is wrong. All of it together is a page somebody scrolls rather
        than reads, on the one screen that has to survive being glanced at from
        a bus stop.

        So the cards are named by slot and the first `TODAY_CARDS` of them are
        drawn, in the learner's own order. The shipped order is the argument:
        what to say to a real person today, what is actually on today, the one
        short round, the run of days, a word, and then the course. It is a
        default rather than a rule, because a home page's reading order is a
        fact about the reader, and Settings is where it is changed; see
        lib/ux/todayOrder.ts. Everything below the cut is on its own page, in
        the rail and in the palette; nothing here is the only way to reach
        anything.
      */}
      <Stack className="min-w-0">
        {doNowCard}
        <Columns>
          {orderTodayCards({
            errand: errandCard,
            schedule: scheduleCard,
            plan: planCard,
            round: roundCard,
            streak: streakCard,
            word: wordCard,
            next: nextCard,
          }, todayOrderFrom(settings[SETTING_KEYS.todayOrder])).slice(0, TODAY_CARDS)}
        </Columns>
      </Stack>
    </Page>
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
function lead(
  stage: "arriving" | "starting" | "settled",
  toReview: number,
  toLearn: number,
  /** This learner's own cards a minute, off the log. Null before it has one. */
  cardsPerMinute: number | null,
): string {
  // Nothing due is only "a good moment for something new" while there is
  // something new. A deck whose words are all learned needs a unit, and saying
  // otherwise sends somebody to a screen with nothing on it.
  if (toReview === 0 && toLearn > 0) return "Nothing due right now. A good moment to meet some new words.";
  if (toReview === 0) return "Nothing due, and no new words waiting. A good moment to open a unit.";
  /*
    At the learner's own rate where the log has one, and at the one default
    the plan uses otherwise. This divided by six while the plan divided by
    three, so the morning promised half the time the plan was budgeting for
    the same cards. lib/stats/pace.ts holds the figure.
  */
  const minutes = minutesForCards(toReview, cardsPerMinute);
  const span = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (stage === "arriving") {
    return `Your deck is ready. ${toReview} card${toReview === 1 ? "" : "s"} to meet, about ${span}.`;
  }
  return `${toReview} card${toReview === 1 ? "" : "s"} waiting, about ${span} of your day.`;
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

  ALL FOUR ARE GREETINGS A COURSE TEACHES, INCLUDING THE ONE FOR THE SMALL
  HOURS. This used to say "Still up" before five, which is an English remark
  about the reader rather than a greeting: it reads as the app noticing the
  hour and having an opinion about it, on the one line that is supposed to be
  the first Estonian somebody meets. `Tere` is what anybody says at an hour
  with no greeting of its own, it is the first phrase in the A1 unit, and it
  is right at every hour, which is what makes it the honest default here.
*/
function greeting(clock: DayClock, now: Date): string {
  const h = clock.hourOf(now);
  if (h < 5) return "Tere";
  if (h < 11) return "Tere hommikust";
  if (h < 18) return "Tere päevast";
  return "Tere õhtust";
}

/** A `Task` row in the shape `TaskRow` can hold, which is a client component. */
function taskView(task: {
  id: string; title: string; tag: string; completed: boolean; dueAt: Date | null;
}): TaskView {
  return {
    id: task.id, title: task.title, tag: task.tag, completed: task.completed,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
  };
}

/**
 * THE ONE CASE MOST IN THE WAY, FOR THE DAY THE ROUND IS THE QUEST.
 *
 * `caseReviewsFor` is the query Progress and Practice ask, rather than a
 * fourth of its own: this page used to draw `WeakestCases` off five thousand
 * rows of all time with no `orderBy` between them, so a learner could be told
 * one number here and another on Progress about the same case on the same
 * day, and which five thousand rows decided it was the plan's answer rather
 * than theirs.
 *
 * The sticking points that used to come back with it are gone from this page
 * rather than moved: `/progress` draws them under their own heading from the
 * same `stickingPoints`, and a home page with two minutes to spend is not
 * where a list of lapsed cards earns its place. That takes three queries and
 * a dictionary read off every render of this page, and leaves this one, on
 * one day in seven.
 */
async function weakestCase(ownerId: string, now: Date) {
  return caseAccuracy(await caseReviewsFor(ownerId, now))[0] ?? null;
}
