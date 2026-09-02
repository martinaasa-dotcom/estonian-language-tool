/**
 * Builds the built-in dictionary from sources, rather than by hand.
 *
 * The seed was 370 words somebody typed, which is a fine demo and a poor
 * dictionary: offline review, the minimal-pair finder and the government drill
 * are all bounded by it, and a learner with no connection meets the ceiling on
 * their first session.
 *
 * WHO IS ALLOWED TO WRITE WHAT (ADR-005, and the whole point of this script):
 *
 *   Estonian forms      Ekilex, the Institute of the Estonian Language. CC BY.
 *   Estonian sentences  Ekilex usages, verbatim, as lexicographers recorded them.
 *   English glosses     Wiktionary. CC BY-SA 4.0, community written.
 *   This script         the joining, the filtering, and nothing else.
 *
 * No model writes a character of the output. That is not a style preference:
 * a wrong inflected form does not sit there being wrong, the scheduler drills
 * it until the learner believes it.
 *
 * Candidates come from Wiktionary's Estonian part-of-speech categories rather
 * than from a list written here, so the vocabulary is attested rather than
 * remembered. Proper nouns and multi-word entries are dropped: a flashcard for
 * "Aabraham" teaches nobody Estonian.
 *
 * Resumable. Every answer is cached to disk as it arrives, so an interrupted
 * run continues instead of asking two public APIs for the same thing twice.
 *
 *   npx tsx scripts/expand-seed.ts            # fetch and write the seed file
 *   npx tsx scripts/expand-seed.ts --limit 50 # a small run, for checking
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";

import { fetchEkilexDetails, searchEkilex } from "../lib/ekilex/client";
import { mapEkilexDetails } from "../lib/ekilex/mapper";
import { extractEstonianEntries, type EstonianSense } from "../lib/dict/wiktionary";
import { resolvePos } from "../lib/dict/pos";
import { EXPANDED_PATH, writeExpanded } from "./lib/expandedFile";

const CACHE = "prisma/data/.cache/expand.jsonl";
const CATEGORY_CACHE = "prisma/data/.cache/categories.json";
const UA = "Kodukeel/0.1 (Estonian learning tool; seed builder)";

/**
 * Wiktionary categories to draw candidates from, and the part of speech each
 * suggests for a word found only there.
 *
 * A category is a *candidate source*, not the answer, and reading it as the
 * answer is the fault this list used to carry. Candidates were collected in
 * this order and deduplicated first-wins, so any word in two categories came
 * out as whichever is higher up, and nouns are first: `kallis`, `valge`,
 * `sinine`, `noor`, `tark` and 74 others shipped as NOUN because they are also
 * listed as nouns somewhere on their page. Reversing the order does not fix
 * it, it moves it: `lamp` is in the adjectives category for a colloquial sense
 * meaning "random", `pea` is in the adverbs category for a sense meaning
 * "almost", and both would then have been labelled against the very gloss
 * shipped beside them.
 *
 * `build()` reads the part of speech off the heading the chosen gloss sits
 * under instead, which is the one fact that cannot disagree with the gloss.
 * This stays as the fallback for a page whose senses carry no heading this app
 * has a label for.
 */
const CATEGORIES: { category: string; pos: string }[] = [
  { category: "Estonian_nouns", pos: "NOUN" },
  { category: "Estonian_verbs", pos: "VERB" },
  { category: "Estonian_adjectives", pos: "ADJECTIVE" },
  { category: "Estonian_adverbs", pos: "ADVERB" },
];

/**
 * How many requests may be in flight. Two public APIs, neither of them ours.
 *
 * Five is where this settled. It was three, which was polite and would have
 * taken four hours; the earlier trouble was never the rate but that a
 * rate-limited answer was written into the cache as a permanent miss. With
 * that fixed a refusal costs a backoff and a retry rather than a lost word, so
 * a little more pressure is self-correcting. The run reports how often a
 * source would not answer, and if that number climbs this is the knob.
 */
const CONCURRENCY = 8;

export interface ExpandedEntry {
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  notes: string | null;
  examples: { et: string; en: string | null }[];
  /** Principal parts only. The regular cases are derived at render time (ADR-009). */
  forms: { formType: string; value: string }[];
  ekilexWordId: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Category listings, fetched once and kept.
 *
 * Paginating four categories is about thirty requests, and Wikimedia
 * rate-limits a burst of them. Doing it again on every run would be rude as
 * well as slow, and it is the part of this script most likely to be rerun.
 */
async function categoryMembers(category: string): Promise<string[]> {
  const cached = existsSync(CATEGORY_CACHE)
    ? (JSON.parse(readFileSync(CATEGORY_CACHE, "utf8")) as Record<string, string[]>)
    : {};
  const hit = cached[category];
  if (hit?.length) return hit;

  const out: string[] = [];
  let cont: string | undefined;
  for (;;) {
    const url =
      `https://en.wiktionary.org/w/api.php?action=query&list=categorymembers` +
      `&cmtitle=Category:${category}&cmlimit=500&format=json&formatversion=2` +
      (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : "");
    const res = await fetchWithRetry(url);
    const body = (await res.json()) as {
      query?: { categorymembers?: { title: string; ns: number }[] };
      continue?: { cmcontinue?: string };
    };
    for (const m of body.query?.categorymembers ?? []) {
      if (m.ns !== 0) continue;
      out.push(m.title);
    }
    cont = body.continue?.cmcontinue;
    if (!cont) break;
    await sleep(2000);
  }
  /*
    An empty category is a failure, not an answer. The first run of this script
    paginated the nouns happily, was then rate-limited, and the `!res.ok` break
    turned three whole parts of speech into zero candidates without a word of
    complaint. A dictionary with no verbs in it would have looked like a
    successful run.
  */
  if (out.length === 0) {
    throw new Error(`Category ${category} returned no members. Refusing to seed a partial dictionary.`);
  }
  mkdirSync(dirname(CATEGORY_CACHE), { recursive: true });
  writeFileSync(CATEGORY_CACHE, JSON.stringify({ ...cached, [category]: out }));
  return out;
}

/**
 * Wikimedia rate-limits a burst, and the answer is to wait rather than to give
 * up: these are public APIs being asked for a lot at once, which is our
 * problem to pace and not theirs to absorb.
 */
async function fetchWithRetry(url: string, attempts = 7): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.ok) return res;
    lastStatus = res.status;
    // Up to about a minute on the last attempt: a rate limit lifts, it does
    // not need to be worked around.
    await sleep(Math.min(60_000, 1500 * 2 ** attempt));
  }
  throw new Error(`${url} failed after ${attempts} attempts, last status ${lastStatus}`);
}

/**
 * A candidate worth spending two requests on.
 *
 * Uppercase is a proper noun, a space or a hyphen is a phrase or a compound
 * entry, and anything outside the Estonian alphabet came from another language
 * that happens to share the category.
 */
function plausibleLemma(word: string): boolean {
  if (word.length < 2 || word.length > 24) return false;
  if (word[0] !== word[0]?.toLowerCase()) return false;
  return /^[a-zõäöüšž]+$/.test(word);
}

interface CacheRow { lemma: string; entry: ExpandedEntry | null }

function readCache(): Map<string, ExpandedEntry | null> {
  const seen = new Map<string, ExpandedEntry | null>();
  if (!existsSync(CACHE)) return seen;
  for (const line of readFileSync(CACHE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as CacheRow;
      seen.set(row.lemma, row.entry);
    } catch {
      // A half-written last line after an interrupted run. Skip it.
    }
  }
  return seen;
}

function cache(lemma: string, entry: ExpandedEntry | null): void {
  mkdirSync(dirname(CACHE), { recursive: true });
  appendFileSync(CACHE, `${JSON.stringify({ lemma, entry })}\n`);
}

/**
 * One candidate, from two sources.
 *
 * Returns null whenever either side is missing or incomplete. A word with no
 * English is not a flashcard, and a word whose principal parts did not come
 * back is a set of forms this app would have to guess at, which it may not do.
 */
async function build(lemma: string, pos: string): Promise<ExpandedEntry | null> {
  const hits = await searchEkilex(lemma);
  const exact = hits.find((h) => h.wordValue === lemma) ?? hits[0];
  if (!exact) return null;

  const details = await fetchEkilexDetails(exact.wordId);
  if (!details) return null;

  const mapped = mapEkilexDetails(details);
  if (!mapped) return null;

  const principal = mapped.forms.filter((f) => f.isPrincipal);
  // A noun needs at least nominative, genitive and partitive; a verb needs the
  // ma- and da-infinitives and the first person present. Below that the app
  // would be deriving from a stem it does not actually have.
  if (principal.length < 3) return null;

  const senses = await englishEntries(lemma);
  const first = senses[0];
  const short = first?.gloss;
  if (!first || !short) return null;
  /*
    A "gloss" that is punctuation and nothing else. Two of these reached the
    dictionary as the single word `.`, from Wiktionary entries whose Estonian
    definition line was a bare cross reference. A flashcard cannot be answered
    with a full stop, and the scheduler would have drilled it.
  */
  if (short.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return null;

  return {
    lemma,
    /*
      The part of speech of the sense the gloss came from, which is the only
      one that cannot contradict the gloss. See `lib/dict/pos.ts` for who gets
      to answer what; the short version is that Ekilex draws the verb line and
      the page's own heading draws the rest.
    */
    pos: resolvePos({
      sensePos: first.pos,
      headwordPos: first.headword,
      ekilexSaysVerb: mapped.pos === "VERB",
      fallback: pos,
    }),
    translation: short,
    cefr: mapped.cefr,
    gradation: mapped.gradation,
    gradationNote: mapped.gradationNote,
    government: mapped.government,
    notes: senses.length > 1 ? senses.slice(1, 4).map((s) => s.gloss).join("; ") : null,
    examples: mapped.examples.slice(0, 3).map((e) => ({ et: e.et, en: e.en ?? null })),
    forms: principal.map((f) => ({ formType: f.formType, value: f.value })),
    ekilexWordId: exact.wordId,
  };
}


/**
 * The English senses for a lemma, telling a real miss from a failed request.
 *
 * `fetchEnglishGloss` answers null to both, which is right in the app (no
 * gloss, move on) and wrong here: a rate-limited minute would be written into
 * the cache as "this word has no English" and the word would never be looked
 * at again. That happened on the first full run, and `koor`, `koristaja` and
 * `koppel` were all filed as glossless while having perfectly good entries.
 *
 * So a 404 is a miss, and anything else that is not a success is thrown, which
 * leaves the word uncached and picked up by the next run.
 */
async function englishEntries(lemma: string): Promise<EstonianSense[]> {
  const url =
    `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(lemma)}` +
    `&prop=wikitext&format=json&formatversion=2`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return [];
    if (res.ok) {
      const data = (await res.json()) as { parse?: { wikitext?: string }; error?: unknown };
      // A page that does not exist comes back as an error object, not a 404.
      if (data.error) return [];
      return extractEstonianEntries(data.parse?.wikitext ?? "");
    }
    await sleep(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw new Error(`Wiktionary would not answer for "${lemma}"`);
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  console.log("Collecting candidates from Wiktionary...");
  const candidates: { lemma: string; pos: string }[] = [];
  const seenLemma = new Set<string>();
  for (const { category, pos } of CATEGORIES) {
    const members = await categoryMembers(category);
    let kept = 0;
    for (const word of members) {
      if (!plausibleLemma(word) || seenLemma.has(word)) continue;
      seenLemma.add(word);
      candidates.push({ lemma: word, pos });
      kept += 1;
    }
    console.log(`  ${category}: ${members.length} members, ${kept} plausible lemmas`);
  }

  const done = readCache();
  const todo = candidates.filter((c) => !done.has(c.lemma)).slice(0, limit);
  console.log(`\n${candidates.length} candidates, ${done.size} already cached, ${todo.length} to fetch.\n`);

  let index = 0;
  let built = 0;
  let skipped = 0;
  let failed = 0;

  async function worker() {
    for (;;) {
      const i = index++;
      const item = todo[i];
      if (!item) return;
      try {
        const entry = await build(item.lemma, item.pos);
        cache(item.lemma, entry);
        if (entry) built++; else skipped++;
      } catch (error) {
        /*
          Deliberately not cached. A thrown error here means a source would not
          answer, which says nothing about the word, and writing it down as a
          miss is how a rate-limited minute turns into a permanent hole in the
          dictionary. It stays on the list for the next run.
        */
        failed++;
        if (process.env.VERBOSE) console.error(item.lemma, error);
      }
      if ((built + skipped + failed) % 100 === 0) {
        console.log(
          `  ${built + skipped + failed}/${todo.length}  kept ${built}, ` +
          `no entry ${skipped}, source unavailable ${failed}`,
        );
      }
      await sleep(60);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const all = readCache();
  const entries: ExpandedEntry[] = [];
  for (const entry of all.values()) if (entry) entries.push(entry);

  // Easiest first, so a reseed that is cut short still leaves a usable beginner
  // dictionary rather than an alphabetical slice of one.
  const rank: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
  entries.sort(
    (a, b) =>
      (rank[a.cefr ?? ""] ?? 9) - (rank[b.cefr ?? ""] ?? 9) || a.lemma.localeCompare(b.lemma, "et"),
  );

  writeExpanded(entries);

  const byCefr = new Map<string, number>();
  for (const e of entries) byCefr.set(e.cefr ?? "none", (byCefr.get(e.cefr ?? "none") ?? 0) + 1);
  const byPos = new Map<string, number>();
  for (const e of entries) byPos.set(e.pos, (byPos.get(e.pos) ?? 0) + 1);

  console.log(`\nWrote ${entries.length} entries to ${EXPANDED_PATH}`);
  console.log("  CEFR:", [...byCefr].map(([k, v]) => `${k}:${v}`).join(" "));
  console.log("  POS: ", [...byPos].map(([k, v]) => `${k}:${v}`).join(" "));
  console.log(`  with a government: ${entries.filter((e) => e.government).length}`);
  console.log(`  with an example:   ${entries.filter((e) => e.examples.length).length}`);
}

void main();
