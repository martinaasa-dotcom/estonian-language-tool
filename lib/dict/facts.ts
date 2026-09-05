import { singleFlight } from "@/lib/cache/singleFlight";
import { prisma } from "@/lib/db";
import { unitIntroducing } from "@/lib/collections/syllabus";
import { bandOf, glossOption, type GlossOption } from "@/lib/questions/distractors";
import { MAX_LETTERS, MIN_LETTERS } from "@/lib/games/crossword";
import {
  alsoAcceptedByLemma as sharedAlsoAccepted, sharedPrompts,
} from "@/lib/collections/senses";
import { heardIndex, type HeardIndex } from "@/lib/assessment/heard";
import { borrowSentences } from "@/lib/dict/borrow";
import { parseExamples, type Example } from "@/lib/dict/examples";

/**
 * FACTS ABOUT THE SHARED DICTIONARY, READ ONCE RATHER THAN ONCE PER LEARNER.
 *
 * `Lexeme` and `Form` are reference data every learner sees (ADR-012), so a
 * query with no `ownerId` in it is asking a question whose answer is the same
 * for everybody and the same on the next request. Three of them were on the
 * render path of Today, which is the page somebody opens every morning:
 *
 *   - which of the course's 1,473 lemmas the dictionary actually holds
 *     (`pathWithProgress`, and it ran three times in one render);
 *   - how many entries there are per CEFR band;
 *   - every lemma in the dictionary with its band, which at the shipped size
 *     is 5,959 rows, fetched in full, to count how many of them the learner
 *     already knows.
 *
 * None of that is a fact about the person waiting for the page. Measured
 * against a socket on the same machine the last one alone was 49ms; against a
 * hosted Postgres it is that plus a round trip plus the rows on the wire, and
 * it was being paid by every learner on every load of the busiest screen here.
 *
 * WHY A TTL AND NOT AN INVALIDATION.
 *
 * The dictionary has half a dozen write paths: a hand edit, an accepted
 * suggestion, a word confirmed off a photograph, a pasted list, a live Ekilex
 * lookup writing what it found. A cache cleared from each of them is a cache
 * that goes stale the first time somebody adds a seventh and does not know to,
 * and that failure is silent and permanent. A minute is self-healing, needs no
 * call sites to stay in step, and is measured against what it costs: a word
 * added by hand is counted towards a readiness percentage, and towards which
 * of a unit's words the dictionary can show, up to sixty seconds later than it
 * used to be. Nothing a reader could notice, and nothing that decides anything.
 *
 * Per warm instance, like `lib/cache/singleFlight.ts` and the rate limiter, and
 * for the reason that module gives about itself: it costs no infrastructure and
 * it removes the load that actually happens. `singleFlight` is what stops a
 * class of twenty-five arriving together from making twenty-five copies of the
 * same query while the first one is still in the air.
 *
 * WHAT THIS MAY HOLD. Only things that are true of the dictionary rather than
 * of a learner. Nothing keyed on an `ownerId` may be cached here: it would be
 * one person's deck served to the next person through the same door.
 */

/** How long a fact about the dictionary is reused before it is asked again. */
export const FACTS_TTL_MS = 60_000;

interface Held<T> {
  value: T;
  /** When this stops being reused. */
  until: number;
}

const held = new Map<string, Held<unknown>>();

/** One dictionary entry, as much of it as anything cached here needs. */
export interface Entry {
  lemma: string;
  cefr: string | null;
}

async function remember<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = held.get(key);
  if (entry && now < entry.until) return entry.value as T;

  /*
    The gap between the miss above and the write below is exactly as wide as
    the query, and it is where a burst lands. `singleFlight` records the
    promise before awaiting it, so everybody who arrives inside that window
    waits on the one query rather than starting another. A throw is not
    remembered: the entry is only written on the way out of a call that
    resolved, so one bad moment at the database is retried by the next reader
    rather than cached for a minute.
  */
  return singleFlight(`dict-facts:${key}`, async () => {
    const value = await work();
    held.set(key, { value, until: Date.now() + ttlMs });
    return value;
  });
}

/**
 * Every lemma the dictionary holds, with the band it is graded at, and the
 * same lemmas as a set for membership tests.
 *
 * One entry rather than two, because they are one read: a set derived from a
 * separately cached list is two things that can expire apart, and then the
 * membership test answers about a dictionary the counts beside it disagree
 * with.
 *
 * Rows *and* a set, because `@@unique` is on `(lemma, pos)` and `hall` is two
 * entries. What a duplicate means is the caller's to decide, which is the rule
 * `oneEntryPerLemma` follows one file over: a count read off the rows counts
 * both, a membership test does not care.
 */
function dictionary(): Promise<{
  rows: { lemma: string; cefr: string | null }[];
  lemmas: Set<string>;
  byId: Map<string, Entry>;
}> {
  return remember("dictionary", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({ select: { id: true, lemma: true, cefr: true } });
    return {
      rows: rows.map(({ lemma, cefr }) => ({ lemma, cefr })),
      lemmas: new Set(rows.map((row) => row.lemma)),
      byId: new Map(rows.map((row) => [row.id, { lemma: row.lemma, cefr: row.cefr }])),
    };
  });
}

/**
 * THE LEMMA BEHIND A CARD, WITHOUT A SECOND QUERY TO FETCH IT.
 *
 * `select: { lexeme: { select: { lemma: true } } }` reads as one query and is
 * two: Prisma fetches the cards, collects their `lexemeId`s and sends a second
 * statement carrying every one of them. On a deck of two thousand that is a
 * round trip and two thousand uuids on the wire, and `deckSnapshot` alone does
 * it on Today, Progress, the course page, Practice and the scan screen.
 *
 * The join it replaces is a lookup in the dictionary this module already
 * holds. **Anything the cache does not know is asked for**, which is the half
 * that makes this safe rather than merely fast: a word added to the deck in
 * the last minute is not in a cache that is up to a minute old, and resolving
 * it to nothing would mean adding a word and then watching its unit still say
 * you have none of it. So a miss is a query for exactly the misses, which on
 * every ordinary request is no query at all.
 */
export async function lemmasByCardLexeme(
  ids: Iterable<string | null>,
): Promise<Map<string, Entry>> {
  const { byId } = await dictionary();
  const out = new Map<string, Entry>();
  const missing: string[] = [];
  for (const id of ids) {
    if (id === null || out.has(id)) continue;
    const entry = byId.get(id);
    if (entry) out.set(id, entry);
    else missing.push(id);
  }
  if (missing.length > 0) {
    const fresh = await prisma.lexeme.findMany({
      where: { id: { in: missing } },
      select: { id: true, lemma: true, cefr: true },
    });
    for (const row of fresh) out.set(row.id, { lemma: row.lemma, cefr: row.cefr });
  }
  return out;
}

/** Every entry, as a lemma and the band it is graded at. */
export async function gradedLemmas(): Promise<{ lemma: string; cefr: string | null }[]> {
  return (await dictionary()).rows;
}

/**
 * Every lemma the dictionary can answer for.
 *
 * The syllabus names words and Ekilex decides whether they exist, so every
 * course screen has to ask which of a unit's words the dictionary actually
 * holds before it can render one. That was an `IN` of the whole course per
 * caller, three times in one render of Today; it is a membership test against
 * this instead.
 */
export async function dictionaryLemmas(): Promise<Set<string>> {
  return (await dictionary()).lemmas;
}

/**
 * How many entries the dictionary holds.
 *
 * Read off the rows above rather than as a `count(*)`, which on the badge
 * check meant a whole-table aggregate on every load of Today to decide
 * whether a "the dictionary has a thousand words" badge had been earned.
 */
export async function dictionarySize(): Promise<number> {
  return (await gradedLemmas()).length;
}

/**
 * How many entries the dictionary has at each band.
 *
 * Tallied from the rows above rather than asked for as a `groupBy`, which is
 * one fewer round trip and, more to the point, one fewer way for two figures
 * on one screen to disagree: the count of A2 words and the list of them are
 * now the same read.
 */
export async function lemmaCountsByLevel(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const row of await gradedLemmas()) {
    if (!row.cefr) continue;
    counts.set(row.cefr, (counts.get(row.cefr) ?? 0) + 1);
  }
  return counts;
}

/**
 * The pool a multiple-choice question draws its wrong answers from, built once
 * and ranked by the module that decides what a wrong answer is worth.
 *
 * This used to be two functions and neither of them was this. `decoyGlosses`
 * returned two thousand bare strings and the review screen took three at
 * random out of them; `glossesByPos` returned the same strings grouped by part
 * of speech and the listening round preferred its own group. So the app had
 * two answers to one question, and the screen this app exists to get people to
 * had the worse of them: a learner asked what `jooma` means chose between
 * "to drink", "window", "October" and "friendship", where the three nouns
 * standing around one verb are one glance and the question measured nothing.
 *
 * `lib/questions/distractors.ts` has been the one table of what a wrong answer
 * is worth since the placement check and the mock exam were fixed for exactly
 * this, and it ranks on four signals rather than one: the course unit that
 * teaches the word, the part of speech, the CEFR band, and the shape of the
 * line. A bare string can carry none of them, which is why this returns a
 * `GlossOption` rather than a gloss. Everything the ranking needs about a line
 * is counted here, once a minute per instance, rather than inside a comparison
 * that runs a few hundred times a question.
 *
 * Read in full rather than truncated, and deliberately: a `take` here has to
 * be ordered, every order available is a property of the word rather than of
 * the question, and `cefr asc` (which is what the truncated version used) means
 * the wrong answers for every question in the app come from the easiest two
 * thousand entries. That is the fault the minimal pairs round had. Which words
 * the dictionary holds is not a fact about the person being asked, so the whole
 * of it is one cached read for everybody.
 */
export function decoyOptions(): Promise<GlossOption[]> {
  return remember("decoy-options", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({
      select: { translation: true, pos: true, cefr: true, lemma: true },
    });
    const seen = new Set<string>();
    const out: GlossOption[] = [];
    for (const row of rows) {
      const text = row.translation.trim();
      // One line per meaning. Two entries glossed the same way are one option,
      // and offering both would be two right answers wearing different ids.
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(glossOption({
        text,
        pos: row.pos,
        band: bandOf(row.cefr),
        theme: unitIntroducing(row.lemma, row.pos),
      }));
    }
    return out;
  });
}

/**
 * Every Estonian word of one length that the app will accept as a guess.
 * Every lemma that answers the same production prompt as another one.
 *
 * A production card is front `translation`, hint `pos`, back `lemma`, so two
 * entries sharing a gloss and a part of speech are one question with two right
 * answers, and each card marks the other's answer wrong. `lib/srs/cards.ts`
 * puts the whole set on the back; this is what finds it.
 *
 * A fact about the shared dictionary and therefore exactly what this file is
 * for: the answer is the same for every learner and the same on the next
 * request, and a deck build would otherwise ask it once per word. The result is
 * small even though the query is not, because only a prompt more than one entry
 * answers is kept: 372 groups out of 6,083 entries, nearly all of them pairs.
 *
 * Keyed `lemma|pos`, which is what `Lexeme` is unique on, because a lemma alone
 * would merge the noun `hall` meaning frost with the adjective meaning grey.
 */
export function alsoAcceptedByLemma(): Promise<Map<string, string[]>> {
  return remember("also-accepted", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({ select: { lemma: true, pos: true, translation: true } });
    return sharedAlsoAccepted(
      sharedPrompts(rows.map((r) => ({ lemma: r.lemma, pos: r.pos, gloss: r.translation }))),
    );
  });
}

/**
 * What every spelling in the dictionary means, for the listening question that
 * plays a whole sentence and asks about "a word you heard in it".
 *
 * A fact about the shared dictionary rather than about the person sitting
 * the check, so it is cached here like the others. The placement is handed a
 * window of two hundred words a band and the sentence it plays holds words
 * from anywhere in the language: `Isa ja ema ei olnud kodus` is filed under
 * `isa`, and whether "mother" may stand as a wrong answer to it is a question
 * about `ema`, which is in the pool only by luck. Measured at 201ms to build
 * over the shipped dictionary, once a minute at most. See `lib/assessment/heard.ts`.
 */
export function heardMeanings(): Promise<HeardIndex> {
  return remember("heard-meanings", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({
      select: {
        lemma: true, pos: true, translation: true,
        forms: { select: { formType: true, value: true, morphCode: true } },
      },
    });
    return heardIndex(rows);
  });
}

/**
 * The same pool, grouped by part of speech, for a question that wants its
 * wrong answers to be the same kind of word as its right one.
 *
 * A word game has two word lists and they are not the same list. The answers
 * are graded dictionary entries, because an answer has to be a word the app can
 * teach and link to afterwards; the *guesses* are the whole language, because
 * telling somebody that a perfectly ordinary Estonian word is not a word is the
 * one thing a game like this must never do. `KnownWord` is the 154,995
 * headwords the Ekilex enumeration brought back, which is what that table was
 * built for: it knows only which words exist, which is exactly enough.
 *
 * Read whole and handed to the browser, so a guess is checked without a round
 * trip. The alternative is a server call inside the one gesture the game is
 * made of, and it would take the board offline as well.
 *
 * MEASURED RATHER THAN ARGUED ABOUT, because the obvious objection is the
 * size: at six letters the list is 7,134 words, and the whole page comes to
 * 143 KB of text that the server compresses to **36 KB**, which is a small
 * photograph, once a day. Front-coding the shared prefixes was the first idea
 * and gzip is already doing it: 143 down to 36 is a factor of four on a sorted
 * list. Serving it from a separately cacheable route would save the repeat
 * visits and costs a loading state on the one screen that must never wait, so
 * it is written down here rather than done.
 *
 * Cached across requests like everything else in this file, since which words
 * exist is not a fact about the person playing.
 */
export function guessableWords(length: number): Promise<string[]> {
  return remember(`guessable:${length}`, FACTS_TTL_MS, async () => {
    const rows = await prisma.$queryRaw<{ lemma: string }[]>`
      SELECT lemma FROM "KnownWord"
      WHERE char_length(lemma) = ${length}
        AND lemma ~ ${"^[a-zäöüõšž]+$"}
      ORDER BY lemma
    `;
    return rows.map((r) => r.lemma);
  });
}

/**
 * The words a crossword could be built from, at one level.
 *
 * A fact about the shared dictionary and about a CEFR band, not about the
 * person waiting: two learners at B1 draw from the same 2,039 rows, and the
 * page fetched all of them on every render and again inside the action that
 * marks the grid. Cached here for the reason everything else is, and keyed on
 * the band rather than on an owner, which is what this module is allowed to
 * hold.
 *
 * The lengths are the compiler's own (`lib/games/crossword.ts`), so a rule
 * about what crosses well is not written down twice. The part of speech is
 * one with a case table behind it, so the entry the finish screen links to is
 * worth opening, and a gloss is required because the gloss is the clue.
 */
export function crosswordPool(bands: readonly string[]): Promise<CrosswordWord[]> {
  const key = [...bands].sort().join(",");
  return remember(`crossword-pool:${key}`, FACTS_TTL_MS, async () => {
    return prisma.$queryRaw<CrosswordWord[]>`
      SELECT DISTINCT ON (lemma) id, lemma, translation FROM "Lexeme"
      WHERE char_length(lemma) BETWEEN ${MIN_LETTERS} AND ${MAX_LETTERS}
        AND lemma ~ ${"^[a-zäöüõšž]+$"}
        AND cefr = ANY(${[...bands]})
        AND pos = ANY(${["NOUN", "VERB", "ADJECTIVE", "ADVERB"]})
        AND translation <> ''
      ORDER BY lemma, id
    `;
  });
}

/** One row of that pool: the answer, the clue's source, and the entry to link to. */
export interface CrosswordWord {
  id: string;
  lemma: string;
  translation: string;
}

/**
 * The sentences every entry may borrow from the rest of the dictionary, by
 * lexeme id. See `lib/dict/borrow.ts` for the rule.
 *
 * A fact about the shared dictionary and not about the person waiting, so it
 * is cached here like the others: it reads every entry's forms and usages once
 * a minute at most, and a deck build, a single add, the flash round and the
 * seed's repair all read the one answer. Measured over the shipped dictionary
 * at about a second to build, which is why it is not built per request.
 */
export function borrowedSentences(): Promise<Map<string, Example[]>> {
  return remember("borrowed-sentences", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({
      select: {
        id: true, lemma: true, pos: true, examples: true,
        forms: { select: { formType: true, value: true, morphCode: true } },
      },
    });
    return borrowSentences(rows.map((r) => ({
      key: r.id, lemma: r.lemma, pos: r.pos, forms: r.forms, examples: parseExamples(r.examples),
    })));
  });
}
