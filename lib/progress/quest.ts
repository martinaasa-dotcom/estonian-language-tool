import { prisma } from "@/lib/db";
import { caseAccuracy } from "@/lib/stats/history";
import { caseReviewsFor } from "@/lib/progress/cases";
import { acceptedAnswers } from "@/lib/estonian/answer";
import { stemsFrom } from "@/lib/estonian/derive";
import { caseIndex, readCase } from "@/lib/estonian/whichCase";
import { caseFormChoices, verbFormChoices, verbFormSlots } from "@/lib/questions/caseChoices";

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
  /**
   * Four forms of this word to pick between, or null where the round asks a
   * card it cannot offer options for.
   *
   * WHY A ROUND LIKE THIS MAY NOT ASK THE LEARNER WHETHER THEY WERE RIGHT.
   * This round picks the cases a learner is worst at, and then asked them to
   * mark their own paper on exactly those. The verdict went into `Review`,
   * which is append-only, and `caseAccuracy` reads it back to decide which
   * cases are weak: the panel that chose the cards was being fed by the round
   * that claimed to be fixing them, on the learner's own say-so. A "Had it"
   * is not evidence, and every figure downstream of it was presented as
   * measured.
   *
   * The round's own argument for a flip is sound and is untouched: two minutes
   * of typing is about eight cards, and this round is about volume across a
   * weakness. What was never true is that self-grading is the only thing that
   * is as fast. Picking one of four is a tap, exactly as "Had it" was a tap.
   *
   * `slot` is what the option would say about the learner if they took it, so
   * a wrong pick can be written down as the confusion it is rather than as a
   * bare failure. See `Review.reachedSlot`: naming it needs the whole singular
   * of the word, which only the server holds, so it travels with the option
   * rather than being worked out in the browser.
   */
  choices: { text: string; slot: string | null }[] | null;
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

  const options = await optionsFor(chosen);

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
      choices: options.get(c.id) ?? null,
    })),
  };
}

/**
 * Four forms per case card, and what each of them would mean.
 *
 * One query for the whole round rather than one per card, and none at all for
 * a round holding no case card. Ordered rather than left to the planner:
 * Estonian has genuine parallel forms, so a word can hold two rows for one
 * `formType` and `stemsFrom` takes the first it is handed. `orderIndex` is the
 * dictionary's own primary-first order and `id` makes it total.
 */
async function optionsFor(
  cards: {
    id: string; back: string; cardType: string; lexemeId: string | null;
    lexeme: { lemma: string } | null;
  }[],
): Promise<Map<string, { text: string; slot: string | null }[]>> {
  const out = new Map<string, { text: string; slot: string | null }[]>();
  const wanted = cards.filter(
    (c) => (c.cardType === "CASE_FORM" || c.cardType === "CONJUGATION") && c.lexemeId,
  );
  if (wanted.length === 0) return out;

  const forms = await prisma.form.findMany({
    where: { lexemeId: { in: [...new Set(wanted.map((c) => c.lexemeId!))] } },
    select: { lexemeId: true, formType: true, value: true, morphCode: true },
    orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
  });

  const byLexeme = new Map<string, typeof forms>();
  for (const form of forms) {
    const held = byLexeme.get(form.lexemeId) ?? [];
    held.push(form);
    byLexeme.set(form.lexemeId, held);
  }

  for (const card of wanted) {
    const held = byLexeme.get(card.lexemeId!);
    if (!held) continue;
    const accepted = acceptedAnswers(card.back, "et");
    const answer = accepted[0] ?? card.back;
    /*
      A form more than one slot spells is named as none of them, which is
      `readCase`'s own rule: `kohvi` is the omastav, the osastav and the short
      sisseütlev at once, and filing a learner's pick under a guess would put a
      confusion in the log that they never had. `verbFormSlots` draws the same
      line for a verb.
    */
    if (card.cardType === "CONJUGATION") {
      const lemma = card.lexeme?.lemma;
      if (!lemma) continue;
      const lex = { lemma, forms: held };
      const picked = verbFormChoices({ lex, accepted, answer, rng: Math.random });
      if (!picked) continue;
      const slots = verbFormSlots(lex);
      out.set(card.id, picked.map((text) => ({ text, slot: slots.get(text) ?? null })));
      continue;
    }
    const stems = stemsFrom(held);
    const picked = caseFormChoices({ stems, accepted, answer, rng: Math.random });
    if (!picked) continue;
    const index = caseIndex(stems);
    out.set(card.id, picked.map((text) => {
      const verdict = readCase(index, text);
      return { text, slot: verdict.kind === "one" ? verdict.key : null };
    }));
  }
  return out;
}
