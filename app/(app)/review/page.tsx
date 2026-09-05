import type { Prisma } from "@prisma/client";
import { glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { nextCardLine } from "@/lib/time/day";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { aroundFirst, bandsAround, isAround } from "@/lib/collections/levels";
import { commonFirst } from "@/lib/collections/commonFirst";
import { unitById, type Level } from "@/lib/collections/syllabus";
import { MAX_ITEMS as MAX_SCAN_ITEMS } from "@/lib/scan/extract";
import { parseItems } from "@/lib/scan/items";
import { inTeachingOrder } from "@/lib/srs/cards";
import { LADDER_CARD_TYPE, LADDER_STATES } from "@/lib/learn/ladder";
import { spaceSiblings } from "@/lib/srs/queue";
import { readSettings, reviewModeFrom, SETTING_KEYS } from "@/lib/settings/store";
import { ReviewSession } from "./ReviewSession";
import { include, withChoices, type CardRow } from "./cards";

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
        cards={await withChoices(drill, gloss)}
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
        cards={await withChoices(drill, gloss)}
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
        cards={await withChoices(drill, gloss)}
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
      where: {
        ownerId, suspended: false, due: { lte: now }, state: { not: 0 },
        /*
          A WORD STILL ON THE LEARN LADDER IS NOT DUE HERE.

          Learn walks a new word up three rungs on its recognition card, and
          the scheduler puts that card ten minutes out between them, so within
          one evening it comes back due. Serving it here as well would have
          both screens teaching one word and, worse, would ask for it cold on
          the screen that does not teach: the ladder is what holds the sentence
          and the four options. Once the card graduates it is ordinary review
          like everything else, which is what "moves to practice" means.

          A plain predicate on the row rather than a subquery over the word,
          because this is the hottest read in the app and the overlap is
          exactly this one shape.
        */
        NOT: { cardType: LADDER_CARD_TYPE, state: 1 },
      },
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
      where: { ownerId, suspended: false, state: 0, ...pastTheLadder(ownerId) },
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

  const room = Math.max(0, Math.min(NEW_PER_SESSION, MAX_SESSION - due.length));
  const fresh = atLevelFirst(await inBandPool(ownerId, freshPool, level, room), level).slice(0, room);
  const gloss = await glossChosen();
  const cards = await withChoices([...spaced, ...inTeachingOrder(fresh)], gloss);

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
 * WHICH UNSEEN CARDS PRACTICE MAY INTRODUCE, WHICH IS THE ONES LEARN HAS
 * FINISHED WITH.
 *
 * A deck arrives whole: a unit, a level or a photographed handout writes a
 * recognition card, a production card and one per case the dictionary can
 * build, all unseen, all at one `createdAt`. Learn teaches the word on its
 * recognition card and Practice drills everything else, so the line between
 * the two screens is drawn here: a word whose recognition card has not
 * graduated is Learn's, and none of its cards is offered here yet. The moment
 * it graduates the rest of them arrive in the ordinary trickle.
 *
 * A `none` on the word's own cards rather than a second query, so this costs a
 * subquery on an indexed column instead of a round trip. `lexemeId` is
 * nullable, and a card with no dictionary entry behind it has no ladder to be
 * on, so it is let through rather than filtered out by a clause that cannot
 * see it.
 */
function pastTheLadder(ownerId: string): Prisma.CardWhereInput {
  return {
    OR: [
      { lexemeId: null },
      {
        lexeme: {
          cards: {
            none: {
              ownerId,
              cardType: LADDER_CARD_TYPE,
              state: { in: [...LADDER_STATES] },
            },
          },
        },
      },
    ],
  };
}

/**
 * The window of unseen cards, widened when none of it is anywhere near the
 * learner's level.
 *
 * `atLevelFirst` orders the window and never drops from it, which is right, and
 * it can only order what it was given. The window is the sixty oldest unseen
 * cards, and age is a fact about when a card was added rather than about who is
 * being taught: a learner placed at A1 by a check that got them wrong, or one
 * who started at A1 a year ago, has a backlog of unseen beginner cards, and the
 * B1 unit they added last week sits behind all of it. Ordering sixty A1 cards
 * by how near A1 they are cannot help. That is the shape of the report this
 * fixes: an A2 or B1 learner being asked about `Tere`.
 *
 * So when the window turns out to hold nothing in band, one more query asks for
 * the same thing filtered to the bands around the learner. It costs a round
 * trip and it costs it only for the learner this hurts: a deck whose oldest
 * unseen cards are already in band, which is everybody set up at their own
 * level, never reaches the second read. Returning the original window when the
 * filtered one is empty is what keeps a level an ordering rather than a gate:
 * a learner with nothing in band still gets taught something.
 *
 * The card's own bands come from `lib/collections/levels.ts`, one either side,
 * and an untagged word counts as in band there, so a word somebody typed in or
 * photographed is never what sends this to a second query.
 */
async function inBandPool(
  ownerId: string, window: CardRow[], level: Level, room: number,
): Promise<CardRow[]> {
  if (room === 0) return window;
  if (window.some((c) => isAround(c.lexeme?.cefr, level))) return window;

  const inBand = await prisma.card.findMany({
    where: {
      ownerId, suspended: false, state: 0,
      ...pastTheLadder(ownerId),
      lexeme: { cefr: { in: [...bandsAround(level)] } },
    },
    orderBy: [{ createdAt: "asc" }, { lexemeId: "asc" }],
    take: NEW_CANDIDATES,
    include,
  });
  return inBand.length > 0 ? inBand : window;
}

/**
 * New words around the learner's level first, and the commonest of those
 * ahead of the rest.
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
 *
 * THE BAND IS THE OUTER ORDERING AND THE CORPUS IS THE INNER ONE, which is
 * what composing the two stable partitions in this order gets: `commonFirst`
 * runs first and `aroundFirst` runs over its answer, so a word out of band
 * never leads on the strength of being common, and inside a band the words the
 * corpus counts most lead the ones it has never heard of. Until now the tie
 * inside a band was `createdAt`, which is when a card happened to be written:
 * a deck holding a unit, a photographed handout and an afternoon of looking
 * things up taught them in assembly order, and `ja` and `aga` waited behind
 * whatever went in first. The measurement was already in the repository and
 * reached two browsing screens and not the queue.
 *
 * It is a partition rather than a rank for the reason `commonFirst` gives at
 * length, which is that a noun and a verb are counted differently and cannot
 * be ranked against each other.
 */
function atLevelFirst(cards: readonly CardRow[], level: Level): CardRow[] {
  return aroundFirst(commonFirst(cards, (c) => c.lexeme?.lemma), level, (c) => c.lexeme?.cefr);
}


