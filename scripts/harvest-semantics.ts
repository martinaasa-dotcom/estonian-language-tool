/**
 * ASKS THE INSTITUTE WHAT KIND OF THING EACH WORD IS.
 *
 *   npx tsx scripts/harvest-semantics.ts            # report what the answer would be
 *   npx tsx scripts/harvest-semantics.ts --write    # and put it in the built dictionary
 *   npx tsx scripts/harvest-semantics.ts --limit 50 # a small run, for checking
 *
 * WHY A DICTIONARY OF FORMS NEEDS A FACT ABOUT MEANING. Estonian has two sets
 * of local cases and which set a word takes is not a fact about its spelling.
 * `tuba` goes `toas`, `toast`, `tuppa`; a person or an animal goes `emal`,
 * `emalt`, `emale`, and `emasse` is not how anybody says anything. The app had
 * one rule for this, `lib/estonian/place.ts`, which reads the ending `-maa`,
 * and endings are all a spelling can tell you. So every flashcard for every
 * animate noun in the dictionary asked the wrong trio: `hobune → millesse?
 * kuhu?` wanting `hobusesse`, `koer → milles? kus?` wanting `koeras`, and a
 * learner drilled on those produces `ma annan õpetajasse` in a classroom.
 *
 * And the question word was wrong with it. A horse is a `kes`, not a `mis`, so
 * the card should read `hobune → kellega?`. `lib/estonian/cases.ts` named the
 * first three cases with both interrogatives and the other eleven with the
 * `mille-` one alone, which is right for a book and wrong for a horse.
 *
 * THE ANSWER WAS IN THE RESPONSE ALL ALONG. Ekilex records a semantic type per
 * meaning, written by the same lexicographers as the forms and the sentences:
 * `hobune` is `loom`, `õpetaja` is `in_elukutse`, `tuba` is `koht_hoone`. The
 * expansion and the course harvest both already fetch `/word/details`, and both
 * dropped this field on the floor, the way the Estonian definitions were
 * dropped before them. Nothing here is generated and nothing here is Estonian
 * this app wrote: a classifier code is stored exactly as Ekilex spells it and
 * `lib/estonian/semantics.ts` is where it is read.
 *
 * THE PRIMARY SENSE, NOT THE UNION. Ekilex answers for the whole word, senses
 * and all, and a word's later senses wander: `jõgi` carries `inimene` on a
 * metaphorical sense about a river of people, `pilv` carries `loom_putukas`,
 * and taking the union would drill a river as though it were a person. The
 * first `eki` lexeme is the Institute's own primary sense, which is the same
 * rule the gloss pipeline takes over a Wiktionary page: sense order is the
 * source's, not ours.
 *
 * ALL OF THE PRIMARY SENSE'S CODES, THOUGH, because one sense carries several
 * and the one that matters is not always first: `arst` is `esitus_tiitel` and
 * `in_elukutse`, and only the second says it is a person.
 *
 * Needs EKILEX_API_KEY and the network. Answers are cached under
 * .ekilex-cache/ as the codes alone rather than as the response: a word's
 * details run to 330KB of etymology trees and the whole dictionary would be
 * 1.8GB of cache to carry two words per entry.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readExpanded, writeExpanded } from "./lib/expandedFile";
import { primarySemanticTypes } from "../lib/ekilex/client";
import { SEMANTIC_GROUPS, semanticGroup } from "../lib/estonian/semantics";

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, ".ekilex-cache");
const BASE = "https://ekilex.ee/api";
const API_KEY = process.env.EKILEX_API_KEY ?? "";

const WRITE = process.argv.includes("--write");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

/** How many requests may be in flight against a service the Institute runs. */
const CONCURRENCY = 5;

interface Entry {
  lemma: string;
  pos: string;
  ekilexWordId?: number;
  semanticTypes?: string | null;
  [key: string]: unknown;
}

interface RawDetails {
  lexemes?: {
    datasetCode?: string;
    meaning?: { semanticTypes?: { code?: string }[] };
  }[];
}

const cacheFile = (name: string) =>
  path.join(CACHE, `${Buffer.from(name, "utf8").toString("base64url")}.json`);

async function cached<T>(name: string, fn: () => Promise<T | null>): Promise<T | null> {
  const file = cacheFile(name);
  if (existsSync(file)) {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      /* a truncated entry is a miss */
    }
  }
  const value = await fn();
  if (value !== null) await writeFile(file, JSON.stringify(value));
  return value;
}

async function call<T>(pathname: string, attempt = 0): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      headers: { "ekilex-api-key": API_KEY },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    if (attempt >= 4) {
      console.warn(`  ! giving up on ${pathname}: ${(err as Error).message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
    return call<T>(pathname, attempt + 1);
  }
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error("EKILEX_API_KEY is not set. This asks the Institute; there is no offline answer.");
    process.exit(1);
  }
  await mkdir(CACHE, { recursive: true });

  const entries = readExpanded<Entry>();
  const wanted = entries.filter((e) => e.ekilexWordId).slice(0, LIMIT);
  console.log(`Asking Ekilex about ${wanted.length.toLocaleString("en-GB")} entries.`);

  let done = 0;
  let unreachable = 0;
  const found = new Map<string, string[]>();

  const queue = [...wanted];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const entry = next;
        const codes = await cached<string[]>(`semantics-${entry.ekilexWordId}`, async () => {
          const details = await call<RawDetails>(`/word/details/${entry.ekilexWordId}`);
          return details ? primarySemanticTypes(details.lexemes) : null;
        });
        if (codes === null) unreachable++;
        else found.set(`${entry.lemma}|${entry.pos}`, codes);
        if (++done % 250 === 0) process.stderr.write(`  ${done}\n`);
      }
    }),
  );

  const groups = new Map<string, number>();
  let typed = 0;
  for (const [, codes] of found) {
    if (codes.length === 0) continue;
    typed++;
    const group = semanticGroup(codes);
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }

  console.log(
    `\n${typed.toLocaleString("en-GB")} of ${found.size.toLocaleString("en-GB")} carry a semantic `
    + `type; ${unreachable} could not be fetched.`,
  );
  for (const group of SEMANTIC_GROUPS) {
    console.log(`  ${group.padEnd(10)} ${(groups.get(group) ?? 0).toLocaleString("en-GB")}`);
  }

  if (!WRITE) {
    console.log("\nNothing written. Re-run with --write to put this in the built dictionary.");
    return;
  }

  let changed = 0;
  for (const entry of entries) {
    const codes = found.get(`${entry.lemma}|${entry.pos}`);
    if (!codes) continue;
    const value = codes.length > 0 ? codes.join(" ") : null;
    if ((entry.semanticTypes ?? null) === value) continue;
    entry.semanticTypes = value;
    changed++;
  }
  writeExpanded(entries);
  console.log(`\nWrote ${changed.toLocaleString("en-GB")} entries into ${"prisma/data/expanded.json"}.`);
}

void main();
