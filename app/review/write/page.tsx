import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { writingTasksFor } from "@/lib/estonian/writing";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { WriteSession, type WritingPrompt } from "./WriteSession";

export const dynamic = "force-dynamic";

const ROUND = 6;

/**
 * Free production: the learner writes their own sentence rather than recalling
 * one side of a card.
 *
 * Words are drawn from their own deck, weighted towards the cases they have
 * actually been getting wrong — the point is to practise producing, not to meet
 * new vocabulary, so everything here is a word they have already met.
 */
export default async function WritePage() {
  const ownerId = await requireUserId();

  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null } },
    select: { lexemeId: true, lapses: true },
    orderBy: { lapses: "desc" },
    take: 200,
  });

  const lexemeIds = [...new Set(cards.map((c) => c.lexemeId).filter((id): id is string => !!id))];

  const lexemes = lexemeIds.length
    ? await prisma.lexeme.findMany({
        where: { id: { in: lexemeIds }, pos: { in: ["NOUN", "ADJECTIVE"] } },
        include: { forms: true },
      })
    : [];

  // The cases this learner has slipped on most, so the round targets weakness
  // rather than sampling evenly.
  const weak = await prisma.review.groupBy({
    by: ["targetCase"],
    where: { ownerId, targetCase: { not: null }, rating: 1 },
    _count: { _all: true },
    orderBy: { _count: { targetCase: "desc" } },
    take: 5,
  });
  const weakCases = new Set(weak.map((w) => w.targetCase).filter((c): c is string => !!c));

  const pool: WritingPrompt[] = [];
  for (const lexeme of lexemes) {
    for (const task of writingTasksFor(lexeme)) {
      pool.push({
        lexemeId: lexeme.id,
        lemma: task.lemma,
        translation: task.translation,
        caseKey: task.caseKey,
        caseEn: task.caseEn,
        caseEt: task.caseEt,
        caseQuestion: task.caseQuestion,
        provenance: task.provenance,
        weak: weakCases.has(task.caseKey),
      });
    }
  }

  // Weak cases first, then shuffled, so a round is varied but pointed.
  const shuffled = pool
    .map((p) => ({ p, k: Math.random() - (p.weak ? 1 : 0) }))
    .sort((a, b) => a.k - b.k)
    .map(({ p }) => p);

  // At most one prompt per word, so a round is six different words.
  const seen = new Set<string>();
  const round = shuffled.filter((p) => !seen.has(p.lemma) && seen.add(p.lemma)).slice(0, ROUND);

  if (round.length === 0) {
    return (
      <Page title="Writing" lead="Write your own Estonian, and have it marked.">
        <Empty
          title="No words to write about yet"
          body="Writing practice draws on nouns and adjectives already in your deck, because the point is producing words you have met — not meeting new ones. Add a few from the dictionary."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  return <WriteSession prompts={round} aiAvailable={resolveProvider() !== null} />;
}
