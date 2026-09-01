import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { bandsAround } from "@/lib/collections/levels";
import { conjugatedForms, type VerbExampleForm } from "@/lib/progress/verbExamples";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { shuffle } from "@/lib/random/shuffle";
import { ConjugationSession, type ConjugationQuestion, type Tense } from "./ConjugationSession";

export const metadata = { title: "Conjugation" };

export const dynamic = "force-dynamic";

const ROUND = 8;

/**
 * How many verbs are read before eight are chosen. Wide enough for the level
 * to have something to choose between, one page of rows either way.
 */
const CANDIDATES = 120;

/**
 * The persons a round asks for, keyed by tense. The first person is given,
 * since it is the principal part and the thing the other five hang off.
 */
const PERSONS: Record<Tense, readonly { person: string; code: string }[]> = {
  present: [
    { person: "sa", code: "IndPrSg2" }, { person: "ta", code: "IndPrSg3" },
    { person: "me", code: "IndPrPl1" }, { person: "te", code: "IndPrPl2" }, { person: "nad", code: "IndPrPl3" },
  ],
  conditional: [
    { person: "sa", code: "KndPrSg2" }, { person: "ta", code: "KndPrPs" },
    { person: "me", code: "KndPrPl1" }, { person: "te", code: "KndPrPl2" }, { person: "nad", code: "KndPrPl3" },
  ],
};

const GIVEN: Record<Tense, string> = { present: "IndPrSg1", conditional: "KndPrSg1" };

/**
 * The conjugation drill: one verb, the first person given, five to type.
 *
 * A conjugation card asks for one person of one verb, which is the right
 * shape for spaced repetition and the wrong shape for the thing a class does
 * on a Tuesday, which is run down the whole table out loud. This is that
 * table, typed, marked cell by cell against the dictionary. Every form is
 * either what Ekilex recorded or the regular ending on the stored first
 * person that `scripts/audit-verbs.ts` checked against Ekilex for every verb
 * here, so the marking is a string comparison and no model is anywhere near
 * it (ADR-005).
 *
 * Verbs from the learner's own deck first, since those are the ones being
 * learned, then the dictionary's verbs around their level. The conditional
 * joins from B1, which is where the course introduces it, and alternates with
 * the present so a round is never one table eight times.
 */
export default async function ConjugationPage() {
  const ownerId = await requireUserId();
  const level = await courseLevelFor(ownerId);

  const select = {
    id: true, lemma: true, translation: true, cefr: true,
    // Ordered for the reason lib/progress/verbExamples.ts gives: a parallel
    // form must be the same one on every load, since one is the answer.
    forms: { select: { formType: true, value: true, morphCode: true }, orderBy: { orderIndex: "asc" as const } },
  } as const;

  const [deck, banded] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId, suspended: false, lexemeId: { not: null }, lexeme: { pos: "VERB" } },
      select: { id: true, lexemeId: true, cardType: true },
      // Ordered because it is cut: which verbs count as in the deck decides
      // which answers grade a real card.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2000,
    }),
    prisma.lexeme.findMany({
      where: { pos: "VERB", cefr: { in: [...bandsAround(level)] } },
      orderBy: [{ cefr: "asc" }, { lemma: "asc" }, { id: "asc" }],
      take: CANDIDATES,
      select,
    }),
  ]);

  // ADR-016: a verb already in the deck grades the card the daily loop would,
  // preferring its conjugation card where it has one.
  const cardFor = new Map<string, string>();
  for (const c of deck) {
    if (!c.lexemeId) continue;
    if (!cardFor.has(c.lexemeId) || c.cardType === "CONJUGATION") cardFor.set(c.lexemeId, c.id);
  }
  const owned = [...cardFor.keys()];
  const mine = owned.length
    ? await prisma.lexeme.findMany({
        where: { id: { in: owned }, pos: "VERB" },
        // Ordered because it is cut, and shuffled afterwards anyway: the cut
        // decides which of a large deck's verbs are eligible at all.
        orderBy: [{ lemma: "asc" }, { id: "asc" }],
        select,
        take: CANDIDATES,
      })
    : [];

  const ordered = [
    ...shuffle(mine),
    ...shuffle(banded.filter((v) => !cardFor.has(v.id))),
  ];

  // The conditional is a B1 point. Below that a round is the present only.
  const conditionalToo = level !== "A1" && level !== "A2";

  const questions: ConjugationQuestion[] = [];
  for (const verb of ordered) {
    if (questions.length >= ROUND) break;
    const forms = conjugatedForms(verb.lemma, verb.forms);
    const tense: Tense = conditionalToo && questions.length % 2 === 1 ? "conditional" : "present";
    const built = questionFor(verb, forms, tense, cardFor.get(verb.id) ?? null)
      ?? (tense === "conditional" ? questionFor(verb, forms, "present", cardFor.get(verb.id) ?? null) : null);
    if (built) questions.push(built);
  }

  if (questions.length === 0) {
    return (
      <Page title="Conjugation" lead="One verb, six persons, typed.">
        <Empty
          title="No verbs to conjugate yet"
          body="Add a verb unit from the path, or look a verb up in the dictionary."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  return <ConjugationSession questions={questions} />;
}

function questionFor(
  verb: { id: string; lemma: string; translation: string; cefr: string | null },
  forms: readonly VerbExampleForm[],
  tense: Tense,
  cardId: string | null,
): ConjugationQuestion | null {
  const given = forms.find((f) => f.code === GIVEN[tense]);
  if (!given) return null;
  const blanks = PERSONS[tense].flatMap(({ person, code }) => {
    const form = forms.find((f) => f.code === code);
    return form ? [{ person, code, answer: form.value, origin: form.origin }] : [];
  });
  // A table with a hole in it is not a table: every person or nothing.
  if (blanks.length !== PERSONS[tense].length) return null;
  return {
    cardId,
    lexemeId: verb.id,
    lemma: verb.lemma,
    translation: verb.translation,
    cefr: verb.cefr,
    inDeck: cardId !== null,
    tense,
    given: { person: "ma", value: given.value },
    blanks,
  };
}
