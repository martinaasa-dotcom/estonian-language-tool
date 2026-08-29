#!/usr/bin/env tsx
/**
 * Harvest the syllabus vocabulary from Ekilex.
 *
 * This is the script that lets the course be wide without anybody writing
 * Estonian. The syllabus names words and glosses them in English; every Estonian
 * character in the result comes back from Ekilex — principal parts, CEFR level,
 * verb government, and the attested sentences the gap-fill, dictation and
 * sentence-building modes are built from.
 *
 * The important property is the direction of authority. A lemma in the syllabus
 * is a *request*, not a fact: if Ekilex does not know it, or knows it with a
 * paradigm that does not match the part of speech we asked for, it is dropped
 * and reported. So a word this project has misspelled or imagined cannot reach
 * the dictionary — it can only fail to arrive, loudly. That is the mechanical
 * version of ADR-005, and it is why the vocabulary could grow by an order of
 * magnitude in one pass without a single generated form.
 *
 * Only principal parts are written. The full retrieved paradigm is deliberately
 * *not* stored: the regular cases are derived from the genitive stem at render
 * time, and a word is upgraded to its authoritative Ekilex paradigm the first
 * time somebody looks at it. Storing all of it here would be the second source
 * of truth the schema notes forbid.
 *
 *   tsx scripts/harvest-ekilex.ts            # harvest anything not cached
 *   tsx scripts/harvest-ekilex.ts --refresh  # ignore the cache, re-ask
 *   tsx scripts/harvest-ekilex.ts --only=kodu
 *
 * Needs EKILEX_API_KEY. Responses are cached under .ekilex-cache/ so a re-run
 * costs nothing and the generated file is reproducible.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { courseWords, type CourseWord } from "../lib/collections/syllabus/index";
import { formatGovernment } from "../lib/ekilex/mapper";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".ekilex-cache");
const OUT = path.join(ROOT, "prisma/data/harvested.ts");

const BASE = "https://ekilex.ee/api";
const DATASETS = "eki,mab";
const KEY = process.env.EKILEX_API_KEY;

/** Ekilex morph codes for the forms we store. Everything else is derived. */
const NOMINAL_PARTS: Record<string, string> = {
  NOM_SG: "SgN",
  GEN_SG: "SgG",
  PART_SG: "SgP",
  ILL_SG_SHORT: "SgAdt",
  PART_PL: "PlP",
  GEN_PL: "PlG",
};
const VERB_PARTS: Record<string, string> = {
  INF_MA: "Sup",
  INF_DA: "Inf",
  PRES_1SG: "IndPrSg1",
  PAST_1SG: "IndIpfSg1",
  PART_TUD: "PtsPtIps",
};

/** Sentences kept per word. Two teach, ten are a wall of text on the entry. */
const MAX_USAGES = 4;
/** A sentence longer than this is a paragraph, not an example. */
const MAX_USAGE_CHARS = 120;
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const CONCURRENCY = Number(args.find((a) => a.startsWith("--jobs="))?.slice("--jobs=".length) ?? 6);

if (!KEY) {
  console.error("EKILEX_API_KEY is not set. This script cannot invent the data it is missing.");
  process.exit(1);
}
const API_KEY: string = KEY;

interface RawForm { value?: string; morphCode?: string }
interface RawParadigm { wordClass?: string | null; forms?: RawForm[] }
interface RawWord { wordId: number; wordValue: string; lang: string; paradigms?: RawParadigm[] }
interface RawUsage { value?: string; lang?: string; public?: boolean }
interface RawLexeme {
  lexemeProficiencyLevelCode?: string | null;
  governments?: { value?: string }[];
  meaning?: { definitions?: { lang?: string; value?: string }[] };
  usages?: RawUsage[];
}
interface RawDetails { word?: RawWord; lexemes?: RawLexeme[] }
interface RawSearch { words?: RawWord[] }

/**
 * A filename for a cache key that cannot collide.
 *
 * The first version of this replaced every character outside `[A-Za-z0-9_-]`
 * with an underscore, which in a project about Estonian is precisely the wrong
 * character class to flatten: `sõda` and `süda` became the same file, as did
 * `väitma` and `võitma`, and each pair's second word silently read the first
 * one's response. The exact-match filter on `wordValue` meant the damage was
 * confined to false drops rather than wrong forms — a word was reported missing
 * from Ekilex while sitting in it — but that is luck, not design. Base64url of
 * the UTF-8 bytes is reversible and cannot collide.
 */
const cacheFile = (name: string) =>
  path.join(CACHE, `${Buffer.from(name, "utf8").toString("base64url")}.json`);

async function cached<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const file = cacheFile(name);
  if (!REFRESH && existsSync(file)) {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      /* a truncated cache entry is just a cache miss */
    }
  }
  const value = await fn();
  // Never cache a failure. `call` returns null when Ekilex was unreachable or
  // unhappy, and writing that down turns one bad minute into a permanent answer.
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
    // Ekilex is a public service run by a research institute, not a CDN. Being
    // patient with it is the whole etiquette of a bulk read.
    if (attempt >= 4) {
      console.warn(`  ! giving up on ${pathname}: ${(err as Error).message}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return call<T>(pathname, attempt + 1);
  }
}

const search = (lemma: string) =>
  cached(`search-${lemma}`, () =>
    call<RawSearch>(`/word/search/${encodeURIComponent(lemma)}/${DATASETS}`));
const details = (wordId: number) =>
  cached(`details-${wordId}`, () => call<RawDetails>(`/word/details/${wordId}`));

/** The forms of a paradigm, flattened to a morphCode to value map. */
function formMap(paradigm: RawParadigm): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of paradigm.forms ?? []) {
    // Ekilex writes "-" where a form genuinely does not exist for this word,
    // most often the short illative. That is an absence, not a value.
    if (!f.value || f.value === "-" || !f.morphCode) continue;
    if (!map.has(f.morphCode)) map.set(f.morphCode, f.value);
  }
  return map;
}

const isVerbParadigm = (p: RawParadigm) =>
  (p.wordClass ?? "").toLowerCase() === "verb" || (p.forms ?? []).some((f) => f.morphCode === "Sup");

/**
 * Picks the paradigm to read from, given what the syllabus said the word is.
 *
 * Homonyms are the reason this exists. Asking for a verb and being handed a noun
 * paradigm is a mismatch we drop rather than guess through.
 */
function pickParadigm(detail: RawDetails | null, wantVerb: boolean): RawParadigm | null {
  const paradigms = detail?.word?.paradigms ?? [];
  const matching = paradigms.filter((p) => isVerbParadigm(p) === wantVerb);
  // Prefer the paradigm carrying the most forms — a stub with three forms is a
  // lexicographic placeholder, not a usable paradigm.
  const sorted = [...matching].sort((a, b) => (b.forms?.length ?? 0) - (a.forms?.length ?? 0));
  return sorted[0] ?? null;
}

function extractLexemeData(detail: RawDetails | null) {
  const cefrCodes: string[] = [];
  const governments: string[] = [];
  const usages: string[] = [];
  const definitions: string[] = [];
  for (const lx of detail?.lexemes ?? []) {
    if (lx.lexemeProficiencyLevelCode) cefrCodes.push(lx.lexemeProficiencyLevelCode);
    for (const g of lx.governments ?? []) {
      if (g.value && !governments.includes(g.value)) governments.push(g.value);
    }
    for (const d of lx.meaning?.definitions ?? []) {
      if (d.lang === "est" && d.value && !definitions.includes(d.value)) definitions.push(d.value);
    }
    for (const u of lx.usages ?? []) {
      // `public: false` is Ekilex's own flag for editorial working material.
      // It is not ours to display.
      if (u.lang !== "est" || u.public === false) continue;
      const value = (u.value ?? "").trim();
      if (!value || value.length > MAX_USAGE_CHARS) continue;
      if (!usages.includes(value)) usages.push(value);
    }
  }
  // The lowest level any sense carries: a word is as easy as its easiest
  // meaning, which is the one a course introduces first.
  const graded = cefrCodes
    .filter((c) => CEFR_ORDER.includes(c))
    .sort((a, b) => CEFR_ORDER.indexOf(a) - CEFR_ORDER.indexOf(b));
  return {
    cefr: graded[0] ?? null,
    governments,
    usages: usages.slice(0, MAX_USAGES),
    definition: definitions[0] ?? null,
  };
}

interface Harvested {
  lemma: string;
  gloss: string;
  pos: string;
  ekilexWordId: number;
  parts: Record<string, string>;
  cefr: string | null;
  government: string | null;
  usages: string[];
  note: string | null;
}
interface Dropped { lemma: string; gloss: string; pos: string; error: string }

async function harvestWord(word: CourseWord): Promise<Harvested | Dropped> {
  const { lemma, gloss, pos } = word;
  const wantVerb = pos === "VERB";
  const found = await search(lemma);
  const candidates = (found?.words ?? []).filter((w) => w.lang === "est" && w.wordValue === lemma);
  if (candidates.length === 0) return { lemma, gloss, pos, error: "not in Ekilex" };

  // An Estonian adverb does not inflect, so demanding a paradigm of one would
  // drop every single connective in the course. Existing in Ekilex is the whole
  // check that matters here: it is still the authority deciding the word is real,
  // and there are no forms to get wrong.
  if (pos === "ADVERB") {
    const first = candidates[0];
    if (!first) return { lemma, gloss, pos, error: "not in Ekilex" };
    const detail = await details(first.wordId);
    const extra = extractLexemeData(detail);
    return {
      lemma, gloss, pos,
      ekilexWordId: first.wordId,
      parts: {},
      cefr: extra.cefr,
      government: null,
      usages: extra.usages,
      note: extra.definition,
    };
  }

  for (const candidate of candidates) {
    const detail = await details(candidate.wordId);
    const paradigm = pickParadigm(detail, wantVerb);
    if (!paradigm) continue;

    const forms = formMap(paradigm);
    const wanted = wantVerb ? VERB_PARTS : NOMINAL_PARTS;
    const parts: Record<string, string> = {};
    for (const [formType, code] of Object.entries(wanted)) {
      const value = forms.get(code);
      if (value) parts[formType] = value;
    }
    // The forms that make a word teachable at all. Without them the paradigm
    // cannot be derived, so the word is dropped rather than half-added.
    const required = wantVerb
      ? ["INF_MA", "INF_DA", "PRES_1SG", "PAST_1SG"]
      : ["NOM_SG", "GEN_SG", "PART_SG"];
    if (required.some((r) => !parts[r])) continue;

    const extra = extractLexemeData(detail);
    return {
      lemma, gloss, pos,
      ekilexWordId: candidate.wordId,
      parts,
      cefr: extra.cefr,
      government: wantVerb ? formatGovernment(extra.governments) : null,
      usages: extra.usages,
      note: extra.definition,
    };
  }
  return { lemma, gloss, pos, error: wantVerb ? "no verb paradigm" : "no nominal paradigm" };
}

/** Runs `worker` over `items` with a fixed number of workers in flight. */
async function pool<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      const item = items[i];
      if (item === undefined) return;
      results[i] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

const q = (s: string) => JSON.stringify(s);

function render(rows: readonly Harvested[]): string {
  const head = `/**
 * GENERATED by scripts/harvest-ekilex.ts. Do not edit by hand.
 *
 * Every Estonian character in this file came back from Ekilex, the Institute of
 * the Estonian Language's lexicographic database: principal parts, CEFR level,
 * verb government, and example sentences a lexicographer recorded. The English
 * glosses are the only authored column, and English is the one language this
 * project is allowed to write (ADR-005).
 *
 * Only principal parts are stored. The regular cases are derived from the
 * genitive stem at render time, and the full paradigm is fetched from Ekilex the
 * first time a word is viewed — storing it here would be a second source of
 * truth that goes stale.
 *
 * ${rows.length} words, harvested ${new Date().toISOString().slice(0, 10)}.
 */

export interface HarvestedWord {
  lemma: string;
  /** English gloss. Authored, because Ekilex has no English on a reader key. */
  gloss: string;
  pos: "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB";
  /** Ekilex's own proficiency level, where it records one. */
  cefr: string | null;
  ekilexWordId: number;
  /** Principal parts by formType. Unpredictable forms only. */
  parts: Record<string, string>;
  /** The case the verb demands of its complement, as Ekilex words it. */
  government: string | null;
  /** Attested sentences. Never generated, only ever hidden or reordered. */
  usages: string[];
  /** Ekilex's Estonian explanatory definition, where it has one. */
  note: string | null;
}

export const HARVESTED: readonly HarvestedWord[] = [
`;
  const body = rows.map((r) => {
    const parts = Object.entries(r.parts).map(([k, v]) => `${k}: ${q(v)}`).join(", ");
    const usages = r.usages.map(q).join(", ");
    return [
      "  {",
      `    lemma: ${q(r.lemma)}, gloss: ${q(r.gloss)}, pos: ${q(r.pos)}, cefr: ${r.cefr ? q(r.cefr) : "null"},`,
      `    ekilexWordId: ${r.ekilexWordId},`,
      `    parts: { ${parts} },`,
      `    government: ${r.government ? q(r.government) : "null"},`,
      `    usages: [${usages}],`,
      `    note: ${r.note ? q(r.note) : "null"},`,
      "  },",
    ].join("\n");
  }).join("\n");
  return `${head}${body}\n];\n`;
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  // Phrases are the one part of speech that is not a headword, so Ekilex has no
  // paradigm for them. They stay in the hand-checked built-in list.
  let requests = courseWords().filter((w) => w.pos !== "PHRASE");
  if (ONLY) requests = requests.filter((w) => w.units.includes(ONLY));

  console.log(`Harvesting ${requests.length} words from Ekilex with ${CONCURRENCY} workers…`);
  let done = 0;
  const results = await pool(requests, CONCURRENCY, async (req) => {
    const out = await harvestWord(req);
    done += 1;
    if (done % 50 === 0) console.log(`  … ${done}/${requests.length}`);
    return out;
  });

  const ok = results.filter((r): r is Harvested => !("error" in r));
  const failed = results.filter((r): r is Dropped => "error" in r);

  ok.sort((a, b) => a.lemma.localeCompare(b.lemma, "et"));
  await writeFile(OUT, render(ok));

  const withUsages = ok.filter((r) => r.usages.length > 0).length;
  const withCefr = ok.filter((r) => r.cefr).length;
  console.log(`\nWrote ${ok.length} words to ${path.relative(ROOT, OUT)}`);
  console.log(`  ${withUsages} carry at least one attested sentence`);
  console.log(`  ${withCefr} carry an Ekilex CEFR level`);
  if (failed.length > 0) {
    console.log(`\n${failed.length} dropped — Ekilex does not have them as asked:`);
    for (const f of failed) console.log(`  ${f.lemma} (${f.pos}): ${f.error}`);
  }
  await writeFile(path.join(CACHE, "dropped.json"), JSON.stringify(failed, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
