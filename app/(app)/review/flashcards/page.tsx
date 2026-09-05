import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { askableSlots, flashTask, hasSentence, type FlashWord } from "@/lib/games/flash";
import { masteryFor, type MasteredWord } from "@/lib/progress/mastery";
import { MASTERY_CORRECT, MASTERY_ORDER } from "@/lib/srs/mastery";
import { slotOfCard } from "@/lib/srs/slots";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { FlashSession, type FlashPrompt } from "./FlashSession";

export const metadata = { title: "Flash cards" };

export const dynamic = "force-dynamic";

/** Words in one round. Long enough to be worth opening, short enough to finish. */
const ROUND = 10;

/**
 * FLASH CARDS: THE WORDS YOU HAVE MET, ASKED IN A WAY REVIEW DOES NOT ASK THEM.
 *
 * `/practice` used to open with a tile linking back to `/review`, which is the
 * page most people arrive from. The learner asked for that slot to hold
 * something that does work review does not, and the first answer to that was
 * this round rendering `ReviewSession` over a different queue, which is review
 * again: the same four shapes, drawn from another list. Their report was that
 * it "reverts back to what is in the Review section", and it did.
 *
 * `lib/games/flash.ts` is the round proper. Five shapes rather than four, and
 * three of them are things review cannot ask: a sentence heard and never
 * shown, a gap with the meaning rather than the lemma beside it, and a
 * sentence the learner writes themselves around a named form. Typed
 * throughout, because producing a form is a different memory from picking it
 * out of four and picking is what stops telling you anything about a word that
 * is nearly known.
 *
 * WHAT IT DRAWS. Words that are not mastered, hardest first, and for each one
 * a slot it has not been right in yet. `Verdict.filled` is what makes that
 * possible: mastery counts distinct slots, so the round can ask for the ones
 * missing rather than piling a sixth correct answer into a slot already full.
 * A word right five times as a meaning is asked for its kaasaütlev instead.
 *
 * WHY IT IS STILL A REVIEW. Every mode grades through the same log (ADR-016),
 * so the scheduler sees what was practised and this is not a side score. What
 * is new is that the answer says which form it was about: the round asks for
 * kaasaütlev on a card that may be a recognition card, and without
 * `Review.slot` the log would record the answer as being about a meaning and
 * the variety half of mastery would never move. See `lib/srs/slots.ts`.
 */
export default async function FlashcardsPage() {
  const ownerId = await requireUserId();

  const words = await masteryFor(ownerId);
  const unfinished = words.filter((w) => w.verdict.mastery !== "mastered");

  if (unfinished.length === 0) {
    return (
      <Page title="Flash cards" lead="The words you have met, asked in a way you have not.">
        <Empty
          title={words.length === 0 ? "No words met yet" : "Every word you have met is mastered"}
          body={
            words.length === 0
              ? "This round works on words review has already introduced."
              : undefined
          }
          action={
            words.length === 0
              ? <ButtonLink href="/review" variant="primary">Open review</ButtonLink>
              : <ButtonLink href="/words/mastery" variant="primary">See the list</ButtonLink>
          }
        />
      </Page>
    );
  }

  /*
    Hardest first, and then whatever is furthest from being finished.

    `MASTERY_ORDER` already says which list is worth reading first and this is
    the same judgement about which word is worth asking first, read from the
    same table rather than from a second one that would drift from it.
  */
  const candidates = [...unfinished]
    .sort(
      (a, b) =>
        MASTERY_ORDER.indexOf(a.verdict.mastery) - MASTERY_ORDER.indexOf(b.verdict.mastery) ||
        a.verdict.slots - b.verdict.slots ||
        a.verdict.correct - b.verdict.correct ||
        a.lemma.localeCompare(b.lemma, "et"),
    )
    .slice(0, ROUND * 3);
  const lexemeIds = candidates.map((w) => w.lexemeId);

  /*
    The entries and the cards, at once. Neither needs the other, and on the
    deployment's own pooler each `await` is a round trip.

    Three times the round is read rather than exactly the round, because a word
    can turn out to have nothing askable left: a phrase whose only slot is
    already full, or an entry whose cards have since been deleted. Taking the
    shortfall out of a longer list is one query; discovering it afterwards
    would be another.
  */
  const [lexemes, cards] = await Promise.all([
    prisma.lexeme.findMany({
      where: { id: { in: lexemeIds } },
      select: {
        id: true, lemma: true, translation: true, pos: true, examples: true,
        // Which local cases the word takes and which pronoun asks for it, both
        // of which are facts about the meaning rather than the spelling.
        semanticTypes: true,
        forms: { select: { formType: true, value: true, morphCode: true }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.card.findMany({
      where: { ownerId, lexemeId: { in: lexemeIds }, suspended: false },
      select: { id: true, lexemeId: true, cardType: true, targetCase: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const byLexeme = new Map(lexemes.map((l) => [l.id, l]));
  const cardsFor = new Map<string, typeof cards>();
  for (const card of cards) {
    if (!card.lexemeId) continue;
    cardsFor.set(card.lexemeId, [...(cardsFor.get(card.lexemeId) ?? []), card]);
  }

  const prompts: FlashPrompt[] = [];
  for (const word of candidates) {
    if (prompts.length >= ROUND) break;
    const prompt = promptFor(
      word, byLexeme.get(word.lexemeId), cardsFor.get(word.lexemeId) ?? [], prompts.length,
    );
    if (prompt) prompts.push(prompt);
  }

  if (prompts.length === 0) {
    return (
      <Page title="Flash cards" lead="The words you have met, asked in a way you have not.">
        <Empty
          title="Nothing to ask yet"
          body="Every word you have met is either mastered or has no form left to ask for."
          action={<ButtonLink href="/words/mastery" variant="primary">See where you are</ButtonLink>}
        />
      </Page>
    );
  }

  return <FlashSession prompts={prompts} />;
}

/**
 * One task for one word: the slot it has not been right in yet, in the shape
 * its own history has opened.
 *
 * Returns nothing where the dictionary or the deck cannot support a question,
 * which is a real case rather than a defensive one: an adverb has one slot and
 * a learner may already have filled it, and a word whose cards were deleted
 * has nothing for the answer to grade against (ADR-016).
 */
function promptFor(
  word: MasteredWord,
  lexeme: {
    id: string; lemma: string; translation: string; pos: string; examples: string;
    semanticTypes: string | null;
    forms: { formType: string; value: string; morphCode: string | null }[];
  } | undefined,
  cards: { id: string; lexemeId: string | null; cardType: string; targetCase: string | null }[],
  /** Where this word sits in the round, which is half of what varies the case. */
  offset: number,
): FlashPrompt | null {
  if (!lexeme || cards.length === 0) return null;

  const source: FlashWord = {
    lexemeId: word.lexemeId,
    lemma: lexeme.lemma,
    translation: lexeme.translation,
    pos: lexeme.pos,
    semanticTypes: lexeme.semanticTypes,
    forms: lexeme.forms,
    examples: usableExamples(parseExamples(lexeme.examples)),
  };

  /*
    A slot this word has not been right in, and a form ahead of a meaning.

    The variety half of mastery is what this round exists to close, so asking
    again for something already answered would be spending the question on the
    half that is already done. Where every slot is filled and the word is still
    not mastered, which is the count half being short, the first slot is asked
    again: that is the honest thing to do rather than dropping the word.
  */
  const askable = askableSlots(source);
  if (askable.length === 0) return null;
  const filled = new Set(word.verdict.filled);
  const open = askable.filter((s) => !filled.has(s.slot));
  const preferred = open.length > 0 ? open : askable;
  const forms = preferred.filter((s) => s.slot !== "PRODUCTION");
  /*
    A FORM THE DICTIONARY CAN SHOW IN A SENTENCE IS ASKED BEFORE ONE IT CANNOT.
    The sentence is what says why anybody would produce the form, so while a
    word still has an open slot with a recorded sentence behind it, that slot
    is asked; the bare ask is what is left once those are filled. See the
    header of `lib/games/flash.ts`.
  */
  const sentenced = forms.filter((s) => hasSentence(source, s));
  const pool = sentenced.length > 0 ? sentenced : forms.length > 0 ? forms : preferred;

  /*
    WHICH OF THE OPEN SLOTS, WHICH IS NOT THE FIRST ONE.

    This took the first open slot, and `CASES` is in the traditional order, so
    the first open case is the sisseütlev for practically every noun in a
    deck. The first round anybody drove asked for it seven times out of ten,
    which is the opposite of the variety this round exists for.

    Two numbers turn it, and both are already here. The word's own correct
    answers move a word through its cases as it settles, so `tuba` is not the
    illative for ever; the position in the round moves two words with the same
    history apart, so a round of ten does not open with the same case ten
    times. Deterministic in both, which is what lets a reloaded round ask the
    same question rather than reshuffling under somebody who refreshed.
  */
  const slot = pool[(word.verdict.correct + offset) % pool.length]!;

  const card = cardFor(cards, slot.slot);
  const task = flashTask({ word: source, slot, cardId: card.id, step: word.verdict.correct });
  if (!task) return null;

  return {
    ...task,
    progress: {
      correct: word.verdict.correct,
      needCorrect: MASTERY_CORRECT,
      slots: word.verdict.slots,
      needSlots: word.verdict.slotsNeeded,
    },
  };
}

/**
 * The card an answer grades.
 *
 * The card about this very slot where the learner has one, so its own
 * scheduling moves with the answer; otherwise the card that comes closest to
 * being about producing the word. Never a card at random: an answer graded
 * against whichever row the plan returned first would move a schedule nobody
 * practised.
 */
function cardFor(
  cards: { id: string; cardType: string; targetCase: string | null }[],
  slot: string,
): { id: string } {
  const exact = cards.find((c) => slotOfCard(c) === slot);
  if (exact) return exact;
  for (const type of ["CASE_FORM", "CLOZE", "PRODUCTION", "CONJUGATION", "RECOGNITION"]) {
    const card = cards.find((c) => c.cardType === type);
    if (card) return card;
  }
  return cards[0]!;
}
