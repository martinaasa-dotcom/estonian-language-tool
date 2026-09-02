import { prisma } from "@/lib/db";
import { derivedVerbForms, pres1sgFrom } from "@/lib/estonian/conjugate";

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
  /**
   * Ekilex's own code for the slot.
   *
   * Wider than `DerivedVerbCode`, which names what the rule can build: a form
   * the dictionary stores because no rule reaches it fills a slot on this
   * table too, and the polite imperative is one.
   */
  readonly code: string;
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
    // Ordered, because a verb Ekilex records two parallel forms for under
    // one code would otherwise have the plan decide which one the table shows.
    forms: { select: { formType: true, value: true, morphCode: true }, orderBy: { orderIndex: "asc" as const } },
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
 *
 * `string` rather than `DerivedVerbCode`, because that type names what the
 * rule can build and this table shows what the app can say. The polite
 * imperative is the difference: `annan` goes to `andke` and `lähen` to
 * `minge`, so no rule reaches it, and the dictionary stores it like every
 * other form no rule reaches.
 */
const CODES: readonly string[] = [
  "IndPrSg1", "IndPrSg2", "IndPrSg3", "IndPrPl1", "IndPrPl2", "IndPrPl3", "IndPrPs_",
  "KndPrSg1", "KndPrSg2", "KndPrPs", "KndPrPl1", "KndPrPl2", "KndPrPl3",
  "ImpPrSg2", "ImpPrPl2",
];

/**
 * Every form of one verb the app can vouch for, attested first.
 *
 * What Ekilex recorded, by code, wins over the rule every time. The seed
 * spells a retrieved code as `EKILEX:<code>` on `formType`; a live fetch puts
 * it on `morphCode`. Where Ekilex has nothing for a slot, the rule answers if
 * it reaches, and the slot is simply absent otherwise. Shared with the
 * conjugation drill, so the table a learner reads and the table they are
 * asked to fill cannot come from two different answers.
 */
export function conjugatedForms(
  lemma: string,
  forms: readonly { formType: string; value: string; morphCode: string | null }[],
): VerbExampleForm[] {
  const pres1sg = pres1sgFrom(forms);
  if (!pres1sg) return [];
  const attested = new Map<string, string>();
  for (const f of forms) {
    const code = f.morphCode ?? (f.formType.startsWith("EKILEX:") ? f.formType.slice(7) : null);
    if (code && !attested.has(code)) attested.set(code, f.value);
  }
  /*
    The present first person is a principal part, so the seed writes it under
    its own name rather than under Ekilex's code, and the loop above cannot see
    it. Nothing noticed while every verb whose first person we hold also had a
    rule to derive the rest from, because that rule hands back the first person
    too, marked STORED. `olema` is the verb the rule refuses, and the moment the
    dictionary could answer the other five persons for it the table printed them
    and started at `oled`: the forms of the commonest verb in the language with
    a hole exactly where the headword should be.
  */
  const firstPersonIsPrincipal = !attested.has("IndPrSg1");
  if (firstPersonIsPrincipal) attested.set("IndPrSg1", pres1sg);
  const derived = new Map<string, ReturnType<typeof derivedVerbForms>[number]>(
    derivedVerbForms({ lemma, pres1sg }).map((f) => [f.morphCode as string, f]),
  );

  const out: VerbExampleForm[] = [];
  for (const code of CODES) {
    const fromEkilex = attested.get(code);
    if (fromEkilex) {
      // The principal part is STORED wherever it comes from, so the provenance
      // a reader sees for `olen` is the one they see for `loen`.
      const principal = code === "IndPrSg1" && firstPersonIsPrincipal;
      out.push({ code, value: fromEkilex, origin: principal ? "STORED" : "EKILEX" });
      continue;
    }
    const rule = derived.get(code);
    if (rule) out.push({ code, value: rule.value, origin: rule.origin });
  }
  return out;
}

function toExample(lex: Candidate, inDeck: boolean): VerbExample | null {
  const pres1sg = pres1sgFrom(lex.forms);
  if (!pres1sg) return null;
  const forms = conjugatedForms(lex.lemma, lex.forms);
  // A verb the rule declines and Ekilex has not filled in shows only its first
  // person, which is not an example of anything: leave it out.
  if (forms.length < 2) return null;
  return { lexemeId: lex.id, lemma: lex.lemma, translation: lex.translation, pres1sg, forms, inDeck };
}
