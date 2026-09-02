/**
 * DOES THE GLOSS DESCRIBE THE WORD WHOSE FORMS ARE STORED BESIDE IT?
 *
 *   npx tsx scripts/audit-homonyms.ts            # every built entry
 *   npx tsx scripts/audit-homonyms.ts --limit 50 # a sample
 *
 * The built dictionary is a join: Wiktionary supplies the English gloss and
 * Ekilex supplies the Estonian forms, and the two are joined on the spelling.
 * Ekilex numbers its homonyms and `scripts/expand-seed.ts` takes the first
 * exact match, which is the fault `scripts/harvest-ekilex.ts` fixed for the
 * course vocabulary and reported at length: 87 of the course's 1,185 words have
 * more than one exact match, and six came back as a different word entirely,
 * `kohus` as a court carrying the forms of a moral duty among them. The harvest
 * pins those. Nothing checked the other four thousand.
 *
 * IT IS CHECKABLE, BECAUSE THE PAGE THE GLOSS CAME OFF SAYS WHICH WORD IT IS.
 * A Wiktionary Estonian block opens with `{{et-noun|<genitive>|<partitive>}}`,
 * so the same block that supplied the gloss declares two of the three principal
 * parts. `iga` is `{{et-noun|ea|iga}}` for the noun meaning age and a
 * determiner meaning every; `kohus` carries `{{et-noun|kohtu|kohut}}` and
 * `{{et-noun|kohuse|kohust}}` on one page. Comparing those two strings with the
 * two the dictionary stores is a mechanical check on the join, from a source
 * this app already trusts for the gloss.
 *
 * WHAT IT IS NOT. It cannot say which homonym is right, only that the two
 * sources disagree about which one was taken. Wiktionary is often thinner than
 * Ekilex and a page with no headword template is silence rather than
 * disagreement, so it reports and never writes: a correction belongs in
 * `expand-seed.ts`, as a pin, in the shape the course harvest already has.
 *
 * Needs the network. Pages are cached under `prisma/data/.cache/` in the same
 * file `npm run audit:glosses` fills, so running one after the other costs
 * Wiktionary nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { extractEstonianEntries } from "../lib/dict/wiktionary";
import { readExpanded } from "./lib/expandedFile";

const CACHE = "prisma/data/.cache/audit-pages.json";
const UA = "Kodukeel/0.1 (Estonian learning tool; homonym audit)";
const BATCH = 50;

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Entry {
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  ekilexWordId?: number;
  forms: { formType: string; value: string }[];
}

function readCache(): Record<string, string> {
  if (!existsSync(CACHE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Wikitext for fifty pages at a time, which is what the query API takes. */
async function fetchPages(titles: string[]): Promise<Record<string, string>> {
  const url =
    `https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content`
    + `&rvslots=main&titles=${encodeURIComponent(titles.join("|"))}&format=json&formatversion=2`;

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
      // A public API being asked for a lot at once is ours to pace.
    }
    await sleep(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw new Error(`Wiktionary would not answer for ${titles.length} pages starting "${titles[0]}"`);
}

const NOMINAL = new Set(["NOUN", "ADJECTIVE", "PRONOUN"]);
const tidy = (word: string) => word.trim().toLocaleLowerCase("et");

async function main(): Promise<void> {
  const entries = readExpanded<Entry>();
  const scope = entries.filter((e) => NOMINAL.has(e.pos)).slice(0, LIMIT);
  console.log(`${entries.length} entries, ${scope.length} nominals in scope.`);

  const pages = readCache();
  const missing = scope.filter((e) => pages[e.lemma] === undefined).map((e) => e.lemma);
  if (missing.length > 0) {
    console.log(`Fetching ${missing.length} pages from Wiktionary...`);
    for (let i = 0; i < missing.length; i += BATCH) {
      Object.assign(pages, await fetchPages(missing.slice(i, i + BATCH)));
      if ((i / BATCH) % 10 === 0) process.stderr.write(`  ${i}\n`);
    }
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(pages));
  }

  let checked = 0;
  let silent = 0;
  const disagree: { lemma: string; gloss: string; ours: string; theirs: string; cefr: string }[] = [];

  for (const entry of scope) {
    const wikitext = pages[entry.lemma];
    if (!wikitext) { silent++; continue; }

    /*
      The block the gloss came off, which is the first sense on the page, and
      only where it declares its stems. The gloss and the stems have to come
      off one block or this is comparing two different words on purpose, which
      is the fault `resolvePos` was written for one field over.
    */
    const first = extractEstonianEntries(wikitext)[0];
    if (!first?.stems) { silent++; continue; }

    const genSg = entry.forms.find((f) => f.formType === "GEN_SG")?.value;
    const partSg = entry.forms.find((f) => f.formType === "PART_SG")?.value;
    if (!genSg || !partSg) { silent++; continue; }

    checked++;
    const ours = `${tidy(genSg)} : ${tidy(partSg)}`;
    const theirs = `${tidy(first.stems[0])} : ${tidy(first.stems[1])}`;
    if (ours !== theirs) {
      disagree.push({
        lemma: entry.lemma, gloss: entry.translation, ours, theirs, cefr: entry.cefr ?? "--",
      });
    }
  }

  console.log(
    `\nChecked ${checked.toLocaleString("en-GB")}; ${silent.toLocaleString("en-GB")} pages said `
    + "nothing about the stems, which is silence rather than agreement.",
  );
  if (disagree.length === 0) {
    console.log("Every gloss describes the word whose forms are stored beside it.");
    return;
  }
  console.log(
    `\n${disagree.length} where Wiktionary's own headword declares different principal parts `
    + "from the ones stored beside its gloss:\n",
  );
  for (const row of disagree.sort((a, b) => a.cefr.localeCompare(b.cefr))) {
    console.log(`  ${row.cefr} ${row.lemma.padEnd(18)} "${row.gloss.slice(0, 34)}"`);
    console.log(`       stored ${row.ours}`);
    console.log(`       page   ${row.theirs}`);
  }
}

void main();
