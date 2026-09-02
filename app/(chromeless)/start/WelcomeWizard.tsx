"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, Loader2 } from "lucide-react";
import { completeOnboarding } from "@/app/actions";
import { AssessmentRunner } from "@/components/assessment/AssessmentRunner";
import { PlanPanel, minutesFor } from "@/components/assessment/PlanPanel";
import { ResultPanel } from "@/components/assessment/ResultPanel";
import { Button } from "@/components/Button";
import { LetterBarScope, LetterSample } from "@/components/DiacriticBar";
import { Mascot } from "@/components/brand";
import { icon } from "@/components/icons";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, impliedTarget, reasonsToStored, type Goals } from "@/lib/assessment/goals";
import { weeksToLearn } from "@/lib/assessment/plan";
import { PRE_A1, type Band, type Item, type Level, type Placement } from "@/lib/assessment/types";
import { DEFAULT_LETTER_BAR, LETTER_BAR_CHOICES, type LetterBar } from "@/lib/ux/letterBar";
import {
  DEFAULT_GLOSS_LANGUAGE, GLOSS_LANGUAGES, type GlossLanguage,
} from "@/lib/collections/glossLanguage";

/**
 * The deck a learner at one level starts with, sized by the server.
 *
 * `cards` is built rather than estimated: `previewUnits` runs the same card
 * generator the deck builder runs and counts what comes out. The screen used to
 * print `words * 2`, which is right only for a unit that drills nothing and is
 * out by a factor of five at A1, where every unit drills cases.
 */
export interface StarterDeck {
  /** The CEFR band this deck is the starting point for. */
  level: string;
  unitIds: string[];
  units: { id: string; title: string; subtitle: string; icon: string }[];
  /** Words the dictionary can actually fill. */
  words: number;
  /** Cards those words build. */
  cards: number;
  /** Units left at this level, so the screen can say what it is not giving them. */
  remaining: number;
}

/** The self-rated ladder, for a learner who would rather not sit the check now. */
/*
  All five, because the course runs to C1 and stopping the list at B2 told
  anybody above it that the app was not for them. Each is described by what a
  person can already do rather than by its code, since somebody who needs to
  pick a level is exactly somebody who does not know what B2 means.
*/
/*
  ONE VOICE, AND IT IS WHAT YOU CAN DO.

  The first two were written as things ("Tere, aitäh, and not much else yet")
  and the last three as the learner speaking ("I am able to comprehend and add
  to most conversations"), so the list changed person halfway down on the
  screen that decides somebody's year, ninety seconds into the app. The last
  one also assumed a motive nobody had been asked about. Every row is now the
  same shape as the first two, which is the shape CEFR itself uses: what you
  can already do.
*/
const LEVELS = [
  { key: "A1", label: "Just starting", detail: "Tere, aitäh, and not much else yet." },
  { key: "A2", label: "I get by", detail: "Shopping, online orders, simple sentences." },
  { key: "B1", label: "Conversational", detail: "A clear conversation, and holding your own side of it." },
  { key: "B2", label: "Confident", detail: "A meeting, and an article read without stopping." },
  { key: "C1", label: "Fluent", detail: "Anything, near enough. Here for the shades of meaning." },
] as const;

/**
 * The four paces, as review counts.
 *
 * The minutes are not listed here. They were, as a hand-written string per row,
 * beside a `minutesFor` in `PlanPanel` that computes the same number from the
 * same goal, and two of them printed as "About about 8 minutes a day" because
 * the sentence around them supplied the "About" as well. One of those is a
 * typo and the other is the reason it survived: a figure written down twice is
 * a figure nobody is checking. `minutesFor` is the one answer.
 */
const GOALS = [
  { value: 10, label: "Casual" },
  { value: 15, label: "Regular" },
  { value: 25, label: "Serious" },
  { value: 40, label: "Intense" },
] as const;

const STEPS = ["You", "Level", "Goal", "Start"] as const;

/**
 * First run.
 *
 * It was eight screens and it is now four, because the feedback on this app was
 * that it overwhelms somebody just getting started and eight screens of
 * questions before a single Estonian word is the first thing that happens to
 * them. What went is not the substance, it is the spreading of it: name, why,
 * how far, by when, days a week, level, pace, plan, tour and deck were ten
 * questions across eight screens, and four of them had a screen to themselves.
 *
 * What each screen is still for:
 *
 *   - **You** asks the one thing needed to greet somebody, and states what this
 *     app is and is not before they have spent an evening on it.
 *   - **Level** measures or estimates where they are. It comes second because
 *     everything after it is built on the answer.
 *   - **Goal** is why, how far, by when and how often, on one screen, with the
 *     plan those answers produce underneath them rather than on a screen of its
 *     own. Seeing the hours change as you answer is the argument for asking.
 *     Skippable in one press, because a learner in a hurry should be.
 *   - **Start** picks the daily goal and the first units. Last, because the
 *     plan has to be seen before anybody invests an evening in a deck.
 *
 * The tour that was step seven is `/guide`, in the rail and in the palette,
 * where it can be reopened a fortnight in when the question actually arises.
 * The honest limits it led with are on the first screen here in one sentence,
 * because that is where they earn their place: before the investment, not
 * after seven screens of it.
 */
export function WelcomeWizard({ starters, suggestedName, paper }: {
  /** The starter deck for each level, sized by the server. */
  starters: StarterDeck[];
  suggestedName: string;
  /** The level check, built server side. Empty when the dictionary cannot fill one. */
  paper: { items: Item[]; missing: string[] };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(suggestedName);
  const [letters, setLetters] = useState<LetterBar>(DEFAULT_LETTER_BAR);
  const [gloss, setGloss] = useState<GlossLanguage>(DEFAULT_GLOSS_LANGUAGE);

  // A set, because almost nobody has one reason: living here, an Estonian
  // partner and a job where the meetings are in Estonian are three answers to
  // one question and the app used to make somebody pick a favourite.
  const [reasons, setReasons] = useState<string[]>([]);
  const [target, setTarget] = useState<Band | null>(null);
  /** True once the learner has pressed a target themselves, which ends the offer. */
  const [targetChosen, setTargetChosen] = useState(false);
  const [deadlineId, setDeadlineId] = useState<string>("1y");
  const [daysPerWeek, setDaysPerWeek] = useState(5);

  const [checking, setChecking] = useState(false);
  const [measured, setMeasured] = useState<Placement | null>(null);
  const [estimated, setEstimated] = useState<string | null>(null);

  const [goal, setGoal] = useState<number>(15);
  const [pending, start] = useTransition();

  /** The level everything downstream uses: measured if it was, stated if not. */
  const level: Level | null = measured ? measured.overall : (estimated as Band | null);
  /** The band the starting deck is chosen from. Below A1 starts at A1. */
  const startBand = level === null || level === PRE_A1 ? "A1" : level;

  const goals: Goals = useMemo(() => ({
    reason: reasonsToStored(reasons),
    target,
    deadline: deadlineFrom(DEADLINES.find((d) => d.id === deadlineId) ?? DEADLINES[4]!, new Date()),
    daysPerWeek,
    note: "",
  }), [reasons, target, deadlineId, daysPerWeek]);

  const chooseLevel = (key: string) => {
    setEstimated(key);
    setMeasured(null);
  };

  /*
    THE OFFERED GOAL FOLLOWS THE REASONS UNTIL SOMEBODY OVERRULES IT.

    `setTarget((current) => current ?? implied)` was right while this was one
    reason and is wrong for a set, because the *first* tick fills the target in
    and every tick after it then finds one already there. Somebody choosing
    citizenship and then work was offered B1 and kept it, which is the level
    below the one their own answers ask for.

    So the app's own suggestion is tracked separately from the learner's. Until
    they press a target chip, the offer is the highest level any chosen reason
    needs, and it moves with the set; the moment they press one, it is theirs
    and nothing here touches it again.
  */
  const toggleReason = (id: string) => {
    setReasons((all) => {
      const next = all.includes(id) ? all.filter((r) => r !== id) : [...all, id];
      if (!targetChosen) setTarget(impliedTarget(next));
      return next;
    });
  };

  const chooseTarget = (band: Band) => {
    setTargetChosen(true);
    setTarget(band);
  };

  /*
    The deck follows the level, and the level is the answer to the question two
    screens back. Nothing here is chosen twice.
  */
  const deck = starters.find((d) => d.level === startBand) ?? starters[0] ?? null;

  const finish = () => {
    start(async () => {
      await completeOnboarding({
        displayName: name,
        cefr: startBand,
        dailyGoal: goal,
        unitIds: deck?.unitIds ?? [],
        letterBar: letters,
        glossLanguage: gloss,
        goals: {
          reason: goals.reason,
          target: goals.target,
          deadline: goals.deadline,
          daysPerWeek: goals.daysPerWeek,
          note: goals.note,
        },
      });
      router.push("/");
      router.refresh();
    });
  };

  // The check owns the screen while it runs: a wizard frame around a test is a
  // Back button somebody presses by accident nine questions in.
  if (checking) {
    return (
      <LetterBarScope value={letters}>
        <main className="min-h-screen" style={{ background: "var(--ground)" }}>
          <AssessmentRunner
          items={paper.items}
          missing={paper.missing}
          /*
            Back to the level step, not past it.

            It used to jump to the goal screen, so somebody who had just spent
            twenty minutes on eighty questions was asked why they were learning
            Estonian and had to press Back to find out what they had scored.
            The result panel lives on step 1 and this is what puts it in front
            of them: the answer to the question they just sat, on the screen
            that asked it, with Continue underneath.
          */
          onFinish={(result) => {
            setMeasured(result);
            setChecking(false);
            setStep(1);
          }}
        />
        </main>
      </LetterBarScope>
    );
  }

  const canContinue =
    (step !== 0 || name.trim().length > 0) &&
    (step !== 1 || level !== null);

  /*
    A `main` rather than a `div`, which is the whole of this change and was
    worth making. First run is the only screen in the app with no landmark on
    it at all: `app/(app)/layout.tsx` gives every signed-in route one and the
    skip link that goes with it, and sign-in and the landing page have their
    own. So the first screen anybody meets was the one screen a reader could
    not jump into, and it is four steps of form.
  */
  return (
    <LetterBarScope value={letters}>
      <main className="relative flex min-h-screen flex-col justify-center px-5 py-10 md:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="wash" style={{ background: "var(--wash-1)", width: 560, height: 560, top: -220, left: -160 }} />
        <span className="wash" style={{ background: "var(--wash-2)", width: 480, height: 480, bottom: -240, right: -160, opacity: 0.6 }} />
      </div>

      <div
        className="pop-in relative mx-auto w-full max-w-2xl rounded-[var(--r-xl)] border p-7 md:p-10"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="mb-8 flex items-center gap-4">
          <Mascot size={44} className="float shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="label-xs mb-2" style={{ color: "var(--accent-deep)" }}>
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
            <Meter pct={((step + 1) / STEPS.length) * 100} label={`Setup progress, step ${step + 1} of ${STEPS.length}`} />
          </div>
        </div>

        {step === 0 && (
          <section>
            {/*
              The heading, then straight into the first question.

              What used to sit between them was "Kodukeel means home language.
              This is how Estonian becomes yours.", which is the right sentence
              on the wrong screen: it is the pitch, and the pitch belongs on the
              page somebody read before pressing the button that brought them
              here. Repeating it is the app introducing itself to somebody who
              has already agreed.

              And the limits moved to the bottom. They still have to be said
              before an evening goes into a deck, and they do not have to be the
              thing standing between the welcome and the name field.
            */}
            <h1 lang="et" className="text-3xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Tere tulemast!
            </h1>

            <label htmlFor="learner-name" className="label-xs mt-8 block" style={{ color: "var(--ink-3)" }}>
              What should we call you?
            </label>
            <input
              id="learner-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder="Your name or a nickname"
              className="mt-2 w-full rounded-[var(--r-lg)] border px-5 py-3.5 text-md outline-none"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Only used to greet you, and shown beside your XP if you ever join a class.
            </p>

            {/*
              THE ONE QUESTION ABOUT THE MACHINE RATHER THAN THE LEARNER, ON THE
              SCREEN THAT IS ALREADY ABOUT NEITHER THE LEVEL NOR THE PLAN.

              It is here rather than on a fifth screen. Four screens is the
              shape of this wizard and a question with a screen to itself is
              exactly the fault the last pass over it fixed: this one is a pair
              of buttons and it belongs beside the other thing we need before
              anybody starts typing Estonian.

              `letters-choice` is the same media query the bar itself is drawn
              under, so a phone is not asked. It gets the default written for
              it, which is what it wants: when that learner next opens the app
              on a computer the row is there, and one press removes it.

              Answered live, and the next screen is the level check, which is
              full of Estonian fields. Whatever is chosen here is what they
              meet there.

              It sits in its own panel because it was the most crowded thing on
              this screen: two cards each holding a title, six letter samples
              and a line of explanation, pressed straight up against the field
              above and the note below with the same 8px everything else on the
              page used.
            */}
            <div
              className="letters-choice mt-10 rounded-[var(--r-lg)] border p-5"
              style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
            >
              <ChoiceGroup
                label="How do you type õ, ä, ö and ü?"
                className="grid gap-3 sm:grid-cols-2"
              >
                {LETTER_BAR_CHOICES.map((o) => (
                  <ChoiceCard
                    key={o.value}
                    layout="stacked"
                    selected={letters === o.value}
                    onSelect={() => setLetters(o.value)}
                    title={o.label}
                    detail={<><LetterSample lit={o.value === "on"} />{o.detail}</>}
                  />
                ))}
              </ChoiceGroup>
              <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
                Change it whenever you like, in Settings or from the row itself.
              </p>
            </div>

            {/*
              WHICH LANGUAGE A MEANING IS GIVEN IN, ASKED ON THE FIRST SCREEN.

              Most people learning Estonian in Estonia already speak Russian or
              Ukrainian, and this is the answer that decides whether the app is
              readable to them at all. Buried in Settings it would be found by
              the people who least need it. It is one row of three buttons, on
              the screen that already asks the other thing we need before
              anybody meets an Estonian word, and unlike the letter bar it is
              asked on a phone too: it is not a fact about the keyboard.

              English stays the default, so somebody who wants it presses
              nothing. The equivalents come from Ekilex, so nothing here was
              written by this app or by a model.
            */}
            <div
              className="mt-4 rounded-[var(--r-lg)] border p-5"
              style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
            >
              <ChoiceGroup
                label="What language would you like meanings in?"
                className="grid gap-3 sm:grid-cols-3"
              >
                {GLOSS_LANGUAGES.map((o) => (
                  <ChoiceCard
                    key={o.id}
                    layout="stacked"
                    selected={gloss === o.id}
                    onSelect={() => setGloss(o.id)}
                    title={o.label}
                    detail={o.id === "en" ? "The course's own glosses" : o.native}
                  />
                ))}
              </ChoiceGroup>
              <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
                The English stays either way. The Russian and Ukrainian are Ekilex&rsquo;s own,
                written by the same lexicographers as the Estonian.
              </p>
            </div>

            {/*
              The limits, last and in one sentence.

              It used to carry a link to /guide reading "What it does and does
              not do, in full", and that page is gone: the landing page makes
              the case, and a learner who skipped it finds out what the app does
              by using it rather than by reading a second description of it. A
              link out of a setup wizard is a way to lose somebody ninety
              seconds in, and the sentence in front of it was already the part
              that mattered.
            */}
            <div className="mt-10">
              <Note tone="hard">
                It will not score your pronunciation, teach you to hold a conversation, or replace a
                teacher.
              </Note>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Where are you now?
            </h1>
            {/*
              NO NUMBER OF MINUTES, AND THAT IS THE HONEST VERSION.

              This said "the ten-minute level check", which was written when the
              paper was nineteen questions. It is eighty now and a skill stops
              one band past the first it was not passed at, so ten minutes is
              true for a beginner and nowhere near true for anybody else: a B1
              learner was still in the reading section after ten minutes with
              three sections to go, having been promised the whole thing in
              that time. A figure that is right at one end of the range and
              three times out at the other is worse than no figure, because the
              learner who is furthest through is the one who was told wrong.
            */}
            <p className="mt-3 max-w-[54ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Take the level check now, or estimate and move on. The check stops as soon as it has
              found your level, and nothing here is locked in: Settings can change it, or sit the
              check, whenever you like.
            </p>

            {measured ? (
              <div className="mt-6">
                <ResultPanel result={measured} heading="Measured just now" />
                <Button variant="ghost" className="mt-4" onClick={() => { setMeasured(null); setChecking(true); }}>
                  Sit it again
                </Button>
              </div>
            ) : (
              <>
                {paper.items.length > 0 ? (
                  <Button variant="primary" size="lg" className="mt-7 w-full" onClick={() => setChecking(true)}>
                    <Compass size={16} aria-hidden /> Take the level check
                  </Button>
                ) : (
                  <div className="mt-6">
                    <Note tone="sky">
                      The level check needs dictionary entries that are tagged with a level, and
                      this copy of Kodukeel does not have that yet. Estimating is your only
                      option for now.
                    </Note>
                  </div>
                )}

                <div className="mt-8">
                  <SectionTitle>Or estimate it</SectionTitle>
                </div>
                <ChoiceGroup ariaLabel="Estimate your level" className="flex flex-col gap-3">
                  {LEVELS.map((l) => (
                    <ChoiceCard
                      key={l.key}
                      selected={estimated === l.key}
                      onSelect={() => chooseLevel(l.key)}
                      lead={l.key}
                      title={l.label}
                      detail={l.detail}
                    />
                  ))}
                </ChoiceGroup>
              </>
            )}
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Why Estonian?
            </h1>
            <p className="mt-3 max-w-[54ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Pick as many as are true. Different reasons need different levels, one of them has a
              real exam attached, and the numbers below change as you answer.
            </p>

            {/*
              A grid rather than a scrolling box. The reasons were in a
              `scroll-host` capped at a third of the viewport, which cut the
              seventh card in half with nothing to say it scrolled: a nested
              scroll region inside a page that already scrolls is the shape
              this pass exists to remove. Eight short rows in two columns fit
              without one.
            */}
            <ChoiceGroup
              ariaLabel="Why you are learning Estonian"
              select="many"
              className="mt-6 grid gap-3 sm:grid-cols-2"
            >
              {REASONS.map((r) => {
                const Icon = icon(r.icon);
                return (
                  <ChoiceCard
                    key={r.id}
                    selected={reasons.includes(r.id)}
                    onSelect={() => toggleReason(r.id)}
                    icon={<Icon size={18} aria-hidden />}
                    title={r.label}
                    detail={r.detail}
                  />
                );
              })}
            </ChoiceGroup>

            {/*
              Three rows of chips rather than three screens of cards, and the
              chip is the whole answer.

              Under the chosen one sat a paragraph pairing what the level lets
              you do with what it does not ("Manage most situations that come
              up... Still out of reach: keep up with fast speech between
              natives"). It is honest and it is the wrong screen for it: this is
              somebody choosing where they are headed, and a caveat that appears
              the moment they choose reads as the app arguing with them. The
              plan directly below already tells them how many hours that target
              costs, which is the version of the same warning they can act on.
              `TARGETS` keeps both strings; Settings still shows `can` on hover.
            */}
            <div className="mt-8 flex flex-col gap-7">
              <div>
                <SectionTitle>What is your goal?</SectionTitle>
                <ChoiceGroup ariaLabel="What is your goal">
                  {TARGETS.map((t) => (
                    <ChoiceChip key={t.band} selected={target === t.band} onSelect={() => chooseTarget(t.band)}>
                      {t.band} · {t.label}
                    </ChoiceChip>
                  ))}
                </ChoiceGroup>
              </div>

              <div>
                <SectionTitle>By when</SectionTitle>
                <ChoiceGroup ariaLabel="By when">
                  {DEADLINES.map((d) => (
                    <ChoiceChip key={d.id} selected={deadlineId === d.id} onSelect={() => setDeadlineId(d.id)}>
                      {d.label}
                    </ChoiceChip>
                  ))}
                </ChoiceGroup>
              </div>

              <div>
                <SectionTitle hint="be honest, the plan is built on it">Days a week you will really practise</SectionTitle>
                <ChoiceGroup ariaLabel="Days a week you will really practise">
                  {[2, 3, 4, 5, 6, 7].map((days) => (
                    <ChoiceChip key={days} even selected={daysPerWeek === days} onSelect={() => setDaysPerWeek(days)}>
                      {days}
                    </ChoiceChip>
                  ))}
                </ChoiceGroup>
              </div>
            </div>

            {/*
              The plan, under the answers that build it rather than on a screen
              of its own. It is the single most useful thing this app can tell a
              beginner and it has to be seen before an evening goes into a deck,
              which it still is: the deck is the step after this one.
            */}
            <div className="mt-7">
              <SectionTitle hint="from your answers and published estimates">What this is going to take</SectionTitle>
              {!measured && (
                <div className="mb-4">
                  <Note tone="sky">
                    This plan is built on the level you estimated. Take the level check whenever
                    you like, and it rebuilds around a real measurement instead.
                  </Note>
                </div>
              )}
              <PlanPanel level={level} goals={goals} dailyGoal={goal} compact />
            </div>
          </section>
        )}

        {/*
          The empty state, which is a deployment rather than a learner: with no
          dictionary seeded there is nothing to build a deck out of, and the
          screen has to say so rather than offer "0 words, 0 cards" as though
          that were a choice somebody made. First run still finishes, because
          the alternative is a stranger stuck on step four of four.
        */}
        {step === 3 && (!deck || deck.cards === 0) && (
          <section>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Your first words
            </h1>
            <Note tone="hard">
              There is no dictionary loaded yet on this installation, so there is no starter deck
              to hand you. Whoever runs it can load one with <code>npm run db:seed</code>. You can
              still choose your pace below, and add words from the dictionary as you come across
              them.
            </Note>

            <div className="mt-7">
              <SectionTitle hint="changeable any time in Settings">How much a day</SectionTitle>
            </div>
            <ChoiceGroup ariaLabel="How much a day">
              {GOALS.map((g) => (
                <ChoiceChip key={g.value} selected={goal === g.value} onSelect={() => setGoal(g.value)}>
                  {g.label} · {g.value} cards
                </ChoiceChip>
              ))}
            </ChoiceGroup>
            <p className="mt-2.5 max-w-[62ch] text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
              {minutesFor(goal)} minutes a day, {daysPerWeek} days a week. That is {goal} cards to
              answer, not {goal} new ones. About nine in ten will be words you have already met,
              coming back right when you are starting to forget them.
            </p>
          </section>
        )}

        {step === 3 && deck && deck.cards > 0 && (
          <section>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Your first words
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              The course starts you here, at {startBand}. These are the words you actually need to
              begin, taught in the order a course teaches them, and each one turns into real
              flashcards with audio and every form of the word.
            </p>

            {/*
              WHAT THIS SCREEN USED TO BE, AND WHY IT IS NOT THAT ANY MORE.

              Fourteen units with checkboxes, three ticked, and `words * 2`
              underneath as the card count. Somebody ninety seconds into an app
              cannot tell whether they need `Riided` before `Ilm`, so the honest
              reading of that list is "tick everything", and ticking everything
              built two thousand cards: at the pace this app itself calls
              sustainable, a backlog into 2028 assembled by accident on a
              Tuesday evening. The count under it said four hundred, because two
              cards a word is only true of a unit that drills nothing.

              So the course picks, the server counts, and the screen says what
              it is handing over. The units are named rather than hidden, and
              the sentence under them says where to change it, because a default
              somebody cannot see is indistinguishable from no choice at all.
            */}
            <ul className="mt-5 flex flex-col gap-2">
              {deck.units.map((u) => {
                const Icon = icon(u.icon);
                return (
                  <li
                    key={u.id}
                    className="flex items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3"
                    style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
                  >
                    <Icon size={18} aria-hidden style={{ color: "var(--accent-deep)" }} />
                    <div className="min-w-0">
                      <p lang="et" className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                        {u.title}
                      </p>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>{u.subtitle}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
              {deck.words} words, {deck.cards} cards.{" "}
              {deck.remaining > 0 && (
                <>The other {deck.remaining} units at {startBand}, and every other level, are on the
                path whenever you want them. </>
              )}
              Nothing here is locked in.
            </p>

            {/*
              The daily goal, as one row rather than a screen. It has a sane
              default, it never caps a session, and Settings changes it in two
              clicks, so a whole step for it was a step spent on the least
              consequential answer in the walkthrough.
            */}
            <div className="mt-7">
              <SectionTitle hint="changeable any time in Settings">How much a day</SectionTitle>
            </div>
            <ChoiceGroup ariaLabel="How much a day">
              {GOALS.map((g) => (
                <ChoiceChip key={g.value} selected={goal === g.value} onSelect={() => setGoal(g.value)}>
                  {g.label} · {g.value} cards
                </ChoiceChip>
              ))}
            </ChoiceGroup>
            {/*
              THE SENTENCE THIS SCREEN EXISTS TO GET RIGHT, AND IT WAS BACKWARDS.

              It read "setting this higher does not make words arrive faster",
              which is the opposite of what the app's own arithmetic does:
              `sustainableNewCardsPerDay` is the goal divided by ten, so Intense
              introduces four new cards a day where Casual introduces one. Four
              times faster is not "no faster". The true half of it is the half
              that got lost: a goal of fifteen is fifteen *reviews*, not fifteen
              new words, because nine of every ten cards you answer are ones you
              have already met. That is the thing nobody is told, and it is why
              a beginner sets Intense in week one and meets two hundred due
              cards in week six.

              So it says both: what the pace buys, and what it costs, with the
              number for this learner's own deck rather than a general warning.
            */}
            <p className="mt-2.5 max-w-[62ch] text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
              {minutesFor(goal)} minutes a day, {daysPerWeek} days a week. That is {goal} cards to
              answer, not {goal} new ones. About nine in ten will be words you have already met,
              coming back right when you are starting to forget them. These {deck.cards} cards take
              roughly {weeksToLearn(deck.cards, goal, daysPerWeek)} weeks to work through this way,
              and a faster setting really does bring them in sooner. It also makes every day&rsquo;s
              session longer, for the next year. Pick the one you would still open on a bad
              Wednesday.
            </p>
          </section>
        )}

        <div className="mt-10 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
              <ArrowLeft size={15} aria-hidden /> Back
            </Button>
          )}
          {step === 1 && level !== null && (
            <Chip tone="accent">
              {measured ? "Measured" : "Estimated"} {level === PRE_A1 ? "below A1" : level}
            </Chip>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              size="lg"
              className="ml-auto"
              onClick={() => setStep((s) => s + 1)}
              disabled={pending || !canContinue}
            >
              Continue <ArrowRight size={15} aria-hidden />
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="ml-auto" onClick={finish} disabled={pending}>
              {pending
                ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Building your deck...</>
                : <>Start learning <ArrowRight size={15} aria-hidden /></>}
            </Button>
          )}
        </div>

        {/*
          NO WAY OUT OF SETUP, AND ONE WAY PAST ONE QUESTION.

          "Skip setup and go straight to the dictionary" sat under every screen
          of this wizard and was the wrong offer twice over. It landed somebody
          on `/dictionary` with no name, no level, no goal and an empty deck,
          which is the app at its least useful and the state every other screen
          then has to apologise for; and it was the most prominent thing on the
          first screen after the Continue button, so the app's own suggestion to
          a stranger was to not use it. Four questions is ninety seconds and
          every one of them changes what the learner is shown afterwards.

          What stays is skipping the *goal*, which is the one screen whose
          answers only feed the plan. Somebody in a hurry can press past it and
          Settings asks the same four questions whenever they want them.
        */}
        {step === 2 && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={pending}
              className="text-xs underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: "var(--ink-3)" }}
            >
              Skip the goal and go straight to the words
            </button>
          </div>
        )}
      </div>
      </main>
    </LetterBarScope>
  );
}
