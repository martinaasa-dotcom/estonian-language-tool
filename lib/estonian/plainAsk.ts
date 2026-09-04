/**
 * WHAT A SLOT IS ASKING FOR, IN THE WORDS SOMEBODY WOULD USE OUT LOUD.
 *
 * A learner reported a flash card headed "Put it in the lihtminevik · ma" and
 * said they could not tell what it wanted. They were right, and the reply they
 * wrote is the specification for this file: the word is `kohtuma`, and what the
 * card is actually asking is how you say it about yourself, in the past. The
 * answer was `kohtusin`, and nothing on the screen said so in a way somebody
 * could act on without already knowing what `lihtminevik` means.
 *
 * That is not an argument against the Estonian names. CLAUDE.md is emphatic
 * about them and it is right: a class in Tallinn, a school textbook and the
 * state examination all name a case by its Estonian name and by the question it
 * answers, and a learner who has only ever met "the inessive" cannot follow
 * their own teacher. What was missing is the layer under it. Somebody who has
 * not met `seesütlev` yet needs to know what is being asked *before* they can
 * learn what it is called, and a name they cannot cash in is furniture.
 *
 * So this is the third thing a screen can say about a slot, beside the Estonian
 * name and the English one, and it is the one that leads on a card: a clause
 * that finishes "How do you say this ...?" and means something to a person who
 * has never opened a grammar book. The name stays on the screen underneath it,
 * where it is the cross-reference it was always meant to be.
 *
 * NOTHING HERE IS GENERATED AND NOTHING HERE IS ESTONIAN. Every clause is
 * authored English about a slot key, which is the same latitude
 * `lib/estonian/grammar.ts` takes: English is the one language this project
 * writes. In particular a clause never inflects the learner's word in either
 * language. "I met" would read better than "about yourself, already happened",
 * and there is no rule that turns "to meet" into "met" for every verb in
 * English any more than there is one that turns `kohtuma` into `kohtusin`, so
 * the clause describes the form rather than spelling it. The dictionary spells
 * it, after the answer.
 *
 * DELIBERATELY PARTIAL, like `lib/estonian/terms.ts` and for its reason. A slot
 * is in the table only where a plain sentence says something a name does not.
 * `PRODUCTION` is not in it, because "how do you say this word" is already the
 * whole question and a clause under it would be the question again.
 *
 * Pure: no React, no Prisma, no Estonian.
 */

/** Completes "How do you say this ...?" for one slot. Null where nothing to add. */
const CLAUSES: Record<string, string> = {
  /*
    The cases, said as the thing you would be doing when you reach for one.

    Written as "something" and "somebody" rather than with the learner's own
    word in them, because the word is already at the top of the card in both
    languages and a gloss dropped into a frame reads badly the moment it is a
    list: `tuba` is glossed "room, chamber" and "when something is inside room,
    chamber" is worse than no sentence at all.
  */
  NOMINATIVE: "as the plain dictionary word",
  GENITIVE: "when it belongs to somebody, the form behind “of”",
  PARTITIVE: "when you mean some of it, or an action not finished",
  ILLATIVE: "when something goes into it",
  INESSIVE: "when something is inside it",
  ELATIVE: "when something comes out of it, or is about it",
  ALLATIVE: "when something goes to it, or is given to somebody",
  ADESSIVE: "when something sits on it, or somebody has it",
  ABLATIVE: "when something is taken from it, or off it",
  TRANSLATIVE: "when something turns into it",
  TERMINATIVE: "when you mean up to it, or until it",
  ESSIVE: "when somebody is acting as it",
  ABESSIVE: "when something is done without it",
  COMITATIVE: "when something is done with it",

  /*
    The verb, said as the two things a course keeps apart that a learner can
    feel: who is doing it, and when. The four axes are on the card underneath
    in their own names, which is where somebody sitting a course will want
    them.
  */
  IndPrSg1: "about yourself, happening now",
  IndPrSg3: "about somebody else, happening now",
  IndPrPl1: "about you and somebody else, happening now",
  IndPrPs_: "about yourself, saying you do not do it",
  IndIpfSg1: "about yourself, already happened",
  IndIpfSg3: "about somebody else, already happened",
  KndPrSg1: "about yourself, as something you would do",
  ImpPrSg2: "telling one person you know to do it",
  ImpPrPl2: "telling somebody politely, or a group, to do it",
};

/**
 * The plain-English clause for a slot, or null where there is nothing to add.
 *
 * Null is an answer rather than a gap: a screen with no clause prints the name
 * on its own, exactly as it did before this existed.
 */
export function plainAsk(slot: string): string | null {
  return CLAUSES[slot] ?? null;
}

/**
 * The whole question, ready to print above a box.
 *
 * "this" rather than the word itself, because the word is already at the top of
 * the card in both languages and this module holds no Estonian to put there.
 */
export function plainAskLine(slot: string): string | null {
  const clause = plainAsk(slot);
  return clause ? `How do you say this ${clause}?` : null;
}

/** Every slot that has a plain reading. Exported for the checks that count them. */
export function slotsWithPlainAsk(): readonly string[] {
  return Object.keys(CLAUSES);
}
