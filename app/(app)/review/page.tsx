import { equivalentIn, glossLanguageFrom, type GlossLanguage } from "@/lib/collections/glossLanguage";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { nextCardLine } from "@/lib/time/day";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { aroundFirst } from "@/lib/collections/levels";
import { unitById, type Level } from "@/lib/collections/syllabus";
import { MAX_ITEMS as MAX_SCAN_ITEMS } from "@/lib/scan/extract";
import { parseExamples, teachingSentence } from "@/lib/dict/examples";
import { decoyGlosses } from "@/lib/dict/facts";
import { parseItems } from "@/lib/scan/items";
import { inTeachingOrder } from "@/lib/srs/cards";
import { spaceSiblings } from "@/lib/srs/queue";
import { isStillLearning } from "@/lib/srs/scheduler";
import { readSettings, reviewModeFrom, SETTING_KEYS } from "@/lib/settings/store";
import { ReviewSession, type ReviewCard } from "./ReviewSession";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Review" };

export const dynamic = "force-dynamic";

const NEW_PER_SESSION = 10;
/**
 * How many unstarted cards are read before ten of them are chosen.
 *
 * The queue used to ask for exactly ten and show them, so which words a
 * learner met next was decided entirely by the order they were added in. That
 * is right for a deck built one unit at a time and wrong the moment anything
 * else fills it: adding a whole level, importing a class handout or
 * photographing a page puts hundreds of cards in at one `createdAt`, spanning
 * every band the dictionary has, and the ten off the front of that are whatever
 * the insert happened to order first.
 *
 * Sixty is a wide enough window for the level to have something to choose
 * between and still one query of one page of rows.
 */
const NEW_CANDIDATES = 60;
const MAX_SESSION = 60;
const CHOICES = 4;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; unit?: string; scan?: string }>;
}) {
  const ownerId = await requireUserId();
  const { case: targetCase, unit: unitId, scan: scanId } = await searchParams;
  const now = new Date();

  // Started here and awaited where it is read, so the one settings row rides
  // beside the deck reads below rather than in front of them. On a hosted
  // database that is a round trip off the daily path.
  const settingsPromise = readSettings(ownerId, [
    SETTING_KEYS.reviewMode, SETTING_KEYS.glossLanguage,
  ]);
  const modeChosen = async () => reviewModeFrom((await settingsPromise)[SETTING_KEYS.reviewMode]);
  /*
    Which language a first meeting gives the meaning in. One read for the whole
    render: `readSettings` is memoised per request, so asking for both keys here
    costs the same round trip the review mode already made.
  */
  const glossChosen = async () =>
    glossLanguageFrom((await settingsPromise)[SETTING_KEYS.glossLanguage]);

  // `examples` rides along because a card's first outing is a teaching screen
  // and a word taught without a sentence is a word taught as a label. The
  // column is a handful of short sentences, and only the one that gets shown
  // crosses to the client (see `introFor`).
  const include = {
    // `cefr` rides along for the new-card queue below, which introduces words
    // around the learner's level before words far off it.
    lexeme: {
      select: {
        lemma: true, translation: true, pos: true, examples: true, cefr: true,
        // For the first meeting only, which is the one screen where a meaning
        // in the learner's own language earns the most: the word is being
        // learned there rather than tested.
        translationRu: true, translationUk: true,
      },
    },
  } as const;

  // A drill ignores scheduling: the point is to attack one weakness — a case the
  // heatmap found, or the unit just added — not to review whatever is due.
  // ReviewSession decides for itself, once, whether an empty pool means "show
  // the empty state" — never the server on a later grade-triggered refresh.
  // See app/review/sprint/ and app/review/listening/ for the same pattern,
  // and the shared reasoning in ReviewSession.tsx.
  if (targetCase) {
    const drill = await prisma.card.findMany({
      where: { ownerId, suspended: false, targetCase },
      orderBy: [{ lapses: "desc" }, { due: "asc" }],
      take: 30,
      include,
    });
    const gloss = await glossChosen();
    return (
      <ReviewSession
        cards={await withChoices(drill.map((c) => toReviewCard(c, gloss)))}
        drillCase={targetCase}
        totalCards={0}
        mode={await modeChosen()}
      />
    );
  }

  if (unitId) {
    const unit = unitById(unitId);
    const drill = unit
      ? await prisma.card.findMany({
          where: { ownerId, suspended: false, lexeme: { lemma: { in: [...unit.lemmas] } } },
          orderBy: [{ due: "asc" }, { lapses: "desc" }],
          take: 40,
          include,
        })
      : [];
    const gloss = await glossChosen();
    return (
      <ReviewSession
        cards={await withChoices(drill.map((c) => toReviewCard(c, gloss)))}
        drillUnit={unitId}
        totalCards={0}
        mode={await modeChosen()}
      />
    );
  }

  /*
    A photographed page, drilled on its own.

    Read by lexeme id rather than by lemma, unlike the unit drill above: a page
    can carry a word the learner added themselves, and matching those by lemma
    would sweep in a homograph that belongs to a different part of speech. The
    page is looked up scoped to its owner, so a guessed id in the query string
    reaches nothing.
  */
  if (scanId) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, ownerId },
      select: { id: true, title: true, items: true },
    });
    const lexemeIds = scan
      ? parseItems(scan.items, MAX_SCAN_ITEMS)
          .map((i) => i.lexemeId)
          .filter((id): id is string => id !== null)
      : [];
    const drill = lexemeIds.length
      ? await prisma.card.findMany({
          where: { ownerId, suspended: false, lexemeId: { in: lexemeIds } },
          orderBy: [{ due: "asc" }, { lapses: "desc" }],
          take: 60,
          include,
        })
      : [];
    const gloss = await glossChosen();
    return (
      <ReviewSession
        cards={await withChoices(drill.map((c) => toReviewCard(c, gloss)))}
        drillScan={scan ? { id: scan.id, title: scan.title } : { id: scanId, title: "A page" }}
        totalCards={0}
        mode={await modeChosen()}
      />
    );
  }

  // Due first, then a capped trickle of new cards. Uncapped new cards is the
  // classic way an SRS becomes an unsustainable workload three weeks in.
  /*
    THREE READS THAT DO NOT NEED EACH OTHER'S ANSWERS, SO THEY ARE ONE ROUND.

    The new-card query used to wait for the due one, because its `take` is what
    is left of the session after the due cards have filled it. That is a whole
    round trip spent on an arithmetic that at most drops a few rows: at most ten
    new cards are shown either way, so the honest version reads a window and
    keeps as many as there is room for. One page of rows is less than the trip
    costs on any hosted database, and the deck size below never depended on
    either. The level read is the fourth because `atLevelFirst` needs it and
    neither of the queries does.
  */
  const [due, freshPool, totalCards, level, mode] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId, suspended: false, due: { lte: now }, state: { not: 0 } },
      orderBy: { due: "asc" },
      take: MAX_SESSION,
      include,
    }),
    // Ordered by lexeme as well as by date so a word's cards stay together:
    // they share one `createdAt`, so date alone leaves them tied and the take
    // can interleave two words. `inTeachingOrder` then settles the order
    // *within* a word, which is what stops a conjugation card being somebody's
    // first sight of a verb.
    prisma.card.findMany({
      where: { ownerId, suspended: false, state: 0 },
      orderBy: [{ createdAt: "asc" }, { lexemeId: "asc" }],
      take: NEW_CANDIDATES,
      include,
    }),
    prisma.card.count({ where: { ownerId } }),
    courseLevelFor(ownerId),
    modeChosen(),
  ]);

  /*
    A CARD NEVER ANSWERS THE CARD BEFORE IT.

    `addCardsFor` writes a word's cards in one go, they are graded in one
    session, and they come back with almost the same `due`, so a queue ordered
    by `due` puts them side by side: measured on the demo deck, 13 of 32 due
    cards sat next to a card of the same word and seven case cards of `Eesti`
    ran consecutively. Answering `Eesti → millesse? kuhu?` straight after
    `Eesti → milles? kus?` is reading the answer off the card before, and the
    log records it as a recall either way, so the scheduler raises the interval
    on a memory nothing tested. See lib/srs/queue.ts.

    Only the due list. New cards keep `inTeachingOrder`, which deliberately
    puts a word's cards together and in the order a lesson teaches them,
    because a first meeting is a teaching screen rather than a retrieval.
  */
  const spaced = spaceSiblings(due, (card) => card.lexemeId);

  const fresh = atLevelFirst(freshPool, level)
    .slice(0, Math.max(0, Math.min(NEW_PER_SESSION, MAX_SESSION - due.length)));
  const gloss = await glossChosen();
  const cards = await withChoices(
    [...spaced, ...inTeachingOrder(fresh)].map((c) => toReviewCard(c, gloss)),
  );

  /*
    WHEN THE NEXT CARD COMES BACK, WHICH IS THE ONLY QUESTION AN EMPTY QUEUE
    RAISES.

    The caught-up screen said "All 312 cards are scheduled for later", which is
    the count somebody already knows and not the thing they came to find out.
    `docs/18-voice.md` uses this exact screen as its worked example and the
    answer it gives is a date.

    Asked only on the path where it is going to be shown, and that is the
    point rather than a saving: this is one more round trip on a page whose
    daily job is to open fast, and on the day there is something to review it
    would answer a question nobody is asking.
  */
  const caughtUp = cards.length === 0 && totalCards > 0;
  const [next, clock] = caughtUp
    ? await Promise.all([
        prisma.card.findFirst({
          where: { ownerId, suspended: false, due: { gt: now } },
          orderBy: [{ due: "asc" }, { id: "asc" }],
          select: { due: true },
        }),
        learnerDayClock(ownerId),
      ])
    : [null, null];

  return (
    <ReviewSession
      cards={cards}
      totalCards={totalCards}
      mode={mode}
      nextDue={next && clock ? nextCardLine(next.due, now, clock) : null}
    />
  );
}

/**
 * New words around the learner's level first.
 *
 * The one place a level can honestly reach the daily loop. What is *due* is
 * decided by FSRS and may not be reordered by anything: a card comes back when
 * the scheduler says, whatever band it is in, or the schedule is not a
 * schedule. What has never been seen has no schedule yet, and choosing which
 * of those to teach next is exactly the judgement a level is for.
 *
 * `aroundFirst` orders and never drops, and a word the learner typed in,
 * pasted or photographed carries no band at all and counts as at level, since
 * they went to the trouble of putting it there. Both of those are
 * `lib/collections/levels.ts`, which is where they can be tested.
 */
function atLevelFirst(cards: readonly CardRow[], level: Level): CardRow[] {
  return aroundFirst(cards, level, (c) => c.lexeme?.cefr);
}

type CardRow = Awaited<ReturnType<typeof prisma.card.findMany>>[number] & {
  lexeme: { lemma: string; translation: string; pos: string; examples: string; cefr: string | null } | null;
};

/**
 * What a first meeting with a word shows.
 *
 * Assembled here rather than in the browser for two reasons: the sentence is
 * picked out of a column holding up to eight of them and only the chosen one
 * needs to cross the wire, and `teachingSentence` is the same function the
 * grammar pages and the lesson use, so a word is introduced the same way
 * wherever it is met.
 *
 * Every string in here came out of the dictionary. Nothing is written, and
 * nothing is derived (ADR-005).
 */
function introFor(c: CardRow, glossLanguage: GlossLanguage): ReviewCard["intro"] {
  if (!c.lexeme) return null;

  // The form the card is about to ask for comes first, then the lemma. On a
  // recognition card the front *is* the lemma, and on a gap-fill the front is a
  // sentence with a hole in it and would match nothing, which is why this asks
  // the card what it is rather than reading whichever side happens to be
  // Estonian.
  const asked = c.cardType === "RECOGNITION" ? c.front : c.back;
  const found = teachingSentence(parseExamples(c.lexeme.examples), [asked, c.lexeme.lemma]);

  const equivalent = equivalentIn(c.lexeme, glossLanguage);

  return {
    lemma: c.lexeme.lemma,
    gloss: c.lexeme.translation,
    equivalent: equivalent ? { text: equivalent, lang: glossLanguage } : null,
    sentence: found
      ? { et: found.example.et, en: found.example.en ?? null, form: found.form }
      : null,
  };
}

function toReviewCard(c: CardRow, glossLanguage: GlossLanguage): ReviewCard {
  return {
    id: c.id,
    cardType: c.cardType,
    front: c.front,
    back: c.back,
    hint: c.hint,
    targetCase: c.targetCase,
    lemma: c.lexeme?.lemma ?? null,
    isNew: c.state === 0,
    // Only on a card that has never been seen. Every other card in the session
    // would carry a sentence nothing renders.
    intro: c.state === 0 ? introFor(c, glossLanguage) : null,
    choices: null,
    scheduling: {
      due: c.due.toISOString(),
      stability: c.stability,
      difficulty: c.difficulty,
      elapsedDays: c.elapsedDays,
      scheduledDays: c.scheduledDays,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state,
      lastReview: c.lastReview?.toISOString() ?? null,
      learningSteps: c.learningSteps,
    },
  };
}

/**
 * Which recognition cards are asked as four options rather than recalled.
 *
 * Only the ones still being learned, which is the whole point of the shape.
 * Options were once attached to every recognition card a session held, and the
 * effect was that half a deck could never be asked properly: `askFor` routes to
 * a pick whenever options exist, and neither review mode overrides it, so the
 * one question this app is named for, what does this Estonian word mean, was
 * always answered with the answer already on the screen. Recognising a gloss
 * among four is a different and much weaker memory than producing it, and a
 * schedule built on the easier one says a word is known when it is not.
 *
 * A card still in learning keeps them for the same reason a new card leads with
 * its answer at all (see `askFor`): the memory is not there yet, and asking for
 * it cold is a guessing game rather than a test. A lapsed card is back in that
 * position by definition, which `isStillLearning` reads as Relearning.
 */
function wantsChoices(card: ReviewCard): boolean {
  /*
    A NEW CARD NOW GETS THEM TOO, BECAUSE IT IS NOW ASKED.

    `!card.isNew` was right while meeting a word was the whole of its first
    outing: there was no question, so there was nothing to offer options for.
    A newly met word is asked back before the session ends now, and the memory
    at that point is minutes old, which is exactly the position the sentence
    above describes for a card still in learning.
  */
  return card.cardType === "RECOGNITION"
    && (card.isNew || isStillLearning(card.scheduling.state));
}

/**
 * Attaches multiple-choice options to the recognition cards that get them.
 *
 * Wrong answers are real translations of other words rather than invented text
 * — nothing here writes Estonian, and a decoy that is obviously nonsense makes
 * the question free. They are drawn once for the whole session, so the pool is
 * one query rather than one per card.
 */
async function withChoices(cards: ReviewCard[]): Promise<ReviewCard[]> {
  if (!cards.some(wantsChoices)) return cards;

  /*
    Which words the dictionary holds is not a fact about the person being
    asked, so the pool is read once per instance rather than once per session:
    two thousand rows off the render path of the screen this app exists to get
    people to. See lib/dict/facts.ts.
  */
  const translations = await decoyGlosses();
  if (translations.length < CHOICES) return cards;

  return cards.map((card) => {
    if (!wantsChoices(card)) return card;
    const decoys = shuffle(translations.filter((t) => t !== card.back)).slice(0, CHOICES - 1);
    return { ...card, choices: shuffle([...decoys, card.back]) };
  });
}

