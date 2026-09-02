/**
 * DOES THE GLOSS DESCRIBE THE WORD WHOSE FORMS ARE STORED BESIDE IT?
 *
 *   npx tsx scripts/audit-homonyms.ts            # every built entry
 *   npx tsx scripts/audit-homonyms.ts --write    # and apply the pins a person has made
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
 * A HOMONYM IS RESOLVED BY A PERSON OR REPORTED, NEVER GUESSED THROUGH, which
 * is the rule `scripts/harvest-ekilex.ts` arrived at for the course and the
 * reason this reports rather than repairs. Wiktionary cannot settle it on its
 * own: it is often thinner than Ekilex and 88 of the 96 disagreements are its
 * own slips on obscure words, `kasutamiset` for a partitive that is
 * `kasutamist`. Picking automatically was tried and is worse than it looks.
 * `aste` really does have two nouns and the page declares both, so the rule
 * moved a B1 entry off `aste : astme : astet`, which is the word
 * `astmevaheldus` is built on, and onto a rarer one that matched the block the
 * gloss came from. Consistent, and not what a learner wants.
 *
 * So the report names, for each disagreement, the Ekilex word whose principal
 * parts *are* the ones the page declares, and a person puts that number in
 * `prisma/data/homonym-pins.json`. `--write` re-maps a pinned entry from that
 * word exactly as `scripts/expand-seed.ts` would have mapped it, keeping the
 * English gloss and the part of speech, because those came from Wiktionary and
 * are not what was wrong.
 *
 * A repoint is a change to the whole entry, not to two strings: the forms, the
 * sentences, the CEFR level, the gradation and the Institute's own semantic
 * type all belong to whichever homonym was taken, so all of them are re-read
 * from the one that was pinned.
 *
 * Needs the network, and `--write` needs EKILEX_API_KEY. Pages are cached
 * under `prisma/data/.cache/` in the same file `npm run audit:glosses` fills,
 * so running one after the other costs Wiktionary nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { extractEstonianEntries } from "../lib/dict/wiktionary";
import { fetchEkilexDetails, searchEkilex } from "../lib/ekilex/client";
import { mapEkilexDetails } from "../lib/ekilex/mapper";
import { readExpanded, writeExpanded } from "./lib/expandedFile";

const CACHE = "prisma/data/.cache/audit-pages.json";
const PINS = "prisma/data/homonym-pins.json";
const UA = "Kodukeel/0.1 (Estonian learning tool; homonym audit)";
const BATCH = 50;

const WRITE = process.argv.includes("--write");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Entry {
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  gradation?: string;
  gradationNote?: string | null;
  government?: string | null;
  notes?: string | null;
  definition?: string | null;
  semanticTypes?: string | null;
  examples?: { et: string; en: string | null }[];
  ekilexWordId?: number;
  forms: { formType: string; value: string }[];
  [key: string]: unknown;
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
  const disagree: {
    entry: Entry; gloss: string; ours: string; theirs: string; cefr: string;
    stems: readonly [string, string];
  }[] = [];

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
        entry, gloss: entry.translation, ours, theirs, cefr: entry.cefr ?? "--", stems: first.stems,
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
  const pins = readPins();
  const candidates = await candidateIds(disagree);
  for (const row of disagree.sort((a, b) => a.cefr.localeCompare(b.cefr))) {
    const key = `${row.entry.lemma}|${row.entry.pos}`;
    console.log(`  ${row.cefr} ${row.entry.lemma.padEnd(18)} "${row.gloss.slice(0, 34)}"`);
    console.log(`       stored ${row.ours}  (Ekilex word ${row.entry.ekilexWordId ?? "?"})`);
    console.log(`       page   ${row.theirs}`);
    const candidate = candidates.get(key);
    if (pins[key]) console.log(`       pinned to ${pins[key]}`);
    else if (candidate) console.log(`       to pin the word the page describes: "${key}": ${candidate}`);
    else console.log("       no Ekilex homonym has those parts, so the page is the one that is wrong");
  }

  if (!WRITE) {
    console.log(`\nNothing written. Pins live in ${PINS}; --write applies them.`);
    return;
  }
  const applied = await applyPins(pins);
  console.log(`\nRepointed ${applied} pinned entries in ${"prisma/data/expanded.json"}.`);
}

/**
 * The pins a person has made: `lemma|pos` to the Ekilex word id to read from.
 *
 * A checked-in file rather than a flag, for the reason `pos-corrections.json`
 * is one: it is a decision somebody made about a word, and it has to survive
 * the next run of anything that rewrites the dictionary.
 */
function readPins(): Record<string, number> {
  if (!existsSync(PINS)) return {};
  return JSON.parse(readFileSync(PINS, "utf8")) as Record<string, number>;
}

/** For each disagreement, the Ekilex homonym whose parts are the page's. */
async function candidateIds(
  rows: readonly { entry: Entry; stems: readonly [string, string] }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!process.env.EKILEX_API_KEY) return out;
  for (const row of rows) {
    const hits = (await searchEkilex(row.entry.lemma)).filter((h) => h.wordValue === row.entry.lemma);
    for (const hit of hits) {
      if (hit.wordId === row.entry.ekilexWordId) continue;
      const mapped = await mappedWord(hit.wordId);
      if (!mapped) continue;
      const part = (type: string) => mapped.forms.find((f) => f.formType === type)?.value;
      const genSg = part("GEN_SG");
      const partSg = part("PART_SG");
      if (!genSg || !partSg) continue;
      if (tidy(genSg) !== tidy(row.stems[0]) || tidy(partSg) !== tidy(row.stems[1])) continue;
      out.set(`${row.entry.lemma}|${row.entry.pos}`, hit.wordId);
      break;
    }
  }
  return out;
}

const mappedWord = async (wordId: number) => {
  const details = await fetchEkilexDetails(wordId);
  return details ? mapEkilexDetails(details) : null;
};

/**
 * Re-reads every pinned entry from the word it is pinned to.
 *
 * The English gloss and the part of speech stay: they came off the Wiktionary
 * block and are not what the pin corrects. Everything else belongs to whichever
 * homonym was taken, so all of it is read again.
 */
async function applyPins(pins: Record<string, number>): Promise<number> {
  if (Object.keys(pins).length === 0) return 0;
  if (!process.env.EKILEX_API_KEY) {
    console.error("EKILEX_API_KEY is not set, so no pinned word can be read.");
    return 0;
  }
  const entries = readExpanded<Entry>();
  let applied = 0;
  for (const [i, entry] of entries.entries()) {
    const wordId = pins[`${entry.lemma}|${entry.pos}`];
    if (!wordId || entry.ekilexWordId === wordId) continue;
    const mapped = await mappedWord(wordId);
    if (!mapped) {
      console.warn(`  ! Ekilex would not answer for ${entry.lemma} (${wordId})`);
      continue;
    }
    entries[i] = {
      ...entry,
      cefr: mapped.cefr ?? entry.cefr,
      gradation: mapped.gradation,
      gradationNote: mapped.gradationNote,
      government: mapped.government,
      definition: mapped.definition,
      semanticTypes: mapped.semanticTypes,
      examples: mapped.examples.map((e) => ({ et: e.et, en: e.en ?? null })),
      ekilexWordId: mapped.ekilexWordId,
      forms: mapped.forms
        .filter((f) => f.isPrincipal)
        .map((f) => ({ formType: f.formType, value: f.value })),
    };
    applied++;
  }
  if (applied > 0) writeExpanded(entries);
  return applied;
}

void main();
