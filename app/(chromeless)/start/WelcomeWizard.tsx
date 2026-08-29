"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { completeOnboarding, skipOnboarding } from "@/app/actions";
import { Button } from "@/components/Button";
import { Mascot } from "@/components/brand";
import { icon } from "@/components/icons";
import { Meter } from "@/components/ui";
import { LEVELS as CEFR_LEVELS, unitsAtLevel } from "@/lib/collections/syllabus";

export interface WizardUnit {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  cefr: string;
  blurb: string;
  words: number;
}

/*
  All six, because the course now runs to C2 and stopping the list at B2 told
  anybody above it that the app was not for them. Each one is described by what
  a person can already do rather than by its code, since somebody who needs to
  pick a level is exactly somebody who does not know what B2 means.
*/
const LEVELS = [
  { key: "A1", label: "Just starting", detail: "Tere, aitäh, and not much else yet." },
  { key: "A2", label: "I get by", detail: "Shopping, ordering, the past tense." },
  { key: "B1", label: "Conversational", detail: "I can hold a conversation and read the news slowly." },
  { key: "B2", label: "Confident", detail: "I follow a debate and want precision, not basics." },
  { key: "C1", label: "Fluent", detail: "I work in Estonian and want to write it well." },
  { key: "C2", label: "Near-native", detail: "I want register, idiom and the last few percent." },
] as const;

const GOALS = [
  { value: 10, label: "Casual", detail: "~3 minutes a day" },
  { value: 15, label: "Regular", detail: "~5 minutes a day" },
  { value: 25, label: "Serious", detail: "~8 minutes a day" },
  { value: 40, label: "Intense", detail: "~13 minutes a day" },
] as const;

/**
 * Units suggested for each starting level: where that learner's next work is.
 *
 * Derived from the syllabus rather than hand-listed, so adding or renaming a
 * unit cannot leave a level pointing at one that no longer exists. The first
 * three of the level are the ones the course itself would open with.
 */
const SUGGESTED: Record<string, string[]> = Object.fromEntries(
  CEFR_LEVELS.map((level) => [level, unitsAtLevel(level).slice(0, 3).map((u) => u.id)]),
);

const STEPS = ["You", "Level", "Pace", "Deck"] as const;

export function WelcomeWizard({ units, suggestedName }: { units: WizardUnit[]; suggestedName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(suggestedName);
  const [level, setLevel] = useState<string>("A1");
  const [goal, setGoal] = useState<number>(15);
  const [picked, setPicked] = useState<string[]>(SUGGESTED.A1 ?? []);
  const [pending, start] = useTransition();

  const chooseLevel = (key: string) => {
    setLevel(key);
    // Re-suggest units, but never silently drop a unit already ticked by hand.
    setPicked((current) => {
      const suggestion = SUGGESTED[key] ?? [];
      const manual = current.filter((id) => !Object.values(SUGGESTED).flat().includes(id));
      return [...new Set([...suggestion, ...manual])];
    });
  };

  const toggleUnit = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const wordCount = units
    .filter((u) => picked.includes(u.id))
    .reduce((sum, u) => sum + u.words, 0);

  const finish = () => {
    start(async () => {
      await completeOnboarding({ displayName: name, cefr: level, dailyGoal: goal, unitIds: picked });
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
          <p className="mt-3 max-w-[52ch] text-base" style={{ color: "var(--ink-2)" }}>
            Kodukeel is built around the thing that actually makes Estonian hard: the cases. Learn a
            word&rsquo;s genitive and eleven more forms follow, so the dictionary, the flashcards and
            the games are all organised around that one idea.
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
            Where are you now?
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--ink-2)" }}>
            Not sure which of these you are? The{" "}
            <a href="/placement" className="underline" style={{ color: "var(--accent-deep)" }}>
              placement test
            </a>{" "}
            takes about two minutes and stops as soon as a level gets hard.
            This only picks your starting units. Nothing is locked, the whole dictionary is open from
            day one.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => chooseLevel(l.key)}
                aria-pressed={level === l.key}
                className="flex items-center gap-4 rounded-[var(--r-lg)] border px-4 py-3.5 text-left transition-opacity hover:opacity-80"
                style={{
                  borderColor: level === l.key ? "var(--accent)" : "var(--rule)",
                  background: level === l.key ? "var(--accent-soft)" : "var(--surface)",
                }}
              >
                <span className="est tnum text-base font-bold" style={{ color: "var(--accent-deep)" }}>{l.key}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>{l.label}</span>
                  <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{l.detail}</span>
                </span>
                {level === l.key && <Check size={17} aria-hidden style={{ color: "var(--accent-deep)" }} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            How much a day?
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--ink-2)" }}>
            Sets your daily goal ring. It is motivational only, it never caps a session, and you can
            change it any time in Settings.
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
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="est text-2xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
            Your first units
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--ink-2)" }}>
            The {level} units. Each one becomes real flashcards with audio and full paradigms, and
            the other five levels are waiting on the course whenever you want them.
          </p>
          <div className="scroll-host mt-5 flex max-h-[46vh] flex-col gap-2">
            {/*
              Only this level's units. The course is eighty-three of them across
              six levels, and a first-run picker that lists all of them is a wall
              rather than a choice.
            */}
            {units.filter((u) => u.cefr === level).map((u) => {
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
        {step < STEPS.length - 1 ? (
          <Button
            variant="primary"
            size="lg"
            className="ml-auto"
            onClick={() => setStep((s) => s + 1)}
            disabled={pending || (step === 0 && name.trim().length === 0)}
          >
            Continue <ArrowRight size={15} aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="ml-auto" onClick={finish} disabled={pending}>
            {pending ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Building your deck…</> : <>Start learning <ArrowRight size={15} aria-hidden /></>}
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
