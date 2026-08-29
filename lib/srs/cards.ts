import { CASES } from "@/lib/estonian/cases";
import { buildCloze } from "@/lib/estonian/cloze";
import { deriveCase } from "@/lib/estonian/derive";
import { caseFromMorphCode } from "@/lib/estonian/morph";
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
  { type: "CASE_FORM", label: "Case form", description: "Produce a named case from the stem", defaultOn: false },
  { type: "GRADATION", label: "Gradation", description: "Strong grade → weak grade", defaultOn: false },
  { type: "GOVERNMENT", label: "Government", description: "Which case the verb takes", defaultOn: false },
  { type: "CLOZE", label: "In a sentence", description: "Fill the gap in a real Estonian sentence", defaultOn: true },
  { type: "CONJUGATION", label: "Conjugation", description: "Produce a person and tense of a verb", defaultOn: false },
];

/**
 * The verb forms worth drilling, and what to call them.
 *
 * Six, not sixty. These are the ones a beginner has to produce out loud in a
 * conversation; the rest of the paradigm is on the dictionary entry to be read,
 * not memorised. Every one is a form we actually hold — from Ekilex by its
 * morph code, or from the seeded principal parts — so nothing is derived.
 */
const CONJUGATION_SLOTS: { match: { morphCode?: string; formType?: string }; label: string }[] = [
  { match: { morphCode: "IndPrSg1", formType: "PRES_1SG" }, label: "present · ma" },
  { match: { morphCode: "IndPrSg3" }, label: "present · ta" },
  { match: { morphCode: "IndPrPl1" }, label: "present · me" },
  { match: { morphCode: "IndIpfSg1", formType: "PAST_1SG" }, label: "past · ma" },
  { match: { morphCode: "IndIpfSg3" }, label: "past · ta" },
  { match: { morphCode: "KndPrSg1" }, label: "conditional · ma" },
];

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
const DRILL_CASES: readonly CaseKey[] = [
  "INESSIVE", "ELATIVE", "ILLATIVE", "ALLATIVE", "ADESSIVE", "COMITATIVE", "TRANSLATIVE",
];

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
        for (const key of DRILL_CASES) {
          const value = deriveCase(genSg, key);
          if (!value) continue;
          const spec = CASES.find((c) => c.key === key)!;
          out.push({
            cardType: type,
            front: `${lex.lemma} → ${spec.en.toLowerCase()}`,
            back: value,
            hint: `${spec.et} · ${spec.question}`,
            targetCase: key,
          });
        }
        break;
      }

      case "GRADATION": {
        if (lex.gradation === "NONE" || !genSg) break;
        out.push({
          cardType: type,
          front: `${lex.lemma} → genitive`,
          back: genSg,
          hint: lex.gradationNote ? `gradation ${lex.gradationNote}` : "consonant gradation",
          targetCase: "GENITIVE",
        });
        break;
      }

      case "CONJUGATION": {
        if (lex.pos !== "VERB") break;
        for (const slot of CONJUGATION_SLOTS) {
          const match = lex.forms.find(
            (f) =>
              (slot.match.morphCode && f.morphCode === slot.match.morphCode) ||
              (slot.match.formType && f.formType === slot.match.formType),
          );
          if (!match) continue;
          out.push({
            cardType: type,
            front: `${lex.lemma} → ${slot.label}`,
            back: match.value,
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

        const byValue = new Map<string, string | null>();
        for (const f of lex.forms) byValue.set(f.value.toLowerCase(), f.morphCode ?? null);
        byValue.set(lex.lemma.toLowerCase(), null);

        let built = 0;
        for (const example of examples) {
          if (built >= MAX_CLOZE_PER_WORD) break;
          const cloze = buildCloze(example.et, [...byValue.keys()]);
          if (!cloze) continue;
          const morphCode = byValue.get(cloze.answer.toLowerCase()) ?? null;
          out.push({
            cardType: type,
            front: cloze.text,
            back: cloze.answer,
            // The lemma is given deliberately: this asks for the right *form*,
            // not for the vocabulary, which the recognition card already tests.
            hint: `${lex.lemma} — ${lex.translation}`,
            targetCase: caseFromMorphCode(morphCode),
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
