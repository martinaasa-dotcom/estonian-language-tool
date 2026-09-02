import { prisma } from "@/lib/db";
import { parseExamples, teachingSentence } from "@/lib/dict/examples";
import { isPhrase } from "@/lib/dict/pos";
import { equivalentIn, type GlossLanguage } from "@/lib/collections/glossLanguage";
import { isStillLearning } from "@/lib/srs/scheduler";
import { unitIntroducing } from "@/lib/collections/syllabus";
import { decoyOptions } from "@/lib/dict/facts";
import {
  bandOf, differentMeaning, glossNearness, glossOption, pickOptions,
} from "@/lib/questions/distractors";
import type { ReviewCard } from "./ReviewSession";

/**
 * READING A CARD OUT OF THE DATABASE AND HANDING IT TO A SESSION.
 *
 * Everything the review screen and the Flash cards round both need to turn a
 * `Card` row into something `ReviewSession` can ask: what to select, how to
 * build the first-meeting screen, and how the multiple-choice options are
 * ranked.
 *
 * It lives here rather than in `page.tsx` because two routes render the same
 * session now, and a second copy of `include` is two selects that drift apart
 * while a second copy of the option ranking is the fault this app has already
 * fixed twice (see `lib/questions/distractors.ts`).
 *
 * Server only: it reads Prisma.
 */

/** Four options, one of them right. */
const CHOICES = 4;

/**
 * What a card row carries. Shared, because `inBandPool` and the Flash cards
 * round read it too, and a second copy is two selects that can come apart.
 *
 * `cefr` rides along for the new-card queue, which introduces words around the
 * learner's level before words far off it. `examples` is a handful of short
 * sentences and only the one that gets shown crosses to the client, because a
 * word taught without a sentence is a word taught as a label (see `introFor`).
 */
export const include = {
  lexeme: {
    select: {
      lemma: true, translation: true, pos: true, examples: true, cefr: true,
      // For the first meeting only, which is the one screen where a meaning in
      // the learner's own language earns the most: the word is being learned
      // there rather than tested.
      translationRu: true, translationUk: true,
    },
  },
} as const;

export type CardRow = Awaited<ReturnType<typeof prisma.card.findMany>>[number] & {
  lexeme: {
    lemma: string; translation: string; pos: string; examples: string; cefr: string | null;
    translationRu: string | null; translationUk: string | null;
  } | null;
};

/**
 * What a first meeting with a word shows.
 *
 * Assembled here rather than in the browser for two reasons: the sentence is
 * picked out of a column holding up to eight of them and only the chosen one
 * needs to cross the wire, and `teachingSentence` is the same function the
 * grammar pages and the lesson use, so a word is introduced the same way
 * wherever it is met.
 *
 * Every string in here came out of the dictionary. Nothing is written, and
 * nothing is derived (ADR-005).
 */
function introFor(c: CardRow, glossLanguage: GlossLanguage): ReviewCard["intro"] {
  if (!c.lexeme) return null;

  // The form the card is about to ask for comes first, then the lemma. On a
  // recognition card the front *is* the lemma, and on a gap-fill the front is a
  // sentence with a hole in it and would match nothing, which is why this asks
  // the card what it is rather than reading whichever side happens to be
  // Estonian.
  const asked = c.cardType === "RECOGNITION" ? c.front : c.back;
  const found = teachingSentence(parseExamples(c.lexeme.examples), [asked, c.lexeme.lemma]);

  const equivalent = equivalentIn(c.lexeme, glossLanguage);

  return {
    lemma: c.lexeme.lemma,
    gloss: c.lexeme.translation,
    equivalent: equivalent ? { text: equivalent, lang: glossLanguage } : null,
    sentence: found
      ? { et: found.example.et, en: found.example.en ?? null, form: found.form }
      : null,
    isPhrase: isPhrase(c.lexeme.pos),
  };
}

function toReviewCard(c: CardRow, glossLanguage: GlossLanguage): ReviewCard {
  return {
    id: c.id,
    cardType: c.cardType,
    front: c.front,
    back: c.back,
    hint: c.hint,
    targetCase: c.targetCase,
    lemma: c.lexeme?.lemma ?? null,
    isNew: c.state === 0,
    // Only on a card that has never been seen. Every other card in the session
    // would carry a sentence nothing renders.
    intro: c.state === 0 ? introFor(c, glossLanguage) : null,
    choices: null,
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

/**
 * Which recognition cards are asked as four options rather than recalled.
 *
 * Only the ones still being learned, which is the whole point of the shape.
 * Options were once attached to every recognition card a session held, and the
 * effect was that half a deck could never be asked properly: `askFor` routes to
 * a pick whenever options exist, and neither review mode overrides it, so the
 * one question this app is named for, what does this Estonian word mean, was
 * always answered with the answer already on the screen. Recognising a gloss
 * among four is a different and much weaker memory than producing it, and a
 * schedule built on the easier one says a word is known when it is not.
 *
 * A card still in learning keeps them for the same reason a new card leads with
 * its answer at all (see `askFor`): the memory is not there yet, and asking for
 * it cold is a guessing game rather than a test. A lapsed card is back in that
 * position by definition, which `isStillLearning` reads as Relearning.
 */
function wantsChoices(card: ReviewCard): boolean {
  /*
    A NEW CARD NOW GETS THEM TOO, BECAUSE IT IS NOW ASKED.

    `!card.isNew` was right while meeting a word was the whole of its first
    outing: there was no question, so there was nothing to offer options for.
    A newly met word is asked back before the session ends now, and the memory
    at that point is minutes old, which is exactly the position the sentence
    above describes for a card still in learning.
  */
  return card.cardType === "RECOGNITION"
    && (card.isNew || isStillLearning(card.scheduling.state));
}

/**
 * Maps the rows to cards, attaching multiple-choice options to the recognition
 * cards that get them.
 *
 * Wrong answers are real translations of other words rather than invented text:
 * nothing here writes Estonian, and a decoy that is obviously nonsense makes
 * the question free. They are drawn once for the whole session, so the pool is
 * one query rather than one per card.
 *
 * **Which three are offered is ranked, not shuffled.** This screen took the
 * first three strings off a shuffle of the whole dictionary, so a learner asked
 * what `jooma` means chose between "to drink", "window", "October" and
 * "friendship". Three nouns standing around one verb is a single glance, and
 * the question measured whether somebody can spot the odd option rather than
 * whether they know the word. The learner who reported it put it plainly: if
 * the Estonian word is a verb then all four options need to be verbs. Measured
 * over 4,000 questions built from the shipped dictionary, all four shared the
 * answer's part of speech 33% of the time, and it is 99% now.
 *
 * `lib/questions/distractors.ts` has been the one table of what a wrong answer
 * is worth since the placement check and the mock exam were fixed for exactly
 * this fault, and the daily review screen was simply never wired to it. It
 * ranks on the course unit, the part of speech, the CEFR band and the shape of
 * the line, and `differentMeaning` is what stops a near option becoming a
 * second right one. `pickOptions` returns null rather than padding when it
 * cannot find three that are genuinely wrong, and that card is asked as recall
 * instead, which is the honest answer and is what this screen does with every
 * card that never had options.
 *
 * Takes the rows rather than the mapped cards, because the ranking needs the
 * part of speech and the band and a `ReviewCard` carries neither. Threading a
 * second parallel array in beside the cards would be two lists that can come
 * apart.
 */
export async function withChoices(
  rows: CardRow[], glossLanguage: GlossLanguage,
): Promise<ReviewCard[]> {
  const cards = rows.map((c) => toReviewCard(c, glossLanguage));
  if (!cards.some(wantsChoices)) return cards;

  /*
    Which words the dictionary holds is not a fact about the person being
    asked, so the pool is read once per instance rather than once per session,
    off the render path of the screen this app exists to get people to.
    See lib/dict/facts.ts.
  */
  const pool = await decoyOptions();
  if (pool.length < CHOICES) return cards;

  return cards.map((card, i) => {
    if (!wantsChoices(card)) return card;
    const lexeme = rows[i]?.lexeme;
    const answer = glossOption({
      text: card.back,
      pos: lexeme?.pos ?? "OTHER",
      band: bandOf(lexeme?.cefr),
      theme: lexeme ? unitIntroducing(lexeme.lemma, lexeme.pos) : null,
    });
    const picked = pickOptions({
      answer,
      candidates: pool,
      rng: Math.random,
      distinct: differentMeaning,
      nearness: glossNearness,
    });
    return picked ? { ...card, choices: picked.options } : card;
  });
}
