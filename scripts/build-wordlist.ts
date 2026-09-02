#!/usr/bin/env tsx
/**
 * EVERY ESTONIAN WORD THERE IS, IN THIRTY-TWO REQUESTS.
 *
 * The dictionary ships 5,363 entries and a learner who searches for anything
 * else gets nothing. That was reported plainly: "I searched for uudishimulik,
 * which is used within our website, on our website dictionary and it wasn't
 * there. Feels bad."
 *
 * The obvious fix is to harvest the language, and the obvious harvest is one
 * request per word. Ekilex holds about 261,000 Estonian headwords, so that is
 * a quarter of a million requests against a free service run by the Institute
 * of the Estonian Language for the good of the language. This app already
 * leans on them for every form and every example sentence it has. Asking that
 * of them for a convenience is not a thing to do.
 *
 * Ekilex's search takes a wildcard, and a wildcard on a single initial letter
 * returns every word beginning with it. Thirty-two letters is thirty-two
 * requests, and the whole headword list comes back. That is the entire cost.
 *
 * WHAT THIS PRODUCES IS A LIST OF WORDS AND NOTHING ELSE. No forms, no
 * glosses, no levels: the search returns a headword and an id, and asking for
 * the rest is back to one request per word. So this is not a dictionary, it is
 * the dictionary's knowledge of *what exists*, which turns out to be most of
 * what was missing. See `lib/dict/known.ts` for what it is worth: a miss that
 * is a real Estonian word says so and fetches it, a miss that is not gets a
 * spelling suggestion, and a typo stops costing Ekilex two requests.
 *
 * WHAT IS FILTERED OUT, AND WHY EACH.
 *
 * **Datasets.** Ekilex hosts the general dictionary alongside a hundred
 * specialist term bases: EU terminology, military, maritime, botany, three
 * kinds of medicine. Those are 95,000 words a learner will never search for
 * and would only see as noise in a spelling suggestion. `eki` is the EKI
 * combined dictionary, which is what Sõnaveeb shows, and `les` is the
 * learner's dictionary; a word in either is general Estonian.
 *
 * **Multi-word entries**, because this is a word list and the search that
 * reads it is given one word.
 *
 * **Anything with a capital in it**, which drops proper nouns and
 * abbreviations. `A`, `AS`, `Eesti`. That is a real loss on the place names,
 * and it is the right side to err on: the list's job is to answer "is this a
 * word", and an index full of two-letter abbreviations makes every typo look
 * like a word.
 *
 * Responses are cached under `.ekilex-cache/wordlist/`, so a re-run costs
 * Ekilex nothing and the generated file is reproducible.
 *
 *   tsx scripts/build-wordlist.ts
 *   tsx scripts/build-wordlist.ts --refresh
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".ekilex-cache", "wordlist");
const OUT = path.join(ROOT, "prisma/data/wordlist.txt");
const BASE = "https://ekilex.ee/api";
const KEY = process.env.EKILEX_API_KEY;

/** Every letter an Estonian word can start with. */
const PREFIXES = [..."abcdefghijklmnopqrstuvwxyzõäöüšž"];

/** The general-language datasets. Everything else is a specialist term base. */
const GENERAL = new Set(["eki", "les"]);

/**
 * A word this list will vouch for existing: Estonian, one word, letters and
 * an internal hyphen, and no capital anywhere.
 */
const WORD = /^[a-zäöüõšž]+(-[a-zäöüõšž]+)*$/;

interface Word {
  wordValue?: string;
  lang?: string;
  datasetCodes?: string[];
}

async function search(prefix: string, refresh: boolean): Promise<Word[]> {
  await mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, `${encodeURIComponent(prefix)}.json`);
  if (!refresh && existsSync(file)) {
    return JSON.parse(await readFile(file, "utf8")).words ?? [];
  }

  const url = `${BASE}/word/search/${encodeURIComponent(`${prefix}*`)}?datasets=eki,mab`;
  const res = await fetch(url, { headers: { "ekilex-api-key": KEY ?? "" } });
  if (!res.ok) throw new Error(`Ekilex returned ${res.status} for ${prefix}*`);
  const body = await res.text();
  await writeFile(file, body);
  return JSON.parse(body).words ?? [];
}

async function main() {
  if (!KEY) {
    console.error("Needs EKILEX_API_KEY. Nothing written.");
    process.exitCode = 1;
    return;
  }
  const refresh = process.argv.includes("--refresh");

  const kept = new Set<string>();
  let seen = 0;
  for (const prefix of PREFIXES) {
    const words = await search(prefix, refresh);
    seen += words.length;
    for (const word of words) {
      if (word.lang !== "est") continue;
      const lemma = (word.wordValue ?? "").trim();
      if (!WORD.test(lemma)) continue;
      if (!(word.datasetCodes ?? []).some((d) => GENERAL.has(d))) continue;
      kept.add(lemma);
    }
    process.stderr.write(`${prefix}* ${String(words.length).padStart(6)} rows, ${kept.size} kept\n`);
  }

  // Sorted, so the file is a diff somebody can read rather than a reshuffle
  // every time Ekilex changes the order it answers in.
  const sorted = [...kept].sort((a, b) => a.localeCompare(b, "et"));
  await writeFile(OUT, `${sorted.join("\n")}\n`);

  console.log(`\n${PREFIXES.length} requests, ${seen} rows seen.`);
  console.log(`Wrote ${sorted.length} Estonian headwords to prisma/data/wordlist.txt.`);
}

void main();
