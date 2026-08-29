import Link from "next/link";
import {
  CircleHelp, Ear, GraduationCap, Grid2x2, Headphones, Mic, PenLine, Puzzle, Scale,
  ScissorsLineDashed, Stethoscope, Target, Zap,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot } from "@/lib/progress/summary";
import { caseAccuracy } from "@/lib/stats/history";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { isBuildable } from "@/lib/estonian/cloze";
import { dictationWords } from "@/lib/estonian/dictation";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Meter, Page, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Every way to practise, in one place, with the state that decides whether each
 * one is worth doing right now — how many cards are due, your best sprint, your
 * fastest match. A hub that just lists modes makes you guess; this one answers
 * "what should I do with the next five minutes".
 */
export default async function PracticePage() {
  const ownerId = await requireUserId();
  const [snapshot, settings, caseReviews, sentenceReady] = await Promise.all([
    deckSnapshot(ownerId),
    readSettings(ownerId, [SETTING_KEYS.sprintBest, SETTING_KEYS.matchBest]),
    prisma.review.findMany({
      where: { targetCase: { not: null }, ownerId },
      select: { targetCase: true, rating: true },
      take: 5000,
    }),
    prisma.card.findMany({
      where: { ownerId, suspended: false, lexemeId: { not: null } },
      distinct: ["lexemeId"],
      take: 300,
      select: { lexeme: { select: { examples: true } } },
    }),
  ]);

  const sprintBest = numberSetting(settings[SETTING_KEYS.sprintBest], 0);
  // How many of the learner's own words carry a sentence worth rebuilding.
  const sentenceCount = sentenceReady.filter((c) =>
    usableExamples(parseExamples(c.lexeme?.examples)).some((e) => isBuildable(e.et)),
  ).length;
  // Dictation is stricter: only sentences short enough to hold in your head.
  const dictationCount = sentenceReady.filter((c) =>
    usableExamples(parseExamples(c.lexeme?.examples)).some((e) => {
      const count = dictationWords(e.et).length;
      return count >= 3 && count <= 9 && e.et.length <= 80;
    }),
  ).length;
  const matchBest = numberSetting(settings[SETTING_KEYS.matchBest], 0);
  const weakCases = caseAccuracy(caseReviews).slice(0, 5);

  const modes = [
    {
      href: "/review",
      icon: GraduationCap,
      tone: "accent",
      title: "Review",
      subtitle: "The daily loop",
      body: "Everything due, scheduled by FSRS. Type the answer or flip the card, your choice in Settings.",
      meta: snapshot.dueCount > 0
        ? `${snapshot.dueCount} due now`
        : snapshot.newCount > 0 ? `${Math.min(snapshot.newCount, 10)} new waiting` : "Nothing due",
      primary: snapshot.dueCount > 0,
    },
    {
      href: "/review/write",
      icon: PenLine,
      tone: "mint",
      title: "Writing",
      subtitle: "Your own sentence",
      body:
        "Use a word in a named case and write a whole sentence. The form is checked against the " +
        "dictionary before Anu ever sees it, so the verdict is certain even when the AI is off.",
      meta: "Free production",
      primary: false,
    },
    {
      href: "/review/government",
      icon: Scale,
      tone: "peach",
      title: "Verb government",
      subtitle: "Which case?",
      body:
        "Aitan sind, but helistan sulle. English gives you no clue, so rektsioon has to be learned " +
        "per verb, and nothing else drills it systematically.",
      meta: "Multiple choice",
      primary: false,
    },
    {
      href: "/review/pairs",
      icon: Ear,
      tone: "sky",
      title: "Minimal pairs",
      subtitle: "Long or short",
      body:
        "Maja or majja? The length distinction Estonian spelling only half records, and the one " +
        "thing reading practice can never teach you.",
      meta: "Needs audio",
      primary: false,
    },
    {
      href: "/review/cloze",
      icon: ScissorsLineDashed,
      tone: "butter",
      title: "From your reading",
      subtitle: "Paste real Estonian",
      body:
        "Bring an article or your homework. Words already in your deck get blanked out, and the " +
        "answer is the form a native writer actually chose.",
      meta: "Your own text",
      primary: false,
    },
    {
      href: "/review/clinic",
      icon: Stethoscope,
      tone: "blush",
      title: "Leech clinic",
      subtitle: "What keeps failing",
      body:
        "The handful of cards you keep getting wrong, with what their history says about how they " +
        "are failing, instead of quietly burying them.",
      meta: "From your review log",
      primary: false,
    },
    {
      href: "/review/sprint",
      icon: Zap,
      tone: "butter",
      title: "Case Sprint",
      subtitle: "60 seconds",
      body: "As many cards as you can in a minute, weighted towards the ones you keep slipping on.",
      meta: sprintBest > 0 ? `Best: ${sprintBest}` : "No score yet",
      primary: false,
    },
    {
      href: "/review/match",
      icon: Grid2x2,
      tone: "mint",
      title: "Match",
      subtitle: "Eight pairs",
      body: "Pair each word with its meaning against the clock. Clean pairs count as a review.",
      meta: matchBest > 0 ? `Best: ${matchBest}s` : "No time yet",
      primary: false,
    },
    {
      href: "/review/sentences",
      icon: Puzzle,
      tone: "blush",
      title: "Sentences",
      subtitle: "Word order",
      body: "Rebuild a real Estonian sentence from its words. The part a flashcard cannot teach.",
      meta: sentenceCount > 0 ? `${sentenceCount} ready` : "Needs sentences",
      primary: false,
    },
    {
      href: "/review/speaking",
      icon: Mic,
      tone: "peach",
      title: "Speaking",
      subtitle: "Out loud",
      body: "Say the word, then hear a native voice and your own recording back to back.",
      meta: "Shadowing",
      primary: false,
    },
    {
      href: "/review/listening",
      icon: Headphones,
      tone: "sky",
      title: "Listening",
      subtitle: "Ear first",
      body: "Hear an Estonian word and pick the meaning, the one skill reading practice never builds.",
      meta: "Audio from TartuNLP",
      primary: false,
    },
    {
      href: "/review/dictation",
      icon: Ear,
      tone: "peach",
      title: "Dictation",
      subtitle: "Hear it, write it",
      body: "A whole sentence, played and typed back. Marked word by word, so you see which ending you missed.",
      meta: dictationCount > 0 ? `${dictationCount} ready` : "Needs sentences",
      primary: false,
    },
  ];

  return (
    <Page
      title="Practice"
      lead="Seven ways to work the same deck, plus a drill for whichever case you keep missing. They all write to the same review log, so anything you do here moves the same schedule forward."
    >
      {snapshot.totalCards === 0 ? (
        <Empty
          title="Nothing to practise yet"
          body="Every mode here draws on your own deck. Start a unit on the path and all of them light up at once."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="lift flex flex-col gap-2 rounded-[var(--r-lg)] border p-5"
                style={{
                  borderColor: m.primary ? "var(--accent)" : "var(--rule)",
                  background: "var(--surface)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full"
                    style={{
                      background: `var(--${m.tone})`,
                      color: "var(--surface)",
                    }}
                  >
                    <m.icon size={19} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="est block text-lg font-bold" style={{ color: "var(--ink)" }}>
                      {m.title}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{m.subtitle}</span>
                  </span>
                  <span className="ml-auto"><Chip tone={m.primary ? "accent" : "neutral"}>{m.meta}</Chip></span>
                </span>
                <span className="text-sm" style={{ color: "var(--ink-2)" }}>{m.body}</span>
              </Link>
            ))}
          </div>

          <section>
            <SectionTitle hint="weakest first">Drill one case</SectionTitle>
            <Card>
              {weakCases.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                  Once you have answered a few case-form cards, the cases you keep missing show up
                  here with a one-click drill. Add a noun unit from the{" "}
                  <Link href="/learn" className="underline" style={{ color: "var(--accent-deep)" }}>path</Link>{" "}
                  to start generating them.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {weakCases.map((c) => (
                    <li key={c.grammCase} className="flex items-center gap-1">
                      <Link
                        href={`/review?case=${c.grammCase}`}
                        className="flex flex-1 items-center gap-3 rounded-[var(--r)] px-2 py-1.5 transition-opacity hover:opacity-75"
                        aria-label={`Drill the ${c.grammCase.toLowerCase()}, currently ${c.accuracy} percent over ${c.total} reviews`}
                      >
                        <Target size={15} aria-hidden style={{ color: "var(--ink-3)" }} />
                        <span className="w-28 text-sm" style={{ color: "var(--ink-2)" }}>
                          {c.grammCase.toLowerCase()}
                        </span>
                        <span className="max-w-[200px] flex-1">
                          <Meter
                            pct={c.accuracy}
                            label={`${c.grammCase.toLowerCase()} accuracy`}
                            tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                            height={5}
                          />
                        </span>
                        <span className="tnum w-20 text-right text-xs" style={{ color: "var(--ink-3)" }}>
                          {c.accuracy}% · {c.total}
                        </span>
                      </Link>
                      <Link
                        href={`/grammar/${c.grammCase.toLowerCase()}`}
                        aria-label={`What the ${c.grammCase.toLowerCase()} is for`}
                        title={`What the ${c.grammCase.toLowerCase()} is for`}
                        className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        <CircleHelp size={14} aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}
    </Page>
  );
}
