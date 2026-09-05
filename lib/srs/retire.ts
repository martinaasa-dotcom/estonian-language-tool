import { caseFits, caseIsUnsaidFor, type CaseSubject } from "@/lib/estonian/caseQuestion";
import { CASES } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";
import { generateCards, isBareCaseFront, type LexemeForCards } from "@/lib/srs/cards";

/**
 * THE CASE CARDS A DECK KEPT THAT ARE WRONG ABOUT ESTONIAN.
 *
 * `lib/srs/cards.ts` asks `caseFits` before it builds a `CASE_FORM` card, so a
 * person is never asked for an inside case and a word with no singular is never
 * asked for anything. That fix settles the cards built from now on and not one
 * card already in a deck, because a `Card` row carries its own front, back and
 * `targetCase` and nothing in this app rewrites one.
 *
 * What that leaves is the fault a learner reported: `isa → milles? kus?` with
 * `isas` on the back. `isas` is not a way of saying anything in Estonian. It is
 * worse than a card that prints its own answer, because a card that marks you
 * wrong is one you argue with and this one is one you learn: somebody who
 * passes it has learned to say `ma annan raamatu õpetajasse`, and the app has
 * contradicted the teacher whose class they are sitting in.
 *
 * "IS THIS CARD WRONG" IS NOT "WOULD THE BUILDER BUILD IT", AND THE FIRST
 * VERSION OF THIS ASKED THE SECOND.
 *
 * It was `caseFits` and nothing else, on the argument that the audit's test and
 * the builder's test should be one function. That argument is about a rule and
 * this is a *deletion*, and the two questions come apart at exactly the place
 * that matters: where the dictionary has said nothing.
 *
 * `localCasesFor` reads "we do not know" as the inside trio. For a builder that
 * is the right default, and its own header says why: an unclassified word is
 * one somebody typed in or confirmed off a photograph, and reading the silence
 * as "it is a person" would break cards that are currently right. For a
 * destructive command it is precisely backwards. `caseFits` refuses the
 * *outside* trio on an unclassified word, so on a deployment whose `Lexeme`
 * rows predate `semanticTypes` the old rule condemned every correct outside
 * card in the database: `isa → isale`, `õpetaja → õpetajale`, `arst → arstile`,
 * `koer → koerale`. Measured on the production database that reported the
 * original fault: 6,952 entries, none of them classified, and 318 cards
 * marked for removal, every one of them right.
 *
 * So this asks the narrow question instead: **is the form on the back one the
 * language does not use?** That needs the dictionary to have said something,
 * and it is only ever said one way round. An inside case on a being is `isas`,
 * which nobody says. An outside case on a room is `toale`, which is ordinary
 * Estonian that the card builder happens not to choose. Only the first is a
 * card to take out of somebody's deck.
 *
 * WHAT COUNTS AS THE DICTIONARY HAVING SAID SOMETHING is `caseIsUnsaidFor`,
 * and it lives in `lib/estonian/caseQuestion.ts` beside `caseFits` rather than
 * here, because that module and `place.ts` are the only two allowed to decide
 * which set of local cases a word takes. Silence is never evidence there
 * either, and a word the Institute called both a being and a place has two
 * ordinary readings rather than a wrong one.
 *
 * The other fault this reports rests on evidence the same way. A word with no
 * singular fails every case, and what says so is the dictionary holding a
 * `NOM_SG` that is not the headword: `prillid` is headed by a plural and Ekilex
 * records `prill` underneath, so `prillid → milles?` wanted `prillis`, which is
 * a form of a word the learner was never shown. A card whose entry has no
 * `NOM_SG` at all makes no such claim and is left alone.
 *
 * ONE RULE, TWO READERS. `scripts/audit-decks.ts` reports and removes; nothing
 * else does either, because every row this names belongs to a learner and that
 * stays a command somebody runs rather than something a seed does behind them.
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
  /** A being asked for an inside case: `isas`, `õpetajasse`, `koeras`. */
  | "wrong-local-set"
  /** The word has no singular, so the form asked for belongs to another word. */
  | "no-singular"
  /** A bare ask, `ravim → millesse? kuhu?`, that no recorded sentence can carry. */
  | "no-sentence";

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
 * Does the dictionary positively say the headword is not its own singular?
 *
 * `caseFits` refuses every case for such a word, and the claim rests on a
 * stored `NOM_SG` that differs from the lemma. An entry holding none says
 * nothing and is left alone.
 */
function knownToHaveNoSingular(subject: CaseSubject): boolean {
  if (!subject.nomSg) return false;
  return subject.nomSg.trim().toLocaleLowerCase("et")
    !== subject.lemma.trim().toLocaleLowerCase("et");
}

/**
 * The cards in a deck whose answer is a form Estonian does not use.
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

    /*
      The builder's own test first, so nothing is ever removed that the builder
      would happily make. It is necessary and, on its own, nowhere near
      sufficient: everything below is the evidence that makes a refusal a
      deletion.
    */
    if (caseFits(key, subject)) continue;

    if (knownToHaveNoSingular(subject)) {
      out.push({ id: card.id, ownerId: card.ownerId, lemma: subject.lemma, grammCase: key, why: "no-singular" });
      continue;
    }

    /*
      And only ever this way round. `isas` is not Estonian; `toale` is, and a
      card asking for it is one the builder would no longer choose rather than
      one that teaches a form nobody says.
    */
    if (caseIsUnsaidFor(key, subject)) {
      out.push({ id: card.id, ownerId: card.ownerId, lemma: subject.lemma, grammCase: key, why: "wrong-local-set" });
    }
  }
  return out;
}

/**
 * A bare case card, as the third rule needs it: the front, to tell the old
 * shape from the new, and the whole entry, because deciding whether a sentence
 * exists for a case is the builder's own question and the builder wants the
 * entry it builds from.
 */
export interface BareCaseCard {
  readonly id: string;
  readonly ownerId: string;
  readonly targetCase: string | null;
  readonly front: string;
  readonly lexeme: LexemeForCards | null;
}

/**
 * THE BARE CASE CARDS NO SENTENCE CAN REPLACE.
 *
 * A case is drilled in a sentence that uses it, or it is not drilled: that is
 * the rule `lib/srs/cards.ts` builds by now, and a learner reported the card it
 * replaced, `ravim → millele? kuhu?`, in exactly those terms. What is the point
 * of the form, and when would anybody use it? A deck built before the change
 * still holds the bare ask, on every case of every word that had a genitive
 * stem, and nothing in the app rewrites a card.
 *
 * Two things happen to those cards and this is the second. `repairCaseFronts`
 * in `prisma/repair.ts` rewrites a bare card into the sentence shape wherever
 * the dictionary holds a sentence naming that case, which keeps the card, its
 * schedule and its history and changes only the question. What that leaves is
 * the card the builder would not build today and cannot rebuild: the word has
 * no recorded sentence in that case, so the ask can only ever be a suffix on a
 * stem. Those are named here, for `scripts/audit-decks.ts` to report and, on a
 * second run, remove.
 *
 * THE BUILDER IS THE TEST, deliberately, where the two rules above it ask a
 * narrower question. Deleting `isas` needed positive evidence because the
 * builder's default on an unclassified word is a guess, and a guess is not
 * grounds for a deletion. Here there is no guess to make: either a
 * lexicographer wrote a sentence carrying this case of this word, and the
 * builder finds it, or nobody did. A card the builder can rebuild is left
 * alone and is the repair's to rewrite; only a card it cannot is named.
 *
 * A card already in the sentence shape is never named, whatever the entry
 * holds now: it was built out of a sentence and the question on it is a real
 * one, even if the dictionary has since lost the usage behind it.
 */
export function unsentencedCaseCards(cards: readonly BareCaseCard[]): Retirement[] {
  const out: Retirement[] = [];
  const built = new Map<LexemeForCards, Set<string>>();
  for (const card of cards) {
    const key = card.targetCase;
    if (!key || !isCaseKey(key)) continue;
    if (!isBareCaseFront(card.front)) continue;
    if (!card.lexeme) continue;

    let cases = built.get(card.lexeme);
    if (!cases) {
      cases = new Set(
        generateCards(card.lexeme, ["CASE_FORM"]).map((c) => c.targetCase ?? ""),
      );
      built.set(card.lexeme, cases);
    }
    if (cases.has(key)) continue;

    out.push({ id: card.id, ownerId: card.ownerId, lemma: card.lexeme.lemma, grammCase: key, why: "no-sentence" });
  }
  return out;
}
