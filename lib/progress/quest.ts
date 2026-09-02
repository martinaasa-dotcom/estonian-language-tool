import { prisma } from "@/lib/db";
import { caseAccuracy } from "@/lib/stats/history";
import { caseReviewsFor } from "@/lib/progress/cases";

/**
 * THE DAILY QUEST'S POOL: WHAT IS GOING WRONG, ASKED AGAIN TODAY.
 *
 * A two-minute round on the learner's own weak points, asked for directly:
 * "Only pick their weakest words (the ones they get wrong the most) and see
 * where they stand today."
 *
 * WEAKEST *CASES* FIRST, NOT ONLY WEAKEST WORDS, and that is the half worth
 * spelling out. A deck's failures cluster by grammar rather than by vocabulary:
 * somebody does not fail `tuba` and `kool` for unrelated reasons, they fail the
 * seesütlev on both. Ranking cards by lapses alone finds the symptom and asks
 * about it word by word; ranking by the case behind them finds the thing that
 * needs fixing and asks about it eight ways. `caseAccuracy` over
 * `caseReviewsFor` is the same query and the same calculation the Progress page
 * and the Practice page read, so the three cannot disagree about which case a
 * learner is worst at.
 *
 * A card carrying no case still gets in, and has to: a learner whose case cards
 * are all fine is not a learner with nothing to work on, and a round that came
 * back empty for them would be the app saying it had nothing to offer on the
 * day it was most sure of itself.
 *
 * Nothing here is stored. Which cases are weakest is derived from the
 * append-only log on every request, like everything else in `lib/progress/`
 * (ADR-014).
 */

/** Cards in a round. Two minutes at a few seconds a card, with headroom. */
export const QUEST_SIZE = 24;

/** How many cases count as "the weak ones". Enough to vary, few enough to aim. */
const WEAK_CASES = 3;

/** Rows read before the round is chosen. A bound on work, not on meaning. */
const POOL = 400;

export interface QuestCard {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  lemma: string | null;
  cardType: string;
  targetCase: string | null;
  /** True when this card is here because its case is one of the weak ones. */
  targetsWeakCase: boolean;
}

export interface Quest {
  cards: QuestCard[];
  /** The cases the round is aimed at, weakest first. Named on the screen. */
  weakCases: { grammCase: string; accuracy: number }[];
}

export async function questFor(ownerId: string): Promise<Quest> {
  const caseReviews = await caseReviewsFor(ownerId);
  const weak = caseAccuracy(caseReviews).slice(0, WEAK_CASES);
  const weakKeys = weak.map((c) => c.grammCase);

  /*
    One read, then chosen in code, rather than a query per case.

    Ordered on `lapses` and then `due`, so past the cap the rows kept are the
    ones that have gone wrong most rather than whichever the plan returned, and
    ending on the id because neither of those is unique: a truncated read says
    where to cut.
  */
  const rows = await prisma.card.findMany({
    where: { ownerId, suspended: false, state: { not: 0 } },
    orderBy: [{ lapses: "desc" }, { due: "asc" }, { id: "asc" }],
    take: POOL,
    include: { lexeme: { select: { lemma: true } } },
  });

  const onWeakCase = rows.filter((c) => c.targetCase && weakKeys.includes(c.targetCase));
  const rest = rows.filter((c) => !c.targetCase || !weakKeys.includes(c.targetCase));

  /*
    Weak-case cards lead and the rest fill in behind them. Filling rather than
    excluding is what keeps the round honest on two different learners: one
    whose partitive is a mess gets a round mostly about the partitive, and one
    with no weak case yet gets their most-lapsed cards rather than an empty
    screen. Nothing is dropped for want of a case.
  */
  const chosen = [...onWeakCase, ...rest].slice(0, QUEST_SIZE);

  return {
    weakCases: weak.map((c) => ({ grammCase: c.grammCase, accuracy: c.accuracy })),
    cards: chosen.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      hint: c.hint,
      lemma: c.lexeme?.lemma ?? null,
      cardType: c.cardType,
      targetCase: c.targetCase,
      targetsWeakCase: Boolean(c.targetCase && weakKeys.includes(c.targetCase)),
    })),
  };
}
