/**
 * One request to the news, per instance, per hour, for everybody.
 *
 * The dictionary's suggestion row wants words that are in the air today. The
 * front page of the national broadcaster is where they are, it is public, it
 * costs nothing, and it is the same document for every learner, which is what
 * makes it cacheable rather than a per-render fetch.
 *
 * NOTHING OF THE LEARNER'S GOES OUT WITH IT. The request carries no query, no
 * account and nothing anybody typed: it asks for a front page and would ask
 * for the same one if nobody were signed in. That is why the feed is not on
 * `/privacy`'s recipients list, which names who receives *personal data*, and
 * adding a line there for a service that receives none of it would make that
 * list harder to read rather than more honest.
 *
 * A SOURCE THAT WILL NOT ANSWER IS WRITTEN DOWN AS A MISS. That rule was
 * learned twice in this repository at some cost: once when the seed recorded
 * nothing for a word Ekilex had nothing for and re-asked for ever, and once
 * when `enrichFromEkilex` did the same thing on the live path. A feed that is
 * down would otherwise be re-tried on every render of the dictionary, against
 * a deadline, by every learner. So a failure is remembered too, for a shorter
 * time than a success, because a feed that is down comes back.
 *
 * The deadline is short and every failure is silent, because this is the least
 * important thing on the page. `lib/dict/suggest.ts` has two more sources
 * behind this one and the row is never empty.
 */
import { singleFlight } from "@/lib/cache/singleFlight";
import { headlineWords, parseHeadlines } from "./headlines";

/**
 * Eesti Rahvusringhääling, the national broadcaster. Its front page is
 * general news in Estonian, which is what a learner is trying to read.
 *
 * An operator can point this somewhere else, or switch it off with `off`, and
 * a deployment that cannot reach it at all simply never gets this source.
 */
const DEFAULT_FEED = "https://www.err.ee/rss";

/** A good hour is a long time in the news, and a short one on a dictionary page. */
const GOOD_FOR_MS = 60 * 60 * 1000;

/** A failure is remembered for long enough to stop a retry storm and no longer. */
const MISS_FOR_MS = 10 * 60 * 1000;

/**
 * Short on purpose. The dictionary page already spends up to 2.5 seconds
 * asking Ekilex about a word somebody actually searched for; a decoration on
 * the empty state does not get to spend that again.
 */
const DEADLINE_MS = 1500;

interface Cached {
  at: number;
  words: string[];
}

let cache: Cached | null = null;

/** The feed this deployment reads, or nothing when it has been switched off. */
export function feedUrl(): string | null {
  const configured = process.env.NEWS_FEED_URL?.trim();
  if (!configured) return DEFAULT_FEED;
  if (configured.toLowerCase() === "off") return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Words from today's headlines, or an empty list.
 *
 * Never throws and never waits long. An empty list is an ordinary answer here,
 * not an error: it is what a deployment with no outbound network, a feed
 * having a bad minute, and an operator who switched this off all get.
 */
export async function newsWords(now: number = Date.now()): Promise<string[]> {
  const url = feedUrl();
  if (!url) return [];

  const fresh = cache && now - cache.at < (cache.words.length ? GOOD_FOR_MS : MISS_FOR_MS);
  if (cache && fresh) return cache.words;

  return singleFlight(`news:${url}`, async () => {
    const words = await read(url);
    cache = { at: Date.now(), words };
    return words;
  });
}

async function read(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DEADLINE_MS),
      cache: "no-store",
      headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
    });
    if (!res.ok) return [];
    return headlineWords(parseHeadlines(await res.text()));
  } catch {
    return [];
  }
}

/** Forgets what was read, so a test does not inherit another test's morning. */
export function resetNewsCache(): void {
  cache = null;
}
