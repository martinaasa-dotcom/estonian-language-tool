import { prisma } from "@/lib/db";
import { computeStreak } from "@/lib/stats/streak";
import { occasionsFor, type Occasion } from "@/lib/copy/almanac";
import { bandsAround, isAround } from "@/lib/collections/levels";
import { dayHashFor, dayIndex } from "@/lib/random/dayHash";
import type { Level } from "@/lib/collections/syllabus/types";
import { matchesGloss, senseIndex } from "@/lib/dict/gloss";
import { parseExamples, usableExamples, type Example } from "@/lib/dict/examples";
import { naturalSentence } from "@/lib/estonian/cloze";
import type { DayClock, DayKey } from "@/lib/time/day";

/**
 * THE WORD OF THE DAY, AND WHY IT IS THAT WORD.
 *
 * The panel this feeds used to be called "word to revisit" and drew the card
 * with the most lapses on it. That is a useful thing to know and it is not a
 * word of the day: it is a word you already have, already failed, and are
 * already going to be asked about this afternoon by the scheduler. It now
 * lives in the sticking points panel, where the rest of "what is fighting you"
 * is, and this is the other thing entirely.
 *
 * TWO RULES DECIDE WHICH WORD.
 *
 * It has to be one the learner has NOT met. Not in their deck, not in their
 * review log, not starred. A word of the day that turns out to be card four of
 * today's review is a coincidence, not a present, and the whole point of the
 * panel is that it is the one thing on this page the rest of the app is not
 * already going to show you.
 *
 * And it has to arrive with a reason. `lib/copy/almanac.ts` decides what today
 * is and which English gloss that asks for, this asks the dictionary who
 * carries it, and the card prints the reason next to the word. A word with a
 * reason is remembered and a word drawn at random is scrolled past.
 *
 * THE LEVEL IS A TIE-BREAK ON ONE PATH AND A FILTER ON THE OTHER, AND THAT
 * ASYMMETRY IS MEASURED RATHER THAN TIDY. A B1 learner was shown `keskmine`,
 * an A1 adjective meaning "average", which is a word they had before they
 * started. The obvious fix is to band both paths on `bandsAround`, the way
 * every other screen that chooses a word for somebody does, and on the themed
 * path it is worse than doing nothing: the almanac asks for meanings, and the
 * meanings a calendar has are `snow`, `hand`, `week` and `first`, which are A1
 * words because that is what those meanings are in any language. Measured over
 * a year of the shipped dictionary at B1, banding the themed pick moved 37
 * days of 336 out of the alphabetically first candidates and into words whose
 * gloss carries the day's meaning as a fourth sense, on 31 days that had the
 * primary one. There is no B1 word for snow. So the themed path ranks on the
 * band **after** the sense, which changes six days and costs nothing, and the
 * word arrives at whatever level the meaning happens to live at, which is the
 * honest answer to "here is a word for today".
 *
 * `pickAny` has no meaning to honor and is where the fault actually was: it
 * filtered on nothing at all, so its skip landed anywhere in six thousand
 * entries. It bands.
 *
 * NOTHING HERE WRITES ESTONIAN, WHICH IS THE POINT OF THE SPLIT (ADR-005). The
 * almanac is English and asks for a meaning. The Estonian is whatever the
 * dictionary already held: the lemma from Ekilex or the built expansion, the
 * gloss from Wiktionary, the example sentence a lexicographer recorded. This
 * module joins them and invents nothing, exactly as `scripts/expand-seed.ts`
 * does one layer down.
 */

/**
 * WHERE A CARD ADDED FROM THIS PANEL SAYS IT CAME FROM.
 *
 * `Card.source` already separates a word taken from the dictionary, a unit of
 * the path, a pasted list, a scan and one Anu suggested, so the panel gets its
 * own value rather than a counter somewhere. That is the whole of how the
 * collection is counted: no column, no total, no stored streak, just cards that
 * know where they came from and `createdAt`, which is the rule progress in this
 * app has always followed (ADR-014). A number that is added up from what
 * actually happened cannot be awarded for something that did not.
 */
export const ALMANAC_SOURCE = "ALMANAC";

/** What the learner has kept from the panel. Derived, like everything else. */
export interface WordOfDayCollection {
  /** Words taken into the deck from this panel, ever. */
  kept: number;
  /** Days in a row one was taken, counting from today or yesterday. */
  streak: number;
}

export interface WordOfDay {
  lexemeId: string;
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  gradationNote: string | null;
  /** An attested sentence, when the entry has one short enough to read at a glance. */
  example: Example | null;
  /**
   * What today is, when the date is the reason this word is here.
   *
   * Null when nothing the almanac asked for could be met and the word was
   * drawn instead. The card says which it got rather than claiming a reason it
   * does not have: a reason nobody can check is worse than no reason.
   */
  occasion: Occasion | null;
}

/** Enough rows to rank properly without dragging the dictionary onto the page. */
const CANDIDATE_LIMIT = 240;

/**
 * The one for `day`, or null when the dictionary has nothing left to offer.
 *
 * Stable through the learner's own day: the same word until their midnight,
 * because the day key is the only thing that varies. Adding it to the deck
 * does not swap it either, since "met" is measured at the start of the day and
 * "add this to my deck" is the button the card is built around.
 */
export async function wordOfDay(
  ownerId: string,
  day: DayKey,
  dayStart: Date,
  level: Level,
): Promise<WordOfDay | null> {
  const occasions = occasionsFor(day);
  const glosses = [...new Set(occasions.flatMap((o) => o.glosses))];

  const themed = glosses.length > 0 ? await pickThemed(ownerId, day, dayStart, occasions, glosses, level) : null;
  return themed ?? (await pickAny(ownerId, day, dayStart, level));
}

/**
 * How many the learner has kept, and whether they are keeping one a day.
 *
 * A count makes the panel a habit rather than a decoration, which is the whole
 * argument for having it: somebody who has kept eleven words this way opens the
 * card looking for the twelfth. It costs one indexed read and no schema.
 *
 * `computeStreak` is the app's own run-of-days function, the one the review
 * streak uses, so a run counted here and a run counted there mean the same
 * thing and break at the same midnight. Bounded at 800 rows, which is a card
 * type or two a day for well over the 400 days a streak can reach.
 */
export async function wordOfDayCollection(
  ownerId: string,
  now: Date,
  clock: DayClock,
): Promise<WordOfDayCollection> {
  const cards = await prisma.card.findMany({
    where: { ownerId, source: ALMANAC_SOURCE },
    select: { id: true, createdAt: true, lexemeId: true },
    /*
      And then on the primary key, because `createdAt` is not unique: one press
      writes a recognition card and a production card in a single `createMany`,
      so the pair shares it exactly, and a `take` that straddles them would
      keep whichever the plan happened to return. The count below is over
      distinct lexemes, so a tie decided differently is a different number.
    */
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 800,
  });
  // Words, not cards: one press adds a recognition card and a production card,
  // and "kept 22" for eleven words would be counting the machinery.
  const words = new Set(cards.map((c) => c.lexemeId ?? "")).size;
  return {
    kept: words,
    streak: computeStreak(cards.map((c) => c.createdAt), now, clock),
  };
}

interface Candidate {
  id: string;
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  gradationNote: string | null;
  examples: string;
}

const SELECT = {
  id: true, lemma: true, pos: true, translation: true,
  cefr: true, gradationNote: true, examples: true,
} as const;

/**
 * A word the almanac asked for.
 *
 * One query for every gloss the day could want rather than one query per
 * gloss: there are up to a dozen of them across five layers, and twelve round
 * trips on the render path of the busiest page in the app to answer a question
 * about the twelfth of the month is not a trade worth making. Postgres sieves
 * with `contains`, `matchesGloss` decides, and the layers are put back in order
 * here.
 */
async function pickThemed(
  ownerId: string,
  day: DayKey,
  dayStart: Date,
  occasions: Occasion[],
  glosses: string[],
  level: Level,
): Promise<WordOfDay | null> {
  const rows = await prisma.lexeme.findMany({
    where: {
      OR: glosses.map((gloss) => ({ translation: { contains: gloss, mode: "insensitive" as const } })),
      ...unmet(ownerId, dayStart),
    },
    select: SELECT,
    /*
      Ordered, because the slice is what the day's word is chosen from. An
      unordered `take` is Postgres's choice of which candidates it even
      considers, and this has to give the same answer twice in one day: the
      almanac promises a word chosen by the date, not by the plan.
    */
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
    take: CANDIDATE_LIMIT,
  });

  const fresh = await withoutReviewed(ownerId, rows);
  if (fresh.length === 0) return null;

  // The layers in the almanac's own order: a named day beats a number, a
  // number beats a month. Within one occasion its own glosses are in order too.
  for (const occasion of occasions) {
    for (const gloss of occasion.glosses) {
      const matches = fresh.filter((row) => matchesGloss(row.translation, gloss));
      const chosen = choose(matches, gloss, day, level);
      if (chosen) return build(chosen, occasion);
    }
  }
  return null;
}

/**
 * Anything at all, when the dictionary could not meet a single request.
 *
 * It never happens on the dictionary this app ships, which carries a word for
 * every gloss the almanac can ask for. It happens on a thin one: a deployment
 * seeded before the harvest, or a learner far enough in to have met every word
 * their level has. So this exists, and it does not pretend to have a reason.
 */
async function pickAny(ownerId: string, day: DayKey, dayStart: Date, level: Level): Promise<WordOfDay | null> {
  const base = { ...unmet(ownerId, dayStart), translation: { not: "" } };
  /*
    Around the learner's level, then anything at all.

    The band is a `cefr` the course or the graded seed wrote down, so it is
    also the filter ADR-024 puts on the dictionary's suggestion row: an entry
    with no band is the tail of the Wiktionary expansion, and `aberratsioon`
    is no better a word of the day than it was a suggestion. That is the one
    place this reads a missing tag differently from `isAround`, which is right
    to keep an untagged word in a learner's own deck and has nothing to say
    about picking one out of the shared dictionary.

    The second pass is the whole dictionary and is what stops the panel going
    blank: a learner far enough in has met every graded word their level has,
    and a card that says nothing is worse than one that says a hard word.
  */
  for (const where of [{ ...base, cefr: { in: [...bandsAround(level)] } }, base]) {
    const total = await prisma.lexeme.count({ where });
    if (total === 0) continue;

    /*
      Stable through the day and spread across the dictionary, from the one
      thing that changes at midnight. `dayIndex` rather than a string hash
      written here: the obvious one moves by a row a day, so this fallback
      walked the dictionary alphabetically for whoever met it, and a hash that
      does not walk still repeats at the birthday rate. A stride over the pool
      does neither. See lib/random/dayHash.ts, where both are measured.

      The tie-break in `choose` below is still a plain hash, and rightly: it
      is separating a handful of equally good candidates for one gloss rather
      than indexing a pool, so there is no pool to walk.
    */
    const skip = dayIndex(day, "wordOfDay", total);
    const rows = await prisma.lexeme.findMany({
      // `lemma` is not unique (`@@unique` is on `(lemma, pos)`), so the id ends
      // it: a skip landing on `hall` must take the same one of its two rows on
      // every request of the same day.
      where, select: SELECT, orderBy: [{ lemma: "asc" }, { id: "asc" }], skip, take: WINDOW,
    });

    /*
      A window rather than one row, because the one row can be thrown out. A
      word whose card was deleted has no card and has certainly been met, so
      `withoutReviewed` rejects it, and with a window of one that used to end
      the whole pick: the panel went blank, or, once this had a second pass
      under it, fell out of the learner's band over a single stale word.
    */
    const chosen = (await withoutReviewed(ownerId, rows))[0];
    if (chosen) return build(chosen, null);
  }
  return null;
}

/** Enough rows past the skip that one already-met word does not end the pick. */
const WINDOW = 8;

/**
 * Never met, as a relation filter.
 *
 * `createdAt: { lt: dayStart }` rather than any card at all, and that is what
 * makes the card's own button work: adding the word to the deck would
 * otherwise make it stop being the word of the day, and the panel would swap
 * under the learner's hand the moment they did what it asked.
 */
function unmet(ownerId: string, dayStart: Date) {
  return {
    cards: { none: { ownerId, createdAt: { lt: dayStart } } },
    stars: { none: { ownerId } },
  };
}

/**
 * The review log has the last word on "met".
 *
 * `Review` has no relation to `Lexeme` to filter through, on purpose: it is
 * append-only and deliberately survives its card, so a word whose card was
 * deleted a month ago has no card and has certainly been met. One query
 * against the candidates rather than a join.
 */
async function withoutReviewed(ownerId: string, rows: Candidate[]): Promise<Candidate[]> {
  if (rows.length === 0) return rows;
  const seen = await prisma.review.findMany({
    where: { ownerId, lexemeId: { in: rows.map((r) => r.id) } },
    select: { lexemeId: true },
    distinct: ["lexemeId"],
  });
  const met = new Set(seen.map((r) => r.lexemeId));
  return rows.filter((row) => !met.has(row.id));
}

/**
 * Which of several words carrying the same sense.
 *
 * Ranked rather than picked at random, because the candidates for one gloss
 * are rarely equal: "fire" is the first sense of one word and the third of
 * another, and the first is the word for fire.
 *
 * Then the learner's own band, among words that carry the meaning equally
 * well: a word for snow is a word for snow, and where two of them are, the one
 * at their level is the one worth printing. It sits *under* the sense and not
 * over it, for the reason in this file's header. Then a sentence, because a
 * word of the day with an example is a lesson and one without is a vocabulary
 * item. Then a level at all, because an entry the course placed is one
 * somebody looked at.
 *
 * The day breaks a tie among equals, so a gloss that comes round every month
 * does not hand over the same word twelve times a year.
 */
function choose(matches: Candidate[], gloss: string, day: DayKey, level: Level): Candidate | undefined {
  if (matches.length === 0) return undefined;

  const scored = matches
    .map((row) => ({
      row,
      rank: [
        senseIndex(row.translation, gloss),
        isAround(row.cefr, level) ? 0 : 1,
        firstExample(row) ? 0 : 1,
        row.cefr ? 0 : 1,
        row.lemma.length,
      ] as const,
    }))
    .sort((a, b) => compare(a.rank, b.rank) || a.row.lemma.localeCompare(b.row.lemma));

  const best = scored[0];
  if (!best) return undefined;
  const tied = scored.filter((s) => compare(s.rank, best.rank) === 0);
  return tied[dayHashFor(day, "wordOfDay") % tied.length]?.row;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The shortest sentence worth reading, and never one a model wrote.
 *
 * `usableExamples` already sorts shortest first, which is what a card with one
 * line of room wants. The `AI` filter is this panel's own: an entry can carry a
 * sentence a model produced, and that is fine on a dictionary page where it is
 * chipped and captioned as such, and it is not fine on the home page under a
 * heading saying today's word was chosen for you. Every sentence that reaches
 * this card was recorded by a person.
 */
function firstExample(row: Candidate): Example | null {
  const attested = usableExamples(parseExamples(row.examples)).filter((e) => e.source !== "AI");
  /*
    Shortest first is right until the shortest is one word. Ekilex records a
    usage against a sense, and for `kool` that included `Kokakool.`, which the
    card printed under "in a sentence" on the first of September. Three words
    and the shape `naturalSentence` asks of an exam sentence, or nothing: a
    card with no sentence says so, and a card with a compound noun and a full
    stop says the app cannot tell the difference.
  */
  return attested.find((e) => wordCount(e.et) >= MIN_SENTENCE_WORDS && naturalSentence(e.et)) ?? null;
}

const MIN_SENTENCE_WORDS = 3;
const wordCount = (text: string) => text.trim().split(/\s+/).length;

function build(row: Candidate, occasion: Occasion | null): WordOfDay {
  return {
    lexemeId: row.id,
    lemma: row.lemma,
    pos: row.pos,
    translation: row.translation,
    cefr: row.cefr,
    gradationNote: row.gradationNote,
    example: firstExample(row),
    occasion,
  };
}
