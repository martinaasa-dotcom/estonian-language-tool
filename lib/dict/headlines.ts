import { newsHeadlines } from "@/lib/news/feed";
import { tokenise, type HeadlineToken } from "@/lib/news/headlines";
import { candidatesFor } from "./resolveScan";
import { matchEstonianForm } from "./search";

/**
 * Today's front page, readable: a few headlines with a dictionary under
 * every word the dictionary will vouch for.
 *
 * READING REAL ESTONIAN IS THE THING THE COURSE IS FOR, AND THE APP HAD NONE
 * OF IT. Every sentence a learner met here was one a lexicographer recorded
 * to illustrate a word, which is the right sentence for a card and is not
 * what a newspaper, a sign or a colleague says. The news feed was already
 * being read once an hour for the dictionary's suggestion row and then
 * thrown away down to its words. The headlines themselves are the most
 * ordinary Estonian this app can put in front of somebody, and they change
 * every morning.
 *
 * The same gate as the suggestion row and the photographed page (ADR-021):
 * the feed proposes, `matchEstonianForm` decides, and a word it vouches for
 * links to the dictionary's own headword. A word it will not vouch for is
 * printed plain, because leaving it out would be editing the sentence and
 * guessing at it would be worse. A headline is offered only when most of it
 * can be looked up, so a beginner meets one they can actually read through
 * rather than one wall of names. Nothing a feed wrote is stored; the block is
 * rendered from the hourly cache and gone with it.
 */
export interface ReadableHeadline {
  /** The headline as the feed spelled it, split into words and the bits between. */
  tokens: (HeadlineToken & { lemma: string | null })[];
  /** How much of it the dictionary can open, 0 to 1. */
  covered: number;
}

/** Enough of the sentence to read through it, rather than one word in a wall of names. */
const MIN_COVERED = 0.6;
/** Short enough to be one line on a phone and long enough to be a sentence. */
const MIN_WORDS = 4;
const MAX_WORDS = 14;
/** Headlines considered; the feed carries up to sixty and the front page is the first of them. */
const CEILING = 40;

let memo: { key: string; result: ReadableHeadline[] } | null = null;

export async function readableHeadlines(limit = 3): Promise<ReadableHeadline[]> {
  const headlines = (await newsHeadlines()).slice(0, CEILING);
  if (headlines.length === 0) return [];
  const key = headlines.join("\n");
  if (memo?.key === key) return memo.result.slice(0, limit);

  const tokenised = headlines.map(tokenise);
  const words = [...new Set(
    tokenised.flatMap((tokens) => tokens.filter((t) => t.word).map((t) => t.text.toLocaleLowerCase("et"))),
  )];
  const candidates = await candidatesFor(words);

  const scored: ReadableHeadline[] = [];
  for (const tokens of tokenised) {
    const wordCount = tokens.filter((t) => t.word).length;
    if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) continue;
    let vouched = 0;
    const annotated = tokens.map((token) => {
      if (!token.word) return { ...token, lemma: null };
      const match = matchEstonianForm(candidates, token.text.toLocaleLowerCase("et"));
      if (match) vouched += 1;
      return { ...token, lemma: match?.lemma ?? null };
    });
    const covered = vouched / wordCount;
    if (covered < MIN_COVERED) continue;
    scored.push({ tokens: annotated, covered });
  }
  // Most readable first; the feed's own order settles a tie so the pick is stable within the hour.
  const result = scored
    .map((h, index) => ({ h, index }))
    .sort((a, b) => b.h.covered - a.h.covered || a.index - b.index)
    .map(({ h }) => h);
  memo = { key, result };
  return result.slice(0, limit);
}

/** Forgets what the dictionary made of the last front page. For tests. */
export function resetHeadlineCache(): void {
  memo = null;
}
