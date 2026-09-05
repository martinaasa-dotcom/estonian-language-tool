import { prisma } from "@/lib/db";
import { generateCards, type LexemeForCards } from "@/lib/srs/cards";
import { lockDeck } from "@/lib/srs/deck";
import { emptyScheduling } from "@/lib/srs/scheduler";

/**
 * Adds gap-fill cards to a word already in the deck, once it has sentences.
 *
 * The order things happen in makes this necessary. A unit is added to the deck
 * from the seeded dictionary, which carries no example sentences; the sentences
 * arrive later, the first time that word is actually looked up and Ekilex is
 * consulted. Without this, a learner's oldest and most-used words would be the
 * only ones that never got the best exercise the app has.
 *
 * Deliberately narrow:
 * - only for a word the learner already has cards for — it never grows the deck
 *   behind their back;
 * - only when they have no gap-fill card for it yet, so re-reading an entry
 *   cannot pile them up, which is a promise the read and the write have to be
 *   under one lock to keep: this is "is it already there" followed by an
 *   insert, and it is reached from a dictionary page *render*, so two tabs on
 *   one entry, or a prefetch on a settled pointer followed by the click, both
 *   land in the gap. `lockDeck` is the same transaction advisory lock
 *   `addCardsFor` and `addPlanToDeck` take, keyed on the learner;
 * - existing cards are never touched, so no scheduling is disturbed.
 */
export async function backfillClozeCards(ownerId: string, lexemeId: string): Promise<number> {
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    include: { forms: true, cards: { where: { ownerId }, select: { cardType: true, front: true, source: true } } },
  });
  if (!lexeme || lexeme.cards.length === 0) return 0;
  if (lexeme.cards.some((c) => c.cardType === "CLOZE")) return 0;

  const generated = generateCards(lexeme as LexemeForCards, ["CLOZE"]);
  if (generated.length === 0) return 0;

  /*
    THE CARD INHERITS THE WORD, BECAUSE IT IS NOT A NEW WORD.

    `Card.source` says whose idea a word was, and `/review/lookups` reads it to
    ask about the ones the learner went and got themselves. A gap-fill added
    here is a card for a word already in the deck, so writing a source of its
    own would move a course word into that round, or a looked-up word out of
    it, on the strength of a sentence arriving from Ekilex. The existing cards
    are read in the same query already, and they were all written together, so
    the first of them is the answer.
  */
  const source = lexeme.cards[0]?.source ?? "MANUAL";
  const scheduling = emptyScheduling(new Date());
  /*
    The check and the write under one lock. Reading "has it a gap-fill card
    yet" and then inserting is check-then-act, and the gap is wide enough to
    matter here because this is reached from a dictionary page *render*: a
    prefetch on a settled pointer and the click behind it are two passes over
    the same entry, as are two tabs. `addCardsFor` and `addPlanToDeck` take
    the same transaction advisory lock, keyed on the learner.
  */
  return prisma.$transaction(async (tx) => {
    await lockDeck(tx, ownerId);
    const already = await tx.card.count({ where: { ownerId, lexemeId, cardType: "CLOZE" } });
    if (already > 0) return 0;
    await tx.card.createMany({
    data: generated.map((c) => ({
      ownerId,
      lexemeId,
      cardType: c.cardType,
      front: c.front,
      back: c.back,
      hint: c.hint,
      targetCase: c.targetCase,
      slot: c.slot,
      source,
      due: scheduling.due,
      stability: scheduling.stability,
      difficulty: scheduling.difficulty,
      state: scheduling.state,
      learningSteps: scheduling.learningSteps,
      })),
    });
    return generated.length;
  });
}
