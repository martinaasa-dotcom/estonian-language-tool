import { PrefetchLink as Link } from "@/components/PrefetchLink";
import type { Metadata } from "next";
import {
  ArrowRight, BookOpen, Check, CircleHelp, Minus,
  Plus, Sparkles, Target, X,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { LEVELS, PATH } from "@/lib/collections/syllabus";
import { DEMO_LEMMAS, DEMO_STEMS, type DemoStems } from "@/lib/collections/demoWords";
import { SEED_SET_SIZE } from "@/lib/collections/seedSize";
import { buildCaseTable, shownForms, stemsFrom, type DerivedForm } from "@/lib/estonian/derive";
import type { CaseSubject } from "@/lib/estonian/caseQuestion";
import { caseByKey } from "@/lib/estonian/cases";
import { caseQuestionFor } from "@/lib/estonian/caseQuestion";
import { ButtonLink } from "@/components/Button";
import { Wordmark } from "@/components/brand";
import { MascotWatch } from "@/components/MascotWatch";
import { CaseExplorer, TutorPeek, type DemoCase, type DemoWord } from "./LandingDemo";
import { LetterTile } from "@/components/LetterTile";
import { LandingAnu, type AnuLine } from "@/components/LandingAnu";
import { toneInk } from "@/components/ui";
import { oneEntryPerLemma } from "@/lib/dict/search";

export const metadata: Metadata = {
  title: { absolute: "Kodukeel. Ready for the real thing" },
  description:
    "Kodukeel means home language. Practice that sticks, a conversation to rehearse with somebody who has an agenda of their own, and one small thing to say out loud today, for anybody making a home in Estonia.",
};

/** The landing page is public and read-only, so it can be cached hard. */
export const revalidate = 3600;

export default async function WelcomePage() {
  const { words, stats } = await loadDemo();

  return (
    <div className="landing relative overflow-x-hidden" style={{ background: "var(--ground)" }}>
      {/*
        Pastel light behind the whole page, drifting. Each blob has its own
        period so the three never move together, and a blob is a blurred
        circle moved on the compositor, so the drift costs no layout.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="wash wash-roam" style={{ background: "var(--wash-1)", width: 620, height: 620, top: -260, left: -160, "--wash-time": "26s" } as React.CSSProperties} />
        <span className="wash wash-roam" style={{ background: "var(--wash-2)", width: 520, height: 520, top: 60, right: -220, opacity: 0.65, "--wash-time": "31s", "--wash-delay": "-9s" } as React.CSSProperties} />
        <span className="wash wash-roam" style={{ background: "var(--wash-3)", width: 560, height: 560, top: 1180, left: -200, opacity: 0.5, "--wash-time": "37s", "--wash-delay": "-17s" } as React.CSSProperties} />
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
      <main className="landing-flow relative">
        <Hero stats={stats} />
        <Cases words={words} />
        <Features />
        <Questions />
        <FinalCta />
      </main>

      <Footer />
      <LandingAnu lines={ANU_LINES} />
    </div>
  );
}

/**
 * What Anu says at each stop down the page, in the order the page goes.
 *
 * One line a section and none of them a pitch: she says what to do here, or
 * what she is for, in the voice she has inside. English only, for the reason
 * every other authored line on this page is English (ADR-005); the Estonian
 * on this page all came out of the dictionary.
 */
const ANU_LINES: readonly AnuLine[] = [
  { at: "top", mood: "happy", text: "I’m Anu, the tutor. I’ll come down the page with you." },
  { at: "cases", mood: "thinking", text: "Press a word. The endings light up, and the odd one out says so." },
  { at: "features", mood: "happy", text: "Ask me the thing you would not ask in class. I never sigh." },
  { at: "faq", mood: "thinking", text: "Straight answers, and the comparison is in there too." },
  { at: "start", mood: "cheer", text: "Fifteen minutes a day. See you inside." },
];

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
          <ButtonLink href="/sign-in" variant="primary" className="group">
            Start free <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
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
    "Counts the conversations you have, not the days you open it",
  ];
  /*
    As tall as what is in it, and one section gap from the next beat. The
    height rule this used to carry, the window less the nav less a peek, is
    gone with the 230px of nothing it left under the claims; `.landing-flow`
    in `app/globals.css` has the argument. The top padding is the only thing
    between the nav pill and the headline, and it grows with the window the
    way the three gaps inside the column do.
  */
  return (
    <section id="top" className="hero-open mx-auto flex max-w-3xl flex-col items-center px-5 text-center md:px-8">
      {/*
        No badge over the headline. It read "for everyone who bounced off
        Estonian once already", which is the same sentiment as the heading one
        section down, in weaker words: "You didn't fail Estonian. Your tools
        did." They used to be two screens apart and the echo was a theme; on a
        page this length they are within one screen of each other, and the echo
        is a page saying its best line twice, second-best first.
      */}
      {/*
        A WORD AT A TIME, AND NO FULL STOP.

        The headline used to fade up as one block. It arrives a word at a
        time now, each a beat behind the last, so the first thing on the page
        is something happening rather than something that has happened. The
        full stop after "sticks" went with it: a headline is not a sentence,
        and a mark that size after a gradient word read as a smudge under it.
        The spans are inline blocks so each can move on its own without the
        line breaking anywhere new, and the break between the two lines is
        the one the hero already placed.
      */}
      <h1
        className="hero-display font-bold leading-[1.02] tracking-[-0.02em]"
        style={{ color: "var(--ink)" }}
      >
        <span className="word-in" style={{ "--w": "60ms" } as React.CSSProperties}>Ready</span>{" "}
        <span className="word-in" style={{ "--w": "160ms" } as React.CSSProperties}>for</span>{" "}
        <span className="word-in" style={{ "--w": "220ms" } as React.CSSProperties}>the</span>
        <br />
        <span className="word-in grad-text grad-sweep" style={{ "--w": "380ms" } as React.CSSProperties}>real thing</span>.
      </h1>

      <p
        className="fade-up hero-lead hero-sub max-w-[52ch] leading-relaxed"
        style={{ color: "var(--ink-2)", animationDelay: "420ms" }}
      >
        Kodukeel means home language. You live here now, and this is where the words start to
        hold up: fifteen quiet minutes a day of practice that sticks, a conversation to rehearse
        with somebody who has an agenda of their own, and one small thing to say out loud today.
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
      <div className="fade-up hero-action w-full sm:w-auto" style={{ animationDelay: "520ms" }}>
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="hero-cta group w-full sm:w-auto">
          Start learning for free{" "}
          <ArrowRight size={17} aria-hidden className="transition-transform group-hover:translate-x-1" />
        </ButtonLink>
      </div>

      {/*
        Balanced rather than wrapped, because four claims of four lengths
        wrap three and one at every desktop width, and a line with one item
        on it under a line with three reads as something fell off. A grid was
        the first answer and sized each column to its longest claim, which
        put the longest one back on two lines. `text-wrap: balance` breaks
        the four into two lines of about the same width, whatever the widths
        are, and the list stays a list. Below `sm` the column is too narrow
        for two on a line, so each claim takes a centred line of its own
        rather than breaking inside itself with the tick left hanging.
      */}
      <ul
        className="fade-up hero-claims mx-auto text-xs sm:[text-wrap:balance]"
        style={{ color: "var(--ink-3)", animationDelay: "640ms" }}
      >
        {claims.map((t) => (
          <li key={t} className="my-1 flex items-start justify-center gap-1.5 sm:mx-2.5 sm:inline-flex sm:items-center sm:align-middle">
            <Check size={14} aria-hidden className="mt-0.5 sm:mt-0" style={{ color: "var(--mint-ink)" }} />
            <span className="max-w-[30ch] text-left sm:max-w-none">{t}</span>
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
    <section id="cases" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 md:px-8">
      <Reveal>
        {/*
          The heading is one line where there is room for one.

          "You didn't fail Estonian. Your tools did." is 820px of 40px display
          type, and the section has 960px inside its padding from `lg` up and
          704px at `md`. Broken by the column it reads as a sentence that ran
          out of room, with "tools did." stranded on a line of its own. So the
          break is placed rather than left to the wrap: below `lg` it falls
          where the sentence already ends, at the full stop, and above it there
          is no break at all. A `br` rather than `whitespace-nowrap`, because a
          nowrap that turns out not to fit is a heading hanging off the page,
          and this one wraps honestly instead.

          The wrapper is wide enough for that line, and the paragraph under it
          keeps its own measure: a 48ch box around both was what forced the
          heading into two lines in the first place.
        */}
        <div className="mx-auto max-w-4xl text-center">
          <p className="label-xs" style={{ color: "var(--accent-deep)" }}>Learn three forms, get most of the rest</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            You didn&rsquo;t fail Estonian.<br className="lg:hidden" /> Your tools did.
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-md leading-relaxed" style={{ color: "var(--ink-2)" }}>
            You can hold a 400-day streak and still freeze when somebody speaks to you at the
            counter. Three forms of a word are yours to learn, sometimes four. Everything after
            them is the same regular endings every time, and where a word breaks the pattern you
            get the form Estonians say beside the one the rule predicts. Press a word and watch.
          </p>
        </div>
      </Reveal>
      <Reveal>
        <div className="relative mt-10 md:mt-12">
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
            changes how many rows the card has.

            THE TRAVEL IS ALONG THE EDGE, WHICH IS WHERE THE ROOM IS. These
            used to wander three or four pixels towards the card, because that
            is the only direction anybody had thought to spend, and against a
            17px margin there is nothing to spend: the movement was real and
            invisible. A letter on the top edge can slide the better part of
            the card's width without coming a pixel nearer anything it could
            land on, so õ and ö now travel 26 and 30px sideways, ä and ü the
            same up and down their own sides, and what crosses the edge is one
            to three pixels. The rock and the squash are what the small budget
            buys, and `room` is what scales them per letter: a rotated square
            is wider than its side, so 8deg on the tightest of the four is
            worth more than 15deg on the one with a gutter under it.

            The hang is bounded by the other end: the gutter is 20px at 640,
            and a rotated square is wider than its side, so 14deg on 40px puts
            its corners about 4px past the box. That is the difference between
            hanging inside the page's padding and being clipped against it, and
            it is why every letter is smaller below `md` than above it.

            EACH ONE MOVES DIFFERENTLY, and that is the point of there being
            four characters in `lib/ux/letterMotion.ts` rather than one
            keyframe with four delays on it. Four squares doing the same thing
            a second and a half apart is a mechanism. õ ambles, ä crouches and
            springs, ü rolls, ö hangs and swings.

            AND THEY NOTICE A POINTER. Coming near one slides it along its own
            edge towards the cursor and settles it further onto the card, which
            is the same rule as the wander for the same reason. They are still
            `pointer-events-none` and `aria-hidden`: an ornament that
            eats a tap on the card underneath it is a decoration doing
            something no decoration should, and the card underneath is the one
            interactive thing on this page.
          */}
          <LetterTile
            letter="õ" hue="blush" edge="top" character="wander"
            tilt={-7} travel={{ x: 26, y: 1 }} room={0.5} reach={280}
            className="-top-6 left-72 z-20 hidden h-8 w-8 text-base sm:block md:-top-8 md:left-80 md:h-10 md:w-10 md:text-xl"
          />
          <LetterTile
            letter="ä" hue="mint" edge="right" character="hop"
            tilt={12} travel={{ x: -3, y: -30 }} room={0.75} delay={0.7} reach={280}
            className="-right-3 top-24 z-20 hidden h-8 w-8 text-base sm:block md:-right-6 md:top-28 md:h-10 md:w-10 md:text-xl"
          />
          <LetterTile
            letter="ü" hue="sky" edge="left" character="tumble"
            tilt={-9} travel={{ x: 2, y: -28 }} room={0.6} delay={1.5} reach={280}
            className="-left-3 bottom-24 z-20 hidden h-8 w-8 text-base sm:block md:-left-6 md:bottom-28 md:h-10 md:w-10 md:text-xl"
          />
          <LetterTile
            letter="ö" hue="butter" edge="bottom" character="swing"
            tilt={15} travel={{ x: -30, y: -3 }} room={0.85} delay={2.2} reach={280}
            className="-bottom-5 right-14 z-20 hidden h-8 w-8 text-base sm:block md:-bottom-6 md:right-20 md:h-10 md:w-10 md:text-xl"
          />

          <CaseExplorer words={derivable} />
        </div>
      </Reveal>
    </section>
  );
}

/* ────────────────────────────────────────────────────── features ── */

function Features() {
  /*
    THREE CARDS, AND WHAT EACH ONE IS FOR CHANGED.

    They were a dictionary, a course and a tutor, which is a list of the parts
    this app is built out of rather than an answer to the question the section
    above just asked. That section ends on somebody who freezes at the counter,
    and the honest next line is how they stop doing that. So the cards are the
    three ways this app is used rather than the three things it contains: the
    person you can ask without anybody watching, the practice that puts the
    words in, and the plan that keeps you turning up. The dictionary did not go
    anywhere; it is the first sentence of the practice card, because looking a
    word up here is how a card gets made.

    ANU LEADS NOW. She was third of three, behind two cards describing
    machinery, and she is the part of this nobody else in the list offers: a
    teacher you can ask a question you are embarrassed by, at eleven at night,
    who answers the question rather than marking it. Her card is also the one
    with something to press, which is worth having early rather than last.

    The history the three replaced, kept because it is the argument for there
    being three of anything at all:

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
    <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 md:px-8">
      <Reveal>
        {/*
          THE HEADING NAMES THE THREE THINGS UNDER IT.

          It read "What's inside" over "How you get there", which is an eyebrow
          about contents over a heading about a journey, and the cards under
          them are neither: they are the three parts of the app somebody uses
          every day. A heading that has to be decoded is a heading that gets
          skipped, on the way to the button. So it says what the cards say,
          one clause each, and the line under it says how the three fit.
        */}
        <div className="mx-auto max-w-[52ch] text-center">
          <p className="label-xs" style={{ color: "var(--blush-ink)" }}>What you get</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            Someone to ask, something to practise, and a date to aim at
          </h2>
          <p className="mx-auto mt-5 max-w-[48ch] text-md leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Three parts, and they work together. A word you ask Anu about becomes a card, and the
            plan decides which evening it comes back.
          </p>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-5 md:mt-14 md:grid-cols-3">
        <Reveal>
          <Feature
            tone="blush"
            icon={<Sparkles size={18} aria-hidden />}
            title="Anu, who never sighs"
            body="Ask her the thing you would not ask in class. She will build a sentence with you, read the one you wrote, and say why the ending changed. Every Estonian word she shows you is looked up, never guessed at."
          >
            <TutorPeek />
          </Feature>
        </Reveal>
        <Reveal>
          <Feature
            tone="accent"
            icon={<BookOpen size={18} aria-hidden />}
            title="Practice that sticks"
            body={`Look a word up and it becomes a card in one press, every form, audio in twelve voices. Then ${PATH.length} units of them, brought back the day before you would forget, and heard the way people say them: at speed, over café noise, down a phone line.`}
          />
        </Reveal>
        <Reveal>
          <Feature
            tone="mint"
            icon={<Target size={18} aria-hidden />}
            title="Then the real thing"
            body="A receptionist with no slot on Thursday, a landlord on a bad line, a counter with a queue. Rehearse the conversation, then take the smallest step outside: one thing to say to a real person today, and a count of how it went. That count is the only score that matters here."
          />
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
          className="feature-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
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
  { label: "Rehearses a conversation with somebody who has an agenda of their own", cells: ["yes", "unsure", "no", "no"] },
  { label: "Counts the conversations you have outside it", cells: ["yes", "no", "no", "no"] },
];

/**
 * Rows where a product other than ours also earns a tick. Read off `ROWS`,
 * because the summary above the table says the number out loud.
 *
 * Spelled rather than printed as a digit, because the sentence around it is
 * prose and the rest of this page counts in words. The table is eight rows
 * long, so the list only has to reach as far as the table can.
 */
const COUNTED = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"] as const;
const shared = ROWS.filter((row) => row.cells.slice(1).includes("yes")).length;
/**
 * Capitalised at the source and lowered at the one call site that needs it
 * mid-sentence, rather than the other way about: this is the count of claims
 * in the table and is the kind of thing a second caller wants to open with.
 */
const CLAIM_COUNT = (COUNTED[ROWS.length] ?? String(ROWS.length)).replace(/^./, (c) => c.toUpperCase());
const SHARED_ROWS = COUNTED[shared] ?? String(shared);

/*
  ONE LINE EACH, AND THE LINE IS WHAT THEY ARE BETTER AT.

  These were four paragraphs describing four other products, which is a page
  selling somebody else's app inside a section about ours. What the credit is
  for is the sentence CLAUDE.md asks for, that each of them does something we
  do not, and that is one clause long. The detail underneath it (a price list,
  a chapter count, which platforms are free) is theirs to publish and is a
  click away on their own site, where it will also be current.
*/
const CREDITS = [
  {
    name: "Speakly",
    body: "Built in Estonia, and the fastest way to get 4,000 common words into your ear. It costs money.",
  },
  {
    name: "Keeleklikk and Keeletee",
    body: "Free state-funded courses with a real teacher answering by email. Start there, and keep this open beside it.",
  },
  {
    name: "Anki",
    body: "Schedules anything you are willing to type. Finding the Estonian is your job, and so is getting it right.",
  },
  {
    name: "The vocabulary apps",
    body: "Drops, Mondly, Memrise, Ling and the rest do words well. This is aimed at which form of the word, and why.",
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
        Duolingo has never offered Estonian, so the real choice is between the tools that do. Of{" "}
        {CLAIM_COUNT.toLowerCase()} claims checked against their own public pages, somebody else
        earns a tick on {SHARED_ROWS}. None of them is trying to get you to{" "}
        <span lang="et" className="font-semibold">ma lähen tuppa</span> and knowing why it is not{" "}
        <span lang="et" className="font-semibold">tuba</span>.
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
        A tick is yes, a dash is their pages not saying so, a question mark is us not being able to
        tell. Checked in August 2026 against each product&rsquo;s own site. Every name belongs to
        its owner and none of them has endorsed this. If something is wrong, tell us and we will
        fix it.
      </p>
    </FaqItem>
  );
}

/* ───────────────────────────────────────────────────── questions ── */

/*
  TWO SENTENCES EACH, WHICH IS THE WHOLE EDIT.

  Every one of these was true and three of them ran past ninety words. A
  question somebody opened because they wanted a yes or a no was answered with
  a paragraph, and the thing they asked about was in the middle of it: the
  payment answer listed four daily limits with their numbers before saying the
  word that matters, which is no. A reader skims that and leaves knowing less
  than the heading told them.

  So each answer leads with the answer and stops. What went is the detail a
  reader only wants once they are inside, which is a screen they reach by
  signing in rather than a paragraph they scroll past to reach the button.
*/
const FAQS = [
  [
    "Do I need to pay for anything?",
    "No, and there is nothing to set up. A handful of things cost real money to run, so Anu, the writing grader and the camera have a daily allowance, and a normal evening never reaches one.",
  ],
  [
    "Where do the Estonian forms come from?",
    "Every form and example sentence comes from Ekilex, run by the Institute of the Estonian Language, and every English gloss from Wiktionary or the course itself. An AI is never allowed to write an Estonian form: it invents plausible ones that are wrong, and a flashcard would drill the mistake straight in. Where Anu translates a sentence for you, it says so on the sentence.",
  ],
  [
    "Is this only for beginners?",
    /*
      Main's rewrite of this answer, with the one word this branch is here for
      taken out of it. "A ten-minute check" was written when the paper was
      nineteen questions; it is eighty now and a skill climbs until it stops
      passing, so ten minutes is right for a beginner and three times out for
      anybody else, and the learner who is furthest through is the one it
      misleads. The shorter answer is main's and is better than what this
      branch had.
    */
    "It runs A1 to C1, and the parts that stay hard are taught on their own: a card for consonant gradation, a card for the case each verb demands, and a unit and a grammar page for whether an object is whole or partial. There is a level check if you would rather not guess where you are, and a mock state examination paper at A2, B1, B2 and C1.",
  ],
  [
    "Will it actually get me talking to people?",
    "That is what it is for. Situations puts you in front of somebody with an agenda of their own, a receptionist, a landlord, a clerk, and marks you against the dictionary rather than a model, so you cannot be told you were wrong when you were right. Today sets one small errand to do out loud, and Progress counts how those went, including the times somebody switched to English. Nothing here scores your pronunciation, because the only recogniser available gets native speakers wrong, and we would rather say so than pretend.",
  ],
  [
    "What happens to my data?",
    "It stays in your account, and you can download all of it from Settings whenever you like. Your review history is the one thing we could never rebuild, so nothing in it is ever changed or deleted.",
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
        {/*
          TWO ICONS SWAPPED, RATHER THAN ONE CHARACTER TURNED.

          It was the character "+", rotated 45 degrees when the question opens.
          A typed plus is a glyph on a baseline, and a baseline is not the
          middle of the line box: `items-center` centres the line box and the
          font then draws the bar wherever its own metrics say, which in Plus
          Jakarta is above centre. So every one of these circles was off centre,
          and the rotation spun the mark about a point that was not its own
          middle, which is why the cross wobbled as it turned. A lucide icon is
          drawn inside a square viewBox, so its centre is the centre of the box
          it is given, and it measures dead centre on both axes.

          THE ROTATION HAD TO GO WITH IT, and that is `test-containment`
          reading the icon correctly rather than a limitation to work around.
          It asks whether an icon is drawn at the size it declared, and
          `getBoundingClientRect` reports the box *after* an ancestor's
          transform: a 15px square turned 45 degrees is 21px across the axes,
          so the check called it deformed, at all three widths, and it was
          right that something was up. The character it replaced declared no
          width or height, so the check had skipped it and never had an opinion
          about the rotation before.

          A cross-fade of the two stacked on top of each other is the other
          way to keep the motion, and it trades this fault for the collision
          check instead. So the icon swaps: `hidden` is `display: none`, which
          is the one state that leaves nothing behind to measure or to sit
          under. What the animation was carrying was never the meaning anyway;
          the meaning is the mark, and the mark is now the right one and in the
          middle of its circle.
        */}
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          <Plus size={15} strokeWidth={2.5} className="group-open:hidden" />
          <X size={15} strokeWidth={2.5} className="hidden group-open:block" />
        </span>
      </summary>
      {children}
    </details>
  );
}

function Questions() {
  return (
    <section id="faq" className="mx-auto w-full max-w-4xl scroll-mt-24 px-5 md:px-8">
      <Reveal>
        {/*
          The same head as the two sections above it, eyebrow, heading, one
          line, because a heading standing alone over a list read as a
          different page starting. Sky, since that hue is reference material
          and this is the reference part of the page.
        */}
        <div className="mx-auto max-w-[52ch] text-center">
          <p className="label-xs" style={{ color: "var(--sky-ink)" }}>Questions</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            The questions people ask
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-md leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Short answers, and how this compares with the other apps is at the end.
          </p>
        </div>
      </Reveal>
      <div className="mt-10 flex flex-col gap-3 md:mt-14">
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
    <section id="start" className="w-full px-5 md:px-8">
      <Reveal>
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[var(--r-xl)] px-6 py-9 text-center md:px-16 md:py-12"
          style={{ background: "var(--accent-soft)" }}
        >
          <span aria-hidden className="wash" style={{ background: "var(--wash-2)", width: 420, height: 420, top: -160, right: -80 }} />
          <span aria-hidden className="wash" style={{ background: "var(--wash-3)", width: 380, height: 380, bottom: -200, left: -60, opacity: 0.5 }} />

          <div className="relative">
            <MascotWatch size={68} mood="cheer" className="float mx-auto" />
            {/*
              The break is placed, not left to the column.

              "Fifteen minutes. Starting today." is 884px of 52px display type
              and the panel has 896px inside its padding at the widest this
              page is drawn, so the one line it fits on is a line with twelve
              pixels to spare: a font that loads a hair wider, or a window a
              step narrower, and the wrap lands wherever it lands, which was
              "Starting" on the first line and "today." alone on the second.
              Two sentences break at the full stop between them or they do not
              break at all, and only one of those is available at every width.
            */}
            <h2 className="mx-auto mt-6 text-3xl font-bold leading-[1.08] tracking-tight md:text-5xl" style={{ color: "var(--ink)" }}>
              Fifteen minutes here.<br />Then say it to somebody.
            </h2>
            {/*
              The close pays off the section that opens the page's argument.

              It described the loop instead: look a word up, press once, let
              the scheduler remember. That is what the app does, and it is a
              third answer to a question the feature grid and this heading have
              both already answered. What it never said is what any of it is
              for. The cases section opens on somebody freezing when they are
              spoken to at a counter, and this is the same person a screen
              later, with something to say back.

              It opened "Start today" and lost the words: the heading two lines
              above it ends on "Starting today", and the same day named twice
              in three lines reads as a page that has forgotten what it just
              said. The heading carries the date, so the line under it carries
              the payoff and nothing else.
            */}
            <p className="mx-auto mt-4 max-w-[52ch] text-md leading-relaxed" style={{ color: "var(--ink-2)" }}>
              The next time somebody speaks to you in Estonian, you will have something to say
              back, and you will have said it before.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full sm:w-auto">
                Start learning for free <ArrowRight size={17} aria-hidden />
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

/**
 * The footer, with room in it.
 *
 * It was one row: the wordmark, a four-source credit run together as a single
 * sentence with the licences inside it, and three links, all at 12px, all on
 * one line at 1280 and wrapping into a lump under it. Crowded, and the credit
 * was the worst of it, because four institutions and three licences in one
 * sentence is a sentence nobody can find their way back into. Each source has
 * a line now, with what it gives and the terms it gives it under, the links
 * have a column, and the whole thing is set a size up with the air a last
 * screen can afford. The rule still sits well clear of the closing panel, so
 * the credits read as the end of the page and not as part of the card above.
 */
const SOURCES = [
  {
    name: "Ekilex",
    href: "https://ekilex.ee",
    by: "Institute of the Estonian Language",
    gives: "every form and example sentence",
    licence: "CC BY 4.0",
  },
  {
    name: "Wiktionary",
    href: "https://en.wiktionary.org",
    by: null,
    gives: "the English glosses",
    licence: "CC BY-SA 4.0",
  },
  {
    name: "FrequencyWords",
    href: "https://github.com/hermitdave/FrequencyWords",
    by: "over OpenSubtitles",
    gives: "the word counts",
    licence: "CC BY-SA 4.0",
  },
  {
    name: "TartuNLP",
    href: "https://tartunlp.ai",
    by: "University of Tartu",
    gives: "the speech",
    licence: null,
  },
] as const;

function Footer() {
  return (
    <footer className="landing-foot relative px-5 pb-14 md:px-8 md:pb-20">
      <div className="mx-auto max-w-6xl border-t pt-12 md:pt-16" style={{ borderColor: "var(--rule)" }}>
        <div className="grid gap-10 md:grid-cols-[1.1fr_1.5fr_auto] md:gap-14">
          <div>
            <Wordmark size={32} />
            <p className="mt-5 max-w-[34ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Kodukeel means home language. Free to use, and every Estonian form in it comes from a
              dictionary rather than a model.
            </p>
          </div>

          <div>
            <p className="label-xs" style={{ color: "var(--ink-3)" }}>Built on</p>
            <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {SOURCES.map((src) => (
                <li key={src.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-semibold" style={{ color: "var(--ink)" }}>
                    <a href={src.href} target="_blank" rel="noreferrer" className="underline underline-offset-4 transition-opacity hover:opacity-70">
                      {src.name}
                    </a>
                    {src.by ? <span className="font-normal" style={{ color: "var(--ink-2)" }}>, {src.by}</span> : null}
                  </span>
                  <span>{src.gives}</span>
                  {src.licence ? <span style={{ color: "var(--ink-3)" }}>&middot; {src.licence}</span> : null}
                </li>
              ))}
            </ul>
          </div>

          {/*
            The three pages a stranger is entitled to read before signing up,
            and until recently the landing page linked none of them: they were
            reachable only from each other and from two screens inside the
            app, which is behind the sign-in they exist to inform.
          */}
          <div>
            <p className="label-xs" style={{ color: "var(--ink-3)" }}>Read</p>
            <ul className="mt-4 flex flex-col gap-3 text-sm font-medium" style={{ color: "var(--ink-2)" }}>
              <li><Link href="/privacy" className="underline underline-offset-4 transition-opacity hover:opacity-70">Privacy</Link></li>
              <li><Link href="/terms" className="underline underline-offset-4 transition-opacity hover:opacity-70">Terms</Link></li>
              <li><Link href="/funding" className="underline underline-offset-4 transition-opacity hover:opacity-70">What it costs to run</Link></li>
              <li><Link href="/sign-in" className="underline underline-offset-4 transition-opacity hover:opacity-70">Sign in</Link></li>
            </ul>
          </div>
        </div>
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
        where: { lemma: { in: [...DEMO_LEMMAS] } },
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
    const words = oneEntryPerLemma(lexemes, [...DEMO_LEMMAS]).flatMap((lex) => {
      const form = (t: string) => lex.forms.find((f) => f.formType === t)?.value;
      const isVerb = lex.pos === "VERB";

      // The three facts a case question is worded from. Two of the five words
      // on this card are people; see lib/estonian/caseQuestion.ts.
      const subject = {
        lemma: lex.lemma,
        semanticTypes: lex.semanticTypes,
        nomSg: form("NOM_SG") ?? null,
      };

      // Labelled the way a course labels them. The three noun parts are the
      // three questions every Estonian schoolbook drills them by, and a visitor
      // who has been to one lesson recognises them.
      const principal = (isVerb
        ? [["ma-tegevusnimi", form("INF_MA")], ["da-tegevusnimi", form("INF_DA")], ["olevik · ma", form("PRES_1SG")], ["lihtminevik · ma", form("PAST_1SG")]]
        : [
            [`nimetav · ${caseQuestionFor(caseByKey("NOMINATIVE")!, subject)}`, form("NOM_SG")],
            [`omastav · ${caseQuestionFor(caseByKey("GENITIVE")!, subject)}`, form("GEN_SG")],
            [`osastav · ${caseQuestionFor(caseByKey("PARTITIVE")!, subject)}`, form("PART_SG")],
          ]
      ).flatMap(([label, value]) => (label && value ? [{ label, value }] : []));

      const table = isVerb
        ? []
        : buildCaseTable(stemsFrom(lex.forms));


      return [{
        lemma: lex.lemma,
        genitive: form("GEN_SG") ?? null,
        principal,
        cases: table.map((row) => demoCase(row, subject, form("GEN_SG") ?? null)),
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
 * been seeded yet, which is the state a fresh deployment builds in, so this
 * path is load-bearing rather than theoretical.
 *
 * The stems are copied verbatim from the checked seed data and live in
 * `lib/collections/demoWords.ts` beside the list of words to ask for; the rest
 * is derived by `buildCaseTable()`, exactly as the live path does it, down to
 * the short illative going in with the forms you memorise. Nothing here is a
 * hand-written Estonian form, and `scripts/test-invariants.ts` checks the copy
 * against the built dictionary rather than trusting that it was copied.
 */
/** The same three facts, off the fallback stems, which carry them by name. */
const demoSubject = (w: DemoStems) => ({
  lemma: w.lemma, semanticTypes: w.semanticTypes, nomSg: w.nomSg,
});

const FALLBACK_WORDS: DemoWord[] = DEMO_STEMS.map((w) => {
  const table = buildCaseTable(w);
  return {
    lemma: w.lemma,
    genitive: w.genSg,
    principal: [
      { label: `nimetav · ${caseQuestionFor(caseByKey("NOMINATIVE")!, demoSubject(w))}`, value: w.nomSg },
      { label: `omastav · ${caseQuestionFor(caseByKey("GENITIVE")!, demoSubject(w))}`, value: w.genSg },
      { label: `osastav · ${caseQuestionFor(caseByKey("PARTITIVE")!, demoSubject(w))}`, value: w.partSg },
    ],
    cases: table.map((row) => demoCase(row, demoSubject(w), w.genSg)),
  };
});

/**
 * One row of the card, from one row of the case table.
 *
 * THE SHORT ILLATIVE STAYS IN ITS OWN ROW. It used to be promoted into the
 * left column, with the forms you memorise, on the argument that `tuppa` is
 * not `toa` with an ending on it and so has to be learnt. True, and it made
 * the card a different shape for `tuba` than for `raamat`: four rows against
 * three on the left, ten against eleven on the right, and a card that changed
 * height under the pointer on every press. The claim is kept and the shape is
 * not: every word draws three rows and eleven, and the illative's row is where
 * the exception is said, in words, beside both spellings.
 *
 * `stored` is decided by comparing the printed form with the stem plus the
 * ending rather than by reading `origin`, because an entry enriched from
 * Ekilex carries a lexicographer's form for every case and every one of them
 * would read as stored, which is true and is not what the chip means. The
 * chip means no rule reaches this one.
 */
function demoCase(row: DerivedForm, subject: CaseSubject, genitive: string | null): DemoCase {
  const shown = shownForms(row);
  /*
    Regular means the printed form is the genitive with this case's ending on
    it. Read off the form rather than built up from the stem, because joining
    a suffix to a stem is derive.ts's job alone and an invariant says so: the
    question here is only whether what derive.ts printed is the rule's own
    answer or a form the dictionary had to supply.
  */
  const first = shown[0] ?? "";
  const { suffix } = row.spec;
  const regular = genitive !== null && suffix.length > 0
    && first.endsWith(suffix) && first.slice(0, -suffix.length) === genitive;
  return {
    en: row.spec.en,
    et: row.spec.et,
    /*
      The question *this* word answers. Two of the five words on this card are
      people, so the `mille-` series printed `milles?` over `mehes` and
      `sõbras`, which is the interrogative for a thing asked about a `kes` on
      the app's own front page. Every row is still shown, because a table of
      forms is a reference rather than a question. See
      lib/estonian/caseQuestion.ts.
    */
    question: caseQuestionFor(row.spec, subject),
    singular: shown.length > 0 ? shown.join(" / ") : null,
    plural: row.plural ?? null,
    principal: row.spec.principal,
    stored: !row.spec.principal && shown.length > 0 && !regular,
  };
}
