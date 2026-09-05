import { CASES, caseByKey } from "@/lib/estonian/cases";

/**
 * WHICH FACET OF A WORD ONE ANSWER WAS ABOUT.
 *
 * `Review.targetCase` answers this for a case card and nothing else, and that
 * turned out to be most of why nothing was ever mastered. `lib/srs/mastery.ts`
 * counts distinct slots as the variety half of its claim, reading
 * `targetCase ?? ""`, so every answer that was not about a case landed in one
 * shared slot:
 *
 *   - A verb has no case cards at all, because `CASE_FORM` needs a genitive
 *     stem. Its recognition, production, gap-fill and eight conjugation cards
 *     were one slot between them, so no verb in any deck could ever reach the
 *     three the rule asks for. Not one of the 799 in the shipped dictionary.
 *   - A word added from the dictionary gets recognition, production and a
 *     gap-fill by default (`CARD_TYPES`), so it had two slots at best and
 *     usually one.
 *
 * A rule nothing can satisfy is not a high standard, it is a broken counter,
 * and the round built on top of it draws the words that are *not* mastered, so
 * the two faults compound: the flash round kept asking about words it would
 * never let go of.
 *
 * So a slot is the specific thing that was asked, and `Review.slot` records it.
 * A case where there is one, the conjugation form where the answer was a named
 * part of a verb, and the card's own type otherwise, because "what does this
 * word mean" and "how do you say it" are two different questions about one word
 * and always were.
 *
 * WHY NOT WIDEN `targetCase`. It is read by `caseAccuracy`, which tallies
 * whatever string it finds and hands it to `WeakestCases`, which falls back to
 * printing the key in lower case. Writing `IndPrSg3` into that column puts
 * `indprsg3` on the Progress page beside `osastav`. The two columns answer two
 * questions: `targetCase` is for the case charts and is unchanged, `slot` is
 * for "have you met this word in enough ways", and neither has to be bent to
 * be the other.
 *
 * Pure. No React, no Prisma, no Estonian: a slot is a key, and `slotLabel`
 * reads the names out of `CASES` and the table below, which holds morph codes
 * and the labels a class uses, exactly as `lib/srs/cards.ts` did when it owned
 * this table.
 */

/**
 * The named parts of the verb a card can ask for, with the Ekilex morph code
 * that identifies each one.
 *
 * It lives here rather than in `lib/srs/cards.ts` because it is now read by
 * two things that must not disagree: the card builder, and whatever decides
 * what a verb answer was about. The labels are the four axes a course keeps
 * apart, which is the naming rule the whole app follows.
 */
export interface ConjugationSlot {
  code: string;
  formType?: string;
  label: string;
  negative?: boolean;
  /** A second Ekilex code whose form is also a right answer for this slot. */
  alsoCode?: string;
}

export const CONJUGATION_SLOTS: readonly ConjugationSlot[] = [
  { code: "IndPrSg1", formType: "PRES_1SG", label: "olevik · ma" },
  { code: "IndPrSg3", label: "olevik · ta" },
  { code: "IndPrPl1", label: "olevik · me" },
  // The negative is one form for every person, said after `ei`. The card
  // shows and accepts the two words together, since `loe` on its own is not
  // what anybody says.
  //
  // `pole` is the other half of that for the one verb that has one. Estonian
  // contracts `ei ole` and the contraction is what people say and write, so a
  // learner typing it was being marked wrong on the commonest verb in the
  // language. Ekilex records it as `IndPrPsN`, for `olema` and for nothing
  // else the course asks about, and the card carries both answers the way the
  // illative does: joined with the separator `acceptedAnswers` splits on, so
  // what the screen shows and what the marker takes are one string.
  { code: "IndPrPs_", label: "eitus · ma ei", negative: true, alsoCode: "IndPrPsN" },
  { code: "IndIpfSg1", formType: "PAST_1SG", label: "lihtminevik · ma" },
  { code: "IndIpfSg3", label: "lihtminevik · ta" },
  { code: "KndPrSg1", label: "tingiv kõneviis · ma" },
  { code: "ImpPrSg2", label: "käskiv kõneviis · sa!" },
  /*
    The polite imperative, which is the one a learner is addressed with. Every
    counter, every receptionist and every official in the country says `öelge`,
    `andke`, `täitke` and `oodake`, and the app could not produce one for any
    verb in the language: it is not a suffix on anything the rule holds, since
    `annan` goes to `andke`, `lähen` to `minge` and `loen` to `lugege`. It is
    stored now, like every other form no rule reaches, and it was found by
    `eval:scene`, where a model writing a `teie` scene reached for it over and
    over and the gate withheld every line.
  */
  { code: "ImpPrPl2", label: "käskiv kõneviis · te!" },
];
/**
 * Slots that are not a form of the word: the questions every word can be asked
 * whatever the dictionary holds for it.
 *
 * These are card types, spelled as `Card.cardType` spells them, because that
 * is what a review of one of those cards is about and the column is already
 * there. A slot for a card type nobody generates is not a problem: the set is
 * what may be *written*, and nothing writes a slot for a card it does not have.
 */
export const MEANING_SLOTS: readonly string[] = [
  "RECOGNITION", "PRODUCTION", "CLOZE", "GOVERNMENT", "CONJUGATION", "GRADATION", "CASE_FORM",
];

const CASE_KEYS = new Set(CASES.map((c) => c.key as string));
const CONJUGATION_CODES = new Set(CONJUGATION_SLOTS.map((s) => s.code));

/**
 * Whether a string is a slot this app writes.
 *
 * `gradeCard` is a public endpoint and the slot arrives as JSON whatever the
 * types say, so it is checked against a closed list before it reaches the one
 * table that cannot be repaired. The same discipline `CARD_SOURCES` applies to
 * `Card.source`, and for a stronger reason: a forged slot would not break a
 * count, it would tell somebody they had mastered a word in a form nobody had
 * ever asked them for.
 */
export function isKnownSlot(slot: string): boolean {
  return CASE_KEYS.has(slot) || CONJUGATION_CODES.has(slot) || MEANING_SLOTS.includes(slot);
}

/** Whether a slot is a grammatical form rather than a question about meaning. */
export function isFormSlot(slot: string): boolean {
  return CASE_KEYS.has(slot) || CONJUGATION_CODES.has(slot);
}

/**
 * The slot an ordinary review of one card falls in.
 *
 * The card's case where it has one, which keeps every review written before
 * this reading the same way it always did, and the card's type otherwise.
 */
export function slotOfCard(
  card: { cardType: string; targetCase: string | null; slot?: string | null },
): string {
  // The case where it has one, then the conjugation slot where it has one, then
  // the type. A card built before `Card.slot` existed reads exactly as it did.
  return card.targetCase ?? card.slot ?? card.cardType;
}

/**
 * The slot a card is about, read off the card itself.
 *
 * `slotOfCard` above answers this from the columns, and it answers it for every
 * card but one: a conjugation card carries no `targetCase`, because the column
 * is for cases and widening it would put `indprsg3` on the Progress page beside
 * `osastav`. So the row for `kohtuma → lihtminevik · ma` says only that it is a
 * `CONJUGATION`, and a screen that wants to say in plain English what that card
 * is asking for has nothing to key on.
 *
 * The front was generated as `${lemma} → ${slot.label}` and the labels are a
 * closed table of ten, so the lookup is exact rather than a guess: a front
 * whose tail is not one of the ten returns null and the screen prints what it
 * always printed. A conjugation card built since carries `Card.slot` and its
 * front is a sentence with the form taken out, so `slotOfCard` answers for it
 * and this reaches only the cards in a deck built before the column existed. It is a read of what the builder wrote, never a write, and it
 * never reaches `Review.slot`, which is checked against `isKnownSlot` on the
 * way into the one table that cannot be repaired.
 */
export function conjugationSlotFromFront(front: string): string | null {
  const tail = front.split("\u2192").pop()?.trim();
  if (!tail) return null;
  return CONJUGATION_SLOTS.find((s) => s.label === tail)?.code ?? null;
}

/** What a slot is called on a screen. The Estonian name leads, as everywhere. */
export function slotLabel(slot: string): string {
  const spec = caseByKey(slot);
  if (spec) return `${spec.et} · ${spec.question}`;

  const verb = CONJUGATION_SLOTS.find((s) => s.code === slot);
  if (verb) return verb.label;

  return MEANING_LABELS[slot] ?? slot.toLowerCase();
}

/** The short version, for a chip beside a word. */
export function slotShort(slot: string): string {
  const spec = caseByKey(slot);
  if (spec) return spec.et;
  return CONJUGATION_SLOTS.find((s) => s.code === slot)?.label ?? MEANING_LABELS[slot] ?? slot.toLowerCase();
}

const MEANING_LABELS: Record<string, string> = {
  RECOGNITION: "what it means",
  PRODUCTION: "saying it",
  CLOZE: "in a sentence",
  GOVERNMENT: "rektsioon",
  CONJUGATION: "a named form",
  GRADATION: "astmevaheldus",
  CASE_FORM: "a case",
};
