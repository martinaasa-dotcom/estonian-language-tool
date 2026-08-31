import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { buildOptions, maskExample, parseGovernment } from "@/lib/estonian/government";
import { parseExamples, sentenceContaining, usableExamples } from "@/lib/dict/examples";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { GovernmentSession, type GovernmentQuestion } from "./GovernmentSession";
import type { CaseKey } from "@/lib/estonian/types";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Verb government" };

export const dynamic = "force-dynamic";

const ROUND = 12;

/**
 * The verb-government drill.
 *
 * Government data has been in the schema since the MVP and was only ever a
 * plain two-sided flashcard, which drills recall of a sentence rather than the
 * discrimination that actually fails: given this verb, which case? Nothing else
 * on the market drills it systematically, and it is the error that survives
 * years of exposure.
 *
 * Verbs come from the whole dictionary rather than only the learner's deck —
 * government is a property of the verb, and meeting a new one in a drill where
 * the answer is explained is a reasonable way to learn it.
 */
export default async function GovernmentPage() {
  const ownerId = await requireUserId();

  const [governed, inDeck] = await Promise.all([
    // Easiest first and stable, rather than whichever two hundred verbs the
    // plan returned. This is a reference a learner comes back to, so the page
    // should be the same page.
    prisma.lexeme.findMany({
      where: { pos: "VERB", government: { not: null } },
      select: { id: true, lemma: true, translation: true, government: true, cefr: true, examples: true },
      orderBy: [{ cefr: "asc" }, { lemma: "asc" }],
      take: 200,
    }),
    prisma.card.findMany({
      where: { ownerId, lexemeId: { not: null } },
      select: { id: true, lexemeId: true, cardType: true },
      take: 2000,
    }),
  ]);

  const mine = new Set(inDeck.map((c) => c.lexemeId));

  // ADR-016: when the verb is already in the deck, answering here is evidence
  // about it and grades the same card the daily loop would. A verb met for the
  // first time in this drill has no card yet, and scores nothing until it is
  // added — which is honest, rather than inventing a card behind the learner.
  const cardFor = new Map<string, string>();
  for (const c of inDeck) {
    if (!c.lexemeId) continue;
    if (!cardFor.has(c.lexemeId) || c.cardType === "GOVERNMENT") cardFor.set(c.lexemeId, c.id);
  }

  const parsed = governed
    .map((v) => ({ v, g: parseGovernment(v.government) }))
    .filter((x): x is { v: (typeof governed)[number]; g: NonNullable<ReturnType<typeof parseGovernment>> } => x.g !== null);

  if (parsed.length === 0) {
    return (
      <Page title="Verb government" lead="Which case a verb demands.">
        <Empty
          title="No governed verbs in the dictionary yet"
          body="Look a verb up once and the case it demands is stored with it."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  // The distribution the distractors are drawn from: what verbs actually govern.
  const pool = parsed.map((p) => p.g.caseKey as CaseKey);

  /*
    Verbs already in the deck first, those being the ones actively learned, and
    random within each group.

    Written as two shuffles rather than as one sort on `Math.random() - (mine ? 1 : 0)`,
    which is the same distribution and arrives at it by a trick: the two key
    ranges are [-1, 0) and [0, 1), so they cannot interleave. That is correct
    and it is not what the line says, and the reader has to work out that the
    ranges are disjoint before they can believe it.
  */
  const ordered = [
    ...shuffle(parsed.filter((p) => mine.has(p.v.id))),
    ...shuffle(parsed.filter((p) => !mine.has(p.v.id))),
  ].slice(0, ROUND);

  /*
    A question is dropped rather than padded when there is no honest set of
    options for it, which `buildOptions` decides: every case the word itself
    governs is true of it, so none of them may stand as a wrong answer, and a
    word governing several can leave too few distractors behind. Losing one
    verb from a round of twelve costs nothing; marking somebody wrong for
    knowing that `aitama` also takes the seestütlev costs the drill its
    credibility.
  */
  const questions: GovernmentQuestion[] = ordered.flatMap(({ v, g }) => {
    const options = buildOptions(g, pool);
    if (!options) return [];
    return [{
      cardId: cardFor.get(v.id) ?? null,
      lexemeId: v.id,
      lemma: v.lemma,
      translation: v.translation,
      cefr: v.cefr,
      answer: g.caseKey,
      answerEn: g.caseEn,
      answerEt: g.caseEt,
      alsoGoverned: [...g.alsoGoverned],
      example: exampleFor(v, g),
      maskedExample: maskExample(exampleFor(v, g)),
      gloss: g.gloss,
      experiencer: g.experiencer,
      inDeck: mine.has(v.id),
      options,
    }];
  });

  return <GovernmentSession questions={questions} />;
}

/**
 * The sentence shown once the case is answered.
 *
 * The seed carries its own example inside the government string. An entry that
 * came from Ekilex does not: its governments are question words, and its
 * sentences are stored separately as usages. Both are attested Estonian, so
 * the drill reads whichever it has rather than showing nothing for every verb
 * the dictionary fetched. Nothing here composes a sentence (ADR-005): if there
 * is no attested one, the question is answered without an example.
 */
function exampleFor(
  lexeme: { lemma: string; examples: string | null },
  government: { example: string | null },
): string | null {
  if (government.example) return government.example;
  const attested = usableExamples(parseExamples(lexeme.examples));
  const containing = sentenceContaining(attested, lexeme.lemma);
  return (containing ?? attested[0])?.et ?? null;
}
