import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { MAX_ITEMS as MAX_SCAN_ITEMS } from "@/lib/scan/extract";
import { parseItems } from "@/lib/scan/items";
import { isStillLearning } from "@/lib/srs/scheduler";
import { readSettings, reviewModeFrom, SETTING_KEYS } from "@/lib/settings/store";
import { ReviewSession, type ReviewCard } from "./ReviewSession";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Review" };

export const dynamic = "force-dynamic";

const NEW_PER_SESSION = 10;
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

  const settings = await readSettings(ownerId, [SETTING_KEYS.reviewMode]);
  const mode = reviewModeFrom(settings[SETTING_KEYS.reviewMode]);

  const include = { lexeme: { select: { lemma: true, translation: true, pos: true } } } as const;

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
        cards={await withChoices(drill.map(toReviewCard))}
        drillCase={targetCase}
        totalCards={0}
        mode={mode}
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
        cards={await withChoices(drill.map(toReviewCard))}
        drillUnit={unitId}
        totalCards={0}
        mode={mode}
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
        cards={await withChoices(drill.map(toReviewCard))}
        drillScan={scan ? { id: scan.id, title: scan.title } : { id: scanId, title: "A page" }}
        totalCards={0}
        mode={mode}
      />
    );
  }

  // Due first, then a capped trickle of new cards. Uncapped new cards is the
  // classic way an SRS becomes an unsustainable workload three weeks in.
  const due = await prisma.card.findMany({
    where: { ownerId, suspended: false, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: MAX_SESSION,
    include,
  });

  const fresh = await prisma.card.findMany({
    where: { ownerId, suspended: false, state: 0 },
    orderBy: { createdAt: "asc" },
    take: Math.max(0, Math.min(NEW_PER_SESSION, MAX_SESSION - due.length)),
    include,
  });

  const cards = await withChoices([...due, ...fresh].map(toReviewCard));
  const totalCards = await prisma.card.count({ where: { ownerId } });

  return <ReviewSession cards={cards} totalCards={totalCards} mode={mode} />;
}

type CardRow = Awaited<ReturnType<typeof prisma.card.findMany>>[number] & {
  lexeme: { lemma: string; translation: string; pos: string } | null;
};

function toReviewCard(c: CardRow): ReviewCard {
  return {
    id: c.id,
    cardType: c.cardType,
    front: c.front,
    back: c.back,
    hint: c.hint,
    targetCase: c.targetCase,
    lemma: c.lexeme?.lemma ?? null,
    isNew: c.state === 0,
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
  return card.cardType === "RECOGNITION" && !card.isNew && isStillLearning(card.scheduling.state);
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
    Two thousand words of a dictionary of about six thousand, so the cap binds
    every time and which third was read decided what could ever be a decoy.
    Easiest first, for the same reason the minimal-pairs pool is: a wrong
    answer a learner has never met is a free question, and one at their own
    level makes them read the Estonian.
  */
  const pool = await prisma.lexeme.findMany({
    select: { translation: true },
    orderBy: [{ cefr: "asc" }, { lemma: "asc" }],
    take: 2000,
  });
  const translations = [...new Set(pool.map((l) => l.translation))];
  if (translations.length < CHOICES) return cards;

  return cards.map((card) => {
    if (!wantsChoices(card)) return card;
    const decoys = shuffle(translations.filter((t) => t !== card.back)).slice(0, CHOICES - 1);
    return { ...card, choices: shuffle([...decoys, card.back]) };
  });
}

