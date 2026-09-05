import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { naturalSentence } from "@/lib/estonian/cloze";
import { starredAmong } from "@/lib/progress/stars";
import { SpeakingSession, type SpeakingCard } from "./SpeakingSession";

export const metadata = { title: "Speaking" };

export const dynamic = "force-dynamic";

const ROUND = 10;

/**
 * A speaking round from the learner's own deck.
 *
 * Words the scheduler thinks are due come first — speaking practice on a word
 * you are about to forget is worth more than on one you met this morning. A
 * word whose sentence already has an English translation is asked as the
 * sentence instead: producing "Jõin tassi kohvi." out loud is a different and
 * harder skill than producing "kohv", and by this point in a session the
 * learner has usually earned it.
 */
export default async function SpeakingPage() {
  const ownerId = await requireUserId();
  const now = new Date();

  const base = { ownerId, suspended: false, cardType: "RECOGNITION", lexemeId: { not: null } } as const;
  const include = {
    lexeme: { select: { lemma: true, translation: true, examples: true } },
  } as const;

  const due = await prisma.card.findMany({
    where: { ...base, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: ROUND,
    include,
  });

  let pool = due;
  if (pool.length < ROUND) {
    const seen = new Set(pool.map((c) => c.id));
    const rest = await prisma.card.findMany({
      where: { ...base, id: { notIn: [...seen] } },
      orderBy: [{ lapses: "desc" }, { due: "asc" }],
      take: ROUND - pool.length,
      include,
    });
    pool = [...pool, ...rest];
  }

  // Which of the round are already favorites, in one read rather than one per
  // card, so the star in the corner is drawn in the state it is actually in.
  const starred = await starredAmong(
    ownerId, pool.map((c) => c.lexemeId).filter((id): id is string => !!id),
  );

  const cards: SpeakingCard[] = pool.map((card) => {
    const lemma = card.lexeme?.lemma ?? card.front;
    const kept = { lexemeId: card.lexemeId, starred: !!card.lexemeId && starred.has(card.lexemeId) };
    /*
      And only a sentence somebody could be asked to say aloud. `usableExamples`
      keeps what is worth printing on a dictionary entry, which is not the same
      thing: `Uuringud näitavad, et ..` trails off and `Elekter läks ära /
      kadus.` is two alternatives round a slash, and neither is speakable.
      `naturalSentence` is the gate the mock exam and the level check already
      put every sentence through.
    */
    const translated = usableExamples(parseExamples(card.lexeme?.examples))
      .find((e) => e.en && naturalSentence(e.et));
    if (translated?.en) {
      return { cardId: card.id, et: translated.et, prompt: translated.en, lemma, isSentence: true, ...kept };
    }
    return { cardId: card.id, et: lemma, prompt: card.back, lemma, isSentence: false, ...kept };
  });

  return <SpeakingSession cards={cards} />;
}
