import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { isBuildable } from "@/lib/estonian/cloze";
import { SentenceSession, type SentenceTask } from "./SentenceSession";

export const dynamic = "force-dynamic";

const ROUND = 8;

/**
 * Builds a round of sentence-ordering exercises from the learner's own deck.
 *
 * Every sentence is one Ekilex recorded against a word they are already
 * studying, so the vocabulary is familiar and only the word order is being
 * tested. Sentences that already have an English translation come first: with
 * one, the exercise is "say this in Estonian", which is a genuine production
 * task rather than a memory drill.
 *
 * Always renders SentenceSession, even with nothing to do — the same reason as
 * every other mode (see app/review/sprint/page.tsx): grading refreshes this
 * Server Component, and a conditional empty state here would swap in mid-round.
 */
export default async function SentencesPage() {
  const ownerId = await requireUserId();

  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null } },
    orderBy: [{ due: "asc" }],
    take: 300,
    select: {
      id: true,
      cardType: true,
      lexeme: { select: { id: true, lemma: true, examples: true } },
    },
  });

  // One task per word, and one card per word to grade against: a learner with
  // five cards for `raamat` should still meet its sentence once.
  const byLexeme = new Map<string, { cardId: string; lemma: string; lexemeId: string; examples: string }>();
  for (const card of cards) {
    const lex = card.lexeme;
    if (!lex) continue;
    const held = byLexeme.get(lex.id);
    // Prefer grading the gap-fill card: it is the one this exercise is closest to.
    if (!held || card.cardType === "CLOZE") {
      byLexeme.set(lex.id, {
        cardId: card.id, lemma: lex.lemma, lexemeId: lex.id, examples: lex.examples,
      });
    }
  }

  const tasks: SentenceTask[] = [];
  for (const entry of byLexeme.values()) {
    for (const example of usableExamples(parseExamples(entry.examples))) {
      if (!isBuildable(example.et)) continue;
      tasks.push({
        cardId: entry.cardId,
        lexemeId: entry.lexemeId,
        lemma: entry.lemma,
        et: example.et,
        en: example.en ?? null,
      });
      break; // one sentence per word keeps a round varied
    }
  }

  // Translated first, then shuffled within each group so a round is not the
  // same eight sentences every time.
  const translated = shuffle(tasks.filter((t) => t.en));
  const untranslated = shuffle(tasks.filter((t) => !t.en));

  return <SentenceSession tasks={[...translated, ...untranslated].slice(0, ROUND)} />;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
