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
export const CONJUGATION_SLOTS: readonly {
  code: string;
  formType?: string;
  label: string;
  negative?: boolean;
}[] = [
  { code: "IndPrSg1", formType: "PRES_1SG", label: "olevik · ma" },
  { code: "IndPrSg3", label: "olevik · ta" },
  { code: "IndPrPl1", label: "olevik · me" },
  // The negative is one form for every person, said after `ei`. The card
  // shows and accepts the two words together, since `loe` on its own is not
  // what anybody says.
  { code: "IndPrPs_", label: "eitus · ma ei", negative: true },
  { code: "IndIpfSg1", formType: "PAST_1SG", label: "lihtminevik · ma" },
  { code: "IndIpfSg3", label: "lihtminevik · ta" },
  { code: "KndPrSg1", label: "tingiv kõneviis · ma" },
  { code: "ImpPrSg2", label: "käskiv kõneviis · sa!" },
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
export function slotOfCard(card: { cardType: string; targetCase: string | null }): string {
  return card.targetCase ?? card.cardType;
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
