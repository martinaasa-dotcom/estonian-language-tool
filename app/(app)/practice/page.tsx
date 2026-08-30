import Link from "next/link";
import type { ComponentType } from "react";
import {
  CircleHelp, ClipboardCheck, Ear, GraduationCap, Grid2x2, Headphones, Mic, PenLine, Puzzle, Scale,
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

  /*
    Grouped, not listed.

    Thirteen cards, each carrying a two sentence paragraph, is thirteen
    paragraphs to read before pressing anything, and the page's own promise is
    that it answers "what should I do with the next five minutes". A flat grid
    cannot answer that; the grouping is the answer. So: the daily loop leads,
    the games that need nothing but a deck come next as tiles you can scan, the
    five that work a specific weakness follow with the one line each that says
    what the weakness is, and the mock paper sits on its own at the bottom
    because sitting one is an afternoon rather than five minutes.

    The body copy that came off the games is not lost, it was never the reason
    anybody pressed them: a title, what it does in three words, and whether
    there is anything ready to play is the whole decision.
  */
  const daily = {
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
  };

  const games = [
    {
      href: "/review/sprint", icon: Zap, tone: "butter", title: "Case Sprint", subtitle: "60 seconds",
      meta: sprintBest > 0 ? `Best: ${sprintBest}` : "No score yet",
    },
    {
      href: "/review/match", icon: Grid2x2, tone: "mint", title: "Match", subtitle: "Eight pairs",
      meta: matchBest > 0 ? `Best: ${matchBest}s` : "No time yet",
    },
    {
      href: "/review/sentences", icon: Puzzle, tone: "blush", title: "Sentences", subtitle: "Word order",
      meta: sentenceCount > 0 ? `${sentenceCount} ready` : "Needs sentences",
    },
    {
      href: "/review/listening", icon: Headphones, tone: "sky", title: "Listening", subtitle: "Hear it, pick it",
      meta: "Audio from TartuNLP",
    },
    {
      href: "/review/dictation", icon: Ear, tone: "peach", title: "Dictation", subtitle: "Hear it, write it",
      meta: dictationCount > 0 ? `${dictationCount} ready` : "Needs sentences",
    },
    {
      href: "/review/speaking", icon: Mic, tone: "peach", title: "Speaking", subtitle: "Out loud",
      meta: "Shadowing",
    },
  ];

  const targeted = [
    {
      href: "/review/write",
      icon: PenLine,
      tone: "mint",
      title: "Writing",
      subtitle: "Your own sentence",
      body:
        "Use a word in a named case. The form is checked against the dictionary before Anu ever " +
        "sees it, so the verdict is certain even when the AI is off.",
      meta: "Free production",
    },
    {
      href: "/review/government",
      icon: Scale,
      tone: "peach",
      title: "Verb government",
      subtitle: "Which case?",
      body:
        "Aitan sind, but helistan sulle. English gives you no clue, so rektsioon has to be learned " +
        "per verb.",
      meta: "Multiple choice",
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
    },
  ];

  return (
    <Page
      title="Practice"
      lead="Every mode here writes to the same review log, so nothing you do is a side game with a score of its own."
    >
      {snapshot.totalCards === 0 ? (
        <Empty
          title="Nothing to practise yet"
          body="Every mode here draws on your own deck. Start a unit on the path and all of them light up at once."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-7">
          <ModeCard mode={daily} />

          <section>
            <SectionTitle hint="a few minutes each">Quick rounds</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="lift flex items-center gap-3 rounded-[var(--r-lg)] border p-4"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `var(--${m.tone})`, color: "var(--surface)" }}
                  >
                    <m.icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="est block text-base font-bold" style={{ color: "var(--ink)" }}>{m.title}</span>
                    <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                      {m.subtitle} · {m.meta}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle hint="when you know what is wrong">Work a weakness</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {targeted.map((m) => <ModeCard key={m.href} mode={m} />)}
            </div>
          </section>

          <section>
            <SectionTitle hint="an afternoon, not five minutes">Sit the paper</SectionTitle>
            <Link
              href="/exam"
              className="lift flex items-center gap-4 rounded-[var(--r-lg)] border p-5"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--blush)", color: "var(--surface)" }}
              >
                <ClipboardCheck size={19} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="est block text-lg font-bold" style={{ color: "var(--ink)" }}>Mock exam</span>
                <span className="mt-1 block text-sm" style={{ color: "var(--ink-2)" }}>
                  An imitation of the A2, B1, B2 or C1 state paper. Four parts, sixty percent to
                  pass, and a zero anywhere fails the whole thing.
                </span>
              </span>
            </Link>
          </section>

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

/**
 * A mode with a reason to open it: the daily loop, and the five that work one
 * specific weakness. The quick rounds do not get one, because a title and
 * whether there is anything ready is the whole decision there and a paragraph
 * beside it is a paragraph nobody reads twice.
 */
function ModeCard({ mode }: {
  mode: {
    href: string;
    icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    tone: string;
    title: string;
    subtitle: string;
    body: string;
    meta: string;
    primary?: boolean;
  };
}) {
  return (
    <Link
      href={mode.href}
      className="lift flex h-full flex-col gap-2 rounded-[var(--r-lg)] border p-5"
      style={{
        borderColor: mode.primary ? "var(--accent)" : "var(--rule)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: `var(--${mode.tone})`, color: "var(--surface)" }}
        >
          <mode.icon size={19} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="est block text-lg font-bold" style={{ color: "var(--ink)" }}>{mode.title}</span>
          <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{mode.subtitle}</span>
        </span>
        <span className="ml-auto"><Chip tone={mode.primary ? "accent" : "neutral"}>{mode.meta}</Chip></span>
      </span>
      <span className="text-sm" style={{ color: "var(--ink-2)" }}>{mode.body}</span>
    </Link>
  );
}
