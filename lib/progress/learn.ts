import { prisma } from "@/lib/db";
import { equivalentIn, type GlossLanguage } from "@/lib/collections/glossLanguage";
import { challengeFirst } from "@/lib/collections/levels";
import type { Level } from "@/lib/collections/syllabus";
import { unitIntroducing } from "@/lib/collections/syllabus";
import { decoyOptions } from "@/lib/dict/facts";
import { starredAmong } from "@/lib/progress/stars";
import { parseExamples, teachingSentence, usableExamples } from "@/lib/dict/examples";
import { glossSentences, type GlossedToken } from "@/lib/dict/glossed";
import { isPhrase } from "@/lib/dict/pos";
import { resolveProvider } from "@/lib/tutor/provider";
import { buildCloze, mentions } from "@/lib/estonian/cloze";
import { gapForms } from "@/lib/estonian/gapForms";
import {
  LADDER_CARD_TYPE, LEARN_BATCH, orderByRung, rungOf, type Rung,
} from "@/lib/learn/ladder";
import {
  bandOf, differentMeaning, glossNearness, glossOption, pickOptions,
} from "@/lib/questions/distractors";

/**
 * READING A BATCH OF WORDS FOR THE LEARN LADDER.
 *
 * `lib/learn/ladder.ts` is the rule and holds no database; this is the half
 * that asks one. It is here rather than beside the rule for the reason every
 * pure layer in this app gives about itself: those modules are unit tested
 * without a framework, and one `import { prisma }` inside a directory four
 * hundred tests read puts a database behind all of them.
 *
 * WHAT A WORD IS, HERE. The ladder works on the word rather than on the card,
 * and the card it grades is the word's **recognition** card. That is not a
 * convenience. Every rung asks one question, "do you know this word", at a
 * harder depth each time, and the recognition card is the one row in the deck
 * that stands for exactly that. Its other cards, the production card, the case
 * cards, the gap cards, are drills on a word you already know, which is what
 * Practice is for: a word leaves here the moment its recognition card
 * graduates, and everything else about it is asked over there.
 */

/**
 * How many unseen words are read before five of them are chosen.
 *
 * A deck is filled a unit, a level or a photographed handout at a time, and a
 * whole level arrives at one `createdAt` spanning every band the dictionary
 * has. Taking the five oldest would hand a B1 learner whatever the insert
 * happened to order first, which is the same fault the review queue's own
 * window was widened for. Sixty is one page of rows and gives the level
 * something to choose between.
 */
const NEW_CANDIDATES = 60;

/** Four options, one of them right. The same number every other picked question uses. */
const CHOICES = 4;

/**
 * What the recognition card and its word carry into a session.
 *
 * `forms` is the reason this is a `select` rather than a bare relation: the gap
 * rung blanks a real form out of a real sentence, and a word read without its
 * principal parts can only ever be gapped on the spelling that happens to be
 * its headword.
 */
const INCLUDE = {
  lexeme: {
    select: {
      id: true, lemma: true, translation: true, pos: true, examples: true, cefr: true,
      translationRu: true, translationUk: true,
      forms: { select: { formType: true, value: true, morphCode: true } },
    },
  },
} as const;

type LearnRow = Awaited<ReturnType<typeof prisma.card.findMany>>[number] & {
  lexeme: {
    id: string; lemma: string; translation: string; pos: string; examples: string;
    cefr: string | null; translationRu: string | null; translationUk: string | null;
    forms: { formType: string; value: string; morphCode: string | null }[];
  } | null;
};

/** The scheduling fields a session needs to work out a rung without the server. */
export interface LearnScheduling {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string | null;
  learningSteps: number;
}

export interface LearnWord {
  /** The recognition card. Every rung of the ladder grades this one row. */
  cardId: string;
  lexemeId: string;
  lemma: string;
  gloss: string;
  /** The Institute's own equivalent in the learner's chosen language, or null. */
  equivalent: { text: string; lang: string } | null;
  /** A whole utterance rather than a word: `Tere!` has no example and never will. */
  isPhrase: boolean;
  /** An attested sentence, and which form of the word it carries. */
  sentence: { et: string; en: string | null; form: string | null } | null;
  /**
   * That sentence with the dictionary under every word it will vouch for.
   *
   * The meet rung is the one screen whose whole job is a word doing something,
   * and Ekilex records no English for most usages, so it was a line of Estonian
   * a beginner could read one word of. Null where the batch did not look. See
   * `lib/dict/glossed.ts`.
   */
  tokens: GlossedToken[] | null;
  /** Whether this deployment has a model to ask for the whole line in English. */
  canTranslate: boolean;
  /**
   * The same sentence with the word taken out of it.
   *
   * Null where the dictionary holds no sentence a gap can be built from, and
   * the session falls back to asking for the word from its meaning. Nothing
   * here is written: `buildCloze` hides a form a lexicographer wrote, which is
   * the one thing this app may do to an Estonian sentence.
   */
  gap: {
    text: string;
    answer: string;
    full: string;
    en: string | null;
    /**
     * Which word the gap wants, without saying which spelling.
     *
     * The rung before this one asked what the word means, so the gap is about
     * the *form*, and a gap with no cue at all is a memory test of which of
     * five words this sentence belonged to. The fallback is the review card's
     * own, for its reason: the lemma and the meaning, then the meaning alone,
     * then nothing, because wherever the gap wants the dictionary form the
     * lemma would be the answer printed a line under the question, and a word
     * spelled the same in both languages puts it in the English too.
     */
    hint: string | null;
  } | null;
  /** Four glosses, one of them right, ranked rather than shuffled. */
  choices: string[] | null;
  /** Whether this word is already one of the learner's favourites. */
  starred: boolean;
  rung: Rung;
  scheduling: LearnScheduling;
}

function schedulingOf(card: LearnRow): LearnScheduling {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.lastReview?.toISOString() ?? null,
    learningSteps: card.learningSteps,
  };
}

/**
 * The sentence a word is taught with, and the gap made out of that same
 * sentence.
 *
 * One sentence for both rungs on purpose. A learner read `Ma joon kohvi` five
 * cards ago and is now asked to put `kohvi` back into it, which is the
 * strongest link this app can make between meeting a word and producing one,
 * and it costs nothing because the dictionary already chose the sentence.
 * Where that sentence cannot carry a gap, any other attested sentence for the
 * word is tried before giving up.
 */
function sentenceAndGap(lexeme: NonNullable<LearnRow["lexeme"]>) {
  const examples = usableExamples(parseExamples(lexeme.examples));
  const taught = teachingSentence(examples, [lexeme.lemma]);
  const forms = [...gapForms({
    lemma: lexeme.lemma, pos: lexeme.pos, forms: lexeme.forms,
  }).keys()];

  const ordered = taught
    ? [taught.example, ...examples.filter((e) => e !== taught.example)]
    : examples;

  for (const example of ordered) {
    const cloze = buildCloze(example.et, forms);
    if (!cloze) continue;
    /*
      The translation is the prompt at the gap rung, and it may not be the
      answer. Thirty entries in the dictionary are spelled the same in both
      languages, so `Vaatasin filmi` under "I watched the film" is a question
      about English spelling. Withheld rather than the gap dropped: the
      sentence is still worth answering, it is simply harder without it.
    */
    const en = example.en && !mentions(example.en, cloze.answer) ? example.en : null;
    const cue = [`${lexeme.lemma}, ${lexeme.translation}`, lexeme.translation]
      .find((line) => !mentions(line, cloze.answer)) ?? null;
    return {
      sentence: taught
        ? { et: taught.example.et, en: taught.example.en ?? null, form: taught.form }
        : { et: example.et, en: example.en ?? null, form: null },
      gap: { text: cloze.text, answer: cloze.answer, full: cloze.full, en, hint: cue },
    };
  }

  return {
    sentence: taught
      ? { et: taught.example.et, en: taught.example.en ?? null, form: taught.form }
      : null,
    gap: null,
  };
}

/**
 * The five words a session works through.
 *
 * Words already on the ladder come first, whatever their band: somebody who
 * met `kohvik` yesterday and could not produce it should be asked it again
 * before they are handed five more, or Learn becomes a place words go in and
 * never come out of. New words fill whatever room is left, nearest the
 * learner's level first.
 */
export async function learnBatch(
  ownerId: string, level: Level, glossLanguage: GlossLanguage, size = LEARN_BATCH,
): Promise<LearnWord[]> {
  const started = await prisma.card.findMany({
    where: { ownerId, suspended: false, cardType: LADDER_CARD_TYPE, state: 1 },
    // Longest waiting first, and the id settles a tie: a word's cards are
    // written in one insert and share a `due` to the millisecond.
    orderBy: [{ due: "asc" }, { id: "asc" }],
    take: size,
    include: INCLUDE,
  });

  const room = Math.max(0, size - started.length);
  const fresh = room === 0 ? [] : challengeFirst(
    await prisma.card.findMany({
      where: { ownerId, suspended: false, cardType: LADDER_CARD_TYPE, state: 0 },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: NEW_CANDIDATES,
      include: INCLUDE,
    }),
    level,
    (card) => card.lexeme?.cefr,
  ).slice(0, room);

  const rows = [...started, ...fresh].filter((row) => row.lexeme !== null);
  if (rows.length === 0) return [];

  /*
    Which words the dictionary holds is not a fact about the person being
    asked, so the decoy pool is one read per instance rather than one per
    session. See lib/dict/facts.ts.
  */
  const pool = await decoyOptions();

  /*
    Which of the batch are already favourites, so the star in the corner of
    each card is drawn in the state it is actually in. One query for the batch
    rather than one per word, and it is here rather than in the page because
    the batch is assembled here and a second read would be a second answer.
  */
  const starred = await starredAmong(
    ownerId, rows.map((row) => row.lexeme!.id),
  );

  const words = rows.map((row) => {
    const lexeme = row.lexeme!;
    const { sentence, gap } = sentenceAndGap(lexeme);
    const equivalent = equivalentIn(lexeme, glossLanguage);

    /*
      Ranked rather than shuffled, through the one table of what a wrong
      answer is worth. Three nouns standing around one verb is a single
      glance, and a learner meeting a word for the first time is exactly who
      that free question is wasted on.
    */
    const picked = pool.length >= CHOICES
      ? pickOptions({
          answer: glossOption({
            text: lexeme.translation,
            pos: lexeme.pos,
            band: bandOf(lexeme.cefr),
            theme: unitIntroducing(lexeme.lemma, lexeme.pos),
          }),
          candidates: pool,
          rng: Math.random,
          distinct: differentMeaning,
          nearness: glossNearness,
        })
      : null;

    return {
      cardId: row.id,
      lexemeId: lexeme.id,
      lemma: lexeme.lemma,
      gloss: lexeme.translation,
      equivalent: equivalent ? { text: equivalent, lang: glossLanguage } : null,
      isPhrase: isPhrase(lexeme.pos),
      sentence,
      // Filled below, in one read for the whole batch rather than one a word.
      tokens: null as GlossedToken[] | null,
      canTranslate: resolveProvider() !== null,
      gap,
      choices: picked ? picked.options : null,
      starred: starred.has(lexeme.id),
      rung: rungOf(row.state, row.learningSteps),
      scheduling: schedulingOf(row),
    } satisfies LearnWord;
  });

  /*
    THE DICTIONARY UNDER EVERY SENTENCE IN THE BATCH, IN ONE READ.

    A loop of lookups is a round trip each and this is five words, so it is one
    query. Nothing is written and nothing is proposed: `matchEstonianForm`
    vouches for a word or it is printed plain (ADR-021).
  */
  const glossable: { index: number; et: string; form: string | null }[] = [];
  words.forEach((word, index) => {
    if (word.sentence) glossable.push({ index, et: word.sentence.et, form: word.sentence.form });
  });
  if (glossable.length > 0) {
    const glossed = await glossSentences(glossable);
    glossable.forEach((w, i) => {
      const word = words[w.index];
      if (word) word.tokens = glossed[i] ?? null;
    });
  }

  return orderByRung(words, (word) => word.rung);
}

/** How much is waiting, for the card that offers a session. */
export interface LearnCounts {
  /** Words that have never been asked. */
  waiting: number;
  /** Words part way up the ladder, which come back before any new one does. */
  started: number;
}

export async function learnCounts(ownerId: string): Promise<LearnCounts> {
  const [waiting, started] = await Promise.all([
    prisma.card.count({
      where: { ownerId, suspended: false, cardType: LADDER_CARD_TYPE, state: 0 },
    }),
    prisma.card.count({
      where: { ownerId, suspended: false, cardType: LADDER_CARD_TYPE, state: 1 },
    }),
  ]);
  return { waiting, started };
}
