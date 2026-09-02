import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { aroundFirst, bandsAround, isAround } from "@/lib/collections/levels";
import { unitById, type Level } from "@/lib/collections/syllabus";
import { MAX_ITEMS as MAX_SCAN_ITEMS } from "@/lib/scan/extract";
import { parseItems } from "@/lib/scan/items";
import { inTeachingOrder } from "@/lib/srs/cards";
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
  const settingsPromise = readSettings(ownerId, [SETTING_KEYS.reviewMode]);
  const modeChosen = async () => reviewModeFrom((await settingsPromise)[SETTING_KEYS.reviewMode]);

  // `examples` rides along because a card's first outing is a teaching screen
  // and a word taught without a sentence is a word taught as a label. The
  // column is a handful of short sentences, and only the one that gets shown
  // crosses to the client (see `introFor`).

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
    return (
      <ReviewSession
        cards={await withChoices(drill)}
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
    return (
      <ReviewSession
        cards={await withChoices(drill)}
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
    return (
      <ReviewSession
        cards={await withChoices(drill)}
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

  const room = Math.max(0, Math.min(NEW_PER_SESSION, MAX_SESSION - due.length));
  const fresh = atLevelFirst(await inBandPool(ownerId, freshPool, level, room), level).slice(0, room);
  const cards = await withChoices([...due, ...inTeachingOrder(fresh)]);

  return <ReviewSession cards={cards} totalCards={totalCards} mode={mode} />;
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
      lexeme: { cefr: { in: [...bandsAround(level)] } },
    },
    orderBy: [{ createdAt: "asc" }, { lexemeId: "asc" }],
    take: NEW_CANDIDATES,
    include,
  });
  return inBand.length > 0 ? inBand : window;
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


