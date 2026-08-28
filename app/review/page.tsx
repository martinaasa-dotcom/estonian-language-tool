import { prisma } from "@/lib/db";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ReviewSession, type ReviewCard } from "./ReviewSession";

export const dynamic = "force-dynamic";

const NEW_PER_SESSION = 10;
const MAX_SESSION = 60;

export default async function ReviewPage() {
  const now = new Date();

  // Due first, then a capped trickle of new cards. Uncapped new cards is the
  // classic way an SRS becomes an unsustainable workload three weeks in.
  const due = await prisma.card.findMany({
    where: { suspended: false, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: MAX_SESSION,
    include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
  });

  const fresh = await prisma.card.findMany({
    where: { suspended: false, state: 0 },
    orderBy: { createdAt: "asc" },
    take: Math.max(0, Math.min(NEW_PER_SESSION, MAX_SESSION - due.length)),
    include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
  });

  const cards: ReviewCard[] = [...due, ...fresh].map((c) => ({
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
  }));

  const totalCards = await prisma.card.count();

  if (cards.length === 0) {
    return (
      <Page title="Review" lead="Spaced repetition, scheduled by FSRS.">
        {totalCards === 0 ? (
          <Empty
            title="No cards yet"
            body="Add words from the dictionary, or paste a list you already have. Two cards are made per word — one each direction."
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        ) : (
          <Empty
            title="Nothing due — you're caught up"
            body={`All ${totalCards} cards are scheduled for later. Reviewing early doesn't help memory, so this is the app telling you to stop.`}
            action={<ButtonLink href="/dictionary" variant="secondary">Add a few new words</ButtonLink>}
          />
        )}
      </Page>
    );
  }

  return <ReviewSession cards={cards} />;
}
