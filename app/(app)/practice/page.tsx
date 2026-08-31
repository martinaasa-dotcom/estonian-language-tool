import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot } from "@/lib/progress/summary";
import { caseAccuracy } from "@/lib/stats/history";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { isBuildable } from "@/lib/estonian/cloze";
import { dictationWords } from "@/lib/estonian/dictation";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { QUICK_MODES, TARGETED_MODES, type PracticeMode } from "@/lib/ux/modes";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { WeakestCases } from "@/components/WeakestCases";
import { Card, Chip, Empty, Page, SectionTitle, Stack } from "@/components/ui";

export const metadata = { title: "Practice" };

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
  const dailyMeta = snapshot.dueCount > 0
    ? `${snapshot.dueCount} due now`
    : snapshot.newCount > 0 ? `${Math.min(snapshot.newCount, 10)} new waiting` : "Nothing due";

  /*
    What is ready right now, per mode. The table in lib/ux/modes.ts says what
    each mode *is*; this says what it is like today, which is a database
    question and so cannot live beside the copy. Anything absent here falls
    back to the mode's own standing note.
  */
  const live: Record<string, string | undefined> = {
    "/review/sprint": sprintBest > 0 ? `Best: ${sprintBest}` : undefined,
    "/review/match": matchBest > 0 ? `Best: ${matchBest}s` : undefined,
    "/review/sentences": sentenceCount > 0 ? `${sentenceCount} ready` : undefined,
    "/review/dictation": dictationCount > 0 ? `${dictationCount} ready` : undefined,
  };
  const metaFor = (mode: PracticeMode) => live[mode.href] ?? mode.note;

  return (
    <Page title="Practice" lead="Every mode grades the same cards.">
      {snapshot.totalCards === 0 ? (
        <Empty
          title="Nothing to practise yet"
          body="Every mode here draws on your own deck."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      ) : (
        <Stack>
          <ModeCard
            href="/review"
            iconName="GraduationCap"
            tone="accent"
            title="Review"
            subtitle="The daily loop"
            body="Everything due, scheduled by FSRS."
            meta={dailyMeta}
            primary={snapshot.dueCount > 0}
          />

          <section>
            <SectionTitle hint="a few minutes each">Quick rounds</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_MODES.map((m) => (
                <ModeTile key={m.href} mode={m} meta={metaFor(m)} />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle hint="when you know what is wrong">Work a weakness</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TARGETED_MODES.map((m) => (
                <ModeTile key={m.href} mode={m} meta={metaFor(m)} />
              ))}
              {/*
                The paper sits in the same grid rather than under a heading of
                its own. It is a different size of commitment, which is what
                the chip says; it is not a different kind of question, and a
                section containing one row was three lines of chrome around it.
              */}
              <Link
                href="/exam"
                className="lift flex items-center gap-3 rounded-[var(--r-lg)] border p-4"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--blush)", color: "var(--surface)" }}
                >
                  <ClipboardCheck size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="est block text-base font-bold" style={{ color: "var(--ink)" }}>Mock exam</span>
                  <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                    A2 to C1 · an afternoon
                  </span>
                </span>
              </Link>
            </div>
          </section>

          <section>
            <SectionTitle hint="weakest first">Drill one case</SectionTitle>
            <Card>
              <WeakestCases
                cases={weakCases}
                empty={
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                    Answer a few case-form cards and the ones you keep missing show up here. Add a
                    noun unit from the{" "}
                    <Link href="/learn" className="underline" style={{ color: "var(--accent-deep)" }}>path</Link>.
                  </p>
                }
              />
            </Card>
          </section>
        </Stack>
      )}
    </Page>
  );
}

/**
 * One mode, at the size the decision actually needs.
 *
 * Every mode but the daily loop is drawn this way now. The five targeted ones
 * each carried `blurb` as a two or three line paragraph and the mock paper
 * carried a sixth, on a page whose own promise is answering "what should I do
 * with the next five minutes". Six paragraphs is not an answer to that, and
 * the quick rounds sitting directly above them had already shown what is: a
 * title, three words, and whether there is anything ready to play.
 *
 * The blurbs are not deleted, and this is the argument for the split rather
 * than for cutting them. `components/CommandPalette.tsx` shows one as the hint
 * under each mode and searches its words, which is where somebody is reading a
 * description rather than scanning a grid. A sentence explaining rektsioon
 * earns its place where you are looking for the thing; it does not earn its
 * place eleven times over on the page you press.
 */
function ModeTile({ mode, meta }: { mode: PracticeMode; meta: string }) {
  const Icon = icon(mode.icon);
  return (
    <Link
      href={mode.href}
      className="lift flex items-center gap-3 rounded-[var(--r-lg)] border p-4"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: `var(--${mode.tone})`, color: "var(--surface)" }}
      >
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="est block text-base font-bold" style={{ color: "var(--ink)" }}>{mode.title}</span>
        <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
          {mode.subtitle} · {meta}
        </span>
      </span>
    </Link>
  );
}

/** The daily loop, and only the daily loop. Everything else is a tile. */
function ModeCard({ href, iconName, tone, title, subtitle, body, meta, primary }: {
  href: string;
  iconName: string;
  tone: string;
  title: string;
  subtitle: string;
  body: string;
  meta: string;
  primary?: boolean;
}) {
  const Icon = icon(iconName);
  return (
    <Link
      href={href}
      className="lift flex h-full flex-col gap-2 rounded-[var(--r-lg)] border p-5"
      style={{
        borderColor: primary ? "var(--accent)" : "var(--rule)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: `var(--${tone})`, color: "var(--surface)" }}
        >
          <Icon size={19} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="est block text-lg font-bold" style={{ color: "var(--ink)" }}>{title}</span>
          <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{subtitle}</span>
        </span>
        <span className="ml-auto"><Chip tone={primary ? "accent" : "neutral"}>{meta}</Chip></span>
      </span>
      <span className="text-sm" style={{ color: "var(--ink-2)" }}>{body}</span>
    </Link>
  );
}
