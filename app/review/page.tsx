import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ReviewSession, type ReviewCard } from "./ReviewSession";

export const dynamic = "force-dynamic";

const NEW_PER_SESSION = 10;
const MAX_SESSION = 60;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const ownerId = await requireUserId();
  const { case: targetCase } = await searchParams;
  const now = new Date();

  // A drill on one grammatical case ignores scheduling: the point is to attack a
  // weakness the heatmap found, not to review what happens to be due.
  if (targetCase) {
    const drill = await prisma.card.findMany({
      where: { ownerId, suspended: false, targetCase },
      orderBy: [{ lapses: "desc" }, { due: "asc" }],
      take: 30,
      include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
    });
    // ReviewSession decides for itself, once, whether an empty pool means "show
    // the empty state" — never the server on a later grade-triggered refresh.
    // See app/review/sprint/ and app/review/listening/ for the same pattern,
    // and the shared reasoning in ReviewSession.tsx.
    return <ReviewSession cards={drill.map(toReviewCard)} drillCase={targetCase} totalCards={0} />;
  }

  // Due first, then a capped trickle of new cards. Uncapped new cards is the
  // classic way an SRS becomes an unsustainable workload three weeks in.
  const due = await prisma.card.findMany({
    where: { ownerId, suspended: false, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: MAX_SESSION,
    include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
  });

  const fresh = await prisma.card.findMany({
    where: { ownerId, suspended: false, state: 0 },
    orderBy: { createdAt: "asc" },
    take: Math.max(0, Math.min(NEW_PER_SESSION, MAX_SESSION - due.length)),
    include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
  });

  const cards: ReviewCard[] = [...due, ...fresh].map(toReviewCard);
  const totalCards = await prisma.card.count({ where: { ownerId } });

  return <ReviewSession cards={cards} totalCards={totalCards} />;
}

type CardRow = Awaited<ReturnType<typeof prisma.card.findMany>>[number] & {
  lexeme: { lemma: string; translation: string; pos: string } | null;
};

function toReviewCard(c: CardRow): ReviewCard {
  return {
    id: c.id,
    cardType: c.cardType,
    front: c.front,
    back: c.back,
    hint: c.hint,
    targetCase: c.targetCase,
    lemma: c.lexeme?.lemma ?? null,
    isNew: c.state === 0,
    scheduling: {
      due: c.due.toISOString(),
      stability: c.stability,
      difficulty: c.difficulty,
      elapsedDays: c.elapsedDays,
      scheduledDays: c.scheduledDays,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state,
      lastReview: c.lastReview?.toISOString() ?? null,
      learningSteps: c.learningSteps,
    },
  };
}
