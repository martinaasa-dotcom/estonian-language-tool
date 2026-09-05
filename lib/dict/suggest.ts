/**
 * The dozen words the dictionary offers somebody who has not searched yet.
 *
 * THIS ROW USED TO BE `ORDER BY lemma ASC, SKIP (days % 40), TAKE 12`, which
 * is a twelve-row window inside the first forty rows of an alphabetical list.
 * The skip made it look as though it moved and it never left the letter A: for
 * the whole life of the app every learner on every day was invited to look up
 * `aasialane`, `aastatuhat`, `aatomipomm` and `aberratsioon`. Three of those
 * carry no CEFR level at all, because they arrived in the tail of the
 * Wiktionary expansion rather than out of the course, and nobody learning
 * Estonian has ever needed the word for an aberration.
 *
 * A suggestion row is the answer to "what is this dictionary for", asked by
 * somebody who has just arrived and typed nothing. So it answers with words
 * that are worth the click, and it says why it chose them.
 *
 * THREE SOURCES, ONE PER RENDER, IN A ROTATING ORDER.
 *
 *   news    Words on the front page of the news this morning, vouched for by
 *           the dictionary. The most alive of the three and the one that makes
 *           the row worth looking at twice.
 *   season  The time of year, out of the course's own units. Works with no
 *           network at all, which is what makes it the one behind news.
 *   level   Words near the level this learner placed at, drawn at random.
 *           Always available, so the row is never empty and never short.
 *
 * A source has to fill most of the row on its own or it is passed over. That
 * is the reason there is no top-up: a row labeled "In the news today" whose
 * last four words came from a random draw would be a caption that is true of
 * two thirds of what is under it, and the honest alternative costs nothing but
 * a slightly shorter row.
 *
 * TWO FILTERS APPLY TO EVERY SOURCE, and between them they are why
 * `aberratsioon` cannot come back.
 *
 * A word must carry a CEFR level. That is not a guess about difficulty, it is
 * a record that somebody put the word in the course or in the graded seed. The
 * 2,090 entries with no level are the ones no source vouched for, and they are
 * exactly the ones that made the old row embarrassing.
 *
 * A word must be a noun, a verb or an adjective. Those are the entries with a
 * table of forms behind them, and that table is what the chip opens. A
 * conjunction has principal parts nobody can name and a case table nobody can
 * build, so a chip leading to one is a chip leading to a dead end.
 *
 * AND THAT SECOND FILTER IS ABOUT THE ENTRY A LEARNER LANDS ON, not about the
 * rows. A chip links to `/dictionary?q=<lemma>` and the dictionary answers a
 * lemma with one entry; `@@unique` is on `(lemma, pos)`, so a lemma can hold
 * more than one. Filtering the rows asks whether *some* entry has a table,
 * which is a different question and the one this used to ask: `oma` is an
 * adjective in the Wiktionary expansion and the pronoun the course teaches, the
 * row offered it on the strength of the adjective, and the dictionary leads
 * with the pronoun, which has no case table. `withATable` is the gate and it is
 * applied once, to whatever a source returned.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { courseLevelFor } from "@/lib/progress/level";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { themeFor, themeLemmas } from "@/lib/collections/topical";
import { newsWords } from "@/lib/news/feed";
import { bandsAround } from "@/lib/collections/levels";
import { opensATable } from "./pos";
import { candidatesFor } from "./resolveScan";
import { matchEstonianForm } from "./search";
import { shuffle } from "@/lib/random/shuffle";

export type SuggestionSource = "news" | "season" | "level";

export interface Suggestions {
  /** The line above the row, saying why these words and not twelve others. */
  label: string;
  source: SuggestionSource;
  words: string[];
}

/** Chips a row holds. Twelve is what the old row drew and it fits at 360px. */
const ROW = 12;

/** The fewest a source may fill before the next one is tried instead. */
const MIN_ROW = 6;

/**
 * The parts of speech with a case or verb table to open.
 *
 * `lib/dict/pos.ts` is where that is decided, because the same question is
 * asked one file over by `lemmasWithNoTable`, and a row filtering on one list
 * while the gate below reads another is two answers to one question.
 */
const POS = ["NOUN", "VERB", "ADJECTIVE"].filter(opensATable);

/**
 * How many headline words are worth asking the dictionary about.
 *
 * The front page yields a few hundred and the row holds twelve, so this is a
 * cap on one database query rather than a limit on the idea. The words are in
 * the order the headlines were in, so what it cuts is the bottom of the page.
 */
const NEWS_CEILING = 90;

/**
 * Which source leads, this render.
 *
 * Weighted rather than fixed, because a fixed order means the two behind the
 * leader are only ever seen when the leader fails, and a seasonal row nobody
 * sees in a year with a working news feed is a feature that quietly rots. The
 * roll happens per render, so the row changes when somebody comes back to it,
 * which is the whole of what "dynamic" means here.
 */
function order(roll: number): SuggestionSource[] {
  if (roll < 0.5) return ["news", "season", "level"];
  if (roll < 0.8) return ["season", "news", "level"];
  return ["level", "season", "news"];
}

export async function suggestWords(
  ownerId: string,
  now: Date = new Date(),
  random: () => number = Math.random,
): Promise<Suggestions> {
  const [level, clock] = await Promise.all([
    courseLevelFor(ownerId),
    learnerDayClock(ownerId),
  ]);
  const band = bandsAround(level);
  const today = clock.dayKey(now);

  for (const source of order(random())) {
    const found =
      source === "news" ? await fromNews(band, random)
      : source === "season" ? await fromSeason(band, today, random)
      : await fromLevel(band);
    const words = await withATable(found);

    if (words.length >= MIN_ROW) {
      return { source, label: labelFor(source, today), words: words.slice(0, ROW) };
    }
  }

  /*
    Nothing had enough to say, which on a dictionary this size means a
    deployment that has barely been seeded. The row draws nothing rather than
    three chips, and the page is the same page without it.
  */
  return { source: "level", label: labelFor("level", today), words: [] };
}

function labelFor(source: SuggestionSource, dayKey: string): string {
  if (source === "news") return "In the news today";
  if (source === "level") return "Around your level";
  return themeFor(...monthDay(dayKey)).reason;
}

/** Month and day out of a `YYYY-MM-DD` key, which is already in the learner's zone. */
function monthDay(dayKey: string): [number, number] {
  const parts = dayKey.split("-");
  return [Number(parts[1]), Number(parts[2])];
}

interface VouchedWord {
  lemma: string;
  cefr: string;
}

/**
 * The vouching, done once for the whole deployment rather than once a render.
 *
 * Resolving ninety headline words costs a query returning a few hundred rows
 * with their forms, and then the matcher over all of it: measured here at
 * about 120ms. The answer is the same for every learner and stays the same
 * until the feed moves, so paying it per render would be paying it for
 * nothing. Keyed on the words themselves, so a new front page is a new key
 * and there is no second expiry to keep in step with the feed's own.
 *
 * A word added to the dictionary inside the hour is not picked up until the
 * feed next changes, which is the one thing this trades away and is worth
 * nothing to anybody: it is a decoration on an empty state.
 */
let vouched: { key: string; words: VouchedWord[] } | null = null;

/**
 * Words off today's headlines that the dictionary is willing to vouch for.
 *
 * The same gate a photographed page goes through, deliberately: an outside
 * source proposes and `matchEstonianForm` decides, accepting only an exact
 * lemma, a stored form, or a regular case built on a genitive stem (ADR-021).
 * A headline is full of inflected forms, so this is doing real work rather
 * than a string comparison in disguise: `ettepaneku` resolves to `ettepanek`
 * and that headword is what the chip offers, with its whole paradigm behind
 * it.
 *
 * What comes back is the *lemma*, never the word as the headline spelled it.
 * Nothing a news feed wrote reaches the dictionary, the deck, or the screen.
 */
async function vouchNews(): Promise<VouchedWord[]> {
  const words = (await newsWords()).slice(0, NEWS_CEILING);
  if (words.length === 0) return [];

  const key = words.join(" ");
  if (vouched?.key === key) return vouched.words;

  const candidates = await candidatesFor(words);
  const out: VouchedWord[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const match = matchEstonianForm(candidates, word);
    if (!match) continue;
    if (!match.cefr || !POS.includes(match.pos)) continue;
    if (seen.has(match.lemma)) continue;
    seen.add(match.lemma);
    out.push({ lemma: match.lemma, cefr: match.cefr });
  }

  vouched = { key, words: out };
  return out;
}

/**
 * ONE GATE RATHER THAN THREE, and it asks the question the chip's promise is
 * about.
 *
 * Each source filters the *rows* by part of speech, which answers "does the
 * table hold an entry with this lemma that has a table". A chip links to
 * `/dictionary?q=<lemma>` and the dictionary answers a lemma with the one entry
 * `bySubstance` leads with, so wherever a lemma holds more than one those are
 * different questions. `oma` is the shipped instance: the Wiktionary expansion
 * heads it `Adjective`, the course teaches it in the pronoun unit where Ekilex
 * calls it an asesõna, the row offered it on the strength of the adjective, and
 * the dictionary leads with the pronoun, which has no case table to open.
 *
 * A lemma is kept only when *every* entry under it has a table. That is
 * stricter than asking `bySubstance` and needs neither its forms counts nor its
 * provenance: whichever entry the dictionary leads with, the chip is good. What
 * it costs is measured and is two words in the whole shipped dictionary, `oma`
 * and `või`, butter and the conjunction both, which the row would have led to
 * the noun for. Two out of six thousand, against a chip that dead-ends.
 *
 * A query rather than a read of `lib/dict/facts.ts`, which is where a fact
 * about the shared dictionary usually belongs. The lemmas asked about change
 * every render, since the front page moves and the level draw is random, so
 * there is no stable key to hold; and a word added in the last minute would be
 * offered ungated by a cache a minute old, which is the one promise this row
 * makes. It is an indexed read of a couple of hundred lemmas on a page that is
 * otherwise three queries.
 *
 * The level is deliberately not part of this. A CEFR band is a record that
 * somebody vouched for *that entry*, which the offered entry answers for
 * itself, and no lemma in the shipped dictionary holds two entries that
 * disagree about it.
 *
 * Exported so the rule can be asked directly. Driving it through `suggestWords`
 * cannot be made to fail on purpose: the level source draws twelve at random
 * out of a couple of thousand words in band, so whether a planted pair is
 * offered at all is a coin toss, and a check that passes because nothing was
 * drawn is a check nobody knows the state of. The end-to-end guard is the test
 * beside it, which asks what the dictionary shows for every word the row
 * offered, and which is what caught `oma`.
 */
export async function withATable(lemmas: string[]): Promise<string[]> {
  if (lemmas.length === 0) return lemmas;
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: { lemma: true, pos: true },
  });
  const dead = new Set(rows.filter((row) => !opensATable(row.pos)).map((row) => row.lemma));
  return lemmas.filter((lemma) => !dead.has(lemma));
}

/** Those of them worth putting in front of a learner at this level. */
async function fromNews(band: readonly string[], random: () => number): Promise<string[]> {
  const words = (await vouchNews()).filter((word) => band.includes(word.cefr));
  return shuffle(words.map((word) => word.lemma), random);
}

/** Forgets what the dictionary made of the last front page. For tests. */
export function resetSuggestionCache(): void {
  vouched = null;
}

/**
 * Words for the time of year, out of the units of the course.
 *
 * The band is tried first and dropped if it leaves too little, which is the
 * one place a filter is relaxed rather than a source abandoned: a theme built
 * on the two history units has nothing at A1 in it, and a beginner in the week
 * of the independence day is better served by a themed row above their level
 * than by a random one at it. They are being invited to read a word, not
 * graded on it.
 */
async function fromSeason(
  band: readonly string[],
  dayKey: string,
  random: () => number,
): Promise<string[]> {
  const lemmas = themeLemmas(themeFor(...monthDay(dayKey)));
  if (lemmas.length === 0) return [];

  const banded = await presentLemmas(lemmas, band);
  const found = banded.length >= MIN_ROW ? banded : await presentLemmas(lemmas, null);
  return shuffle(found, random);
}

/** Which of these lemmas the dictionary actually holds, as words worth opening. */
async function presentLemmas(lemmas: string[], band: readonly string[] | null): Promise<string[]> {
  const rows = await prisma.lexeme.findMany({
    where: {
      lemma: { in: lemmas },
      pos: { in: POS },
      ...(band ? { cefr: { in: [...band] } } : { cefr: { not: null } }),
    },
    select: { lemma: true },
    // Ordered because it is cut. The row is shuffled afterwards, so this is not
    // about which words lead; it is that the 200 shuffled from are the same 200
    // rather than whichever the plan returned.
    orderBy: { id: "asc" },
    take: 200,
  });
  return [...new Set(rows.map((row) => row.lemma))];
}

/**
 * A random draw from the whole graded dictionary, near the learner's level.
 *
 * `ORDER BY random()` reads every row the filters leave, which is a few
 * thousand and measured in single milliseconds. The alternative, a random
 * offset into an ordered page, is what the row this replaces was doing.
 */
async function fromLevel(band: readonly string[]): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ lemma: string }[]>`
    SELECT lemma FROM "Lexeme"
     WHERE cefr IN (${Prisma.join([...band])})
       AND pos IN (${Prisma.join(POS)})
     ORDER BY random()
     LIMIT ${ROW}
  `;
  return rows.map((row) => row.lemma);
}
