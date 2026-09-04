import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ClipboardCheck, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot } from "@/lib/progress/summary";
import { caseAccuracy } from "@/lib/stats/history";
import { caseReviewsFor } from "@/lib/progress/cases";
import { masteryCounts, masteryFor } from "@/lib/progress/mastery";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { isBuildable } from "@/lib/estonian/cloze";
import { dictationWords } from "@/lib/estonian/dictation";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { GAMES, QUICK_MODES, modeAt, type PracticeMode } from "@/lib/ux/modes";
import { COMMON_GROUPS } from "@/lib/collections/commonGroups";
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
  const [snapshot, settings, caseReviews, sentenceReady, words] = await Promise.all([
    deckSnapshot(ownerId),
    readSettings(ownerId, [SETTING_KEYS.sprintBest, SETTING_KEYS.matchBest]),
    // The one reader, so Practice and Progress cannot disagree about which case
    // a learner is worst at. See lib/progress/cases.ts.
    caseReviewsFor(ownerId),
    /*
      The learner's own words, asked for as words.

      This was a `findMany` over their cards with `distinct: ["lexemeId"]` and
      `take: 300`, which is the page's heaviest read and only looked bounded.
      Prisma deduplicates in the client, so a `LIMIT` would cut rows before the
      deduplication and it emits none: the SQL was every card this learner
      owns, and then `examples`, the longest column in the schema, fetched once
      per card rather than once per word. A word with five card types was read
      five times.

      Asking Lexeme instead is one row per word by construction, so the cap is
      a real `LIMIT` and the join happens once. Two thousand is past any deck
      somebody has actually built, and ordered, so a learner who does get there
      is told the same number twice rather than a different one each load.
    */
    prisma.lexeme.findMany({
      where: { cards: { some: { ownerId, suspended: false } } },
      orderBy: { lemma: "asc" },
      take: 2000,
      select: { examples: true },
    }),
    // Where every met word stands. The same read the Flash cards round makes,
    // so the count on its tile and the round behind it are one answer.
    masteryFor(ownerId),
  ]);

  const sprintBest = numberSetting(settings[SETTING_KEYS.sprintBest], 0);
  /*
    Parsed once and asked twice. Each of these used to call `parseExamples` for
    itself, which is a `JSON.parse` per word per question, and the cap above is
    now a real one at two thousand rather than a number that was not in the SQL.
    Two thousand words is four thousand parses for two integers.

    Sentence building wants a sentence worth rebuilding; dictation is stricter,
    since it has to be short enough to hold in your head.
  */
  const usable = sentenceReady.map((w) => usableExamples(parseExamples(w.examples)));
  const sentenceCount = usable.filter((es) => es.some((e) => isBuildable(e.et))).length;
  const dictationCount = usable.filter((es) => es.some((e) => {
    const count = dictationWords(e.et).length;
    return count >= 3 && count <= 9 && e.et.length <= 80;
  })).length;
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
  /*
    What the top slot says about itself: how many met words are not yet
    mastered, which is the number the round is about. `masteryCounts` and the
    round read one query, so the tile cannot promise words the round will not
    find.
  */
  /*
    What Review would put in front of them right now: due cards plus the unseen
    ones it trickles in, drawn the same way Today draws it. A tile saying
    "Nothing due" over a session with ten cards in it is the sort of small
    inconsistency a reader catches once and then stops trusting.
  */
  const ready = Math.min(snapshot.dueCount + Math.min(snapshot.newForPractice, 10), 60);

  const counts = masteryCounts(words);
  const unfinished = counts.struggling + counts.almost + counts.learning;
  const flashMeta = unfinished > 0
    ? `${unfinished} to work on`
    : words.length > 0 ? "All mastered" : "Nothing met yet";

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
    <Page title="Practice" lead="Words you have already learned, asked every way there is.">
      {snapshot.totalCards === 0 ? (
        <Empty
          title="Nothing to practise yet"
          body="Every mode here draws on your own deck."
          action={<ButtonLink href="/learn" variant="primary">Learn some words first</ButtonLink>}
        />
      ) : (
        <Stack>
          {/*
            THE TOP SLOT IS THE SCHEDULE, AND IT DID NOT USED TO BE.

            It was Flash cards, on the argument that `/review` is the page most
            people arrived here from, so leading with it offered somebody the
            door they had just come through. That was true while Review was a
            row in the rail. It is not any more: the daily row is Learn, review
            lives inside this page (`lib/ux/nav.ts`), and a learner who opens
            Practice with cards due has come here for exactly that. Leaving it
            out would make the one thing this page is for reachable only from
            Today.

            Flash cards keeps its slot directly under it, which is what it is:
            the words review has already introduced, asked in a way it does not
            ask them, across a variety of case endings, until the app can be
            confident the word is known. See lib/srs/mastery.ts for what
            confident means.
          */}
          <ModeCard
            href="/review"
            iconName="GraduationCap"
            tone="accent"
            title="Review"
            subtitle="Everything due"
            body="Timed to the moment before you forget. The schedule decides what comes back, not you."
            meta={ready > 0 ? `${ready} waiting` : "Nothing due"}
            primary={ready > 0}
          />

          {/*
            THE ROUND THAT IS NOT A ROUND. A situation is five to eight minutes
            with somebody who has an agenda of their own, and it is where the
            words above get used on a person rather than recalled. It has a
            row of its own in the rail; it is here too because this is the
            screen somebody is on when they have ten minutes and want to use
            them.
          */}
          <ModeCard
            href="/situations"
            iconName="MessagesSquare"
            tone="blush"
            title="Situations"
            subtitle="Somebody behind a desk"
            body="A receptionist, a landlord, a shop. Get done what you came for, in Estonian, with things going wrong on purpose."
            meta="five to eight minutes"
          />

          <ModeCard
            href="/review/flashcards"
            iconName="Layers"
            tone="accent"
            title="Flash cards"
            subtitle="Words you have met"
            body="Type it, hear it in a sentence, or write one of your own. A new form each time."
            meta={flashMeta}
            primary={unfinished > 0 && ready === 0}
          />

          {/*
            THE SAME ROUND, POINTED AT THE WORDS EVERYBODY MEETS FIRST.

            Flash cards above works the deck you have. This works a deck
            nobody has to build a decision about: the hundred commonest words
            of each kind, counted over a corpus rather than chosen, which is
            the one question the course cannot answer because it teaches in
            themes. See lib/collections/frequency.ts.

            Four buttons rather than one, because the four lists are four
            different sittings and picking one is the whole decision. They go
            straight to the round, so this is one press; the card's own title
            goes to the index, which carries the counts and the way to build
            the next twenty out.
          */}
          <CommonWordsCard />

          {/*
            AND WHERE THOSE WORDS STAND, BESIDE THE ROUNDS THAT MOVE THEM.

            The lists were on `/words` and nowhere else, three cards down a page
            about the deck, and the learner reported that they could not find
            them. This is the screen they were standing on when they wanted
            them: the two rounds above work on the words that are not done, and
            this says which those are and what each one is still short of.
          */}
          {words.length > 0 && (
            <Link
              href="/words/mastery"
              className="lift flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--r-lg)] border p-4"
              style={{
                borderColor: "var(--rule)", background: "var(--surface)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                Where your words stand
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                <span><span className="tnum" style={{ color: "var(--mint-ink)" }}>{counts.mastered}</span> mastered</span>
                <span><span className="tnum" style={{ color: "var(--butter-ink)" }}>{counts.almost}</span> almost there</span>
                <span><span className="tnum" style={{ color: "var(--peach-ink)" }}>{counts.struggling}</span> need work</span>
              </span>
            </Link>
          )}

          <section>
            <SectionTitle hint="a few minutes each">Rounds</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_MODES.map((m) => (
                <ModeTile key={m.href} mode={m} meta={metaFor(m)} />
              ))}
            </div>
          </section>

          {/*
            THE GAMES, WHICH ARE ROUNDS THAT ARE NOT ABOUT THE SCHEDULE.

            Drawn from the table rather than listed here, so a game added to
            `lib/ux/modes.ts` with `within: "/practice"` appears without anybody
            remembering this file. That is not tidiness: Picture match and Target
            shipped claiming to be reached from here while nothing here linked to
            them, so both were unfindable outside the command palette, and
            `nav.test.ts` is what said so.

            A section of their own rather than seven tiles in the grid above,
            because the six rounds are six hues and a seventh would have to
            borrow one and read as a duplicate of whichever it took.
          */}
          {GAMES.length > 0 && (
            <section>
              <SectionTitle hint="for the fun of it">Games</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {GAMES.map((m) => (
                  <ModeTile key={m.href} mode={m} meta={metaFor(m)} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle hint="an afternoon, not five minutes">Sit the paper</SectionTitle>
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
                <span className="block text-base font-bold" style={{ color: "var(--ink)" }}>Mock exam</span>
                <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                  A2 to C1 · four parts · sixty percent to pass
                </span>
              </span>
            </Link>
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
        <span className="block text-base font-bold" style={{ color: "var(--ink)" }}>{mode.title}</span>
        <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
          {mode.subtitle} · {meta}
        </span>
      </span>
    </Link>
  );
}

/**
 * THE FOUR FREQUENCY LISTS, AS FOUR DOORS.
 *
 * Shaped like `ModeCard` above, and not built out of it, because that one is a
 * `Link` wrapping the whole card and this one has four links inside it. Nesting
 * those would be a link inside a link, which is invalid and which no browser
 * agrees about.
 *
 * Every string comes from `lib/ux/modes.ts` and
 * `lib/collections/commonGroups.ts` rather than from here, so a list renamed
 * once is renamed on the dictionary's page, the round index, the round and this
 * card together. That is the fault this app has fixed four times over: the same
 * mode was called two things on two screens because two files described it.
 *
 * Each button carries its own label for a screen reader, since "Verbs" on its
 * own is a word rather than a destination, and clears the 44px floor under a
 * coarse pointer like every other control here.
 */
function CommonWordsCard() {
  const mode = modeAt("/review/common");
  if (!mode) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-[var(--r-lg)] border p-5"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: `var(--${mode.tone})`, color: "var(--surface)" }}
        >
          <TrendingUp size={19} aria-hidden />
        </span>
        <span className="min-w-0">
          <Link
            href={mode.href}
            className="block text-lg font-bold underline-offset-4 hover:underline"
            style={{ color: "var(--ink)" }}
          >
            {mode.title}
          </Link>
          <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{mode.subtitle}</span>
        </span>
        <span className="ml-auto"><Chip tone="neutral">{mode.note}</Chip></span>
      </div>

      <p className="text-sm" style={{ color: "var(--ink-2)" }}>
        {"These are the ones you will hear most, so let's get them down."}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {COMMON_GROUPS.map((group) => (
          <Link
            key={group.key}
            href={`/review/common/${group.slug}`}
            aria-label={`Flash cards: most common ${group.title.toLowerCase()}`}
            className="tap-tint flex min-h-11 items-center gap-2.5 rounded-[var(--r)] border px-3 py-2"
            style={{ borderColor: "var(--rule-soft)", background: "var(--raised)" }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: `var(--${group.tone})` }}
              aria-hidden
            />
            <span className="min-w-0 text-sm font-semibold" style={{ color: "var(--ink)" }}>
              {group.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
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
          <span className="block text-lg font-bold" style={{ color: "var(--ink)" }}>{title}</span>
          <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{subtitle}</span>
        </span>
        <span className="ml-auto"><Chip tone={primary ? "accent" : "neutral"}>{meta}</Chip></span>
      </span>
      <span className="text-sm" style={{ color: "var(--ink-2)" }}>{body}</span>
    </Link>
  );
}
