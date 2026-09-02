import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ListeningSession, type ListeningCard } from "./ListeningSession";
import { shuffle } from "@/lib/random/shuffle";
import { decoyOptions } from "@/lib/dict/facts";
import { unitIntroducing } from "@/lib/collections/syllabus";
import {
  bandOf, differentMeaning, glossNearness, glossOption, pickOptions,
} from "@/lib/questions/distractors";

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
    include: { lexeme: { select: { lemma: true, translation: true, pos: true, cefr: true } } },
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
      include: { lexeme: { select: { lemma: true, translation: true, pos: true, cefr: true } } },
    });
    cards = [...cards, ...weak];
  }

  // The dictionary's overall size is stable across a session (grading never
  // changes it), so this check is safe to keep here rather than in the client.
  if (cards.length > 0) {
    // Which words the dictionary holds is the same answer for everybody and
    // the same answer next round, so it is read once per instance rather than
    // once per round: see lib/dict/facts.ts.
    const pool = await decoyOptions();
    if (pool.length < MIN_LEXEMES_FOR_CHOICES) {
      return (
        <Page title="Listening" lead="Hear a word, pick its meaning.">
          <Empty
            title="Not quite enough words yet"
            body={`The wrong answers come from other words, and there aren't ${MIN_LEXEMES_FOR_CHOICES} yet to pick from.`}
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        </Page>
      );
    }

    /*
      Wrong answers are ranked by `lib/questions/distractors.ts`, the same table
      the review screen, the placement check and the mock exam read. This round
      used to keep its own `pickDecoys`, which preferred the answer's own part
      of speech and took whatever the shuffle gave after that. Preferring the
      part of speech was the right instinct and it was one signal out of four:
      it left a C1 noun standing beside an A1 one, and a three-sense gloss
      beside three one-word options, which is the answer before a word of it has
      been read. One table rather than a copy here, because two rankings of one
      question drift a weight at a time.
    */
    const listeningCards: ListeningCard[] = [];
    for (const c of shuffle(cards)) {
      const correct = c.back;
      const answer = glossOption({
        text: correct,
        pos: c.lexeme?.pos ?? "OTHER",
        band: bandOf(c.lexeme?.cefr),
        theme: c.lexeme ? unitIntroducing(c.lexeme.lemma, c.lexeme.pos) : null,
      });
      const picked = pickOptions({
        answer, candidates: pool, rng: Math.random,
        distinct: differentMeaning, nearness: glossNearness,
      });
      // A word the pool cannot supply three genuinely wrong answers for is
      // dropped rather than padded, because this round has no shape to fall
      // back to: it is four options or it is nothing.
      if (!picked) continue;
      listeningCards.push({
        id: c.id, lemma: c.lexeme?.lemma ?? c.front, correct, choices: picked.options,
      });
    }

    return <ListeningSession cards={listeningCards} />;
  }

  return <ListeningSession cards={[]} />;
}

