"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Compass, Loader2 } from "lucide-react";
import { completeOnboarding, skipOnboarding } from "@/app/actions";
import { AssessmentRunner } from "@/components/assessment/AssessmentRunner";
import { PlanPanel } from "@/components/assessment/PlanPanel";
import { ResultPanel } from "@/components/assessment/ResultPanel";
import { Button } from "@/components/Button";
import { Mascot } from "@/components/brand";
import { icon } from "@/components/icons";
import { Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { LEVELS as CEFR_LEVELS, unitsAtLevel } from "@/lib/collections/syllabus";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, type Goals } from "@/lib/assessment/goals";
import { PRE_A1, type Band, type Item, type Level, type Placement } from "@/lib/assessment/types";
import { WHAT_IT_IS } from "@/lib/copy/tour";

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
  All six, because the course now runs to C2 and stopping the list at B2 told
  anybody above it that the app was not for them. Each is described by what a
  person can already do rather than by its code, since somebody who needs to
  pick a level is exactly somebody who does not know what B2 means.
*/
const LEVELS = [
  { key: "A1", label: "Just starting", detail: "Tere, aitäh, and not much else yet." },
  { key: "A2", label: "I get by", detail: "Shopping, ordering, the lihtminevik." },
  { key: "B1", label: "Conversational", detail: "I can hold a conversation and read the news slowly." },
  { key: "B2", label: "Confident", detail: "I follow a debate and want precision, not basics." },
  { key: "C1", label: "Fluent", detail: "I work in Estonian and want the last ten percent." },
  { key: "C2", label: "Near native", detail: "I want register, idiom and the shades." },
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
      <div className="min-h-screen" style={{ background: "var(--ground)" }}>
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
      </div>
    );
  }

  const canContinue =
    (step !== 0 || name.trim().length > 0) &&
    (step !== 1 || level !== null);

  return (
    <div className="relative flex min-h-screen flex-col justify-center px-5 py-10 md:px-8">
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
              {WHAT_IT_IS}
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
                <div className="flex flex-col gap-2">
                  {LEVELS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => chooseLevel(l.key)}
                      aria-pressed={estimated === l.key}
                      className="flex items-center gap-4 rounded-[var(--r-lg)] border px-4 py-3.5 text-left transition-opacity hover:opacity-80"
                      style={{
                        borderColor: estimated === l.key ? "var(--accent)" : "var(--rule)",
                        background: estimated === l.key ? "var(--accent-soft)" : "var(--surface)",
                      }}
                    >
                      <span className="est tnum text-base font-bold" style={{ color: "var(--accent-deep)" }}>{l.key}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>{l.label}</span>
                        <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{l.detail}</span>
                      </span>
                      {estimated === l.key && <Check size={17} aria-hidden style={{ color: "var(--accent-deep)" }} />}
                    </button>
                  ))}
                </div>
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
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {REASONS.map((r) => {
                const Icon = icon(r.icon);
                const on = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => chooseReason(r.id)}
                    aria-pressed={on}
                    className="flex items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3 text-left transition-opacity hover:opacity-80"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--rule)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    <Icon size={18} aria-hidden style={{ color: on ? "var(--accent-deep)" : "var(--ink-3)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>{r.label}</span>
                      <span className="block text-xs leading-snug" style={{ color: "var(--ink-3)" }}>{r.detail}</span>
                    </span>
                    {on && <Check size={16} className="shrink-0" aria-hidden style={{ color: "var(--accent-deep)" }} />}
                  </button>
                );
              })}
            </div>

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
                <div className="flex flex-wrap gap-2">
                  {TARGETS.map((t) => (
                    <button key={t.band} type="button" onClick={() => setTarget(t.band)} aria-pressed={target === t.band}>
                      <Chip tone={target === t.band ? "accent" : "neutral"}>{t.band} · {t.label}</Chip>
                    </button>
                  ))}
                </div>
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
                <div className="flex flex-wrap gap-2">
                  {DEADLINES.map((d) => (
                    <button key={d.id} type="button" onClick={() => setDeadlineId(d.id)} aria-pressed={deadlineId === d.id}>
                      <Chip tone={deadlineId === d.id ? "accent" : "neutral"}>{d.label}</Chip>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle hint="be honest, the plan is built on it">Days a week you will really practise</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4, 5, 6, 7].map((days) => (
                    <button key={days} type="button" onClick={() => setDaysPerWeek(days)} aria-pressed={daysPerWeek === days}>
                      <Chip tone={daysPerWeek === days ? "accent" : "neutral"}>{days}</Chip>
                    </button>
                  ))}
                </div>
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
            <div className="scroll-host mt-5 flex max-h-[38vh] flex-col gap-2">
              {/*
                This level's units only. The course is eighty-three of them
                across six levels, and a first-run picker listing all of them is
                a wall rather than a choice.
              */}
              {units.filter((u) => u.cefr === startBand || u.cefr === level).map((u) => {
                const Icon = icon(u.icon);
                const on = picked.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUnit(u.id)}
                    aria-pressed={on}
                    className="flex items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3 text-left transition-opacity hover:opacity-80"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--rule)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    <Icon size={18} aria-hidden style={{ color: on ? "var(--accent-deep)" : "var(--ink-3)" }} />
                    <span className="min-w-0 flex-1">
                      <span lang="et" className="est block text-base font-semibold" style={{ color: "var(--ink)" }}>
                        {u.title}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                        {u.subtitle} · {u.words} words · {u.cefr}
                      </span>
                    </span>
                    {on && <Check size={16} aria-hidden style={{ color: "var(--accent-deep)" }} />}
                  </button>
                );
              })}
            </div>
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
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button key={g.value} type="button" onClick={() => setGoal(g.value)} aria-pressed={goal === g.value}>
                  <Chip tone={goal === g.value ? "accent" : "neutral"}>{g.label} · {g.value} cards</Chip>
                </button>
              ))}
            </div>
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
    </div>
  );
}
