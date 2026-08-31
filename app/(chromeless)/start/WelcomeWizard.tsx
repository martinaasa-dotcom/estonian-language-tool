"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, Loader2 } from "lucide-react";
import { completeOnboarding, skipOnboarding } from "@/app/actions";
import { AssessmentRunner } from "@/components/assessment/AssessmentRunner";
import { PlanPanel } from "@/components/assessment/PlanPanel";
import { ResultPanel } from "@/components/assessment/ResultPanel";
import { Button } from "@/components/Button";
import { LetterBarScope, LetterSample } from "@/components/DiacriticBar";
import { Mascot } from "@/components/brand";
import { icon } from "@/components/icons";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { LEVELS as CEFR_LEVELS, unitsAtLevel } from "@/lib/collections/syllabus";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, type Goals } from "@/lib/assessment/goals";
import { PRE_A1, type Band, type Item, type Level, type Placement } from "@/lib/assessment/types";
import { WHAT_IT_IS_SHORT } from "@/lib/copy/tour";
import { DEFAULT_LETTER_BAR, LETTER_BAR_CHOICES, type LetterBar } from "@/lib/ux/letterBar";

export interface WizardUnit {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  cefr: string;
  blurb: string;
  words: number;
}

/** The self-rated ladder, for a learner who would rather not sit the check now. */
/*
  All five, because the course runs to C1 and stopping the list at B2 told
  anybody above it that the app was not for them. Each is described by what a
  person can already do rather than by its code, since somebody who needs to
  pick a level is exactly somebody who does not know what B2 means.
*/
const LEVELS = [
  { key: "A1", label: "Just starting", detail: "Tere, aitäh, and not much else yet." },
  { key: "A2", label: "I get by", detail: "Shopping, ordering, the lihtminevik." },
  { key: "B1", label: "Conversational", detail: "I can hold a conversation and read the news slowly." },
  { key: "B2", label: "Confident", detail: "I follow a debate and want precision, not basics." },
  { key: "C1", label: "Fluent", detail: "I work in Estonian and want to write it well." },
] as const;

const GOALS = [
  { value: 10, label: "Casual", detail: "about 3 minutes a day" },
  { value: 15, label: "Regular", detail: "about 5 minutes a day" },
  { value: 25, label: "Serious", detail: "about 8 minutes a day" },
  { value: 40, label: "Intense", detail: "about 13 minutes a day" },
] as const;

/**
 * Units suggested for each starting level, which is where that learner's next
 * work is.
 *
 * Derived from the syllabus rather than hand-listed. The list it replaced named
 * unit ids in a string literal and stopped at B2, so it could rot silently when
 * the course grew. Below A1 starts where A1 does, because the first sensible
 * thing to do is the same either way.
 */
const SUGGESTED: Record<string, string[]> = {
  ...Object.fromEntries(
    CEFR_LEVELS.map((level) => [level, unitsAtLevel(level).slice(0, 3).map((u) => u.id)]),
  ),
  [PRE_A1]: unitsAtLevel("A1").slice(0, 3).map((u) => u.id),
};

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
export function WelcomeWizard({ units, suggestedName, paper }: {
  units: WizardUnit[];
  suggestedName: string;
  /** The level check, built server side. Empty when the dictionary cannot fill one. */
  paper: { items: Item[]; missing: string[] };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(suggestedName);
  const [letters, setLetters] = useState<LetterBar>(DEFAULT_LETTER_BAR);

  const [reason, setReason] = useState<string | null>(null);
  const [target, setTarget] = useState<Band | null>(null);
  const [deadlineId, setDeadlineId] = useState<string>("1y");
  const [daysPerWeek, setDaysPerWeek] = useState(5);

  const [checking, setChecking] = useState(false);
  const [measured, setMeasured] = useState<Placement | null>(null);
  const [estimated, setEstimated] = useState<string | null>(null);

  const [goal, setGoal] = useState<number>(15);
  const [picked, setPicked] = useState<string[]>(SUGGESTED.A1 ?? []);
  const [pending, start] = useTransition();

  /** The level everything downstream uses: measured if it was, stated if not. */
  const level: Level | null = measured ? measured.overall : (estimated as Band | null);
  /** The band the starting deck is chosen from. Below A1 starts at A1. */
  const startBand = level === null || level === PRE_A1 ? "A1" : level;

  const goals: Goals = useMemo(() => ({
    reason,
    target,
    deadline: deadlineFrom(DEADLINES.find((d) => d.id === deadlineId) ?? DEADLINES[4]!, new Date()),
    daysPerWeek,
    note: "",
  }), [reason, target, deadlineId, daysPerWeek]);

  const chooseLevel = (key: string) => {
    setEstimated(key);
    setMeasured(null);
    setPicked((current) => {
      const suggestion = SUGGESTED[key] ?? [];
      const manual = current.filter((id) => !Object.values(SUGGESTED).flat().includes(id));
      return [...new Set([...suggestion, ...manual])];
    });
  };

  const chooseReason = (id: string) => {
    setReason(id);
    // The level a reason usually needs, offered rather than imposed: a learner
    // who has not picked a target yet gets one, a learner who has keeps theirs.
    const implied = REASONS.find((r) => r.id === id)?.implies ?? null;
    setTarget((current) => current ?? implied);
  };

  const toggleUnit = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const wordCount = units.filter((u) => picked.includes(u.id)).reduce((sum, u) => sum + u.words, 0);
  const chosenTarget = TARGETS.find((t) => t.band === target);

  const finish = () => {
    start(async () => {
      await completeOnboarding({
        displayName: name,
        cefr: startBand,
        dailyGoal: goal,
        unitIds: picked,
        letterBar: letters,
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

  const skip = () => {
    start(async () => {
      await skipOnboarding();
      router.push("/dictionary");
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
          onFinish={(result) => {
            setMeasured(result);
            const band = result.overall === PRE_A1 || result.overall === null ? "A1" : result.overall;
            setPicked((current) => [...new Set([...(SUGGESTED[band] ?? []), ...current])]);
            setChecking(false);
            setStep(2);
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
            <h1 lang="et" className="est text-3xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Tere tulemast!
            </h1>
            <p className="mt-3 max-w-[54ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {WHAT_IT_IS_SHORT}
            </p>
            <div className="mt-5">
              {/*
                The limits, up front and in one sentence. They used to be a
                screen of their own, seven steps in, which is after the
                investment rather than before it. Both lists in full are at
                /guide, which opens in its own tab so nobody loses this one.
              */}
              <Note tone="hard">
                It will not score your pronunciation, teach you to hold a conversation, or replace a
                teacher.{" "}
                <a
                  href="/guide"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-2"
                  style={{ color: "var(--accent-deep)" }}
                >
                  What it does and does not do, in full
                </a>
                .
              </Note>
            </div>
            <label htmlFor="learner-name" className="label-xs mt-7 block" style={{ color: "var(--ink-3)" }}>
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
              Only used to greet you, and on the class leaderboard if you ever turn that on.
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
            */}
            <div className="letters-choice mt-7">
              <ChoiceGroup
                label="How do you type õ, ä, ö and ü?"
                className="grid gap-2 sm:grid-cols-2"
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
              <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                Change it whenever you like, in Settings or from the row itself.
              </p>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Where are you now?
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              Measure it in about ten minutes, or estimate it and move on. Nothing is locked either
              way, and the check is on the Level check screen whenever you want it.
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
                  <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => setChecking(true)}>
                    <Compass size={16} aria-hidden /> Take the level check
                  </Button>
                ) : (
                  <div className="mt-6">
                    <Note tone="sky">
                      The level check needs a dictionary with levelled entries and this deployment
                      has none yet, so estimating is the only option right now.
                    </Note>
                  </div>
                )}

                <SectionTitle hint="a guess is a guess, and it says so on the plan">Or estimate it</SectionTitle>
                <ChoiceGroup ariaLabel="Estimate your level" className="flex flex-col gap-2">
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
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Why Estonian, and how far?
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              This is not a personality quiz. Different reasons need different levels, one of them
              has an exam attached, and the hours underneath change with every answer.
            </p>

            {/*
              A grid rather than a scrolling box. The reasons were in a
              `scroll-host` capped at a third of the viewport, which cut the
              seventh card in half with nothing to say it scrolled: a nested
              scroll region inside a page that already scrolls is the shape
              this pass exists to remove. Eight short rows in two columns fit
              without one.
            */}
            <ChoiceGroup ariaLabel="Why you are learning Estonian" className="mt-6 grid gap-2 sm:grid-cols-2">
              {REASONS.map((r) => {
                const Icon = icon(r.icon);
                return (
                  <ChoiceCard
                    key={r.id}
                    selected={reason === r.id}
                    onSelect={() => chooseReason(r.id)}
                    icon={<Icon size={18} aria-hidden />}
                    title={r.label}
                    detail={r.detail}
                  />
                );
              })}
            </ChoiceGroup>

            {/*
              Three rows of chips rather than three screens of cards. Each
              target used to carry its can and cannot lines whether or not it
              was the one chosen, which is five paragraphs to read before
              pressing one button. The pair is shown for the chosen one, where
              it is the thing being decided rather than a wall to scan.
            */}
            <div className="mt-7 flex flex-col gap-6">
              <div>
                <SectionTitle>How far</SectionTitle>
                <ChoiceGroup ariaLabel="How far">
                  {TARGETS.map((t) => (
                    <ChoiceChip key={t.band} selected={target === t.band} onSelect={() => setTarget(t.band)}>
                      {t.band} · {t.label}
                    </ChoiceChip>
                  ))}
                </ChoiceGroup>
                {chosenTarget && (
                  <p className="mt-2.5 max-w-[60ch] text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
                    {chosenTarget.can}{" "}
                    <span style={{ color: "var(--butter-ink)" }}>
                      Still out of reach: {chosenTarget.cannot.charAt(0).toLowerCase() + chosenTarget.cannot.slice(1)}
                    </span>
                  </p>
                )}
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
                    Built on the level you estimated. Take the check when you have ten minutes and
                    the plan is rebuilt on a measurement instead.
                  </Note>
                </div>
              )}
              <PlanPanel level={level} goals={goals} dailyGoal={goal} compact />
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Your first units
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              Picked for {startBand}. Each one becomes real flashcards with audio and full
              paradigms, and you can add or drop units later on the path.
            </p>
            {/*
              Any number of units, so these are toggle buttons and say so:
              `aria-pressed` is what a checkbox-shaped answer means, and it is
              the one group on this screen it was ever right for.
            */}
            <ChoiceGroup
              select="many"
              ariaLabel="Units to start with"
              className="scroll-host mt-5 flex max-h-[38vh] flex-col gap-2"
            >
              {/*
                This level's units only. The course is eighty-three of them
                across six levels, and a first-run picker listing all of them is
                a wall rather than a choice.
              */}
              {units.filter((u) => u.cefr === startBand || u.cefr === level).map((u) => {
                const Icon = icon(u.icon);
                return (
                  <ChoiceCard
                    key={u.id}
                    selected={picked.includes(u.id)}
                    onSelect={() => toggleUnit(u.id)}
                    icon={<Icon size={18} aria-hidden />}
                    title={u.title}
                    titleLang="et"
                    detail={`${u.subtitle} · ${u.words} words · ${u.cefr}`}
                  />
                );
              })}
            </ChoiceGroup>
            <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
              {wordCount === 0
                ? "Nothing selected. You can also start from the dictionary and add words as you meet them."
                : `${wordCount} words, about ${wordCount * 2} cards to start with.`}
            </p>

            {/*
              The daily goal, as one row rather than a screen. It has a sane
              default, it never caps a session, and Settings changes it in two
              clicks, so a whole step for it was a step spent on the least
              consequential answer in the walkthrough.
            */}
            <SectionTitle hint="changeable any time in Settings">How much a day</SectionTitle>
            <ChoiceGroup ariaLabel="How much a day">
              {GOALS.map((g) => (
                <ChoiceChip key={g.value} selected={goal === g.value} onSelect={() => setGoal(g.value)}>
                  {g.label} · {g.value} cards
                </ChoiceChip>
              ))}
            </ChoiceGroup>
            <p className="mt-2.5 max-w-[60ch] text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
              About {GOALS.find((g) => g.value === goal)?.detail ?? "five minutes a day"}. A card you
              learn today costs roughly ten reviews over its first year, so setting this higher does
              not make words arrive faster, it makes week six unbearable.
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

        <div className="mt-6 text-center">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={pending}
              className="text-xs underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: "var(--ink-3)" }}
            >
              Skip the goal and go straight to the words
            </button>
          ) : (
            <button
              type="button"
              onClick={skip}
              disabled={pending}
              className="text-xs underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: "var(--ink-3)" }}
            >
              Skip setup and go straight to the dictionary
            </button>
          )}
        </div>
      </div>
      </main>
    </LetterBarScope>
  );
}
