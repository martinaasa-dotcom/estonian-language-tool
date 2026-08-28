import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, BookOpen, ChartNoAxesColumn, Check, Download, Flame, Headphones, Minus,
  Map as MapIcon, Sparkles, Timer, Trophy, Volume2, WifiOff,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { buildCaseTable } from "@/lib/estonian/derive";
import { ButtonLink } from "@/components/Button";
import { Mascot, Wordmark } from "@/components/brand";
import { CaseExplorer, DemoCard, TutorPeek, type DemoWord } from "./LandingDemo";

export const metadata: Metadata = {
  title: "Kodukeel — Estonian that finally sticks",
  description:
    "Fourteen cases, a stem that changes when you look at it. Kodukeel turns Estonian into fifteen quiet minutes a day: real paradigms from Ekilex, spaced repetition, native audio and a tutor that explains the rule.",
};

/** The landing page is public and read-only, so it can be cached hard. */
export const revalidate = 3600;

const DEMO_LEMMAS = ["tuba", "raamat", "õppima"];

export default async function WelcomePage() {
  const { words, stats } = await loadDemo();

  return (
    <div className="relative overflow-x-hidden" style={{ background: "var(--ground)" }}>
      {/* Pastel light, fixed behind the whole page. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="wash" style={{ background: "var(--wash-1)", width: 620, height: 620, top: -260, left: -160 }} />
        <span className="wash" style={{ background: "var(--wash-2)", width: 520, height: 520, top: 60, right: -220, opacity: 0.65 }} />
        <span className="wash" style={{ background: "var(--wash-3)", width: 560, height: 560, top: 1180, left: -200, opacity: 0.5 }} />
      </div>

      <Nav />

      <main className="relative">
        <Hero words={words} />
        <Sources />
        <Problem />
        <Cases words={words} />
        <Features />
        <HowItWorks />
        <Numbers stats={stats} />
        <Comparison />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}

/**
 * Fades a section up as it scrolls into view — CSS scroll timelines, so it costs
 * no JavaScript and degrades to "already visible" where they aren't supported.
 */
function Reveal({ children }: { children: React.ReactNode }) {
  return <div className="reveal">{children}</div>;
}

/* ─────────────────────────────────────────────────────────── nav ── */

function Nav() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full border px-4 py-2.5 md:px-5"
        style={{
          borderColor: "var(--rule)",
          background: "color-mix(in oklab, var(--surface) 82%, transparent)",
          backdropFilter: "blur(16px)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Link href="/welcome" aria-label="Kodukeel, home">
          <Wordmark size={30} />
        </Link>
        <div className="hidden items-center gap-7 text-[14px] font-medium md:flex" style={{ color: "var(--ink-2)" }}>
          <a href="#cases" className="transition-opacity hover:opacity-60">The cases</a>
          <a href="#features" className="transition-opacity hover:opacity-60">What you get</a>
          <a href="#how" className="transition-opacity hover:opacity-60">How it works</a>
          <a href="#faq" className="transition-opacity hover:opacity-60">Questions</a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden rounded-full px-4 py-2 text-[14px] font-semibold transition-opacity hover:opacity-60 sm:block"
            style={{ color: "var(--ink-2)" }}
          >
            Sign in
          </Link>
          <ButtonLink href="/sign-in" variant="primary">
            Start free <ArrowRight size={15} aria-hidden />
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}

/* ────────────────────────────────────────────────────────── hero ── */

function Hero({ words }: { words: DemoWord[] }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-8 pt-14 md:grid-cols-[1.05fr_0.95fr] md:gap-16 md:px-8 md:pb-16 md:pt-20">
      <div>
        <p
          className="fade-up label-xs inline-flex items-center gap-2 rounded-full px-3.5 py-2"
          style={{ background: "var(--butter-soft)", color: "var(--butter)", animationDelay: "40ms" }}
        >
          <Sparkles size={13} aria-hidden /> For everyone who bounced off Estonian once already
        </p>

        <h1
          className="est fade-up mt-6 text-[46px] font-bold leading-[1.02] tracking-[-0.02em] md:text-[68px]"
          style={{ color: "var(--ink)", animationDelay: "90ms" }}
        >
          Estonian that
          <br />
          finally <span className="grad-text">sticks</span>.
        </h1>

        <p
          className="fade-up mt-6 max-w-[54ch] text-[17px] leading-relaxed md:text-[18.5px]"
          style={{ color: "var(--ink-2)", animationDelay: "150ms" }}
        >
          Fourteen cases. A stem that changes shape when you look at it. Kodukeel turns all of it
          into fifteen quiet minutes a day — real paradigms, native audio, and a tutor who tells you
          the rule instead of just marking you wrong.
        </p>

        <div className="fade-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "210ms" }}>
          <ButtonLink href="/sign-in" variant="primary" size="lg">
            Start learning — free <ArrowRight size={17} aria-hidden />
          </ButtonLink>
          <a
            href="#cases"
            className="press inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-[15.5px] font-semibold transition-all hover:-translate-y-px"
            style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink)", boxShadow: "var(--shadow-sm)" }}
          >
            Show me a word <BookOpen size={16} aria-hidden />
          </a>
        </div>

        <ul
          className="fade-up mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]"
          style={{ color: "var(--ink-3)", animationDelay: "270ms" }}
        >
          {["No card, no trial timer", "Your review history exports in one click", "Reviewing works offline"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check size={14} aria-hidden style={{ color: "var(--mint)" }} /> {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="fade-up relative" style={{ animationDelay: "320ms" }}>
        {/* Floating diacritics: the six characters this whole app is built around. */}
        <span
          aria-hidden
          className="est float absolute -left-4 -top-8 z-20 hidden h-14 w-14 sm:flex items-center justify-center rounded-[var(--r)] text-[26px] font-bold md:-left-10"
          style={{ background: "var(--blush-soft)", color: "var(--blush)", boxShadow: "var(--shadow-sm)", "--float-tilt": "-8deg" } as React.CSSProperties}
        >
          õ
        </span>
        <span
          aria-hidden
          className="est float absolute -right-3 top-28 z-20 hidden h-12 w-12 sm:flex items-center justify-center rounded-[var(--r)] text-[22px] font-bold md:-right-8"
          style={{ background: "var(--mint-soft)", color: "var(--mint)", boxShadow: "var(--shadow-sm)", animationDelay: "1.2s", "--float-tilt": "9deg" } as React.CSSProperties}
        >
          ä
        </span>
        <span
          aria-hidden
          className="est float absolute -bottom-2 -left-2 z-20 hidden h-12 w-12 sm:flex md:-left-6 items-center justify-center rounded-[var(--r)] text-[22px] font-bold"
          style={{ background: "var(--sky-soft)", color: "var(--sky)", boxShadow: "var(--shadow-sm)", animationDelay: "0.6s", "--float-tilt": "6deg" } as React.CSSProperties}
        >
          ü
        </span>

        <DemoCard words={words} />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── sources ── */

const SOURCES = [
  ["Ekilex", "Institute of the Estonian Language"],
  ["TartuNLP", "University of Tartu speech"],
  ["FSRS", "the scheduler Anki moved to"],
  ["Open data", "CC BY 4.0, cited in app"],
] as const;

function Sources() {
  return (
    <Reveal>
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <p className="label-xs mb-5 text-center" style={{ color: "var(--ink-3)" }}>
          Every Estonian form in the app comes from a named source
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SOURCES.map(([name, detail]) => (
            <div
              key={name}
              className="rounded-[var(--r)] border px-4 py-3.5 text-center"
              style={{ borderColor: "var(--rule)", background: "color-mix(in oklab, var(--surface) 70%, transparent)" }}
            >
              <p className="est text-[17px] font-bold" style={{ color: "var(--ink)" }}>{name}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--ink-3)" }}>{detail}</p>
            </div>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────── problem ── */

const PROBLEMS = [
  {
    tone: "peach",
    title: "Streak apps don’t teach cases",
    body: "You can hold a 400-day streak and still not know whether it is majja, majas or majast. Kodukeel drills the case itself, and tracks which one keeps failing.",
  },
  {
    tone: "butter",
    title: "Textbooks don’t schedule",
    body: "Week six pushes out week two. Nothing brings a word back on the day you were about to forget it — which is the only day repetition is worth doing.",
  },
  {
    tone: "sky",
    title: "Translation apps invent Estonian",
    body: "Ask a chatbot for an inflected form and you will get a confident, wrong one. Every form here comes from a dictionary, never from a model.",
  },
] as const;

function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <h2 className="est mx-auto max-w-[20ch] text-center text-[32px] font-bold leading-tight tracking-tight md:text-[42px]" style={{ color: "var(--ink)" }}>
          You didn’t fail Estonian. Your tools did.
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PROBLEMS.map((p, i) => (
          <Reveal key={p.title}>
            <div
              className="lift h-full rounded-[var(--r-xl)] p-6"
              style={{ background: `var(--${p.tone}-soft)` }}
            >
              <span
                className="est flex h-11 w-11 items-center justify-center rounded-full text-[18px] font-bold"
                style={{ background: "var(--surface)", color: `var(--${p.tone})` }}
              >
                {i + 1}
              </span>
              <h3 className="est mt-4 text-[21px] font-bold leading-snug" style={{ color: "var(--ink)" }}>
                {p.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {p.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────── cases ── */

function Cases({ words }: { words: DemoWord[] }) {
  return (
    <section id="cases" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <div className="mx-auto max-w-[46ch] text-center">
          <p className="label-xs" style={{ color: "var(--accent)" }}>Learn one form, get eleven</p>
          <h2 className="est mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[42px]" style={{ color: "var(--ink)" }}>
            The fourteen cases, finally on your side
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Three principal parts are genuinely unpredictable, so you memorise those. The other
            eleven are regular endings on the genitive stem — press a word and watch them fall out.
          </p>
        </div>
      </Reveal>
      <Reveal>
        <div className="mt-9">
          <CaseExplorer words={words.filter((w) => w.cases.length > 0)} />
        </div>
      </Reveal>
    </section>
  );
}

/* ────────────────────────────────────────────────────── features ── */

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <div className="mx-auto max-w-[44ch] text-center">
          <p className="label-xs" style={{ color: "var(--blush)" }}>What you actually get</p>
          <h2 className="est mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[42px]" style={{ color: "var(--ink)" }}>
            Eight things, each doing one job well
          </h2>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Reveal>
          <Feature
            tone="mint"
            icon={<MapIcon size={18} aria-hidden />}
            title="A path from A1 to C1"
            body="Eighteen units, each a sitting's worth of words. Adding one builds real cards — full paradigm, audio, both directions — in a single click."
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="accent"
            icon={<BookOpen size={18} aria-hidden />}
            title="A dictionary that shows the whole word"
            body="Search an inflected form you met in class — toas, lugesin — and it finds the word, tells you which form you typed, and lays out the full paradigm with gradation marked."
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="butter"
            icon={<Flame size={18} aria-hidden />}
            title="Repetition that knows when to stop"
            body="FSRS schedules every card for the day you were about to forget it — then tells you you're done. New cards are capped, so week three never becomes an hour."
          />
        </Reveal>

        <Reveal>
          <div
            className="lift flex h-full flex-col rounded-[var(--r-xl)] border p-6 md:col-span-2"
            style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--blush-soft)", color: "var(--blush)" }}>
                <Sparkles size={18} aria-hidden />
              </span>
              <h3 className="est text-[21px] font-bold" style={{ color: "var(--ink)" }}>Anu explains the rule</h3>
            </div>
            <p className="mt-2.5 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              A grammar tutor for the questions a textbook answers on page 240. She explains, checks
              your sentence and names the pattern — and she is never allowed to invent an Estonian
              form, because those come from the dictionary.
            </p>
            <div className="mt-5">
              <TutorPeek />
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="flex h-full flex-col gap-4">
            <Feature
              tone="sky"
              icon={<Volume2 size={18} aria-hidden />}
              title="Hear every single form"
              body="Estonian neural speech from the University of Tartu, on every word and every form, at normal or slow speed. No key, no per-word charge."
            />
            <Feature
              tone="peach"
              icon={<Timer size={18} aria-hidden />}
              title="Four ways to practise"
              body="A 60-second sprint, a match round, listening, and a drill for whichever case you keep missing. All of it feeds the same schedule."
            />
          </div>
        </Reveal>

        <Reveal>
          <Feature
            tone="accent"
            icon={<ChartNoAxesColumn size={18} aria-hidden />}
            title="Progress you can audit"
            body="A heatmap of every day you showed up, a forecast of what is coming, and accuracy per grammatical case. All computed from the review log — there is no score to inflate."
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="butter"
            icon={<Trophy size={18} aria-hidden />}
            title="XP, quests and a streak"
            body="Ten levels with Estonian names, three quests a day, and streak shields for the evening life gets in the way. Motivation that is earned, never bought."
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="mint"
            icon={<WifiOff size={18} aria-hidden />}
            title="Yours, and portable"
            body="Reviewing works on a train with no signal — grades queue up and send themselves later. Your whole history exports as JSON whenever you want it."
            icon2={<Download size={15} aria-hidden />}
          />
        </Reveal>
      </div>
    </section>
  );
}

function Feature({ tone, icon, icon2, title, body, className = "" }: {
  tone: "accent" | "mint" | "sky" | "butter" | "peach" | "blush";
  icon: React.ReactNode;
  icon2?: React.ReactNode;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={`lift flex h-full flex-col rounded-[var(--r-xl)] border p-6 ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}
      >
        {icon}
      </span>
      <h3 className="est mt-4 flex items-center gap-2 text-[19px] font-bold leading-snug" style={{ color: "var(--ink)" }}>
        {title}
        {icon2 && <span style={{ color: "var(--ink-3)" }}>{icon2}</span>}
      </h3>
      <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{body}</p>
    </div>
  );
}

/* ───────────────────────────────────────────────────── how it works ── */

const STEPS = [
  {
    title: "Pick a unit, or look a word up",
    body: "Eighteen units from greetings to argument, or type anything — Estonian, English, or a form you half-remember from class.",
    tone: "sky",
  },
  {
    title: "Add it in one click",
    body: "Real cards with the full paradigm and audio, both directions. Add a case-form or gradation card when a word deserves the extra attention.",
    tone: "accent",
  },
  {
    title: "Show up for fifteen minutes",
    body: "Today tells you exactly what is due and how long it will take. When you are caught up, it says so and sends you away.",
    tone: "mint",
  },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 px-5 py-14 md:px-8 md:py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-[42ch] text-center">
            <p className="label-xs" style={{ color: "var(--mint)" }}>Three steps, then a habit</p>
            <h2 className="est mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[42px]" style={{ color: "var(--ink)" }}>
              How a day with Kodukeel goes
            </h2>
          </div>
        </Reveal>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title}>
              <li
                className="relative h-full overflow-hidden rounded-[var(--r-xl)] border p-6"
                style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
              >
                <span
                  aria-hidden
                  className="est absolute -right-2 -top-6 text-[92px] font-bold leading-none"
                  style={{ color: `var(--${s.tone}-soft)` }}
                >
                  {i + 1}
                </span>
                <div className="relative">
                  <span className="label-xs" style={{ color: `var(--${s.tone})` }}>Step {i + 1}</span>
                  <h3 className="est mt-2 text-[21px] font-bold" style={{ color: "var(--ink)" }}>{s.title}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{s.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── numbers ── */

function Numbers({ stats }: { stats: { words: number; forms: number } }) {
  const items = [
    [stats.words.toLocaleString("en-GB"), "words, hand-checked", "A1 up into C1"],
    [stats.forms.toLocaleString("en-GB"), "stored forms", "never generated"],
    ["18", "units, A1 to C1", "greetings to argument"],
    ["14", "cases covered", "3 memorised, 11 derived"],
  ] as const;

  return (
    <Reveal>
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <div
          className="grid gap-6 rounded-[var(--r-xl)] px-6 py-8 sm:grid-cols-2 md:grid-cols-4 md:px-10"
          style={{ background: "var(--surface)", border: "1px solid var(--rule)", boxShadow: "var(--shadow-sm)" }}
        >
          {items.map(([value, label, hint]) => (
            <div key={label}>
              <p className="est tnum text-[40px] font-bold leading-none tracking-tight grad-text">{value}</p>
              <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{label}</p>
              <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>{hint}</p>
            </div>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

/* ──────────────────────────────────────────────────── comparison ── */

const ROWS = [
  ["Teaches the case system itself", true, false],
  ["Forms come from a real dictionary", true, false],
  ["Schedules by when you'll forget", true, false],
  ["Tells you when to stop for the day", true, false],
  ["Explains why, not just wrong", true, false],
  ["Your history is yours to export", true, false],
  ["Works with no signal at all", true, false],
] as const;

function Comparison() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <div className="mx-auto max-w-[40ch] text-center">
          <p className="label-xs" style={{ color: "var(--peach)" }}>An honest comparison</p>
          <h2 className="est mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[42px]" style={{ color: "var(--ink)" }}>
            Kodukeel vs. the owl
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Streak apps are excellent at getting you to open them. That is a different problem to
            being able to say <span lang="et" className="est font-semibold">ma lähen tuppa</span> and
            know why it is not <span lang="et" className="est font-semibold">tuba</span>.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <div
          className="mt-9 overflow-hidden rounded-[var(--r-xl)] border"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow)" }}
        >
          <div
            className="grid grid-cols-[1fr_88px_88px] items-center gap-2 border-b px-5 py-3.5 md:grid-cols-[1fr_120px_120px]"
            style={{ borderColor: "var(--rule-soft)", background: "var(--raised)" }}
          >
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>&nbsp;</span>
            <span className="est text-center text-[15px] font-bold" style={{ color: "var(--accent)" }}>Kodukeel</span>
            <span className="label-xs text-center" style={{ color: "var(--ink-3)" }}>Streak apps</span>
          </div>
          {ROWS.map(([label, ours, theirs]) => (
            <div
              key={label}
              className="grid grid-cols-[1fr_88px_88px] items-center gap-2 px-5 py-3.5 md:grid-cols-[1fr_120px_120px]"
              style={{ borderTop: "1px solid var(--rule-soft)" }}
            >
              <span className="text-[14.5px]" style={{ color: "var(--ink-2)" }}>{label}</span>
              <span className="flex justify-center">
                {ours ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--mint-soft)", color: "var(--mint)" }}>
                    <Check size={15} strokeWidth={3} aria-label="yes" />
                  </span>
                ) : null}
              </span>
              <span className="flex justify-center">
                {theirs ? null : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                    <Minus size={15} strokeWidth={3} aria-label="no" />
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── faq ── */

const FAQS = [
  [
    "Do I need to pay for anything?",
    "No. Sign in with Google and the dictionary, flashcards, audio, sprints and exports are all there. The AI tutor is the one part that needs an API key, and the default provider it is built around has a genuinely free model.",
  ],
  [
    "Where do the Estonian forms come from?",
    "Ekilex, the Institute of the Estonian Language, plus a hand-checked built-in set of common words. The eleven regular cases are worked out from the genitive by a function with its own unit tests. An AI is never allowed to supply an Estonian form — it invents plausible, wrong ones, and a flashcard would then drill the mistake in.",
  ],
  [
    "Is this only for beginners?",
    "It covers A1 to C1. The parts that make Estonian hard later — consonant gradation, verb government, total versus partial objects — each get their own card type rather than being left to guesswork.",
  ],
  [
    "What happens to my data?",
    "It stays in your account, scoped to you, and you can download the whole thing as JSON from Settings at any time. Your review history is the one thing here that cannot be recreated, so it is append-only and never overwritten.",
  ],
] as const;

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <h2 className="est text-center text-[32px] font-bold leading-tight tracking-tight md:text-[42px]" style={{ color: "var(--ink)" }}>
          The questions people ask
        </h2>
      </Reveal>
      <div className="mt-9 flex flex-col gap-3">
        {FAQS.map(([q, a], i) => (
          <Reveal key={q}>
            <details
              className="group rounded-[var(--r-lg)] border px-5 py-4"
              style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold"
                style={{ color: "var(--ink)" }}
              >
                {q}
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[17px] leading-none transition-transform group-open:rotate-45"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────── final call ── */

function FinalCta() {
  return (
    <section className="px-5 py-14 md:px-8 md:py-20">
      <Reveal>
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[36px] px-6 py-14 text-center md:px-16 md:py-20"
          style={{ background: "var(--accent-soft)" }}
        >
          <span aria-hidden className="wash" style={{ background: "var(--wash-2)", width: 420, height: 420, top: -160, right: -80 }} />
          <span aria-hidden className="wash" style={{ background: "var(--wash-3)", width: 380, height: 380, bottom: -200, left: -60, opacity: 0.5 }} />

          <div className="relative">
            <Mascot size={68} mood="cheer" className="float mx-auto" />
            <h2 className="est mx-auto mt-6 max-w-[18ch] text-[34px] font-bold leading-[1.08] tracking-tight md:text-[50px]" style={{ color: "var(--ink)" }}>
              Fifteen minutes. Starting today.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Look up one word, add it, and let the scheduler do the remembering. That is the whole
              commitment.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/sign-in" variant="primary" size="lg">
                Start learning — free <ArrowRight size={17} aria-hidden />
              </ButtonLink>
              <a
                href="#cases"
                className="press inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-[15.5px] font-semibold transition-all hover:-translate-y-px"
                style={{ background: "var(--surface)", borderColor: "transparent", color: "var(--ink)" }}
              >
                <Headphones size={16} aria-hidden /> See it first
              </a>
            </div>
            <p className="mt-5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Google sign-in · nothing to install · export whenever you like
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative px-5 pb-10 md:px-8">
      <div
        className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t pt-8 text-[12.5px] md:flex-row"
        style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}
      >
        <Wordmark size={26} />
        <p className="text-center md:text-right">
          Forms from{" "}
          <a href="https://ekilex.ee" target="_blank" rel="noreferrer" className="underline underline-offset-2">Ekilex</a>
          , Institute of the Estonian Language · CC BY 4.0. Speech from{" "}
          <a href="https://tartunlp.ai" target="_blank" rel="noreferrer" className="underline underline-offset-2">TartuNLP</a>,
          University of Tartu.
        </p>
      </div>
    </footer>
  );
}

/* ──────────────────────────────────────────────────────── data ── */

/**
 * The demo words are pulled from the real dictionary and run through the real
 * derivation, so nothing on this page is a mock-up — and no Estonian form on it
 * was written by hand into marketing copy. If the database is unreachable the
 * page still renders: the fallback carries only principal parts copied from the
 * checked seed set, and no derived forms at all.
 */
async function loadDemo(): Promise<{ words: DemoWord[]; stats: { words: number; forms: number } }> {
  try {
    const [lexemes, wordCount, formCount] = await Promise.all([
      prisma.lexeme.findMany({
        where: { lemma: { in: DEMO_LEMMAS } },
        include: { forms: true },
      }),
      prisma.lexeme.count(),
      prisma.form.count(),
    ]);

    const byLemma = new Map(lexemes.map((l) => [l.lemma, l]));
    const words = DEMO_LEMMAS.flatMap((lemma) => {
      const lex = byLemma.get(lemma);
      if (!lex) return [];
      const form = (t: string) => lex.forms.find((f) => f.formType === t)?.value;
      const isVerb = lex.pos === "VERB";

      const principal = (isVerb
        ? [["ma-infinitive", form("INF_MA")], ["da-infinitive", form("INF_DA")], ["present 1sg", form("PRES_1SG")], ["past 1sg", form("PAST_1SG")]]
        : [["nominative", form("NOM_SG")], ["genitive", form("GEN_SG")], ["partitive", form("PART_SG")]]
      ).flatMap(([label, value]) => (label && value ? [{ label, value }] : []));

      const cases = isVerb
        ? []
        : buildCaseTable({
            nomSg: form("NOM_SG"), genSg: form("GEN_SG"), partSg: form("PART_SG"),
            partPl: form("PART_PL"), genPl: form("GEN_PL"),
          }).map((row) => ({
            en: row.spec.en,
            et: row.spec.et,
            question: row.spec.question,
            singular: row.singular ?? null,
            plural: row.plural ?? null,
            principal: row.spec.principal,
          }));

      return [{
        lemma: lex.lemma,
        translation: lex.translation,
        cefr: lex.cefr,
        gradationNote: lex.gradationNote,
        genitive: form("GEN_SG") ?? null,
        principal,
        cases,
      }];
    });

    if (words.length > 0) return { words, stats: { words: wordCount, forms: formCount } };
  } catch {
    // Falls through to the static set below — a landing page must render even
    // when the database behind it is having a bad day.
  }

  return { words: FALLBACK_WORDS, stats: { words: 360, forms: 1568 } };
}

/** Principal parts copied verbatim from the checked seed set — never derived here. */
const FALLBACK_WORDS: DemoWord[] = [
  {
    lemma: "tuba", translation: "room", cefr: "A1", gradationNote: "b : ∅", genitive: "toa",
    principal: [{ label: "nominative", value: "tuba" }, { label: "genitive", value: "toa" }, { label: "partitive", value: "tuba" }],
    cases: [],
  },
  {
    lemma: "raamat", translation: "book", cefr: "A1", gradationNote: null, genitive: "raamatu",
    principal: [{ label: "nominative", value: "raamat" }, { label: "genitive", value: "raamatu" }, { label: "partitive", value: "raamatut" }],
    cases: [],
  },
];
