import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { buildOptions, maskExample, parseGovernment } from "@/lib/estonian/government";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { GovernmentSession, type GovernmentQuestion } from "./GovernmentSession";
import type { CaseKey } from "@/lib/estonian/types";

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
      select: { id: true, lemma: true, translation: true, government: true, cefr: true },
      take: 200,
    }),
    prisma.card.findMany({
      where: { ownerId, lexemeId: { not: null } },
      select: { lexemeId: true },
      distinct: ["lexemeId"],
      take: 500,
    }),
  ]);

  const mine = new Set(inDeck.map((c) => c.lexemeId));

  const parsed = governed
    .map((v) => ({ v, g: parseGovernment(v.government) }))
    .filter((x): x is { v: (typeof governed)[number]; g: NonNullable<ReturnType<typeof parseGovernment>> } => x.g !== null);

  if (parsed.length === 0) {
    return (
      <Page title="Verb government" lead="Which case a verb demands.">
        <Empty
          title="No governed verbs in the dictionary yet"
          body="Government data comes from Ekilex and from the built-in set. Add an Ekilex key in Settings, or add a verb by hand with its government noted."
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
    lexemeId: v.id,
    lemma: v.lemma,
    translation: v.translation,
    cefr: v.cefr,
    answer: g.caseKey,
    answerEn: g.caseEn,
    answerEt: g.caseEt,
    example: g.example,
    maskedExample: maskExample(g.example),
    gloss: g.gloss,
    experiencer: g.experiencer,
    inDeck: mine.has(v.id),
    options: buildOptions(g.caseKey, pool),
  }));

  return <GovernmentSession questions={questions} />;
}
