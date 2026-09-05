import { prisma } from "@/lib/db";
import { bandsAround } from "@/lib/collections/levels";
import type { Level } from "@/lib/collections/syllabus/types";
import { guessableWords } from "@/lib/dict/facts";
import { dayIndex } from "@/lib/random/dayHash";
import { SONAD_LENGTH } from "@/lib/games/sonad";
import { semanticCategory } from "@/lib/estonian/semantics";
import type { DayKey } from "@/lib/time/day";

/**
 * WHICH WORD SÕNAD IS ABOUT TODAY, AND WHICH WORDS IT WILL ACCEPT.
 *
 * Two lists, and the difference between them is the whole design.
 *
 * THE ANSWER IS A GRADED DICTIONARY ENTRY at the learner's own level, because
 * an answer has to be a word this app can teach: the finish screen names it,
 * glosses it, links to its entry and offers to put it in the deck, and none of
 * that works for a word out of the tail of the expansion. Banded on
 * `bandsAround` like every other screen that chooses a word for somebody, which
 * also means the pool follows a learner up: 215 answers at A1, 477 at B1.
 *
 * THE GUESSES ARE THE WHOLE LANGUAGE, IN EVERY FORM. `KnownWord` held the
 * 154,995 headwords the Ekilex enumeration brought back, 7,134 of them six
 * letters long, and a learner typed `põhjas`, the seesütlev of `põhi`, and was
 * told it was not a word. Telling somebody that an ordinary Estonian word is
 * not a word is the one thing a game like this must never do, and a headword
 * list does it to every case of every noun. The guesses are the forms list
 * now (`lib/dict/forms.ts`), 60,812 spellings at six letters.
 *
 * THE DAY DECIDES, NOT A RANDOM NUMBER, so the board survives a reload and two
 * people at the same level talking about it are talking about one word. The
 * key is the learner's own day (`lib/time/day.ts`), because a server's midnight
 * is the deployment's.
 *
 * NOTHING IS STORED. What guesses have been made lives on the device, the way
 * an unfinished mock exam does, and the answer is recomputed from the date. A
 * round finished is a `Review` row if the word is in the deck and nothing at
 * all otherwise, which is ADR-014's rule: no counter, no stored score.
 */

export interface Puzzle {
  /** The word, which the client needs in order to mark a guess without a call. */
  answer: string;
  lexemeId: string;
  translation: string;
  pos: string;
  cefr: string | null;
  /**
   * What kind of thing it is, or null where the Institute said nothing useful.
   *
   * Read here rather than on the board because it is a dictionary column, and
   * read through `semanticCategory` rather than passed raw because
   * `lib/estonian/semantics.ts` is the one module allowed to interpret those
   * codes. Null is an ordinary answer: `cluesAt` still gives the vowels.
   */
  category: string | null;
  /** Already in the deck, so finishing is evidence rather than an offer. */
  inDeck: boolean;
}

/**
 * That the answer crosses to the browser is deliberate and is not a leak worth
 * closing.
 *
 * The alternative is a round trip per guess in a game whose feel is typing and
 * pressing return, and the thing being protected is a puzzle somebody chose to
 * play. Anybody who opens the network tab has spoiled their own morning, which
 * is the same bargain every offline word game makes. What the client may *not*
 * decide is what it is worth: `ratingFor` is pure and runs on the server in the
 * action, over the guesses it is handed, so a forged board cannot post a Good
 * for a word nobody answered.
 */
export async function puzzleFor(
  ownerId: string, day: DayKey, level: Level,
): Promise<Puzzle | null> {
  const bands = [...bandsAround(level)];
  const kinds = ["NOUN", "VERB", "ADJECTIVE", "ADVERB"];

  /*
    Ordered and counted, then skipped into, which is the shape the word of the
    day uses and for the same reason: it is stable through the learner's day
    from the one thing that changes at midnight, and it spreads across the pool
    rather than favoring the front of the alphabet.

    The length filter is in SQL rather than in JavaScript because the pool is
    six thousand rows and the answer is one of them.
  */
  const pool = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (lemma) id FROM "Lexeme"
    WHERE char_length(lemma) = ${SONAD_LENGTH}
      AND lemma ~ ${"^[a-zäöüõšž]+$"}
      AND cefr = ANY(${bands})
      AND pos = ANY(${kinds})
    ORDER BY lemma, id
  `;
  if (pool.length === 0) return null;

  /*
    One entry per lemma, decided in SQL rather than after the fact: `@@unique`
    is on `(lemma, pos)`, so `hall` is two rows, and a pool holding both would
    put the same six letters on the board on two different days under two
    different glosses. The lowercase-only pattern is doing a second job as
    well, keeping a proper noun off the board: `Eesti` is a NOUN and nobody
    wants to deduce it.
  */
  const entry = await prisma.lexeme.findUnique({
    where: { id: pool[dayIndex(day, "sonad", pool.length)]!.id },
    select: {
      id: true, lemma: true, pos: true, translation: true, cefr: true,
      semanticTypes: true,
    },
  });
  if (!entry) return null;

  const card = await prisma.card.findFirst({
    where: { ownerId, lexemeId: entry.id },
    select: { id: true },
  });

  return {
    answer: entry.lemma.toLocaleLowerCase("et"),
    lexemeId: entry.id,
    translation: entry.translation,
    pos: entry.pos,
    cefr: entry.cefr,
    category: semanticCategory(entry.semanticTypes),
    inDeck: card !== null,
  };
}

/** Every six-letter Estonian word, for the board to check a guess against. */
export function guessList(): Promise<string[]> {
  return guessableWords(SONAD_LENGTH);
}
