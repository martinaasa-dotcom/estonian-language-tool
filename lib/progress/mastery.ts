import { prisma } from "@/lib/db";
import { masteryOf, type Mastery, type Verdict, type WordReview } from "@/lib/srs/mastery";

/**
 * WHICH WORDS A LEARNER HAS MASTERED, AND WHICH KEEP GOING WRONG.
 *
 * The reads behind `lib/srs/mastery.ts`, which holds the rule and none of the
 * SQL. Two screens want this and they must not disagree about it: the Flash
 * cards round draws the words that are *not* mastered yet, and the word lists
 * show all four tiers. One query behind both, for the reason
 * `lib/progress/cases.ts` gives at length about the weakest case panel: a
 * shared calculation over an unshared input is not a shared answer.
 *
 * WHY THE WHOLE LOG AND NOT A WINDOW. `caseReviewsFor` reads half a year,
 * because "what should I drill now" is a question about the present and holding
 * a mistake somebody has since fixed against them for ever is the opposite of
 * what a drill button is for. Mastery is the other question. "I have mastered
 * this word" is a claim about everything that ever happened to it, and a word
 * answered right eight times a year ago and never since has not stopped being
 * known because the window moved. The cap is a bound on the work, ordered so
 * that past it the rows kept are the recent ones rather than whichever the plan
 * returned.
 */

/**
 * Rows read at once. Past this a deck is larger than anybody has built: at four
 * cards a word and a few answers each, twenty thousand is several hundred words
 * worked properly. `(ownerId, reviewedAt)` is indexed, so the order is free.
 */
const CAP = 20_000;

/** How many words a list shows before it stops being a list and becomes a wall. */
export const LIST_LIMIT = 60;

export interface MasteredWord {
  lexemeId: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  verdict: Verdict;
}

/**
 * Every word in the learner's deck that has been answered at least once, with
 * where it stands.
 *
 * A word with no answers behind it is left out rather than reported as
 * "learning": it is in the deck and has not been met, which is a fact about the
 * new queue and not about mastery, and putting it in a list headed "still
 * learning" would tell somebody they are part way through a word they have
 * never seen.
 */
export async function masteryFor(ownerId: string): Promise<MasteredWord[]> {
  const reviews = await prisma.review.findMany({
    where: { ownerId, lexemeId: { not: null } },
    select: { lexemeId: true, rating: true, targetCase: true, reviewedAt: true },
    orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
    take: CAP,
  });
  if (reviews.length === 0) return [];

  const byWord = new Map<string, WordReview[]>();
  for (const row of reviews) {
    const held = byWord.get(row.lexemeId!) ?? [];
    held.push({ rating: row.rating, targetCase: row.targetCase, reviewedAt: row.reviewedAt });
    byWord.set(row.lexemeId!, held);
  }

  /*
    The words themselves, in one read rather than one per word.

    `Review` deliberately has no relation to `Card` or to `Lexeme` (it carries
    its own `lexemeId` as a plain column), so this cannot be an include and has
    to be a second query. A word whose entry has since been deleted simply does
    not come back, and its reviews are dropped here rather than rendered as a
    row with no name on it.
  */
  const lexemes = await prisma.lexeme.findMany({
    where: { id: { in: [...byWord.keys()] } },
    select: { id: true, lemma: true, translation: true, pos: true, cefr: true },
    orderBy: { id: "asc" },
  });

  /*
    KEYED ON `(lemma, pos)`, WHICH IS THE SCHEMA'S OWN UNIQUE KEY.

    A learner who confirmed `tuba` off a photograph beside the seeded one has
    two entries, two sets of cards and two sets of reviews, and a list headed
    "mastered" would print the word twice with two different verdicts. Merging
    on the lemma alone would be wrong the other way: `hall` is a noun meaning
    frost and an adjective meaning grey, and they are two words that happen to
    be spelled alike.

    `@@unique` on `Lexeme` is `(lemma, pos)`, so that is the line between "two
    rows for one word" and "two words". Two entries sharing it are duplicates
    and their answers are one word's history; the reviews are merged rather than
    one entry picked, because a learner who practised both practised the word.
  */
  const merged = new Map<string, MasteredWord & { reviews: WordReview[] }>();
  for (const l of lexemes) {
    const key = `${l.lemma.toLowerCase()}|${l.pos}`;
    const reviewsFor = byWord.get(l.id) ?? [];
    const held = merged.get(key);
    if (held) {
      held.reviews.push(...reviewsFor);
      continue;
    }
    merged.set(key, {
      lexemeId: l.id,
      lemma: l.lemma,
      translation: l.translation,
      pos: l.pos,
      cefr: l.cefr,
      // Filled below, once every entry sharing this key has contributed.
      verdict: masteryOf([]),
      reviews: [...reviewsFor],
    });
  }

  return [...merged.values()].map(({ reviews: own, ...word }) => ({
    ...word,
    verdict: masteryOf(own),
  }));
}

/** The words at one tier, most worked first, capped at something readable. */
export function wordsAt(words: readonly MasteredWord[], tier: Mastery): MasteredWord[] {
  return words
    .filter((w) => w.verdict.mastery === tier)
    .sort((a, b) => b.verdict.total - a.verdict.total || a.lemma.localeCompare(b.lemma, "et"))
    .slice(0, LIST_LIMIT);
}

/** How many words sit at each tier. Counted over all of them, not the capped list. */
export function masteryCounts(words: readonly MasteredWord[]): Record<Mastery, number> {
  const counts: Record<Mastery, number> = { mastered: 0, almost: 0, struggling: 0, learning: 0 };
  for (const word of words) counts[word.verdict.mastery] += 1;
  return counts;
}
