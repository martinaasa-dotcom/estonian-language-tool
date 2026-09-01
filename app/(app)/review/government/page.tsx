import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { bandsAround } from "@/lib/collections/levels";
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
 * The fewest governed verbs a level's own band may draw before the whole set
 * answers instead.
 *
 * A round is twelve questions and a verb only makes one if the distractor pool
 * can offer a case it does not itself govern, so the band needs several times
 * the round to fill it. Forty is where this dictionary's thinnest band still
 * builds a full round.
 */
const MIN_VERBS = 40;

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

  const level = await courseLevelFor(ownerId);
  const verbs = {
    select: { id: true, lemma: true, translation: true, government: true, cefr: true, examples: true },
    // Easiest first and stable, rather than whichever two hundred verbs the
    // plan returned. This is a reference a learner comes back to, so the page
    // should be the same page.
    orderBy: [{ cefr: "asc" as const }, { lemma: "asc" as const }],
    take: 200,
  };

  const [banded, inDeck] = await Promise.all([
    /*
      Around the learner's level.

      Government is the one thing about an Estonian verb an English speaker
      cannot reason out, so this is a drill somebody comes back to for years,
      and it was pinned to the same two hundred verbs for all of them: the
      dictionary records government for 268 verbs and `ORDER BY cefr ASC` took
      the easiest two hundred, so the C1 verbs were the ones nobody was ever
      shown. One band either side (`lib/collections/levels.ts`) moves the
      window with the learner and leaves the cefr key doing what it was for,
      which is opening on the easier verb inside it.
    */
    prisma.lexeme.findMany({
      where: { pos: "VERB", government: { not: null }, cefr: { in: [...bandsAround(level)] } },
      ...verbs,
    }),
    prisma.card.findMany({
      where: { ownerId, lexemeId: { not: null } },
      select: { id: true, lexemeId: true, cardType: true },
      // Ordered because it is cut: this decides which verbs count as already in
      // the deck, and therefore which answers grade a real card. An unordered
      // slice hands that to the plan, so the same verb could score on one visit
      // and not on the next.
      orderBy: { id: "asc" },
      take: 2000,
    }),
  ]);

  /*
    A band too thin to build a round from is a fact about the dictionary, not
    about the learner, so the whole governed set answers instead. That is what
    this page did for everybody before it learned about levels, and it is the
    same widening the minimal pairs pool does one route over.
  */
  const governed = banded.length >= MIN_VERBS
    ? banded
    : await prisma.lexeme.findMany({ where: { pos: "VERB", government: { not: null } }, ...verbs });

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
