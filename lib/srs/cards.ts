import { CASES, caseByKey } from "@/lib/estonian/cases";
import { localCasesFor } from "@/lib/estonian/place";
import { buildCloze } from "@/lib/estonian/cloze";
import { gapForms } from "@/lib/estonian/gapForms";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { derivedVerbForms, pres1sgFrom } from "@/lib/estonian/conjugate";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import type { CaseKey } from "@/lib/estonian/types";

export type CardType =
  | "RECOGNITION" | "PRODUCTION" | "CASE_FORM" | "GRADATION" | "GOVERNMENT" | "CLOZE" | "CONJUGATION";

export interface CardTypeSpec {
  readonly type: CardType;
  readonly label: string;
  readonly description: string;
  /** Selected by default when adding a word to the deck. */
  readonly defaultOn: boolean;
}

export const CARD_TYPES: readonly CardTypeSpec[] = [
  { type: "RECOGNITION", label: "Recognition", description: "Estonian → English", defaultOn: true },
  { type: "PRODUCTION", label: "Production", description: "English → Estonian", defaultOn: true },
  { type: "CASE_FORM", label: "Case form", description: "Answer a case question from the stem", defaultOn: false },
  { type: "GRADATION", label: "Gradation", description: "Strong grade → weak grade", defaultOn: false },
  { type: "GOVERNMENT", label: "Government", description: "Which case the verb takes", defaultOn: false },
  { type: "CLOZE", label: "In a sentence", description: "Fill the gap in a real Estonian sentence", defaultOn: true },
  { type: "CONJUGATION", label: "Conjugation", description: "Produce a named form of a verb", defaultOn: false },
];

/**
 * The order a word's own cards are worth meeting in.
 *
 * Every card a word generates is created in one `createMany` with one
 * `createdAt`, so ordering the new-card queue by that column leaves the cards
 * of a single word tied, and Postgres is free to return them in any order it
 * likes. That is how a learner's first sight of `juhtuma` came to be a
 * conjugation card asking for `olevik · ma`: a form of a verb whose meaning
 * the app had not told them yet.
 *
 * So the tie is broken here rather than left to the database, and the order is
 * the order a lesson teaches in: meet the word, then say it, then see it in a
 * sentence, and only then produce a named form of it. A type missing from this
 * table sorts last, which is the safe end for one nobody has thought about.
 */
const TEACHING_ORDER: readonly CardType[] = [
  "RECOGNITION", "PRODUCTION", "CLOZE", "CASE_FORM", "CONJUGATION", "GRADATION", "GOVERNMENT",
];

export function teachingRank(cardType: string): number {
  const at = TEACHING_ORDER.indexOf(cardType as CardType);
  return at === -1 ? TEACHING_ORDER.length : at;
}

/**
 * Sorts a batch of new cards so each word introduces itself before it examines
 * anybody.
 *
 * Stable within a word, and it deliberately does not reorder *across* words:
 * the queue's own ordering decided which words come first and this only settles
 * the ties inside one. Cards with no lexeme are their own group, since a
 * manually written card belongs to nothing.
 */
export function inTeachingOrder<T extends { lexemeId: string | null; cardType: string }>(cards: T[]): T[] {
  // Decorated rather than compared in place: the comparator needs each card's
  // original position, and looking that up with indexOf would be quadratic and
  // would also collapse two equal objects onto one index.
  const firstSeen = new Map<string, number>();
  const decorated = cards.map((card, i) => {
    const key = card.lexemeId ?? `#${i}`;
    if (!firstSeen.has(key)) firstSeen.set(key, i);
    return { card, i, group: firstSeen.get(key)!, rank: teachingRank(card.cardType) };
  });

  decorated.sort((a, b) => (a.group - b.group) || (a.rank - b.rank) || (a.i - b.i));
  return decorated.map((d) => d.card);
}

/**
 * The verb forms worth drilling, and what to call them.
 *
 * Eight, not sixty. These are the ones a beginner has to produce out loud in a
 * conversation; the rest of the forms are on the dictionary entry to be read,
 * not memorised. An attested form always answers first: Ekilex's, by its
 * morph code, or the seeded principal part. Where the dictionary holds only
 * the principal parts, which is every seeded verb on a deployment without a
 * key, the present, the negative, the conditional and the singular imperative
 * come from `lib/estonian/conjugate.ts`, the one rule over a stored stem that
 * was checked against every verb in the dictionary before it was allowed to
 * put a word on the back of a card. The simple past third person has no such
 * rule and stays attested-only, so a seeded verb makes seven cards and an
 * enriched one eight.
 *
 * Asked by the name a teacher asks by. Nobody stands at a whiteboard in Tallinn
 * and says "the conditional"; they say `tingiv kõneviis`, and a learner who has
 * only ever met the English name cannot follow the question. The English name
 * is on the reference page this card links back to, which is the right place
 * for a cross-reference and the wrong place for the prompt.
 */
const CONJUGATION_SLOTS: { code: string; formType?: string; label: string; negative?: boolean }[] = [
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
 * The form for one conjugation slot: attested where the dictionary has it,
 * derived where the rule reaches, and nothing otherwise.
 */
function conjugationAnswer(lex: LexemeForCards, slot: (typeof CONJUGATION_SLOTS)[number]): string | null {
  const attested = lex.forms.find(
    (f) =>
      f.morphCode === slot.code ||
      f.formType === `EKILEX:${slot.code}` ||
      (slot.formType !== undefined && f.formType === slot.formType),
  );
  if (attested) return attested.value;
  const derived = derivedVerbForms({ lemma: lex.lemma, pres1sg: pres1sgFrom(lex.forms) })
    .find((f) => f.morphCode === slot.code);
  return derived?.value ?? null;
}

/** At most this many gap-fill cards per word: two sentences teach, eight nag. */
const MAX_CLOZE_PER_WORD = 2;

export interface LexemeForCards {
  lemma: string;
  translation: string;
  pos: string;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  /** The raw `Lexeme.examples` JSON column; parsed defensively. */
  examples?: string | null;
  forms: { formType: string; value: string; morphCode?: string | null }[];
}

export interface GeneratedCard {
  cardType: CardType;
  front: string;
  back: string;
  hint: string | null;
  targetCase: string | null;
}

const form = (l: LexemeForCards, type: string) => l.forms.find((f) => f.formType === type)?.value;

/** Cases worth drilling first — the ones a B1 learner actually reaches for. */
/**
 * The cases every word is drilled on, whichever set of local ones it takes.
 * `localCasesFor` supplies the other three, because a place name in `-maa`
 * answers `kus?` with `Saksamaal` and not with `Saksamaas`. See
 * lib/estonian/place.ts for what that was doing to the A1 country unit.
 */
const DRILL_CASES: readonly CaseKey[] = ["COMITATIVE", "TRANSLATIVE"];

/**
 * Builds the cards for one word. Only types the word can actually support are
 * produced — a word with no gradation gets no gradation card, a noun gets no
 * government card. Never invents content it does not have.
 */
export function generateCards(lex: LexemeForCards, types: readonly CardType[]): GeneratedCard[] {
  const out: GeneratedCard[] = [];
  const genSg = form(lex, "GEN_SG");

  for (const type of types) {
    switch (type) {
      case "RECOGNITION":
        out.push({ cardType: type, front: lex.lemma, back: lex.translation, hint: null, targetCase: null });
        break;

      case "PRODUCTION":
        out.push({ cardType: type, front: lex.translation, back: lex.lemma, hint: lex.pos.toLowerCase(), targetCase: null });
        break;

      case "CASE_FORM": {
        if (!genSg) break;
        for (const key of [...localCasesFor(lex.lemma), ...DRILL_CASES]) {
          /*
            THE ANSWER SIDE IS WHAT THE DICTIONARY ATTESTS.

            This asked `deriveCase` for a suffix on the genitive, and for the
            illative that is the long form: the card for `tuba` had `toasse` on
            the back, and a learner typing `tuppa`, which is the form they will
            hear every day, was marked wrong and shown the card again until
            they stopped. `aeg` was drilled as `ajasse` rather than `aega`.

            Every accepted spelling goes on the back, joined the way
            `acceptedAnswers` already splits stored alternatives, so a word
            with two real illatives marks both right and teaches both.
          */
          const answer = caseAnswer(stemsFrom(lex.forms), key);
          if (!answer) continue;
          const spec = CASES.find((c) => c.key === key)!;
          out.push({
            cardType: type,
            front: `${lex.lemma} → ${spec.question}`,
            back: answer.accepted.join(" / "),
            hint: `${spec.et} · the ${spec.en.toLowerCase()}`,
            targetCase: key,
          });
        }
        break;
      }

      case "GRADATION": {
        if (lex.gradation === "NONE" || !genSg) break;
        out.push({
          cardType: type,
          front: `${lex.lemma} → ${caseByKey("GENITIVE")!.question}`,
          back: genSg,
          /*
            The hint is shown before the answer, so it may not carry the
            pattern: `astmevaheldus mm : mb` over `hammas → kelle? mille?`
            hands `hamba` straight over and the card stops being a question.
            The pattern is on the entry, on the grammar page the answer links
            to, and in the chip beside the word wherever it is printed.
          */
          hint: "astmevaheldus · consonant gradation",
          targetCase: "GENITIVE",
        });
        break;
      }

      case "CONJUGATION": {
        if (lex.pos !== "VERB") break;
        for (const slot of CONJUGATION_SLOTS) {
          const value = conjugationAnswer(lex, slot);
          if (!value) continue;
          out.push({
            cardType: type,
            front: `${lex.lemma} → ${slot.label}`,
            back: slot.negative ? `ei ${value}` : value,
            hint: lex.translation,
            targetCase: null,
          });
        }
        break;
      }

      case "CLOZE": {
        // Only ever built from a sentence Ekilex recorded, by hiding a form we
        // already hold. Nothing is written — the exercise is real Estonian with
        // one word taken out (see lib/estonian/cloze.ts).
        const examples = usableExamples(parseExamples(lex.examples));
        if (examples.length === 0) break;

        // Every spelling of the word, stored or derived, so a sentence about
        // `tuba` can be gapped on `toas` and one about `algama` on `algab`.
        // See `lib/estonian/gapForms.ts`: a derived form reaches a card only
        // by matching a word a lexicographer wrote, so the sentence is what
        // vouches for it.
        const byValue = gapForms(lex);

        let built = 0;
        for (const example of examples) {
          if (built >= MAX_CLOZE_PER_WORD) break;
          const cloze = buildCloze(example.et, [...byValue.keys()]);
          if (!cloze) continue;
          out.push({
            cardType: type,
            front: cloze.text,
            back: cloze.answer,
            // The lemma is given deliberately: this asks for the right *form*,
            // not for the vocabulary, which the recognition card already tests.
            hint: `${lex.lemma}, ${lex.translation}`,
            targetCase: byValue.get(cloze.answer.toLowerCase()) ?? null,
          });
          built++;
        }
        break;
      }

      case "GOVERNMENT": {
        if (!lex.government) break;
        out.push({
          cardType: type,
          front: `${lex.lemma} takes which case?`,
          back: lex.government,
          hint: "rektsioon",
          targetCase: null,
        });
        break;
      }
    }
  }
  return out;
}

/** Card types this word can actually support, for the add-to-deck checklist. */
export function availableCardTypes(lex: LexemeForCards): CardType[] {
  const genSg = form(lex, "GEN_SG");
  const types: CardType[] = ["RECOGNITION", "PRODUCTION"];
  if (genSg) types.push("CASE_FORM");
  if (lex.gradation !== "NONE" && genSg) types.push("GRADATION");
  if (lex.government) types.push("GOVERNMENT");
  // Offered only when they can genuinely be built: an option that silently
  // produces no cards is worse than no option.
  if (generateCards(lex, ["CONJUGATION"]).length > 0) types.push("CONJUGATION");
  if (generateCards(lex, ["CLOZE"]).length > 0) types.push("CLOZE");
  return types;
}
