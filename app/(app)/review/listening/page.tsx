import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ListeningSession, type ListeningCard } from "./ListeningSession";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Listening" };

export const dynamic = "force-dynamic";

const POOL_SIZE = 20;
const CHOICE_COUNT = 4;
const MIN_LEXEMES_FOR_CHOICES = CHOICE_COUNT;

/**
 * Audio multiple-choice — the Duolingo "listening exercise" idea, built as a
 * session mode over existing RECOGNITION cards (see app/review/sprint/ for
 * the same pattern) rather than a new stored CardType. docs/13-mvp-status.md
 * §4 shelved a real `LISTENING` FSRS card because it would need example
 * sentences the dictionary doesn't carry for every word; this sidesteps that
 * by only ever needing what every word already has — its audio and its
 * translation — and grading through the same FSRS path as a normal review.
 *
 * Always renders ListeningSession, even with an empty card pool — it decides
 * for itself, once on mount, whether to show its own empty state. gradeCard()
 * refreshes this route's Server Component on every call, so a conditional
 * choice made *here* between Empty and ListeningSession would keep
 * re-evaluating as the pool is graded away, swapping to Empty right as the
 * final card is graded — before the session summary would show.
 */
export default async function ListeningPage() {
  const ownerId = await requireUserId();
  const now = new Date();

  const due = await prisma.card.findMany({
    where: { ownerId, suspended: false, cardType: "RECOGNITION", lexemeId: { not: null }, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: POOL_SIZE,
    include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
  });

  let cards = due;
  if (cards.length < POOL_SIZE) {
    const seenIds = new Set(cards.map((c) => c.id));
    const weak = await prisma.card.findMany({
      where: {
        ownerId, suspended: false, cardType: "RECOGNITION", lexemeId: { not: null },
        lapses: { gt: 0 }, id: { notIn: [...seenIds] },
      },
      orderBy: { lapses: "desc" },
      take: POOL_SIZE - cards.length,
      include: { lexeme: { select: { lemma: true, translation: true, pos: true } } },
    });
    cards = [...cards, ...weak];
  }

  // The dictionary's overall size is stable across a session (grading never
  // changes it), so this check is safe to keep here rather than in the client.
  if (cards.length > 0) {
    const decoyPool = await prisma.lexeme.findMany({ select: { translation: true, pos: true } });
    const distinctTranslations = new Set(decoyPool.map((l) => l.translation));
    if (distinctTranslations.size < MIN_LEXEMES_FOR_CHOICES) {
      return (
        <Page title="Listening" lead="Hear a word, pick its meaning.">
          <Empty
            title="Not quite enough words yet"
            body={`The wrong answers come from other words, and there are fewer than ${MIN_LEXEMES_FOR_CHOICES} to draw on.`}
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        </Page>
      );
    }

    // Decoys are drawn from the whole dictionary, favouring the same part of
    // speech so the wrong answers aren't trivially implausible.
    const byPos = new Map<string, string[]>();
    for (const l of decoyPool) {
      const arr = byPos.get(l.pos) ?? [];
      if (!arr.includes(l.translation)) arr.push(l.translation);
      byPos.set(l.pos, arr);
    }
    const allTranslations = [...distinctTranslations];

    const shuffled = shuffle(cards);
    const listeningCards: ListeningCard[] = shuffled.map((c) => {
      const correct = c.back;
      const pos = c.lexeme?.pos ?? "OTHER";
      const decoys = pickDecoys(byPos, allTranslations, pos, correct, CHOICE_COUNT - 1);
      const choices = shuffle([...decoys, correct]);
      return { id: c.id, lemma: c.lexeme?.lemma ?? c.front, correct, choices };
    });

    return <ListeningSession cards={listeningCards} />;
  }

  return <ListeningSession cards={[]} />;
}

function pickDecoys(
  byPos: Map<string, string[]>, allTranslations: string[], pos: string, correct: string, count: number,
): string[] {
  const sameOrder = shuffle((byPos.get(pos) ?? []).filter((t) => t !== correct));
  const rest = shuffle(allTranslations.filter((t) => t !== correct && !sameOrder.includes(t)));
  return [...sameOrder, ...rest].slice(0, count);
}

