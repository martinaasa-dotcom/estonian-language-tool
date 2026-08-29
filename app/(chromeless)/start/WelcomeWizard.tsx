"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Compass, Loader2, X } from "lucide-react";
import { completeOnboarding, skipOnboarding } from "@/app/actions";
import { AssessmentRunner } from "@/components/assessment/AssessmentRunner";
import { PlanPanel } from "@/components/assessment/PlanPanel";
import { ResultPanel } from "@/components/assessment/ResultPanel";
import { Button } from "@/components/Button";
import { Mascot } from "@/components/brand";
import { icon } from "@/components/icons";
import { Card, Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, type Goals } from "@/lib/assessment/goals";
import { PRE_A1, type Band, type Item, type Level, type Placement } from "@/lib/assessment/types";
import { CAN, CANNOT, TOUR, WHAT_IT_IS } from "@/lib/copy/tour";

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
const LEVELS = [
  { key: "A1", label: "Just starting", detail: "Tere, aitäh, and not much else yet." },
  { key: "A2", label: "I get by", detail: "Shopping, ordering, simple past tense." },
  { key: "B1", label: "Conversational", detail: "I can hold a conversation and read the news slowly." },
  { key: "B2", label: "Confident", detail: "I want vocabulary and precision, not basics." },
] as const;

const GOALS = [
  { value: 10, label: "Casual", detail: "about 3 minutes a day" },
  { value: 15, label: "Regular", detail: "about 5 minutes a day" },
  { value: 25, label: "Serious", detail: "about 8 minutes a day" },
  { value: 40, label: "Intense", detail: "about 13 minutes a day" },
] as const;

/** Units suggested for each starting level, which is where that learner's next work is. */
const SUGGESTED: Record<string, string[]> = {
  A1: ["tervitused", "inimesed", "kodu"],
  A2: ["sook-ja-jook", "aeg", "iga-paev"],
  B1: ["rektsioon", "tunded", "too-ja-raha"],
  B2: ["uhiskond", "too-ja-raha", "akadeemiline"],
};

const STEPS = ["You", "Why", "Goal", "Level", "Pace", "Plan", "Tour", "Deck"] as const;

/**
 * First run.
 *
 * It asks four things and teaches one, and the order matters. Why you are here
 * comes before what level you want, because "which CEFR level" is unanswerable
 * until somebody tells you that B1 is what naturalisation asks for. The level
 * check comes before the plan, because a plan built on a guessed starting point
 * is a guess with arithmetic on top. The plan comes before the deck, because
 * the number of hours involved is the single most useful thing this app can
 * tell a beginner, and it should be told before they have invested an evening.
 *
 * The walkthrough is not a carousel of features. It is the list of what this
 * app does and, at equal length, what it does not, because the second list is
 * what makes the first believable.
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
  const [note, setNote] = useState("");

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
    note,
  }), [reason, target, deadlineId, daysPerWeek, note]);

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
            setStep(4);
          }}
        />
      </div>
    );
  }

  const canContinue =
    (step !== 0 || name.trim().length > 0) &&
    (step !== 3 || level !== null);

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
            <p className="mt-3 max-w-[54ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
              The next few minutes ask what you are here for, measure where you are now if you want
              that, and then tell you honestly how long the thing you want is likely to take.
            </p>
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
              Only used to greet you, and on the class leaderboard if you ever turn that on.
            </p>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Why Estonian?
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              This is not a personality quiz. Different reasons need different levels, and one of
              them has an exam attached with a level set by somebody else.
            </p>
            <div className="scroll-host mt-6 flex max-h-[46vh] flex-col gap-2">
              {REASONS.map((r) => {
                const Icon = icon(r.icon);
                const on = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => chooseReason(r.id)}
                    aria-pressed={on}
                    className="flex items-center gap-4 rounded-[var(--r-lg)] border px-4 py-3.5 text-left transition-opacity hover:opacity-80"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--rule)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    <Icon size={18} aria-hidden style={{ color: on ? "var(--accent-deep)" : "var(--ink-3)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>{r.label}</span>
                      <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{r.detail}</span>
                    </span>
                    {on && <Check size={16} aria-hidden style={{ color: "var(--accent-deep)" }} />}
                  </button>
                );
              })}
            </div>
            <label htmlFor="goal-note" className="label-xs mt-6 block" style={{ color: "var(--ink-3)" }}>
              In your own words, if you like
            </label>
            <input
              id="goal-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
              placeholder="Something you want to be able to do"
              className="mt-2 w-full rounded-[var(--r-lg)] border px-5 py-3 text-base outline-none"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Kept as you wrote it and shown back to you on the plan. Nothing reads it but you.
            </p>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              How far, and by when?
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              A level is a claim about what you can do, so each one here says what it gets you and
              what it still does not.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {TARGETS.map((t) => {
                const on = target === t.band;
                return (
                  <button
                    key={t.band}
                    type="button"
                    onClick={() => setTarget(t.band)}
                    aria-pressed={on}
                    className="rounded-[var(--r-lg)] border px-4 py-3.5 text-left transition-opacity hover:opacity-80"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--rule)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="est tnum text-base font-bold" style={{ color: "var(--accent-deep)" }}>{t.band}</span>
                      <span className="text-base font-medium" style={{ color: "var(--ink)" }}>{t.label}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>{t.can}</span>
                    <span className="mt-1 block text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
                      Still out of reach: {t.cannot.charAt(0).toLowerCase() + t.cannot.slice(1)}
                    </span>
                  </button>
                );
              })}
            </div>

            <SectionTitle>By when</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEADLINES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDeadlineId(d.id)}
                  aria-pressed={deadlineId === d.id}
                  className="min-h-[48px] rounded-[var(--r-lg)] border px-4 py-3 text-left text-base transition-opacity hover:opacity-80"
                  style={{
                    borderColor: deadlineId === d.id ? "var(--accent)" : "var(--rule)",
                    background: deadlineId === d.id ? "var(--accent-soft)" : "var(--surface)",
                    color: "var(--ink)",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <SectionTitle hint="be honest, the plan is built on it">Days a week you will really practise</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 7].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDaysPerWeek(days)}
                  aria-pressed={daysPerWeek === days}
                  className="tnum min-h-[44px] min-w-[44px] rounded-full border px-4 text-base font-semibold transition-opacity hover:opacity-80"
                  style={{
                    borderColor: daysPerWeek === days ? "var(--accent)" : "var(--rule)",
                    background: daysPerWeek === days ? "var(--accent-soft)" : "var(--surface)",
                    color: daysPerWeek === days ? "var(--accent-deep)" : "var(--ink-2)",
                  }}
                >
                  {days}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Where are you now?
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              Measure it or estimate it. Measuring takes about ten minutes and covers reading,
              listening, writing and speaking. Nothing is locked either way: the whole dictionary is
              open from day one, and you can take the check any time from the Level check screen.
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

        {step === 4 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              How much a day?
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              This sets your daily goal ring. It never caps a session and you can change it any time
              in Settings. Pick the number you will still meet on a bad Tuesday.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  aria-pressed={goal === g.value}
                  className="rounded-[var(--r-lg)] border px-4 py-3.5 text-left transition-opacity hover:opacity-80"
                  style={{
                    borderColor: goal === g.value ? "var(--accent)" : "var(--rule)",
                    background: goal === g.value ? "var(--accent-soft)" : "var(--surface)",
                  }}
                >
                  <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>
                    {g.label} · {g.value} cards
                  </span>
                  <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{g.detail}</span>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <Note tone="sky">
                A card you learn today costs roughly ten reviews over its first year, so a goal of{" "}
                {goal} cards is one to four genuinely new words a day once the reviews arrive. Setting
                it higher does not make words arrive faster, it makes week six unbearable.
              </Note>
            </div>
          </section>
        )}

        {step === 5 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              What this is going to take
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              Built from your answers and from published estimates, not from anything this app wants
              you to believe. If the numbers are uncomfortable, that is the useful part.
            </p>
            {!measured && (
              <div className="mt-5">
                <Note tone="sky">
                  This is built on the level you estimated. Take the check when you have ten minutes
                  and the plan is rebuilt on a measurement instead.
                </Note>
              </div>
            )}
            {note.trim() && (
              <p className="mt-5 text-base italic" style={{ color: "var(--ink-2)" }}>
                Your words: {note.trim()}
              </p>
            )}
            <div className="mt-6">
              <PlanPanel level={level} goals={goals} dailyGoal={goal} />
            </div>
          </section>
        )}

        {step === 6 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              What is here, and what is not
            </h1>
            <p className="mt-2 max-w-[54ch] text-base" style={{ color: "var(--ink-2)" }}>
              Both lists, at the same length. You can reopen this any time under What this app is.
            </p>

            <div className="scroll-host mt-6 flex max-h-[52vh] flex-col gap-3">
              <Card tone="accent">
                <SectionTitle>What it does</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {CAN.map((claim) => (
                    <li key={claim.text} className="flex gap-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      <Check size={15} className="mt-0.5 shrink-0" aria-hidden style={{ color: "var(--accent-deep)" }} />
                      <span>{claim.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card tone="butter">
                <SectionTitle>What it does not</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {CANNOT.map((claim) => (
                    <li key={claim.text} className="flex gap-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      <X size={15} className="mt-0.5 shrink-0" aria-hidden style={{ color: "var(--butter-ink)" }} />
                      <span>{claim.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <div>
                <SectionTitle hint="and when to open it">Every screen</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {TOUR.map((stop) => {
                    const Icon = icon(stop.icon);
                    return (
                      <li
                        key={stop.href}
                        className="flex gap-3 rounded-[var(--r-lg)] border px-4 py-3"
                        style={{ borderColor: "var(--rule)" }}
                      >
                        <span
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          style={{ background: "var(--raised)", color: "var(--ink-2)" }}
                        >
                          <Icon size={15} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-base font-semibold" style={{ color: "var(--ink)" }}>{stop.title}</span>
                          <span className="block text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>{stop.what}</span>
                          <span className="mt-1 block text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>{stop.when}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>
        )}

        {step === 7 && (
          <section>
            <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
              Your first units
            </h1>
            <p className="mt-2 text-base" style={{ color: "var(--ink-2)" }}>
              Picked for {startBand}. Each unit becomes real flashcards with audio and full
              paradigms, and you can add or drop units later on the path.
            </p>
            <div className="scroll-host mt-5 flex max-h-[46vh] flex-col gap-2">
              {units.map((u) => {
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
          </section>
        )}

        <div className="mt-10 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
              <ArrowLeft size={15} aria-hidden /> Back
            </Button>
          )}
          {step === 3 && level !== null && (
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
          <button
            type="button"
            onClick={skip}
            disabled={pending}
            className="text-xs underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--ink-3)" }}
          >
            Skip setup and go straight to the dictionary
          </button>
        </div>
      </div>
    </div>
  );
}
