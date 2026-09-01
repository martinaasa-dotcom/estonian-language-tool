import { prisma } from "@/lib/db";
import { parseExamples, sentenceContaining } from "@/lib/dict/examples";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
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

  /*
    The learner's own nouns first: a case is easier to believe in a word you
    are already studying than in whatever the dictionary happens to list first.

    Both of these are ordered, and neither was. This is a reference page a
    learner comes back to, and the six words on it were decided by the order
    Postgres returned rows in: `rank` below has four values and `sort` is
    stable, so ties keep whatever order arrived, and the top-up query was the
    only one of the three that said which order it wanted. It looked settled
    because a plan for the same rows usually is, and it is not a promise. The
    same shape as the dictionary leading with an arbitrary one of two entries,
    one page along.

    Oldest card first, because the words somebody has been studying longest are
    the ones they can read a new case off, and that order is then *kept*.

    Sorting the deck words by lemma afterwards was the first attempt and it
    reads badly, which is the sort of thing only looking at the page tells you:
    the six real words under `seesütlev` came out `aadress, aasta, abi,
    abikaasa, aastapäev, abielu`, six words from the top of the alphabet under a
    heading that says "words from your deck first". Deterministic, and it looks
    like a bug. Postgres does not return `IN (…)` in the order the ids were
    given, so keeping the deck's own order means putting it back by hand.

    The top-up below stays on cefr and lemma. That is the empty-deck case, where
    easiest-first is the right answer and there is no better order to preserve.
  */
  const deckIds = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null }, lexeme: { pos: "NOUN" } },
    distinct: ["lexemeId"],
    orderBy: [{ createdAt: "asc" }, { lexemeId: "asc" }, { id: "asc" }],
    take: CANDIDATES,
    select: { lexemeId: true },
  });
  const owned = deckIds.map((c) => c.lexemeId!).filter(Boolean);
  const deckOrder = new Map(owned.map((id, at) => [id, at]));

  const mine: Candidate[] = owned.length
    ? (await prisma.lexeme.findMany({ where: { id: { in: owned } }, select }))
      .sort((a, b) => (deckOrder.get(a.id) ?? 0) - (deckOrder.get(b.id) ?? 0))
    : [];

  // Topped up from the dictionary, easiest words first, so an empty deck still
  // gets a page worth reading on day one.
  const rest: Candidate[] = await prisma.lexeme.findMany({
    where: { pos: "NOUN", id: { notIn: owned.length ? owned : ["-"] } },
    orderBy: [{ cefr: "asc" }, { lemma: "asc" }, { id: "asc" }],
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

  /*
    THE THREE PRINCIPAL PARTS ARE STORED SLOTS; THE OTHER ELEVEN ARE A QUESTION
    FOR `caseAnswer`.

    This walked its own precedence and got the illative wrong twice over.
    `PRINCIPAL_FORM_TYPE` listed only the nominative, genitive and partitive, so
    `ILL_SG_SHORT` was never consulted; and the Ekilex lookup above it takes
    `SgIll`, the long form, which then beat the short one sitting in the same
    form list. The grammar reference prints its examples with a provenance
    label, so it was showing `toasse` under a tag saying a lexicographer wrote
    it down, which is the worst version of this fault: right about the source
    and wrong about the word.
  */
  const principalType = PRINCIPAL_FORM_TYPE[key];
  const retrieved = principalType
    ? lex.forms.find(
        (f) => caseFromMorphCode(f.morphCode) === key && numberFromMorphCode(f.morphCode) === "SINGULAR",
      )
    : undefined;
  const principal = principalType
    ? lex.forms.find((f) => f.formType === principalType)?.value
    : undefined;

  const answer = principalType ? null : caseAnswer(stemsFrom(lex.forms), key);
  const form = retrieved?.value ?? principal ?? answer?.value;
  if (!form) return null;

  const origin: CaseExample["origin"] =
    retrieved ? "EKILEX" : principal ? "STORED" : (answer?.origin ?? "DERIVED");

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
