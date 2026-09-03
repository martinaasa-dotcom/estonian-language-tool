import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { naturalSentence, nominalOpener } from "@/lib/estonian/cloze";
import { dictationWords } from "@/lib/estonian/dictation";
import { DictationSession, type DictationTask } from "./DictationSession";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Dictation" };

export const dynamic = "force-dynamic";

const ROUND = 6;

/** Long enough to be a sentence, short enough to hold in your head. */
const MIN_WORDS = 3;
const MAX_WORDS = 9;
const MAX_CHARS = 80;

/**
 * A dictation round from the learner's own deck.
 *
 * Every sentence is one Ekilex recorded against a word they are studying, so
 * nothing here was written by the app and nothing is unfamiliar vocabulary
 * dressed up as a listening test. Short sentences only: a dictation you cannot
 * hold in your head is a memory test, not a listening one.
 *
 * Renders the session even with nothing to do, for the same reason every other
 * mode does — grading refreshes this Server Component, and a conditional empty
 * state here would swap itself in mid-round.
 */
export default async function DictationPage() {
  const ownerId = await requireUserId();

  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null } },
    orderBy: [{ due: "asc" }],
    take: 300,
    select: {
      id: true,
      cardType: true,
      lexeme: { select: { id: true, lemma: true, pos: true, examples: true } },
    },
  });

  // One task per word, and one card per word to grade against.
  const byLexeme = new Map<string, { cardId: string; lemma: string; pos: string; examples: string }>();
  for (const card of cards) {
    const lex = card.lexeme;
    if (!lex) continue;
    const held = byLexeme.get(lex.id);
    // The gap-fill card is the closest thing in the deck to "this word, in a
    // sentence, spelled out", so it is the one this round grades.
    if (!held || card.cardType === "CLOZE") {
      byLexeme.set(lex.id, { cardId: card.id, lemma: lex.lemma, pos: lex.pos, examples: lex.examples });
    }
  }

  const tasks: DictationTask[] = [];
  for (const entry of byLexeme.values()) {
    /*
      And only something somebody could type back. `usableExamples` keeps what
      is worth printing on a dictionary entry; a usage that trails off
      (`Uuringud näitavad, et ..`) or offers two alternatives round a slash
      (`Elekter läks ära / kadus.`) is perfectly good lexicography and cannot
      be dictated. `naturalSentence` is the gate the mock exam and the level
      check already put every sentence through.

      The opener is the headword rather than every form of it, which is what a
      query on this page can afford: the label pattern is a usage that names
      its own headword and then illustrates, and Ekilex writes that name in the
      dictionary form.
    */
    const opener = nominalOpener(entry.pos, [entry.lemma]);
    for (const example of usableExamples(parseExamples(entry.examples))) {
      if (!naturalSentence(example.et, opener)) continue;
      const count = dictationWords(example.et).length;
      if (count < MIN_WORDS || count > MAX_WORDS) continue;
      if (example.et.length > MAX_CHARS) continue;
      tasks.push({
        cardId: entry.cardId,
        lemma: entry.lemma,
        et: example.et,
        en: example.en ?? null,
      });
      break; // one sentence per word keeps a round varied
    }
  }

  return <DictationSession tasks={shuffle(tasks).slice(0, ROUND)} />;
}

