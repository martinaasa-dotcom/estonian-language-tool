import { singleFlight } from "@/lib/cache/singleFlight";
import { prisma } from "@/lib/db";

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

/** How many entries a wrong answer may be drawn from. */
const DECOY_POOL = 2_000;

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
 * The pool a multiple-choice question draws its wrong answers from.
 *
 * Real translations of other words rather than invented text: nothing in this
 * app writes Estonian, and a decoy that is obviously nonsense makes the
 * question free. Easiest first, so a wrong answer is one the learner has a
 * chance of having met.
 *
 * Two thousand rows out of about six thousand, read on every load of the
 * review screen and of the listening round, and the same two thousand every
 * time for everybody: which words the dictionary holds is not a fact about the
 * person being asked. Cached with the rest of it.
 */
export function decoyGlosses(): Promise<string[]> {
  return remember("decoy-glosses", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({
      select: { translation: true },
      // Ordered to the end, because this is a `take`: `cefr` and `lemma`
      // together are not unique, and past the cap which words can ever be a
      // decoy would otherwise be the query plan's answer rather than this one.
      orderBy: [{ cefr: "asc" }, { lemma: "asc" }, { id: "asc" }],
      take: DECOY_POOL,
    });
    return [...new Set(rows.map((row) => row.translation))];
  });
}

/**
 * The same pool, grouped by part of speech, for a question that wants its
 * wrong answers to be the same kind of word as its right one.
 *
 * The listening round read the whole dictionary for this on every round and
 * then built the grouping with an `includes` inside the loop, which is a scan
 * of a growing array per row: about six thousand rows and, at the end of it,
 * an answer identical to the one the previous round worked out. Both halves
 * are cached, the query and the grouping.
 *
 * The arrays are shared, so a caller reads and never writes: every use of them
 * filters, which makes a new one.
 */
export function glossesByPos(): Promise<{ byPos: Map<string, string[]>; all: string[] }> {
  return remember("glosses-by-pos", FACTS_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({ select: { translation: true, pos: true } });
    const byPos = new Map<string, Set<string>>();
    const all = new Set<string>();
    for (const row of rows) {
      all.add(row.translation);
      const held = byPos.get(row.pos) ?? new Set<string>();
      held.add(row.translation);
      byPos.set(row.pos, held);
    }
    return {
      byPos: new Map([...byPos].map(([pos, set]) => [pos, [...set]])),
      all: [...all],
    };
  });
}
