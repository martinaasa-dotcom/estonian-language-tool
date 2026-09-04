import { prisma } from "@/lib/db";
import { generateCards, type LexemeForCards } from "@/lib/srs/cards";
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
 *   cannot pile them up;
 * - existing cards are never touched, so no scheduling is disturbed.
 */
export async function backfillClozeCards(ownerId: string, lexemeId: string): Promise<number> {
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    include: { forms: true, cards: { where: { ownerId }, select: { cardType: true, front: true } } },
  });
  if (!lexeme || lexeme.cards.length === 0) return 0;
  if (lexeme.cards.some((c) => c.cardType === "CLOZE")) return 0;

  const generated = generateCards(lexeme as LexemeForCards, ["CLOZE"]);
  if (generated.length === 0) return 0;

  const scheduling = emptyScheduling(new Date());
  await prisma.card.createMany({
    data: generated.map((c) => ({
      ownerId,
      lexemeId,
      cardType: c.cardType,
      front: c.front,
      back: c.back,
      hint: c.hint,
      targetCase: c.targetCase,
      slot: c.slot,
      source: "DICTIONARY",
      due: scheduling.due,
      stability: scheduling.stability,
      difficulty: scheduling.difficulty,
      state: scheduling.state,
      learningSteps: scheduling.learningSteps,
    })),
  });
  return generated.length;
}
