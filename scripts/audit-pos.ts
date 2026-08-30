/**
 * Checks the built dictionary's parts of speech against Wiktionary again.
 *
 * The sibling of `audit-glosses.ts`, and it exists for the same reason: both
 * facts come off the same definition line, so a fault in how one is read is
 * invisible in the output. Every label this could get wrong is a real part of
 * speech spelled correctly, and an Estonian adjective declines exactly like a
 * noun, so nothing on any screen looks broken. A sample will not find it
 * either, because the faults are not spread evenly: they are every word that
 * happens to be listed in two of Wiktionary's categories.
 *
 * The first run found 78 adjectives and 8 adverbs shipped as NOUN, among them
 * `kallis`, `valge`, `sinine`, `noor`, `tark`, `vana` and `magus`.
 *
 *   npx tsx scripts/audit-pos.ts              # report, change nothing
 *   npx tsx scripts/audit-pos.ts --write      # apply the corrections
 *   npx tsx scripts/audit-pos.ts --cefr A1,A2,B1
 *
 * It shares `audit-glosses.ts`'s page cache, so whichever runs second is free.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { extractEstonianEntries } from "../lib/dict/wiktionary";
import { resolvePos } from "../lib/dict/pos";
import type { ExpandedEntry } from "./expand-seed";

const OUT = "prisma/data/expanded.json";
const CORRECTIONS = "prisma/data/pos-corrections.json";
const CACHE = "prisma/data/.cache/audit-pages.json";
const UA = "Kodukeel/0.1 (Estonian learning tool; part-of-speech audit)";
const BATCH = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A label this build corrected, so an already-seeded database can be brought along. */
export interface PosCorrection {
  lemma: string;
  from: string;
  to: string;
}

function readCache(): Record<string, string> {
  if (!existsSync(CACHE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Wikitext for many pages at once. Same endpoint and pacing as the gloss audit. */
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
      // Falls through to the backoff, as in the gloss audit.
    }
    await sleep(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw new Error(`Wiktionary would not answer for ${titles.length} pages starting "${titles[0]}"`);
}

function readCorrections(): PosCorrection[] {
  if (!existsSync(CORRECTIONS)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(CORRECTIONS, "utf8"));
    return Array.isArray(parsed) ? (parsed as PosCorrection[]) : [];
  } catch {
    return [];
  }
}

async function main() {
  const write = process.argv.includes("--write");
  const cefrArg = process.argv.indexOf("--cefr");
  const levels = cefrArg > 0 ? new Set(process.argv[cefrArg + 1]?.split(",")) : null;

  const entries = JSON.parse(readFileSync(OUT, "utf8")) as ExpandedEntry[];
  const scope = entries.filter((e) => !levels || levels.has(e.cefr ?? ""));
  console.log(`${entries.length} entries, ${scope.length} in scope.`);

  const pages = readCache();
  const missing = scope.filter((e) => pages[e.lemma] === undefined).map((e) => e.lemma);
  if (missing.length) {
    console.log(`Fetching ${missing.length} pages...`);
    for (let i = 0; i < missing.length; i += BATCH) {
      Object.assign(pages, await fetchPages(missing.slice(i, i + BATCH)));
      mkdirSync(dirname(CACHE), { recursive: true });
      writeFileSync(CACHE, JSON.stringify(pages));
      await sleep(200);
    }
  }

  const corrected: { entry: ExpandedEntry; from: string; to: string }[] = [];
  let unheaded = 0;

  for (const entry of scope) {
    /*
      A page nobody could fetch says nothing about the entry, and a silence
      treated as an answer is the fault that cost this pipeline four fifths of
      its dictionary once already. Skipped, not relabelled.
    */
    const wikitext = pages[entry.lemma];
    if (!wikitext) continue;

    const senses = extractEstonianEntries(wikitext);
    const first = senses[0];
    if (!first) continue;

    /*
      A page whose first sense carries no heading this app has a label for
      (`Postposition`, `Numeral`, `Participle`) is counted and left alone. The
      builder had a category to fall back on and this audit does not, and
      inventing one to fill the column would be the exact move the whole
      pipeline is built to refuse.
    */
    if (!first.pos) {
      unheaded += 1;
      continue;
    }

    const next = resolvePos({
      sensePos: first.pos,
      headwordPos: first.headword,
      // The entry's own label is the only record of what Ekilex said, and it
      // is the one column Ekilex is authoritative for. A verb stays a verb.
      ekilexSaysVerb: entry.pos === "VERB",
      fallback: entry.pos,
    });
    if (next !== entry.pos) {
      corrected.push({ entry, from: entry.pos, to: next });
    }
  }

  const moves = new Map<string, number>();
  for (const c of corrected) moves.set(`${c.from} -> ${c.to}`, (moves.get(`${c.from} -> ${c.to}`) ?? 0) + 1);

  console.log(`\n${corrected.length} label${corrected.length === 1 ? "" : "s"} disagree with Wiktionary:\n`);
  for (const c of corrected) {
    console.log(
      `  ${(c.entry.cefr ?? "--").padEnd(4)} ${c.entry.lemma.padEnd(18)} ` +
      `${c.from.padEnd(10)} -> ${c.to.padEnd(10)} ${JSON.stringify(c.entry.translation)}`,
    );
  }
  console.log(`\n  ${[...moves].map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  console.log(`  ${unheaded} entr${unheaded === 1 ? "y" : "ies"} left alone: no heading this app labels.`);

  if (!write) {
    console.log("\nNothing written. Re-run with --write to apply.");
    return;
  }

  for (const c of corrected) c.entry.pos = c.to;
  writeFileSync(OUT, `${JSON.stringify(entries, null, 0)}\n`);

  /*
    The corrections are written down as well as applied, because `pos` is half
    of `Lexeme`'s conflict key. A reseed of an already-seeded database matches
    on (lemma, pos), so a corrected entry would miss the row it belongs to and
    insert a second one beside it: two `kallis` in the dictionary, one labelled
    NOUN and one ADJECTIVE. `prisma/expanded.ts` reads this file and repoints
    the existing row instead. Appended rather than replaced, so a database that
    skipped a build still finds the hop it missed.
  */
  const seen = new Set(readCorrections().map((c) => `${c.lemma}|${c.from}|${c.to}`));
  const ledger = [
    ...readCorrections(),
    ...corrected
      .map((c) => ({ lemma: c.entry.lemma, from: c.from, to: c.to }))
      .filter((c) => !seen.has(`${c.lemma}|${c.from}|${c.to}`)),
  ];
  writeFileSync(CORRECTIONS, `${JSON.stringify(ledger, null, 0)}\n`);

  console.log(`\nWrote ${entries.length} entries to ${OUT} (${corrected.length} relabelled).`);
  console.log(`Recorded ${ledger.length} correction${ledger.length === 1 ? "" : "s"} in ${CORRECTIONS}.`);
}

void main();
