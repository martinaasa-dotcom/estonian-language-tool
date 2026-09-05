#!/usr/bin/env tsx
/**
 * EVERY SPELLING OF EVERY ESTONIAN WORD, FROM EVERY SOURCE THAT MAY BE USED.
 *
 * `KnownWord` answered "is that a word" for 155,000 headwords and could not
 * answer it for a single inflected form: `põhjas` is the seesütlev of `põhi`,
 * a learner typed it into Sõnad, and the game refused it as not a word. A
 * headword list cannot fix that however long it gets, because the shape of the
 * question is wrong. Estonian is written in its forms, and a word has thirty
 * of them.
 *
 * So this is a *forms* list, and it unions three sources, every one of them
 * openly licensed and named in `LICENSE`:
 *
 *   1. The Ekilex enumeration this repository already holds
 *      (`prisma/data/wordlist.txt`, thirty-two requests, CC BY 4.0).
 *   2. Ekilex's own inflection tables for 160,000 words, published as
 *      `est_inflected_forms.tsv` in KristjanPikhof/Estonian-Wordlist-Enriched-
 *      Ekilex (CC BY-SA 4.0 for the repository, CC BY 4.0 for the Institute's
 *      data inside it). That is the one-request-per-word harvest this project
 *      refused to run against the Institute, done once by somebody else, so
 *      the cost to Ekilex is already paid and is not paid again here.
 *   3. Vabamorf, Filosoft's open-source analyser and synthesiser (LGPL), run
 *      over the union of the headwords with guessing off, through
 *      `scripts/lib/synthesize-forms.py`. It is the second opinion on every
 *      word and the only source for the headwords the inflection file has no
 *      row for.
 *
 * WHAT IT IS FOR, AND WHAT IT IS NOT. It is an accept list: it says whether a
 * spelling is Estonian and which headword it belongs to, and it decides
 * nothing else. It holds no gloss, no level and no case label, so nothing in
 * it can become a card, a paper or a marking target, and an invariant keeps
 * `lib/srs`, `lib/exam`, `lib/assessment` and the scanner from reaching it.
 * That is the line that keeps ADR-005 whole: a synthesised form on the accept
 * side costs at worst a non-word being let through, which on a word game is
 * cheap, and the same form on the answer side would be drilled.
 *
 * WHY FILES RATHER THAN A TABLE. The union is 6,044,103 form-headword pairs
 * over 5,755,280 spellings. `KnownWord` at 155,000 rows is a table; this at
 * forty times that measured 789 MB in Postgres with the folded index the
 * search would need, for a question whose answer never changes and is read by
 * two screens. So it is written as gzipped shards keyed on the folded first
 * three letters of the form, 3,857 of them and 15 MB in the repository, and
 * `lib/dict/forms.ts` reads one per lookup, which is a small read and a
 * decompression rather than a query. `outputFileTracingIncludes` in
 * `next.config.ts` is what carries them onto a deployment.
 *
 * THE SIX-LETTER FILE IS WRITTEN HERE AND NOT DERIVED, because a full scan of
 * every shard on every render of the game is the cost this layout exists to
 * avoid. Its length is read off `SONAD_LENGTH` rather than typed, and the
 * invariant checks the file on disk is the length the game asks for.
 *
 * Reproducible: the inflection file is cached under `.ekilex-cache/forms/` and
 * a manifest records what each source contributed. Needs `python3` with
 * `estnltk` (`pip install estnltk`) and about eight minutes.
 *
 *   npm run forms
 *   npm run forms -- --refresh    # re-download the inflection file
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fold } from "../lib/estonian/fold";
import { SONAD_LENGTH } from "../lib/games/sonad";
import { LENGTH_FILE, MANIFEST_FILE, SHARD_DIR, shardKey } from "../lib/dict/formsLayout";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".ekilex-cache", "forms");
const WORDLIST = path.join(ROOT, "prisma/data/wordlist.txt");
const OUT = path.join(ROOT, "prisma/data/forms");
const PYTHON = process.env.FORMS_PYTHON ?? "python3";

/**
 * Where the inflection file is published.
 *
 * `main` rather than a commit, and the cache is what makes a re-run
 * reproducible: the file is written to `.ekilex-cache/forms/` on the first run
 * and read from there afterwards, so nothing moves under a rebuild unless
 * somebody passes `--refresh`. The manifest records what the run took from
 * each source, which is the record worth keeping when it does move.
 */
const INFLECTIONS_URL =
  "https://raw.githubusercontent.com/KristjanPikhof/Estonian-Wordlist-Enriched-Ekilex/"
  + "main/data/est_inflected_forms.tsv";

/** The same rule `build-wordlist.ts` applies to a headword, applied to a form. */
const WORD = /^[a-zäöüõšž]+(-[a-zäöüõšž]+)*$/;

async function inflectionFile(refresh: boolean): Promise<string> {
  await mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, "est_inflected_forms.tsv");
  if (!refresh && existsSync(file)) return readFile(file, "utf8");
  const res = await fetch(INFLECTIONS_URL);
  if (!res.ok) throw new Error(`the inflection file answered ${res.status}`);
  const text = await res.text();
  await writeFile(file, text);
  return text;
}

/**
 * Runs the synthesiser over the headwords and collects what it says.
 *
 * Cached like the inflection file and for the same reason: it is seven
 * minutes of somebody else's software over an unchanging input, and a re-run
 * that only wants to reshape the shards should not pay it again.
 */
async function synthesised(headwords: readonly string[], refresh: boolean): Promise<string> {
  const file = path.join(CACHE, "vabamorf.tsv");
  if (!refresh && existsSync(file)) return readFile(file, "utf8");
  const lines: string[] = [];
  await runSynthesiser(headwords, (form, lemma) => lines.push(`${form}\t${lemma}`));
  const text = `${lines.join("\n")}\n`;
  await writeFile(file, text);
  return text;
}

function runSynthesiser(headwords: readonly string[], onPair: (form: string, lemma: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ROOT, "scripts/lib/synthesize-forms.py")], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    child.on("error", reject);
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const tab = line.indexOf("\t");
      if (tab > 0) onPair(line.slice(0, tab), line.slice(tab + 1));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`the synthesiser exited with ${code}; is estnltk installed?`));
    });
    child.stdin.write(`${headwords.join("\n")}\n`);
    child.stdin.end();
  });
}

async function main() {
  const refresh = process.argv.includes("--refresh");

  // form -> headwords. A form can belong to several: `koolis` is the seesütlev
  // of `kool` and a person of `koolma`, and both are kept.
  const pairs = new Map<string, Set<string>>();
  const counts = { headwords: 0, inflectionFile: 0, vabamorf: 0 };
  const add = (form: string, lemma: string, source: keyof typeof counts) => {
    if (!WORD.test(form) || !WORD.test(lemma)) return;
    let set = pairs.get(form);
    if (!set) { set = new Set(); pairs.set(form, set); }
    if (!set.has(lemma)) { set.add(lemma); counts[source] += 1; }
  };

  // 1. The enumeration, and every headword the inflection file names.
  const headwords = new Set(
    (await readFile(WORDLIST, "utf8")).split("\n").map((l) => l.trim()).filter(Boolean),
  );

  // 2. The inflection file: `word<TAB>form,form,...`, lower-cased, because the
  //    file capitalises a proper-noun compound and the rule here is no capitals.
  const inflections = await inflectionFile(refresh);
  for (const line of inflections.split("\n").slice(1)) {
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const word = line.slice(0, tab).trim();
    if (!WORD.test(word)) continue;
    headwords.add(word);
    for (const form of line.slice(tab + 1).split(",")) {
      add(form.trim().toLowerCase(), word, "inflectionFile");
    }
  }
  const heads = [...headwords].sort((a, b) => a.localeCompare(b, "et"));
  for (const word of heads) add(word, word, "headwords");
  process.stderr.write(`${heads.length} headwords, ${pairs.size} spellings before Vabamorf\n`);

  // 3. Vabamorf over all of them.
  const vabamorf = await synthesised(heads, refresh);
  for (const line of vabamorf.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0) add(line.slice(0, tab), line.slice(tab + 1), "vabamorf");
  }
  process.stderr.write(`${pairs.size} spellings after Vabamorf\n`);

  // Shards, keyed on the folded first two letters so a folded lookup reads one
  // file. Sorted inside, one form a line, its headwords after a tab.
  const shards = new Map<string, string[]>();
  for (const form of [...pairs.keys()].sort((a, b) => a.localeCompare(b, "et"))) {
    const key = shardKey(fold(form));
    const lemmas = [...pairs.get(form)!].sort((a, b) => a.localeCompare(b, "et"));
    let lines = shards.get(key);
    if (!lines) { lines = []; shards.set(key, lines); }
    lines.push(`${form}\t${lemmas.join(",")}`);
  }
  await rm(path.join(OUT, SHARD_DIR), { recursive: true, force: true });
  await mkdir(path.join(OUT, SHARD_DIR), { recursive: true });
  for (const [key, lines] of shards) {
    await writeFile(path.join(OUT, SHARD_DIR, `${key}.tsv.gz`), gzipSync(`${lines.join("\n")}\n`, { level: 9 }));
  }

  // The game's own length, written once rather than scanned for.
  const guessable = [...pairs.keys()]
    .filter((f) => f.length === SONAD_LENGTH && !f.includes("-"))
    .sort((a, b) => a.localeCompare(b, "et"));
  await writeFile(path.join(OUT, LENGTH_FILE(SONAD_LENGTH)), gzipSync(`${guessable.join("\n")}\n`, { level: 9 }));

  const manifest = {
    builtOn: new Date().toISOString().slice(0, 10),
    sources: {
      headwords: { rows: heads.length, from: "prisma/data/wordlist.txt and the inflection file's own headwords" },
      inflectionFile: { pairs: counts.inflectionFile, from: INFLECTIONS_URL, licence: "CC BY 4.0 (EKI), CC BY-SA 4.0 (repository)" },
      vabamorf: { pairs: counts.vabamorf, from: "scripts/lib/synthesize-forms.py, guessing off", licence: "LGPL" },
    },
    spellings: pairs.size,
    pairs: [...pairs.values()].reduce((n, s) => n + s.size, 0),
    shards: shards.size,
    lengths: { [SONAD_LENGTH]: guessable.length },
  };
  await writeFile(path.join(OUT, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  const files = await readdir(path.join(OUT, SHARD_DIR));
  console.log(`Wrote ${files.length} shards, ${manifest.spellings} spellings, ${manifest.pairs} pairs; ${guessable.length} of length ${SONAD_LENGTH}.`);
}

void main();
