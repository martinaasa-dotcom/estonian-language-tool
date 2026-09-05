import { Suspense } from "react";
import { ClipboardCheck, Compass, Flame, Footprints, Shield } from "lucide-react";
import { outThere } from "@/lib/progress/outThere";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { CEFR_LEVELS } from "@/lib/estonian/types";
import { dailySummary, deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { learnerDayClock } from "@/lib/progress/dayClock";
import {
  bestStudyHour, buildHeatmap, caseAccuracy, dailyLoad, ratingBreakdown,
  retentionReading,
} from "@/lib/stats/history";
import { stickingPoints } from "@/lib/stats/sticking";
import { ButtonLink } from "@/components/Button";
import { DrillLink } from "@/components/DrillLink";
import { Heatmap } from "@/components/Heatmap";
import { ShareProgress } from "@/components/ShareProgress";
import { StickingPoints } from "@/components/StickingPoints";
import { WeakestCases } from "@/components/WeakestCases";
import { NotAutomatic } from "@/components/NotAutomatic";
import { confusions } from "@/lib/stats/confusions";
import { answerTimeReading } from "@/lib/stats/answerTime";
import { ReadinessPanel } from "@/components/readiness/Summary";
import { readinessPicture } from "@/lib/progress/readiness";
import { caseReviewsFor } from "@/lib/progress/cases";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Board, BoardSkeleton } from "./Board";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { lemmasByCardLexeme } from "@/lib/dict/facts";
import { Card, Chip, Empty, Meter, Page, Ring, SectionTitle, Stack, Stat } from "@/components/ui";
import { NO_VALUE } from "@/lib/copy/values";
import { formatHour } from "@/lib/time/clock";

export const metadata = { title: "Progress" };

export const dynamic = "force-dynamic";

const HEATMAP_DAYS = 182;
const TREND_DAYS = 30;

export default async function ProgressPage() {
  const ownerId = await requireUserId();
  const now = new Date();
  // Every figure below is a fact about a *day*, and this page renders on the
  // server, whose midnight is the deployment's. See lib/time/day.ts.
  const [clock, snapshot] = await Promise.all([learnerDayClock(ownerId), deckSnapshot(ownerId, now)]);

  const [summary, units, reviews, deck, caseReviews, shieldRow, readiness, outside] = await Promise.all([
    dailySummary(ownerId, now, clock),
    pathWithProgress(ownerId, snapshot),
    prisma.review.findMany({
      where: { ownerId, reviewedAt: { gte: new Date(now.getTime() - HEATMAP_DAYS * 86_400_000) } },
      /*
        `durationMs`, `slot` and `reachedSlot`. The first has been collected
        since the scheduler was built and, until the plan began reading it as
        the length of a sitting, was read by nothing; nothing had ever read it
        as the time on one answer. The other two are what the flash and scene
        rounds work out about a wrong answer and used to print and drop.
        `lib/stats/answerTime.ts` and `lib/stats/confusions.ts` are the
        readers, and they cost this query three columns over rows it already
        reads.
      */
      select: {
        reviewedAt: true, rating: true, targetCase: true, stateBefore: true, cardId: true,
        durationMs: true, slot: true, reachedSlot: true,
      },
      orderBy: { reviewedAt: "asc" },
    }),
    /*
      ONE READ OF THE DECK, NOT TWO, AND ONE ROUND TRIP RATHER THAN FOUR.

      This page used to read every card twice: once here for the CEFR
      breakdown and again below, sequentially, for the cards that keep coming
      back. Both asked for the lemma through the relation, which Prisma serves
      as a second statement carrying every lexeme id it just read, so the two
      reads were four round trips over the same rows. They are one read with
      both sets of columns, and the lemma comes out of the shared dictionary
      (lib/dict/facts.ts).
    */
    prisma.card.findMany({
      where: { ownerId },
      select: {
        id: true, front: true, back: true, cardType: true, targetCase: true,
        lapses: true, reps: true, suspended: true, state: true, lexemeId: true,
      },
    }),
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
    // The shields lived on Settings, which is where you change things, not
    // where you find out how you are doing. This is a reading.
    readSettings(ownerId, [SETTING_KEYS.streakShields]),
    /*
      Which of the course's situations this learner could follow, take part
      in or lead, counted. Beside the case and vocabulary panels rather than
      under them, because it is the reading of "how am I doing" that answers
      in the terms somebody outside the app asks it in.
    */
    readinessPicture(ownerId, now),
    // Conversations reported from outside the app, which is the number the
    // readiness reading is a forecast of.
    outThere(ownerId, clock, now),
  ]);
  const shields = numberSetting(shieldRow[SETTING_KEYS.streakShields], 0);

  // The lemma behind each card, out of the dictionary the whole deployment
  // shares rather than a second statement per deck read. lib/dict/facts.ts.
  const entries = await lemmasByCardLexeme(deck.map((card) => card.lexemeId));
  const lemmaOf = (id: string | null) =>
    (id === null ? undefined : entries.get(id)?.lemma) ?? null;

  // The cards that keep coming back. Lapses live on the card's own FSRS state;
  // the accuracy beside them is counted from the log above.
  const sticking = stickingPoints(
    deck.map((c) => ({
      id: c.id, lemma: lemmaOf(c.lexemeId), front: c.front, back: c.back,
      cardType: c.cardType, targetCase: c.targetCase,
      lapses: c.lapses, reps: c.reps, suspended: c.suspended,
    })),
    reviews,
  );

  const heatmap = buildHeatmap(reviews.map((r) => r.reviewedAt), HEATMAP_DAYS, now, clock);
  const trend = dailyLoad(reviews, TREND_DAYS, now, clock);
  const breakdown = ratingBreakdown(reviews);
  // The narrower, more useful number: how often a card the scheduler believed
  // you knew actually came back. The recall rate above counts first sights too.
  const retention = retentionReading(reviews);
  const cases = caseAccuracy(caseReviews);
  /*
    Read off the rows the heatmap already fetched rather than a query of their
    own: same owner, same half-year, and this page's own argument about
    `caseReviewsFor` is that two windows over one question is how the two
    answers drift.
  */
  const pace = answerTimeReading(reviews);
  const mixedUp = confusions(reviews);
  const hour = bestStudyHour(reviews, 20, clock);

  // Vocabulary reach by CEFR: known words per level, against what the deck holds.
  const byLevel = new Map<string, { total: Set<string>; known: Set<string> }>();
  for (const card of deck) {
    const word = card.lexemeId === null ? undefined : entries.get(card.lexemeId);
    if (!word) continue;
    const { lemma } = word;
    const level = word.cefr ?? NO_VALUE;
    const entry = byLevel.get(level) ?? { total: new Set<string>(), known: new Set<string>() };
    entry.total.add(lemma);
    if (snapshot.knownLemmas.has(lemma)) entry.known.add(lemma);
    byLevel.set(level, entry);
  }

  const trendPeak = Math.max(1, ...trend.map((d) => d.reviews));
  const pathKnown = units.reduce((s, u) => s + u.known, 0);
  const pathTotal = units.reduce((s, u) => s + u.available, 0);

  if (reviews.length === 0 && snapshot.totalCards === 0) {
    return (
      <Page title="Progress" lead="Worked out fresh from your reviews every time you check.">
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
      lead="Worked out fresh from your reviews every time you check."
      /*
        The three other readings of "how am I doing", reached from the page
        that asks it. Each is a `within` in `lib/ux/nav.ts` rather than a row
        in the rail, and a `within` nobody wired up is a screen reachable only
        through the command palette: the level check was linked here and the
        mock paper and the deck were not.
      */
      actions={
        <span className="flex flex-wrap gap-2">
          <ButtonLink href="/assess">
            <Compass size={15} aria-hidden /> Level check
          </ButtonLink>
          <ButtonLink href="/exam">
            <ClipboardCheck size={15} aria-hidden /> Mock exam
          </ButtonLink>
        </span>
      }
    >
      <Stack>
        {/*
          WHAT THIS LEARNER HAS DONE, WHICH IS FOUR FIGURES AND NOT A SCORE.

          This card opened with a level ring, an Estonian level title and an XP
          total, and three quest meters counting towards the same currency sat
          under it. All of that was withdrawn: it was a second scoring system
          beside the ones that mean something on this page, and a learner
          reading down got several ways of being scored before reaching the one
          that says what to drill. Nothing was lost with it, because XP was
          derived from the review log on every request and never stored
          (ADR-014), so there is no column holding anybody's old total.

          The streak stays, and so do the shields, because they answer a
          different question: not how well, but whether you turned up. The
          shields moved here from the badge shelf they were paid out beside.
        */}
        <Card className="flex flex-wrap items-center gap-7">
          <Stat
            value={<span className="inline-flex items-center gap-1.5">{summary.streak}<Flame size={18} aria-hidden style={{ color: "var(--hard-ink)" }} /></span>}
            label="Day streak"
          />
          <Stat value={snapshot.knownCards} label="Cards known" tone="var(--good-ink)" />
          <Stat value={breakdown.accuracy === null ? NO_VALUE : `${breakdown.accuracy}%`} label="Recall rate" />
          <Stat
            value={<span className="inline-flex items-center gap-1.5">{shields}<Shield size={16} aria-hidden style={{ color: "var(--accent-deep)" }} /></span>}
            label={`Shield${shields === 1 ? "" : "s"} banked`}
          />
          <span className="ml-auto"><ShareProgress /></span>
          {/* What the shield figure beside it means. It used to be explained on
              the badge shelf, which is where it was paid out and is not where
              it is spent. */}
          <p className="w-full text-xs" style={{ color: "var(--ink-3)" }}>
            A shield carries your streak through one day you miss. One arrives at 7, 30 and 100 days.
          </p>
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
                No reviews yet. Each bar is a day, colored by how much you recalled.
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

        {readiness.totalReviews > 0 && <ReadinessPanel summary={readiness.summary} />}

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

        {/*
          Only where there is something to say, which is the shape the
          sticking points above already take. A panel that draws a heading over
          two empty lists is furniture, and this one has nothing to fall back
          on: a learner whose rounds never timed an answer has no pace, and
          that is a true and uninteresting state.
        */}
        {(pace.slow.length > 0 || mixedUp.length > 0) && (
          <section>
            <SectionTitle hint="from answers a round timed">Not automatic yet</SectionTitle>
            <Card tone="butter">
              <NotAutomatic slow={pace.slow} mixedUp={mixedUp} medianMs={pace.medianMs} />
            </Card>
          </section>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {/*
            THE PANEL THIS PAGE IS FOR, PUT AHEAD OF THE CHARTS.

            A level and a heatmap are what the app measures. What a person
            cares about is whether they got through the conversation at the
            counter, so the first thing here is what they reported from out
            there. The readiness panel beside the charts is the app's forecast
            of the same thing; this is the result. Derived on every request
            from rows that are facts (ADR-014): an encounter is a report, never
            a counter.
          */}
          <section>
            <SectionTitle hint={`last ${outside.days} days`}>Out there</SectionTitle>
            <Card>
              {outside.total === 0 ? (
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                  Nothing reported yet. Today asks each morning whether you spoke any Estonian to somebody
                  yesterday, and the answers land here. This is the one number that matters more than any
                  chart on this page.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {/*
                    The first figure counts the days something was said, not the
                    days the question was answered: "not yesterday" is an honest
                    answer and counting it here would report a fortnight of them
                    back as a fortnight of conversations. lib/collections/errands.ts
                    is where that is decided, for this panel and Today alike.
                  */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat value={outside.total} label="conversations" tone="var(--accent-deep)" icon={<Footprints size={14} aria-hidden />} />
                    <Stat value={outside.byOutcome.UNDERSTOOD} label="understood you" tone="var(--good-ink)" />
                    <Stat value={outside.byOutcome.SWITCHED} label="switched to English" tone="var(--hard-ink)" />
                    <Stat value={outside.byOutcome.BAILED} label="days with none" tone="var(--ink-3)" />
                  </div>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {outside.streak > 1 ? `${outside.streak} days in a row with a real conversation in them. ` : ""}
                    Self-reported, and the switch to English is the figure to watch: it falls as your Estonian holds.
                  </p>
                </div>
              )}
            </Card>
          </section>

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
                This counts a word only once you know every card for it, so the real number could
                be a little higher.{" "}
                <Link href="/words" className="underline" style={{ color: "var(--accent-deep)" }}>
                  See your deck card by card
                </Link>.
              </p>
            </Card>
          </section>

        </div>

        {/*
          THE BOARD IS THE LAST THING ON THIS PAGE AND IT WAS FOUR ROUND TRIPS
          IN FRONT OF THE FIRST.

          Finding the class, reading its name through the relation, then the
          roster: a chain nothing above it needed the answer to, at the bottom
          of a page of charts. Behind a boundary it is fetched while the rest
          of the page is already being read, which is what a `Suspense` is
          for, and it is three trips rather than four now that the name comes
          back beside the roster instead of in front of it. See ./Board.
        */}
        <Suspense fallback={<BoardSkeleton />}>
          <Board ownerId={ownerId} now={now} />
        </Suspense>
      </Stack>
    </Page>
  );
}
