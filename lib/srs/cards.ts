import { CASES } from "@/lib/estonian/cases";
import { deriveCase } from "@/lib/estonian/derive";
import type { CaseKey } from "@/lib/estonian/types";

export type CardType = "RECOGNITION" | "PRODUCTION" | "CASE_FORM" | "GRADATION" | "GOVERNMENT";

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
];

export interface LexemeForCards {
  lemma: string;
  translation: string;
  pos: string;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  forms: { formType: string; value: string }[];
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
  return types;
}
