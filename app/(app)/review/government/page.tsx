import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { buildOptions, maskExample, parseGovernment } from "@/lib/estonian/government";
import { parseExamples, sentenceContaining, usableExamples } from "@/lib/dict/examples";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { GovernmentSession, type GovernmentQuestion } from "./GovernmentSession";
import type { CaseKey } from "@/lib/estonian/types";

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
    prisma.lexeme.findMany({
      where: { pos: "VERB", government: { not: null } },
      select: { id: true, lemma: true, translation: true, government: true, cefr: true, examples: true },
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

  // Verbs already in the deck first — those are the ones being actively learned.
  const ordered = parsed
    .map((p) => ({ p, k: Math.random() - (mine.has(p.v.id) ? 1 : 0) }))
    .sort((a, b) => a.k - b.k)
    .map(({ p }) => p)
    .slice(0, ROUND);

  const questions: GovernmentQuestion[] = ordered.map(({ v, g }) => ({
    cardId: cardFor.get(v.id) ?? null,
    lexemeId: v.id,
    lemma: v.lemma,
    translation: v.translation,
    cefr: v.cefr,
    answer: g.caseKey,
    answerEn: g.caseEn,
    answerEt: g.caseEt,
    example: exampleFor(v, g),
    maskedExample: maskExample(exampleFor(v, g)),
    gloss: g.gloss,
    experiencer: g.experiencer,
    inDeck: mine.has(v.id),
    options: buildOptions(g.caseKey, pool),
  }));

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
