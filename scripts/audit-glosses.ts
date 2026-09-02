/**
 * Checks the built dictionary's English glosses against Wiktionary again.
 *
 * The glosses are the answer side of a flashcard, and a wrong one is not
 * inert: the scheduler repeats it until the learner has learned it. They come
 * from Wiktionary through `extractEstonianSenses`, so a fault in that parser
 * is silent by construction, because the output is a plausible English phrase
 * either way. A sample will not find it. This re-runs the parser over every
 * entry's own page and reports the ones that disagree.
 *
 * The first run, over the 2,164 entries at A1 to B1, found 25. Four of them
 * were a different word, not a different sense: `lamp` was drilled as
 * "random", `oktoober` as "hard hat", `ooper` as "opera house", `rida` as
 * "many, much". `{{l|en|lamp}}` renders as the word "lamp" and was being
 * deleted with the rest of the markup, which emptied the line and moved the
 * picker on to the next sense, and on a page with more than one etymology the
 * next sense belongs to another word entirely.
 *
 *   npx tsx scripts/audit-glosses.ts              # report, change nothing
 *   npx tsx scripts/audit-glosses.ts --write      # apply the corrections
 *   npx tsx scripts/audit-glosses.ts --cefr A1,A2,B1
 *
 * Resumable: every page is cached under `prisma/data/.cache/`, so a second run
 * costs nothing and an interrupted one continues.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { extractEstonianSenses } from "../lib/dict/wiktionary";
import type { ExpandedEntry } from "./expand-seed";
import { EXPANDED_PATH, writeExpanded } from "./lib/expandedFile";

const CACHE = "prisma/data/.cache/audit-pages.json";
const UA = "Kodukeel/0.1 (Estonian learning tool; gloss audit)";
/** The query API takes fifty titles at a time; `action=parse` takes one. */
const BATCH = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readCache(): Record<string, string> {
  if (!existsSync(CACHE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Wikitext for many pages at once.
 *
 * `expand-seed.ts` asks for one page per request because it is discovering
 * words and has to tell a missing page from a rate limit. Here the word list
 * is already known, so the batch endpoint does the same job in a fiftieth of
 * the requests: the first full pass took an hour one at a time and four
 * minutes this way.
 */
async function fetchPages(titles: string[]): Promise<Record<string, string>> {
  const url =
    `https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content` +
    `&rvslots=main&titles=${encodeURIComponent(titles.join("|"))}&format=json&formatversion=2`;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (res.ok) {
        const body = (await res.json()) as {
          query?: { pages?: { title: string; missing?: boolean; revisions?: { slots?: { main?: { content?: string } } }[] }[] };
        };
        const pages = body.query?.pages;
        if (pages) {
          const out: Record<string, string> = {};
          for (const title of titles) out[title] = "";
          for (const page of pages) out[page.title] = page.missing ? "" : page.revisions?.[0]?.slots?.main?.content ?? "";
          return out;
        }
      }
    } catch {
      // Falls through to the backoff. A public API being asked for a lot at
      // once is ours to pace, not theirs to absorb.
    }
    await sleep(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw new Error(`Wiktionary would not answer for ${titles.length} pages starting "${titles[0]}"`);
}

async function main() {
  const write = process.argv.includes("--write");
  const cefrArg = process.argv.indexOf("--cefr");
  const levels = cefrArg > 0 ? new Set(process.argv[cefrArg + 1]?.split(",")) : null;

  const entries = JSON.parse(readFileSync(EXPANDED_PATH, "utf8")) as ExpandedEntry[];
  const scope = entries.filter((e) => !levels || levels.has(e.cefr ?? ""));
  console.log(`${entries.length} entries, ${scope.length} in scope.`);

  const pages = readCache();
  const missing = scope.filter((e) => pages[e.lemma] === undefined).map((e) => e.lemma);
  /*
    A WHOLE PASS DOES NOT FIT IN ONE RUN, AND STOPPING DEAD WAS THE WRONG ANSWER.

    Wiktionary starts refusing part way through five thousand pages however
    politely they are asked: measured here at about 3,800 before a batch would
    not come back however long it was given. `fetchPages` threw, `main` never
    reached the comparison, and a run that had successfully fetched four fifths
    of the dictionary reported nothing at all about any of it.

    That is the wrong shape twice over. It threw away work that was done, and on
    a schedule it would have made the weekly job red for a fact about Wiktionary
    rather than a fact about a gloss, which is how a check becomes one everybody
    waives.

    So a refusal ends the fetching rather than the run, and what could not be
    read is *counted and printed* instead of being quietly skipped. That is the
    same third outcome `absent(n, why)` gives a browser suite, and it matters
    for the same reason: silence is how the first seed run recorded four fifths
    of the dictionary as having no English at all. Every page fetched is written
    to the cache as it arrives, so the next run picks up where this one stopped.
  */
  let unreachable = 0;
  if (missing.length) {
    console.log(`Fetching ${missing.length} pages...`);
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      try {
        Object.assign(pages, await fetchPages(batch));
      } catch (error) {
        unreachable = missing.length - i;
        console.log(`\n${(error as Error).message}`);
        console.log(`Stopped with ${unreachable} of ${missing.length} pages still unread.`);
        console.log("Everything fetched is cached, so running this again carries on from here.");
        break;
      }
      mkdirSync(dirname(CACHE), { recursive: true });
      writeFileSync(CACHE, JSON.stringify(pages));
      // Paced rather than hurried. A public API being asked for a lot at once
      // is ours to pace, and this is the one thing that decides how far a run
      // gets before it is turned away.
      await sleep(500);
    }
  }

  const corrected: { entry: ExpandedEntry; from: string; to: string }[] = [];
  const dropped: ExpandedEntry[] = [];
  let unchecked = 0;

  for (const entry of scope) {
    const wikitext = pages[entry.lemma];
    /*
      A page nobody could fetch says nothing about the entry. Silence here is
      how the first seed run filed `koor` and `koristaja` as having no English
      at all, so an absent page is skipped rather than treated as an answer.
    */
    if (!wikitext) {
      // Counted, not merely skipped. A pass over four fifths of the dictionary
      // reads exactly like a pass over all of it unless it says which it was.
      if (pages[entry.lemma] === undefined) unchecked += 1;
      continue;
    }

    const senses = extractEstonianSenses(wikitext);
    const short = senses[0];
    // The same floor the builder applies: a flashcard cannot be answered with
    // a full stop.
    const usable = short && short.replace(/[^\p{L}\p{N}]/gu, "").length >= 2 ? short : null;

    if (!usable) {
      dropped.push(entry);
      continue;
    }
    if (usable !== entry.translation) {
      corrected.push({ entry, from: entry.translation, to: usable });
      entry.translation = usable;
      entry.notes = senses.length > 1 ? senses.slice(1, 4).join("; ") : null;
    }
  }

  const byLevel = new Map<string, number>();
  for (const c of corrected) byLevel.set(c.entry.cefr ?? "none", (byLevel.get(c.entry.cefr ?? "none") ?? 0) + 1);

  // The verb has to agree too. It read "1 gloss disagree" for the single-item
  // case, which is the one somebody reads most carefully.
  const one = corrected.length === 1;
  console.log(`\n${corrected.length} gloss${one ? "" : "es"} ${one ? "disagrees" : "disagree"} with Wiktionary:\n`);
  for (const c of corrected) {
    console.log(`  ${(c.entry.cefr ?? "--").padEnd(4)} ${c.entry.lemma.padEnd(18)} ${JSON.stringify(c.from)}`);
    console.log(`  ${"".padEnd(4)} ${"".padEnd(18)}   -> ${JSON.stringify(c.to)}`);
  }
  console.log(`\n  by level: ${[...byLevel].map(([k, v]) => `${k}:${v}`).join(" ")}`);
  // How much of the scope this actually saw. A clean result over half the
  // dictionary is not a clean result, and the only way to tell those apart from
  // the outside is for the run to say which one it was.
  const checked = scope.length - unchecked;
  console.log(`  checked:  ${checked} of ${scope.length}` +
    (unchecked ? `, and ${unchecked} Wiktionary would not send today` : ""));
  if (dropped.length) {
    console.log(`\n${dropped.length} entr${dropped.length === 1 ? "y has" : "ies have"} no usable gloss any more:`);
    for (const d of dropped) console.log(`  ${(d.cefr ?? "--").padEnd(4)} ${d.lemma.padEnd(18)} ${JSON.stringify(d.translation)}`);
  }

  if (!write) {
    console.log("\nNothing written. Re-run with --write to apply.");
    /*
      A drift check has to be able to fail, or scheduling it buys nothing.

      This printed its findings and exited 0, which is right for somebody
      reading the output and useless to a job: `.github/workflows/drift.yml`
      runs this weekly, and a green tick on a run that found twenty-five wrong
      glosses is worse than not running it. `--write` still exits 0, because
      applying the corrections is the fix rather than the finding.

      A gloss is the answer side of a flashcard. The first systematic pass
      corrected 25 of 2,164, and four of those were a different word rather
      than a different sense.

      A run that could not read most of what it was asked to read fails too,
      and says so separately, on the rule the browser suites already follow:
      waiving more than half of a suite is a failure whatever the reasons say.
      Under that line it is a partial pass and reports as one, because the
      cache means the next run continues rather than starting again.
    */
    if (corrected.length || dropped.length) process.exitCode = 1;
    if (unchecked * 2 > scope.length) {
      console.log(`Fewer than half the pages were readable, so this is not a pass either way.`);
      process.exitCode = 1;
    }
    return;
  }
  const remove = new Set(dropped.map((d) => d.lemma));
  const next = entries.filter((e) => !remove.has(e.lemma));
  writeExpanded(next);
  console.log(`\nWrote ${next.length} entries to ${EXPANDED_PATH} (${corrected.length} corrected, ${dropped.length} dropped).`);
}

void main();
