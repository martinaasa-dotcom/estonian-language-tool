import { prisma } from "@/lib/db";
import { parseExamples, sentenceContaining } from "@/lib/dict/examples";
import { deriveCase } from "@/lib/estonian/derive";
import { caseFromMorphCode, numberFromMorphCode } from "@/lib/estonian/morph";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * Real words in one case, for the grammar reference.
 *
 * The reference itself (`lib/estonian/grammar.ts`) is English prose and holds no
 * Estonian at all. Everything Estonian on that page comes from here, and every
 * value has a provenance the page prints next to it:
 *
 * - `EKILEX` — the form as the Institute of the Estonian Language records it.
 * - `STORED` — a principal part from the seeded dictionary. Also authoritative.
 * - `DERIVED` — the regular ending on a stored genitive stem, which is the same
 *   arithmetic the dictionary entry shows and the same one the learner is being
 *   taught to do in their head.
 *
 * Nothing else is offered. A word with no genitive stem produces no example
 * rather than a guess (ADR-005).
 */
export interface CaseExample {
  lexemeId: string;
  lemma: string;
  translation: string;
  genitive: string | null;
  /** The word in this case, singular. */
  form: string;
  origin: "EKILEX" | "STORED" | "DERIVED";
  /** True when this word is in the learner's own deck. */
  inDeck: boolean;
  /** An attested sentence that actually contains `form`, when one exists. */
  sentence: { et: string; en: string | null } | null;
}

const PRINCIPAL_FORM_TYPE: Partial<Record<CaseKey, string>> = {
  NOMINATIVE: "NOM_SG",
  GENITIVE: "GEN_SG",
  PARTITIVE: "PART_SG",
};

/** How many candidate words to pull before filtering down to the ones that work. */
const CANDIDATES = 60;

interface Candidate {
  id: string;
  lemma: string;
  translation: string;
  examples: string;
  forms: { formType: string; value: string; morphCode: string | null }[];
}

export async function caseExamples(
  ownerId: string,
  key: CaseKey,
  limit = 6,
): Promise<CaseExample[]> {
  const select = {
    id: true,
    lemma: true,
    translation: true,
    examples: true,
    forms: { select: { formType: true, value: true, morphCode: true } },
  } as const;

  // The learner's own nouns first: a case is easier to believe in a word you
  // are already studying than in whatever the dictionary happens to list first.
  const deckIds = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null }, lexeme: { pos: "NOUN" } },
    distinct: ["lexemeId"],
    take: CANDIDATES,
    select: { lexemeId: true },
  });
  const owned = deckIds.map((c) => c.lexemeId!).filter(Boolean);

  const mine: Candidate[] = owned.length
    ? await prisma.lexeme.findMany({ where: { id: { in: owned } }, select })
    : [];

  // Topped up from the dictionary, easiest words first, so an empty deck still
  // gets a page worth reading on day one.
  const rest: Candidate[] = await prisma.lexeme.findMany({
    where: { pos: "NOUN", id: { notIn: owned.length ? owned : ["-"] } },
    orderBy: [{ cefr: "asc" }, { lemma: "asc" }],
    take: CANDIDATES,
    select,
  });

  const built = [
    ...mine.map((lex) => toExample(lex, key, true)),
    ...rest.map((lex) => toExample(lex, key, false)),
  ].filter(isExample);

  // Deck words first — a case is easier to believe in a word you are already
  // studying — and within each half, the ones that can also be shown inside a
  // real sentence, because that is the row that teaches the most.
  const rank = (e: CaseExample) => (e.inDeck ? 0 : 2) + (e.sentence ? 0 : 1);
  return built.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

function isExample(value: CaseExample | null): value is CaseExample {
  return value !== null;
}

function toExample(lex: Candidate, key: CaseKey, inDeck: boolean): CaseExample | null {
  const genitive = lex.forms.find((f) => f.formType === "GEN_SG")?.value ?? null;

  // An Ekilex form for exactly this case and number beats everything else: it is
  // authoritative, and it is right even where the regular ending is not.
  const retrieved = lex.forms.find(
    (f) => caseFromMorphCode(f.morphCode) === key && numberFromMorphCode(f.morphCode) === "SINGULAR",
  );

  const principalType = PRINCIPAL_FORM_TYPE[key];
  const principal = principalType
    ? lex.forms.find((f) => f.formType === principalType)?.value
    : undefined;

  const form = retrieved?.value ?? principal ?? deriveCase(genitive ?? undefined, key);
  if (!form) return null;

  const origin: CaseExample["origin"] = retrieved ? "EKILEX" : principal ? "STORED" : "DERIVED";

  return {
    lexemeId: lex.id,
    lemma: lex.lemma,
    translation: lex.translation,
    genitive,
    form,
    origin,
    inDeck,
    sentence: toSentence(sentenceContaining(parseExamples(lex.examples), form)),
  };
}

function toSentence(example: { et: string; en?: string | null } | null) {
  return example ? { et: example.et, en: example.en ?? null } : null;
}
