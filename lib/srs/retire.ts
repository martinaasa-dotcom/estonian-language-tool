import { caseFits, type CaseSubject } from "@/lib/estonian/caseQuestion";
import { CASES } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * THE CASE CARDS A DECK KEPT AFTER THE BUILDER STOPPED MAKING THEM.
 *
 * `lib/srs/cards.ts` asks `caseFits` before it builds a `CASE_FORM` card, so a
 * person is never asked for an inside case and a word with no singular is
 * never asked for anything. That fix settles the cards built from now on and
 * not one card already in a deck, because a `Card` row carries its own front,
 * back and `targetCase` and nothing in this app rewrites one.
 *
 * What that leaves is the fault a learner reported: `isa → milles? kus?` with
 * `isas` on the back, on the daily quest, on a card the deck had held since
 * before `lib/estonian/semantics.ts` existed. `isas` is not a way of saying
 * anything in Estonian. It is worse than a card that marks a right answer
 * wrong, because a card that marks you wrong is one you argue with and this
 * one is one you learn: somebody who passes it has learned to say
 * `ma annan raamatu õpetajasse`, and the app has contradicted the teacher
 * whose class they are sitting in.
 *
 * ONE RULE, TWO READERS. `scripts/audit-decks.ts` reports and removes; nothing
 * else does either, because every row this names belongs to a learner and
 * `docs/13-mvp-status.md` settled that as a command somebody runs rather than
 * something a seed does behind them. Both halves of the audit read this, so
 * the rule cannot be stated twice and drift.
 *
 * IT IS `caseFits` AND NOTHING ELSE, which is the whole of why it is safe.
 * The builder's test and the audit's test are the same function over the same
 * three facts, so a card this removes is exactly a card the builder would
 * refuse to make, and a change to the rule reaches both at once. In
 * particular: a word the dictionary has no classification for keeps every
 * card it has, because `localCasesFor` reads "we do not know" as the inside
 * trio, which is what those cards were built on.
 *
 * Pure: rows in, ids out. No Prisma, no clock.
 */

/** One card, as much of it as the rule needs. */
export interface DeckCaseCard {
  readonly id: string;
  readonly ownerId: string;
  readonly targetCase: string | null;
  /** The entry the card is about, or null where the card has lost it. */
  readonly lexeme: {
    readonly lemma: string;
    readonly semanticTypes: string | null;
    readonly forms: readonly { readonly formType: string; readonly value: string }[];
  } | null;
}

/** Why a card cannot be answered, so the report can say which fault it found. */
export type RetireReason =
  /** The word takes the other set of local cases: a person is not a place. */
  | "wrong-local-set"
  /** The word has no singular, so the form asked for belongs to another word. */
  | "no-singular";

export interface Retirement {
  readonly id: string;
  readonly ownerId: string;
  readonly lemma: string;
  readonly grammCase: CaseKey;
  readonly why: RetireReason;
}

const isCaseKey = (value: string): value is CaseKey =>
  CASES.some((spec) => spec.key === value);

function subjectOf(card: DeckCaseCard): CaseSubject | null {
  if (!card.lexeme) return null;
  return {
    lemma: card.lexeme.lemma,
    semanticTypes: card.lexeme.semanticTypes,
    nomSg: card.lexeme.forms.find((f) => f.formType === "NOM_SG")?.value ?? null,
  };
}

/**
 * The cards in a deck that ask a case the word does not take.
 *
 * A card whose `targetCase` is not a case at all is left alone rather than
 * guessed about: `Review.slot` widened what may be written down and a row
 * carrying something this table does not know is a fact about a column rather
 * than a broken card.
 */
export function retirableCaseCards(cards: readonly DeckCaseCard[]): Retirement[] {
  const out: Retirement[] = [];
  for (const card of cards) {
    const key = card.targetCase;
    if (!key || !isCaseKey(key)) continue;
    const subject = subjectOf(card);
    if (!subject) continue;
    if (caseFits(key, subject)) continue;
    out.push({
      id: card.id,
      ownerId: card.ownerId,
      lemma: subject.lemma,
      grammCase: key,
      /*
        Which of the two, decided by asking the subject rather than by
        repeating the test: a word with no singular fails every case, so it is
        the first thing to rule out and the local sets are what is left.
      */
      why: caseFits("COMITATIVE", subject) ? "wrong-local-set" : "no-singular",
    });
  }
  return out;
}
