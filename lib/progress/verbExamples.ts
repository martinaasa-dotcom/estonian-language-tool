import { prisma } from "@/lib/db";
import { derivedVerbForms, pres1sgFrom, type DerivedVerbCode } from "@/lib/estonian/conjugate";

/**
 * Real verbs conjugated, for the grammar reference.
 *
 * The topic pages for the present tense, the negative, the conditional and
 * the imperative used to explain in English and then hand over to the units,
 * on the argument that there was no safe way to show the point on real words.
 * For those four there is, and it is the same one the case pages take: every
 * form here is either what Ekilex recorded for the verb, or the regular ending
 * on the stored first person from `lib/estonian/conjugate.ts`, which was
 * checked against Ekilex for every verb in the dictionary. Each form says
 * which, and nothing else is offered (ADR-005).
 *
 * The learner's own verbs first, oldest card first, for the reason the case
 * page gives: a rule is easier to believe on a word you are already studying.
 * Topped up from the dictionary's easiest verbs, so the page reads on day one.
 */
export interface VerbExampleForm {
  readonly code: DerivedVerbCode;
  readonly value: string;
  readonly origin: "EKILEX" | "STORED" | "DERIVED";
}

export interface VerbExample {
  readonly lexemeId: string;
  readonly lemma: string;
  readonly translation: string;
  readonly pres1sg: string;
  readonly forms: readonly VerbExampleForm[];
  readonly inDeck: boolean;
}

const CANDIDATES = 40;

interface Candidate {
  id: string;
  lemma: string;
  translation: string;
  forms: { formType: string; value: string; morphCode: string | null }[];
}

export async function verbExamples(ownerId: string, limit = 4): Promise<VerbExample[]> {
  const select = {
    id: true,
    lemma: true,
    translation: true,
    forms: { select: { formType: true, value: true, morphCode: true } },
  } as const;

  const deck = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null }, lexeme: { pos: "VERB" } },
    distinct: ["lexemeId"],
    orderBy: [{ createdAt: "asc" }, { lexemeId: "asc" }, { id: "asc" }],
    take: CANDIDATES,
    select: { lexemeId: true },
  });
  const owned = deck.map((c) => c.lexemeId!).filter(Boolean);
  const deckOrder = new Map(owned.map((id, at) => [id, at]));

  const mine: Candidate[] = owned.length
    ? (await prisma.lexeme.findMany({ where: { id: { in: owned } }, select }))
      .sort((a, b) => (deckOrder.get(a.id) ?? 0) - (deckOrder.get(b.id) ?? 0))
    : [];

  const rest: Candidate[] = await prisma.lexeme.findMany({
    where: { pos: "VERB", id: { notIn: owned.length ? owned : ["-"] } },
    orderBy: [{ cefr: "asc" }, { lemma: "asc" }, { id: "asc" }],
    take: CANDIDATES,
    select,
  });

  const out: VerbExample[] = [];
  for (const lex of [...mine.map((l) => [l, true] as const), ...rest.map((l) => [l, false] as const)]) {
    const built = toExample(lex[0], lex[1]);
    if (built) out.push(built);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The slots the reference shows, in the order a table reads them. A
 * particle verb's particle rides along in every form, so it is fine here.
 */
const CODES: readonly DerivedVerbCode[] = [
  "IndPrSg1", "IndPrSg2", "IndPrSg3", "IndPrPl1", "IndPrPl2", "IndPrPl3", "IndPrPs_",
  "KndPrSg1", "KndPrSg2", "KndPrPs", "KndPrPl1", "KndPrPl2", "KndPrPl3", "ImpPrSg2",
];

function toExample(lex: Candidate, inDeck: boolean): VerbExample | null {
  const pres1sg = pres1sgFrom(lex.forms);
  if (!pres1sg) return null;

  // What Ekilex recorded, by code, wins over the rule every time. The seed
  // spells a retrieved code as `EKILEX:<code>` on `formType`; a live fetch
  // puts it on `morphCode`.
  const attested = new Map<string, string>();
  for (const f of lex.forms) {
    const code = f.morphCode ?? (f.formType.startsWith("EKILEX:") ? f.formType.slice(7) : null);
    if (code && !attested.has(code)) attested.set(code, f.value);
  }
  const derived = new Map(
    derivedVerbForms({ lemma: lex.lemma, pres1sg }).map((f) => [f.morphCode, f] as const),
  );

  const forms: VerbExampleForm[] = [];
  for (const code of CODES) {
    const fromEkilex = attested.get(code);
    if (fromEkilex) {
      forms.push({ code, value: fromEkilex, origin: "EKILEX" });
      continue;
    }
    const rule = derived.get(code);
    if (rule) forms.push({ code, value: rule.value, origin: rule.origin });
  }
  // A verb the rule declines and Ekilex has not filled in shows only its first
  // person, which is not an example of anything: leave it out.
  if (forms.length < 2) return null;

  return { lexemeId: lex.id, lemma: lex.lemma, translation: lex.translation, pres1sg, forms, inDeck };
}
