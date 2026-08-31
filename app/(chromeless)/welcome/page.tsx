import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, BookOpen, Check, CircleHelp, Minus,
  Map as MapIcon, Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { LEVELS, PATH } from "@/lib/collections/syllabus";
import { SEED_SET_SIZE } from "@/lib/collections/seedSize";
import { buildCaseTable } from "@/lib/estonian/derive";
import { ButtonLink } from "@/components/Button";
import { Wordmark } from "@/components/brand";
import { MascotWatch } from "@/components/MascotWatch";
import { CaseExplorer, TutorPeek, type DemoWord } from "./LandingDemo";
import { toneInk } from "@/components/ui";
import { oneEntryPerLemma } from "@/lib/dict/search";

export const metadata: Metadata = {
  title: { absolute: "Kodukeel. Estonian that finally sticks" },
  description:
    "Fourteen cases, a stem that changes when you look at it. Kodukeel turns Estonian into fifteen quiet minutes a day: real forms from Ekilex, spaced repetition, native audio and a tutor that explains the rule.",
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

      {/*
        Ten sections became eight, and eight became five.

        The page was answering every question a visitor could have, in the order
        somebody thought of them. The first cut took out a four-tile source
        credit and a four-figure stat panel, and left a page that still had to be
        scrolled four times before it stopped introducing itself. Nothing in it
        was wrong; there was simply more of it than anybody deciding whether to
        try an app will read.

        Two sections went, and neither lost its argument. "You didn't fail
        Estonian. Your tools did." was three cards making three complaints, and
        each complaint was answered somewhere further down by the thing that
        answers it: the case demo, the scheduler card, the line about a model
        never supplying a form. So each one now sits next to its answer instead
        of a screen and a half above it. "How a day goes" was three steps that
        the feature grid and the closing sentence already described, in the same
        words, twice.

        What is left is the five beats somebody actually needs: what this is,
        why the cases are the hard part, what you get, what the catch is, and
        where to start. The comparison is one of the questions now rather than a
        section of its own, which is where the person asking it looks.
      */}
      <main className="relative">
        <Hero stats={stats} />
        <Cases words={words} />
        <Features />
        <Questions />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}

/**
 * Fades a block in as it scrolls into view. CSS scroll timelines, so it costs
 * no JavaScript and degrades to "already visible" where they aren't supported.
 *
 * It renders a `div` and nothing else, which is a constraint on where it may go
 * rather than a detail. It once wrapped the `<li>`s of an ordered list, and a
 * `div` between an `ol` and its `li` means the list is not a list: a screen
 * reader announces an empty list and three stray items. If a list ever needs
 * this again, the wrapper has to render the list item itself.
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
        <div className="hidden items-center gap-7 text-sm font-medium md:flex" style={{ color: "var(--ink-2)" }}>
          <a href="#cases" className="transition-opacity hover:opacity-60">The cases</a>
          <a href="#features" className="transition-opacity hover:opacity-60">What you get</a>
          <a href="#faq" className="transition-opacity hover:opacity-60">Questions</a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-60 sm:block"
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

/**
 * The hero, with nothing beside it.
 *
 * It carried a live flashcard: a real card, flipped and graded, with the real
 * scheduling intervals under it, so a visitor had done a review before signing
 * up for anything. It was the best thing on the page and it is gone anyway.
 * It cost 413px of a phone, the page was still six screens after everything
 * else had been cut, and it is the second demonstration rather than the first.
 * The case explorer one section down is what this app is actually for. A page
 * that shows two things shows neither, and of the two, spaced repetition is
 * the part a stranger already understands.
 *
 * THE FOUR LETTERS WENT WITH IT, and that is the card's doing rather than a
 * verdict on them. They were tucked over the card's four sides, one to a side,
 * and the argument for that arrangement is the argument against keeping them:
 * a letter with clear air around it reads as a square that missed rather than
 * as one that was put there. With no card there is no edge, and the two other
 * cards big enough to hang them on are a table of Estonian forms and the
 * closing panel, neither of which is the hero. What carries this language's
 * character on the page now is the explorer, which is full of the real thing.
 * Their four checks in `scripts/test-design.mjs` went too, and the suite's
 * floor came down by exactly four.
 *
 * So one centred column, which is the shape a hero takes when it has no second
 * half: the eye goes down the middle to the button rather than across to a card
 * and back.
 */
function Hero({ stats }: { stats: { words: number; forms: number } }) {
  /*
    The four figures that were a panel of their own, as one line of evidence
    under the button. A stat panel three screens down is a claim nobody has a
    reason to read; the same numbers beside the call to action are the reason to
    believe the sentence above them. The unit count and the level range are read
    from the course itself rather than written by hand, which is what kept this
    line from going stale the way "eighteen units, A1 to C1" once did.
  */
  const claims = [
    /*
      "Every form from Ekilex" was one source too few, and the half it left out
      is the half a stranger meets first: the built-in set is hand-typed
      principal parts checked against a reference, the course vocabulary is
      Ekilex's, and the English on all of it is Wiktionary's. What every one of
      them has in common is the thing worth claiming, which is that a person or
      a dictionary put each form there and no model did. The FAQ names the three
      sources one screen down; this line is the promise they add up to.
    */
    `${stats.words.toLocaleString("en-GB")} words, ${stats.forms.toLocaleString("en-GB")} forms, none from a model`,
    `${PATH.length} units, ${LEVELS[0]} to ${LEVELS[LEVELS.length - 1]}`,
    "Free, and it works offline",
  ];
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-5 pb-6 pt-14 text-center md:px-8 md:pb-10 md:pt-20">
      {/*
        No badge over the headline. It read "for everyone who bounced off
        Estonian once already", which is the same sentiment as the heading one
        section down, in weaker words: "You didn't fail Estonian. Your tools
        did." They used to be two screens apart and the echo was a theme; on a
        page this length they are within one screen of each other, and the echo
        is a page saying its best line twice, second-best first.
      */}
      <h1
        className="fade-up text-5xl font-bold leading-[1.02] tracking-[-0.02em] md:text-6xl"
        style={{ color: "var(--ink)", animationDelay: "90ms" }}
      >
        Estonian that
        <br />
        finally <span className="grad-text grad-sweep">sticks</span>.
      </h1>

      <p
        className="fade-up mt-5 max-w-[52ch] text-md leading-relaxed"
        style={{ color: "var(--ink-2)", animationDelay: "150ms" }}
      >
        Fourteen cases, and a stem that changes shape when you look at it. Fifteen quiet minutes a
        day, real forms from Ekilex, native audio, and a tutor who tells you the rule instead of
        marking you wrong.
      </p>

      {/*
        One loud action, and nothing beside it.

        It was two heavy pills of different widths, which on a 360px screen wrap
        into a lopsided stack: a gradient button, then a bordered white one
        under it ending somewhere else entirely, both shouting at the same
        volume about two things that are not equally important. The rule the
        button primitive is written under is one loud action per screen. So the
        second became a link, "Show me a word", and now it is gone too: it
        jumped to the case explorer, which on a page this length is one flick
        down and the next thing a reader meets anyway, and the nav carries the
        same jump under "The cases" for anybody who wants to aim.
      */}
      <div className="fade-up mt-7 w-full sm:w-auto" style={{ animationDelay: "210ms" }}>
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full sm:w-auto">
          Start learning, free <ArrowRight size={17} aria-hidden />
        </ButtonLink>
      </div>

      <ul
        className="fade-up mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs"
        style={{ color: "var(--ink-3)", animationDelay: "270ms" }}
      >
        {claims.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <Check size={14} aria-hidden style={{ color: "var(--mint-ink)" }} /> {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────────────────────────────────────── cases ── */

/**
 * The problem and the demonstration of it, in one section.
 *
 * The complaint used to be a section of its own three cards above this one:
 * streak apps do not teach cases, textbooks do not schedule, chatbots invent
 * Estonian. All three are still made, and each is now made where it is
 * answered. The first is this heading, standing over the thing that answers it.
 * The second is on the scheduling card below, which was already saying half of
 * it. The third is on Anu's card and in the line of evidence under the hero,
 * where it is a promise about the whole app rather than one grievance in three.
 */
function Cases({ words }: { words: DemoWord[] }) {
  const derivable = words.filter((w) => w.cases.some((c) => !c.principal && c.singular));
  if (derivable.length === 0) return null;

  return (
    <section id="cases" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-10 md:px-8 md:py-14">
      <Reveal>
        <div className="mx-auto max-w-[48ch] text-center">
          <p className="label-xs" style={{ color: "var(--accent-deep)" }}>Learn one form, get eleven</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            You didn&rsquo;t fail Estonian. Your tools did.
          </h2>
          <p className="mt-4 text-md leading-relaxed" style={{ color: "var(--ink-2)" }}>
            You can hold a 400-day streak and still not know whether it is{" "}
            <span lang="et" className="font-semibold">majja</span>,{" "}
            <span lang="et" className="font-semibold">majas</span> or{" "}
            <span lang="et" className="font-semibold">majast</span>. Three principal parts are
            unpredictable, so you memorise those; the other eleven are regular endings on the
            genitive stem. Press a word.
          </p>
        </div>
      </Reveal>
      <Reveal>
        <div className="relative mt-8">
          {/*
            THE FOUR VOWELS A UK OR US KEYBOARD CANNOT WRITE, over the four
            sides of the card that is full of them.

            They are the reason `lib/ux/letterBar.ts` exists and the first
            thing anybody meets about this language, and they used to hang off
            the hero's flashcard. That card went when this page was cut to five
            screens, and the rule they are placed under is why they could not
            simply stay where they were: THEY ALL TOUCH THE CARD, one to a
            side. A letter with clear air around it reads as one that missed
            rather than as one that was put there.

            So they moved rather than went, and this is the card they belong
            on: the only object left on the page big enough to carry them, and
            the one whose contents are the letters themselves. The hero above
            is a centred column with no box in it, and the closing panel is a
            send-off rather than an introduction.

            WHAT THEY MAY NOT TOUCH IS A CONTROL. On the old card that was one
            full-width pill in the footer; here it is the two word chips near
            the top left, which is why the letter on the top edge sits well
            left of them and is checked against every button inside the card
            rather than against one named pill.

            THE CARD CHANGES SHAPE, which the flashcard did not: the explorer
            stacks into one column below `md`, so it is 707px tall at 640 and
            about 440 above it. The two side letters are therefore placed from
            the top and the bottom rather than at a fraction of a height that
            is not stable, and the gutter they hang in goes 20px, 32px, 96px
            across the three widths, so the hang grows with it.

            EVERY OFFSET IS DERIVED FROM THE CARD'S OWN PADDING rather than
            from where the content happens to sit. The nearest run of text is
            21px from the left edge, 17px from the top, 33px from the right and
            22px from the bottom, measured at all three widths and for both
            words the explorer can show. So a letter that reaches in by less
            than its side's margin, wander included, cannot touch a glyph
            whatever the reader presses: that is a property of the placement
            rather than a lucky gap, which matters because pressing a chip
            changes how many rows the card has. Each of these reaches in by 12
            to 20px and drifts at most 4px further.

            The hang is bounded by the other end: the gutter is 20px at 640,
            and a rotated square is wider than its side, so 14deg on 40px puts
            its corners about 4px past the box. That is the difference between
            hanging inside the page's padding and being clipped against it, and
            it is why the side letters are smaller below `md` than above it.

            They are `pointer-events-none` and `aria-hidden`: an ornament that
            eats a tap on the card underneath it is a decoration doing
            something no decoration should, and the card underneath is the one
            interactive thing on this page.

            `scripts/test-design.mjs` measures all of it at 640, 768 and 1280,
            stepping each letter through twelve frames of its own wander rather
            than reading it where it happens to rest: every letter over an
            edge, none on a control, none past the page, and the slant still
            there with the animation stopped.

            One hue each, and the fourth takes butter because it is the hue
            left: blush, mint and sky are spoken for and peach means "missed"
            on every other screen in the app.
          */}
          <span
            aria-hidden
            className="drift pointer-events-none absolute -top-7 left-72 z-20 hidden h-10 w-10 sm:flex items-center justify-center rounded-[var(--r)] text-lg font-bold md:-top-11 md:left-80 md:h-14 md:w-14 md:text-2xl"
            style={{ background: "var(--blush-soft)", color: "var(--blush-ink)", boxShadow: "var(--shadow-sm)", "--float-tilt": "-14deg", "--drift-x": "2px", "--drift-y": "4px", "--drift-turn": "2deg", "--drift-time": "9s" } as React.CSSProperties}
          >
            õ
          </span>
          <span
            aria-hidden
            className="drift pointer-events-none absolute -right-3 top-24 z-20 hidden h-8 w-8 sm:flex items-center justify-center rounded-[var(--r-sm)] text-base font-bold md:-right-6 md:top-28 md:h-12 md:w-12 md:text-xl"
            style={{ background: "var(--mint-soft)", color: "var(--mint-ink)", boxShadow: "var(--shadow-sm)", animationDelay: "1.2s", "--float-tilt": "12deg", "--drift-x": "-4px", "--drift-y": "-3px", "--drift-turn": "1.6deg", "--drift-time": "7.5s" } as React.CSSProperties}
          >
            ä
          </span>
          <span
            aria-hidden
            className="drift pointer-events-none absolute -left-3 bottom-24 z-20 hidden h-7 w-7 sm:flex items-center justify-center rounded-[var(--r-sm)] text-sm font-bold md:-left-6 md:bottom-28 md:h-10 md:w-10 md:text-lg"
            style={{ background: "var(--sky-soft)", color: "var(--sky-ink)", boxShadow: "var(--shadow-sm)", animationDelay: "2.4s", "--float-tilt": "-9deg", "--drift-x": "4px", "--drift-y": "-3px", "--drift-turn": "2.2deg", "--drift-time": "11s" } as React.CSSProperties}
          >
            ü
          </span>
          <span
            aria-hidden
            className="drift pointer-events-none absolute -bottom-5 right-14 z-20 hidden h-8 w-8 sm:flex items-center justify-center rounded-[var(--r-sm)] text-base font-bold md:-bottom-6 md:right-20 md:h-9 md:w-9 md:text-lg"
            style={{ background: "var(--butter-soft)", color: "var(--butter-ink)", boxShadow: "var(--shadow-sm)", animationDelay: "3.6s", "--float-tilt": "15deg", "--drift-x": "-3px", "--drift-y": "-4px", "--drift-turn": "1.8deg", "--drift-time": "10s" } as React.CSSProperties}
          >
            ö
          </span>

          <CaseExplorer words={derivable} />
        </div>
      </Reveal>
    </section>
  );
}

/* ────────────────────────────────────────────────────── features ── */

function Features() {
  /*
    Eight cards became five, five became four, four became three.

    Three of the original eight said what the hero, the FAQ or another card was
    already saying: a portability card beside an offline tick, a progress card
    beside an XP card, and a "four ways to practise" card that had been wrong
    since the third practice mode shipped. Then the speech card, which is not a
    thing of its own: it is what the dictionary entry does when you press a
    form, so it is a clause on the dictionary card.

    The last to go is the seam between the course and the scheduler, and they
    were never two things. A unit is a sitting's worth of words, adding one
    makes cards, and the scheduler is what brings those cards back: that is one
    loop described twice, once as "here is a syllabus" and once as "here is a
    scheduler", with the sentence joining them left for the reader to write.

    What the bodies carry now is the section that used to sit under this one.
    "How a day goes" was three steps, and all three were already here in other
    words: picking a unit and looking a word up is the first card, adding it in
    a press is the second, and being told you are done for the day is the second
    card's whole point. A step somebody reads twice is a step they read neither
    time.

    Three is also what makes the grid a row again, with no hole to explain.
    `md:col-span-2` on Anu's card had done nothing since the day it was written,
    because the grid item is the `Reveal` wrapper and the span was on the card
    inside it: the layout everybody had been looking at was three cards, then
    two, then a gap where the sixth would go.
  */
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-10 md:px-8 md:py-14">
      <Reveal>
        <div className="mx-auto max-w-[44ch] text-center">
          <p className="label-xs" style={{ color: "var(--blush-ink)" }}>What you actually get</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            Three things, each doing one job well
          </h2>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Reveal>
          <Feature
            tone="accent"
            icon={<BookOpen size={18} aria-hidden />}
            title="A dictionary that shows the whole word"
            body="Search a form you half-remember from class and it finds the word, says which one you typed, and lays out all the rest with gradation marked and every form spoken aloud."
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="mint"
            icon={<MapIcon size={18} aria-hidden />}
            title={`A course of ${PATH.length} units that schedules itself`}
            body="Each unit is a sitting's worth of words that becomes real cards in one press. FSRS brings each one back on the day you were going to forget it, then tells you you're done. Sprint, dictation and listening all grade those same cards."
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="blush"
            icon={<Sparkles size={18} aria-hidden />}
            title="Anu explains the rule"
            body="Ask a chatbot for an inflected form and you get a confident, wrong one. Anu explains the rule and checks your sentence, and she may never supply an Estonian form: those come from the dictionary."
          >
            <TutorPeek />
          </Feature>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * One card, and `children` for the one that shows its work.
 *
 * Anu's card used to be a hand-written copy of this with its icon beside the
 * heading instead of above it, which is how it came to be the only card in the
 * grid laid out differently from its neighbours. A slot under the body is the
 * whole of what it needed, and the icon it was laying out its own way is the
 * arrangement every card takes now: a circle stacked over a heading spends 52px
 * of a phone on saying nothing the heading does not, once per card.
 */
function Feature({ tone, icon, title, body, children }: {
  tone: "accent" | "mint" | "sky" | "butter" | "peach" | "blush";
  icon: React.ReactNode;
  title: React.ReactNode;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="lift flex h-full flex-col rounded-[var(--r-xl)] border p-6"
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: `var(--${tone}-soft)`, color: toneInk(tone) }}
        >
          {icon}
        </span>
        <h3 className="text-lg font-bold leading-snug" style={{ color: "var(--ink)" }}>
          {title}
        </h3>
      </div>
      <p className="mt-3 max-w-[52ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{body}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────── comparison ── */

/**
 * The comparison, and the rules it is written under.
 *
 * It used to be headed "Kodukeel vs. the owl", which was a joke at the expense
 * of an app that has never offered Estonian at all. Comparing yourself with a
 * product nobody can buy in this language is not an honest comparison, and it
 * left the page silent about the tools somebody choosing today is actually
 * choosing between. The fact is now stated plainly and the mascot is gone with
 * it: borrowing somebody else's branding to sell your own thing is the part of
 * a comparison that gets a letter, and the plain sentence was better copy
 * anyway.
 *
 * So the columns are the real ones, and every claim in the table is written to
 * survive being read by the people it is about: a fact taken from that
 * product's own public pages, checked on a stated date, with a third state for
 * the cells we could not confirm rather than a guess in our own favour. No
 * logos, no borrowed branding, nothing about price beyond what their own store
 * listing says, and a credit line under the table for what each of them does
 * better than Kodukeel does. On most of these rows somebody else ticks too,
 * which is what a comparison looks like when it is not rigged.
 *
 * How many is counted from the rows rather than written under them. It said
 * three, the table had grown since, and the true figure was seven: a sentence
 * claiming to be an honest comparison was the one sentence on the page nobody
 * had rechecked. `SHARED_ROWS` cannot drift from the grid it describes.
 *
 * If you add a row, it has to be checkable by a stranger in an afternoon. A row
 * that can only be settled by opinion belongs in the prose, not the grid.
 */

/** yes · no, going by its own public pages · we could not tell. */
type Verdict = "yes" | "no" | "unsure";

const TOOLS = [
  { name: "Kodukeel", short: "Kodukeel", ours: true },
  { name: "Speakly", short: "Speakly", ours: false },
  { name: "Keeleklikk", short: "Keeleklikk", ours: false },
  { name: "Anki", short: "Anki", ours: false },
] as const;

const ROWS: readonly { label: string; cells: readonly [Verdict, Verdict, Verdict, Verdict] }[] = [
  { label: "Free, with no subscription", cells: ["yes", "no", "yes", "yes"] },
  { label: "Built for Estonian and nothing else", cells: ["yes", "no", "yes", "no"] },
  { label: "Teaches the case system case by case", cells: ["yes", "unsure", "yes", "no"] },
  { label: "Every form shows the dictionary it came from", cells: ["yes", "no", "no", "no"] },
  { label: "Brings a word back on the day you would forget it", cells: ["yes", "yes", "no", "yes"] },
  { label: "Any word you look up becomes a card", cells: ["yes", "no", "no", "yes"] },
  { label: "Explains why the answer was wrong", cells: ["yes", "yes", "yes", "no"] },
  { label: "Keeps working with no connection", cells: ["yes", "unsure", "no", "yes"] },
];

/**
 * Rows where a product other than ours also earns a tick. Read off `ROWS`,
 * because the summary above the table says the number out loud.
 *
 * Spelled rather than printed as a digit, because the sentence around it is
 * prose and the rest of this page counts in words. The table is eight rows
 * long, so the list only has to reach as far as the table can.
 */
const COUNTED = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"] as const;
const shared = ROWS.filter((row) => row.cells.slice(1).includes("yes")).length;
/** It opens the sentence, so it opens with a capital. */
const CLAIM_COUNT = (COUNTED[ROWS.length] ?? String(ROWS.length)).replace(/^./, (c) => c.toUpperCase());
const SHARED_ROWS = COUNTED[shared] ?? String(shared);

const CREDITS = [
  {
    name: "Speakly",
    body:
      "Built in Estonia, and the closest thing here to a like for like comparison. It teaches the 4,000 words you will meet most often in the order you will meet them, with audio, grammar notes and its own spaced repetition, in ten languages. For getting words into your ear quickly it is good, and it is a subscription: its App Store listing runs from 9.99 euros a month to 69.99 euros once.",
  },
  {
    name: "Keeleklikk and Keeletee",
    body:
      "Free courses funded by the Integration Foundation: A1 to A2, then B1, sixteen chapters of animation and grammar video, and an Estonian teacher who answers your questions by email. If you are starting from nothing and want a course rather than a tool, start there. Kodukeel is the thing to keep open alongside it and after it.",
  },
  {
    name: "Anki",
    body:
      "Free, open source, works offline, and it will schedule anything you are willing to type onto a card. What it will not do is supply the Estonian: every form is yours to find, and yours to get wrong. The desktop and Android apps cost nothing; the iPhone one is a single purchase.",
  },
  {
    name: "The vocabulary apps",
    body:
      "Drops, Mondly, uTalk, Ling, Memrise, Clozemaster and Lingvist all include Estonian and all do words in five quiet minutes rather well. Kodukeel is aimed at the part that comes after the word: which form of it, and why that one.",
  },
] as const;

function Mark({ verdict }: { verdict: Verdict }) {
  if (verdict === "yes") {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
      >
        <Check size={15} strokeWidth={3} aria-label="yes" />
      </span>
    );
  }
  if (verdict === "unsure") {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: "var(--butter-soft)", color: "var(--butter-ink)" }}
      >
        <CircleHelp size={15} strokeWidth={2.5} aria-label="we could not tell" />
      </span>
    );
  }
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full"
      style={{ background: "var(--raised)", color: "var(--ink-3)" }}
    >
      <Minus size={15} strokeWidth={3} aria-label="no" />
    </span>
  );
}

/**
 * The comparison, folded into the questions.
 *
 * Every claim in it is still here, and so is the credit paragraph for each of
 * the four tools. What changed is where it sits. It was a section of its own
 * with its own heading and its own summary paragraph, second from the bottom of
 * the page, and an eight-row grid against three products with four credit cards
 * and a dated methodology note is the longest block here by a distance. It also
 * answers a question only somebody already choosing between tools is asking,
 * which is exactly the shape of the four questions above it. So it is the fifth
 * one, wearing the same shell: the person asking it finds it where they look
 * for it, and everybody else gets a line in a list instead of a screen.
 *
 * Shut by default rather than removed, because the argument in the comment
 * below still holds: a page that will not say what it is not better at is a
 * page whose claims cannot be checked.
 */
function Comparison() {
  return (
    <FaqItem question="How does it compare with Speakly, Keeleklikk and Anki?">
      {/*
        No Reveal inside here. It fades a section up as it enters the
        viewport, and an element that is display:none until somebody opens
        a disclosure has no entry to animate on a page already scrolled
        past it. The one thing worse than an animation nobody sees is one
        that leaves the content half-faded, which the design suite checks
        for by name.
      */}
      <p className="mt-3 max-w-[68ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
        Duolingo has never offered an Estonian course, so the choice you actually face is between
        the tools that do. {CLAIM_COUNT} claims, checked against their own public pages, and on{" "}
        {SHARED_ROWS} of them somebody else ticks too.
      </p>
      <p className="mt-3 max-w-[68ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
        None of them is trying to do quite this: get you to the point of saying{" "}
        <span lang="et" className="font-semibold">ma lähen tuppa</span> and knowing why it
        is not <span lang="et" className="font-semibold">tuba</span>.
      </p>

      {/* Phones get a card per claim: four columns of ticks at 390px would
          leave the labels a third of a line wide, and this page may not
          scroll sideways. */}
      <div className="mt-7 flex flex-col gap-3 md:hidden">
        {ROWS.map((row) => (
          <div
            key={row.label}
            className="rounded-[var(--r-lg)] border p-4"
            style={{ background: "var(--surface)", borderColor: "var(--rule)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{row.label}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {TOOLS.map((tool, i) => (
                <span key={tool.name} className="flex items-center gap-2">
                  <Mark verdict={row.cells[i] ?? "unsure"} />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: tool.ours ? "var(--accent-deep)" : "var(--ink-3)" }}
                  >
                    {tool.short}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-7 hidden overflow-hidden rounded-[var(--r-xl)] border md:block"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow)" }}
      >
        <div
          className="grid grid-cols-[1fr_repeat(4,88px)] items-center gap-2 border-b px-5 py-3.5"
          style={{ borderColor: "var(--rule-soft)", background: "var(--raised)" }}
        >
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>&nbsp;</span>
          {TOOLS.map((tool) =>
            tool.ours ? (
              <span key={tool.name} className="text-center text-base font-bold" style={{ color: "var(--accent-deep)" }}>
                {tool.name}
              </span>
            ) : (
              <span key={tool.name} className="label-xs text-center" style={{ color: "var(--ink-3)" }}>
                {tool.name}
              </span>
            ),
          )}
        </div>
        {ROWS.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_repeat(4,88px)] items-center gap-2 px-5 py-3.5"
            style={{ borderTop: "1px solid var(--rule-soft)" }}
          >
            <span className="text-base" style={{ color: "var(--ink-2)" }}>{row.label}</span>
            {TOOLS.map((tool, i) => (
              <span key={tool.name} className="flex justify-center">
                <Mark verdict={row.cells[i] ?? "unsure"} />
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CREDITS.map((credit) => (
          <div
            key={credit.name}
            className="rounded-[var(--r-lg)] border px-4 py-3.5"
            style={{ borderColor: "var(--rule)", background: "color-mix(in oklab, var(--surface) 70%, transparent)" }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{credit.name}</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>{credit.body}</p>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-6 max-w-[68ch] text-center text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
        A tick means yes, a dash means not from anything its own public pages say, and a question
        mark means we could not tell and would rather say so. Checked in August 2026 against each
        product&rsquo;s own site and store listing. Every name here belongs to its owner, Kodukeel
        is not affiliated with any of them and none of them has endorsed it. If something is out
        of date or simply wrong, tell us and it gets corrected.
      </p>
    </FaqItem>
  );
}

/* ───────────────────────────────────────────────────── questions ── */

const FAQS = [
  [
    "Do I need to pay for anything?",
    "No, and there is nothing to set up either. Sign in with Google and the dictionary, the flashcards, every practice mode, the mock exam and your exports are yours with nothing counted. What is counted is the handful of things that cost this site money each time they run, and they carry a day's allowance rather than a price: ten questions to Anu, thirty notes back from the writing grader, twenty photographed pages, and three hundred phrases of speech nobody has asked for before. Audio is cached once it has been spoken, so a review session never reaches that last number.",
  ],
  [
    "Where do the Estonian forms come from?",
    "Ekilex, the Institute of the Estonian Language, for every Estonian form and every example sentence; English Wiktionary for the English, checked word by word against its own page; plus a hand-checked built-in set of common words. The eleven regular cases are worked out from the genitive by a function with its own unit tests. An AI is never allowed to supply an Estonian form: it invents plausible, wrong ones, and a flashcard would then drill the mistake in.",
  ],
  [
    "Is this only for beginners?",
    "It covers A1 to C1. The parts that make Estonian hard later (consonant gradation, verb government, total versus partial objects) each get their own card type rather than being left to guesswork. There is a ten-minute placement check if you would rather not guess where you are, and a mock paper for the state examination at A2, B1, B2 and C1, assembled from recorded sentences and marked by comparison against the dictionary.",
  ],
  [
    "What happens to my data?",
    "It stays in your account, scoped to you, and you can download the whole thing as JSON from Settings at any time. Your review history is the one thing here that cannot be recreated, so it is append-only and never overwritten.",
  ],
] as const;

/**
 * One shell for every question, the comparison included.
 *
 * It exists because the comparison used to be its own section with its own
 * heading, its own eyebrow and its own chevron, and folding it in beside four
 * questions that look nothing like it would have read as two designs meeting
 * rather than as one list. A shared shell is also the reason the comparison
 * costs a line rather than a screen: shut, it is exactly as tall as "What
 * happens to my data?".
 */
function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details
      className="group rounded-[var(--r-lg)] border px-5 py-4"
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-4 text-md font-semibold"
        style={{ color: "var(--ink)" }}
      >
        {question}
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-md leading-none transition-transform group-open:rotate-45"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          +
        </span>
      </summary>
      {children}
    </details>
  );
}

function Questions() {
  return (
    <section id="faq" className="mx-auto max-w-4xl scroll-mt-24 px-5 py-10 md:px-8 md:py-14">
      <Reveal>
        <h2 className="text-center text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
          The questions people ask
        </h2>
      </Reveal>
      <div className="mt-8 flex flex-col gap-3">
        {FAQS.map(([q, a]) => (
          <Reveal key={q}>
            <FaqItem question={q}>
              {/* Capped, because the section is as wide as the comparison table
                  inside it and a hundred characters to the line is not a width
                  anybody reads a paragraph at. */}
              <p className="mt-3 max-w-[68ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{a}</p>
            </FaqItem>
          </Reveal>
        ))}
        <Reveal>
          <Comparison />
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────── final call ── */

/**
 * The close, and the one line the cut sections left behind.
 *
 * "How a day with Kodukeel goes" was three cards saying pick a unit, add it in
 * a press, and show up for fifteen minutes. That is one sentence, and it reads
 * better as one: it belongs at the point where somebody is deciding, not three
 * scrolls earlier where it is a feature list with numbers on it.
 *
 * The second button went with it. A page this length has its demonstration two
 * screens up rather than eight, and a "see it first" link at the bottom of a
 * short page is an invitation to leave the one screen that asks for a decision.
 */
function FinalCta() {
  return (
    <section className="px-5 py-10 md:px-8 md:py-14">
      <Reveal>
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[var(--r-xl)] px-6 py-9 text-center md:px-16 md:py-12"
          style={{ background: "var(--accent-soft)" }}
        >
          <span aria-hidden className="wash" style={{ background: "var(--wash-2)", width: 420, height: 420, top: -160, right: -80 }} />
          <span aria-hidden className="wash" style={{ background: "var(--wash-3)", width: 380, height: 380, bottom: -200, left: -60, opacity: 0.5 }} />

          <div className="relative">
            <MascotWatch size={68} mood="cheer" className="float mx-auto" />
            <h2 className="mx-auto mt-6 max-w-[18ch] text-3xl font-bold leading-[1.08] tracking-tight md:text-5xl" style={{ color: "var(--ink)" }}>
              Fifteen minutes. Starting today.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-md leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Look up one word, add it in a press, and let the scheduler do the remembering. That
              is the whole commitment.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full sm:w-auto">
                Start learning, free <ArrowRight size={17} aria-hidden />
              </ButtonLink>
            </div>
            <p className="mt-5 text-xs" style={{ color: "var(--ink-3)" }}>
              Google sign-in &middot; nothing to install &middot; export whenever you like
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
        className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t pt-8 text-xs md:flex-row"
        style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}
      >
        <Wordmark size={26} />
        <p className="text-center md:text-right">
          Forms and example sentences from{" "}
          <a href="https://ekilex.ee" target="_blank" rel="noreferrer" className="underline underline-offset-2">Ekilex</a>
          , Institute of the Estonian Language · CC BY 4.0. English glosses from{" "}
          <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer" className="underline underline-offset-2">Wiktionary</a>
          {" "}· CC BY-SA 4.0. Speech from{" "}
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

    /*
      One entry per lemma. `new Map(lexemes.map(...))` kept whichever row came
      last, which is the plan's choice, and `tuba` is both one of the three
      words this page demonstrates and a lemma the dictionary can hold twice:
      once from Ekilex with thirty forms, and once as a formless stub the
      moment somebody confirms it off a photograph. The case table under it
      is the whole argument this page makes, and it would have been empty.
    */
    const words = oneEntryPerLemma(lexemes, DEMO_LEMMAS).flatMap((lex) => {
      const form = (t: string) => lex.forms.find((f) => f.formType === t)?.value;
      const isVerb = lex.pos === "VERB";

      // Labelled the way a course labels them. The three noun parts are the
      // three questions every Estonian schoolbook drills them by, and a visitor
      // who has been to one lesson recognises them.
      const principal = (isVerb
        ? [["ma-tegevusnimi", form("INF_MA")], ["da-tegevusnimi", form("INF_DA")], ["olevik · ma", form("PRES_1SG")], ["lihtminevik · ma", form("PAST_1SG")]]
        : [["nimetav · kes? mis?", form("NOM_SG")], ["omastav · kelle? mille?", form("GEN_SG")], ["osastav · keda? mida?", form("PART_SG")]]
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

  // The counts describe the built-in dictionary that `npm run db:seed` loads —
  // the right thing to claim when the database behind this page is unreachable
  // or has not been seeded yet, since that is exactly what a visitor would get.
  return { words: FALLBACK_WORDS, stats: SEED_SET_SIZE };
}

/**
 * The set the page falls back to when the database is unreachable or has not
 * been seeded yet — which is the state a fresh deployment builds in, so this
 * path is load-bearing rather than theoretical.
 *
 * The principal parts are copied verbatim from the checked seed data; the rest
 * is derived by `buildCaseTable()`, exactly as the live path does it. Nothing
 * here is a hand-written Estonian form.
 */

const FALLBACK_STEMS = [
  { lemma: "tuba",
    nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade" },
  { lemma: "raamat",
    nomSg: "raamat", genSg: "raamatu", partSg: "raamatut", partPl: "raamatuid", genPl: "raamatute" },
] as const;

const FALLBACK_WORDS: DemoWord[] = FALLBACK_STEMS.map((w) => ({
  lemma: w.lemma,
  genitive: w.genSg,
  principal: [
    { label: "nimetav · kes? mis?", value: w.nomSg },
    { label: "omastav · kelle? mille?", value: w.genSg },
    { label: "osastav · keda? mida?", value: w.partSg },
  ],
  cases: buildCaseTable(w).map((row) => ({
    en: row.spec.en,
    et: row.spec.et,
    question: row.spec.question,
    singular: row.singular ?? null,
    plural: row.plural ?? null,
    principal: row.spec.principal,
  })),
}));
