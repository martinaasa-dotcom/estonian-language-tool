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
 * is a *request*, not a fact: if Ekilex does not know it, or knows it with
 * forms that do not match the part of speech we asked for, it is dropped
 * and reported. So a word this project has misspelled or imagined cannot reach
 * the dictionary — it can only fail to arrive, loudly. That is the mechanical
 * version of ADR-005, and it is why the vocabulary could grow by an order of
 * magnitude in one pass without a single generated form.
 *
 * Only principal parts are written. Everything else Ekilex returns is deliberately
 * *not* stored: the regular cases are derived from the genitive stem at render
 * time, and a word is upgraded to its authoritative Ekilex forms the first
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
import { RETIRED_WORDS } from "../lib/collections/syllabus/retired";
import { inferPos } from "../lib/collections/syllabus/types";
import { primarySemanticTypes } from "../lib/ekilex/client";
import { formatGovernment } from "../lib/ekilex/mapper";
import { unreachableSlots } from "../lib/estonian/conjugate";
import { unreachableCaseForms } from "../lib/estonian/derive";

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
  NOM_PL: "PlN",
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
/** Equivalents per language: two is what a card has room for. */
const MAX_EQUIVALENTS = 2;
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
/** One set of forms, as Ekilex groups them. Their JSON's own key is `paradigms`. */
interface RawFormSet { wordClass?: string | null; forms?: RawForm[] }
interface RawWord { wordId: number; wordValue: string; lang: string; paradigms?: RawFormSet[] }
interface RawUsage { value?: string; lang?: string; public?: boolean }
interface RawLexeme {
  datasetCode?: string;
  lexemeProficiencyLevelCode?: string | null;
  governments?: { value?: string }[];
  /** Ekilex's own word class: `s`, `v`, `adj`, `adv`, `konj`, `pron`, `prep`. */
  pos?: { code?: string }[];
  meaning?: {
    definitions?: { lang?: string; value?: string }[];
    semanticTypes?: { code?: string }[];
  };
  usages?: RawUsage[];
  /** Ekilex's equivalents in other languages, which is where rus and ukr live. */
  synonymLangGroups?: {
    lang?: string;
    synonyms?: { type?: string; words?: { wordValue?: string }[] }[];
  }[];
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

/** One set of forms, flattened to a morphCode to value map. */
function formMap(formSet: RawFormSet): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of formSet.forms ?? []) {
    // Ekilex writes "-" where a form genuinely does not exist for this word,
    // most often the short illative. That is an absence, not a value.
    if (!f.value || f.value === "-" || !f.morphCode) continue;
    if (!map.has(f.morphCode)) map.set(f.morphCode, f.value);
  }
  return map;
}

/**
 * The same, keeping every value rather than the first.
 *
 * Estonian has genuine parallel forms and a principal part wants one of them,
 * so `formMap` taking the first is right for what it is used for. It is wrong
 * for the question below, which is what the dictionary has to store because no
 * rule reaches it: Ekilex records the allative of `mina` as `minule` and
 * `mulle` under one code, and the second is the one anybody says.
 */
function allForms(formSet: RawFormSet): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of formSet.forms ?? []) {
    if (!f.value || f.value === "-" || !f.morphCode) continue;
    const seen = map.get(f.morphCode) ?? [];
    if (!seen.includes(f.value)) seen.push(f.value);
    map.set(f.morphCode, seen);
  }
  return map;
}

const isVerbFormSet = (p: RawFormSet) =>
  (p.wordClass ?? "").toLowerCase() === "verb" || (p.forms ?? []).some((f) => f.morphCode === "Sup");

/**
 * Picks the set of forms to read from, given what the syllabus said the word is.
 *
 * Homonyms are the reason this exists. Asking for a verb and being handed a noun's
 * forms is a mismatch we drop rather than guess through.
 */
function pickFormSet(detail: RawDetails | null, wantVerb: boolean): RawFormSet | null {
  const sets = detail?.word?.paradigms ?? [];
  const matching = sets.filter((p) => isVerbFormSet(p) === wantVerb);
  // Prefer the set carrying the most forms — a stub with three forms is a
  // lexicographic placeholder, not a usable set.
  const sorted = [...matching].sort((a, b) => (b.forms?.length ?? 0) - (a.forms?.length ?? 0));
  return sorted[0] ?? null;
}

function extractLexemeData(detail: RawDetails | null) {
  const cefrCodes: string[] = [];
  const posCodes: string[] = [];
  const governments: string[] = [];
  const usages: string[] = [];
  const definitions: string[] = [];
  const rus: string[] = [];
  const ukr: string[] = [];
  for (const lx of detail?.lexemes ?? []) {
    if (lx.lexemeProficiencyLevelCode) cefrCodes.push(lx.lexemeProficiencyLevelCode);
    /*
      WHAT EKILEX CALLS IT, KEPT BESIDE WHAT THIS COURSE CALLS IT.

      The course has six parts of speech and Ekilex has more, so `ja` is
      `konj` there and `ADVERB` here, which is what this course already calls
      an uninflecting function word. That coarser label is deliberate: `pos` is
      half the key `Lexeme` is unique on, so adding one is a migration rather
      than a rename (docs/13-mvp-status.md §22 is the story of the last time
      twelve words ended up in the dictionary twice over a label).

      What was wrong was not the label, it was that the source's own label was
      thrown away, so nothing could tell a deliberate coarsening from a
      mistake. Recording it costs nothing, it is in the response already, and
      `npm run audit:senses` reads it to report where the two disagree in a way
      no coarsening explains.
    */
    for (const p of lx.pos ?? []) {
      if (p.code && !posCodes.includes(p.code)) posCodes.push(p.code);
    }
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
    /*
      THE INSTITUTE'S OWN RUSSIAN AND UKRAINIAN, FROM THE RESPONSE WE ALREADY
      HAVE.

      Most people learning Estonian in Estonia already speak one of these, and
      an app that can only say `kohv` is "coffee" is asking them to go through
      a third language to reach a word their own would have landed instantly.
      Ekilex records the equivalents right here, written by the lexicographers
      who wrote the Estonian, in the same cached response the forms come from:
      1,965 of the 1,975 entries in the cache carry a Russian one and 1,755 a
      Ukrainian one, so this costs no request at all.

      `MEANING_WORD` only: the other synonym kinds are relations between
      meanings rather than the word that is this meaning. `wordValue` rather
      than `wordValuePrese`, which carries Ekilex's `<eki-stress>` markup for a
      rendering this app does not do.
    */
    for (const group of lx.synonymLangGroups ?? []) {
      const into = group.lang === "rus" ? rus : group.lang === "ukr" ? ukr : null;
      if (!into) continue;
      for (const synonym of group.synonyms ?? []) {
        if (synonym.type !== "MEANING_WORD") continue;
        for (const word of synonym.words ?? []) {
          const value = (word.wordValue ?? "").trim();
          if (value && !into.includes(value)) into.push(value);
        }
      }
    }
  }
  // The lowest level any sense carries: a word is as easy as its easiest
  // meaning, which is the one a course introduces first.
  const graded = cefrCodes
    .filter((c) => CEFR_ORDER.includes(c))
    .sort((a, b) => CEFR_ORDER.indexOf(a) - CEFR_ORDER.indexOf(b));
  return {
    cefr: graded[0] ?? null,
    ekilexPos: posCodes,
    governments,
    usages: usages.slice(0, MAX_USAGES),
    definition: definitions[0] ?? null,
    /*
      What kind of thing the word is, as the Institute classified it, and the
      one field in this response the harvest used to throw away that a card
      depends on. Estonian picks between two whole sets of local cases on it,
      so without it `hobune` was drilled as `hobusesse` and `õpetaja` as
      `õpetajasse`. `primarySemanticTypes` is in the client rather than here,
      because two scripts and the live lookup read the same field off their own
      cached copies of this response.
    */
    semanticTypes: primarySemanticTypes(detail?.lexemes),
    // Two at most, which is what a card has room for and is where a third
    // stops adding meaning and starts being a list.
    rus: rus.slice(0, MAX_EQUIVALENTS),
    ukr: ukr.slice(0, MAX_EQUIVALENTS),
  };
}

interface Harvested {
  lemma: string;
  gloss: string;
  pos: string;
  ekilexWordId: number;
  /** What Ekilex calls it, beside what this course calls it. See HarvestedWord. */
  ekilexPos: string[];
  parts: Record<string, string>;
  /** Whole forms Ekilex recorded that no rule reaches. See HarvestedWord. */
  extraForms: { code: string; value: string }[];
  cefr: string | null;
  government: string | null;
  usages: string[];
  note: string | null;
  /** The Institute's semantic type codes for the word's primary sense. */
  semanticTypes: string[];
  /** Ekilex's own equivalents in the other two languages of the country. */
  rus: string[];
  ukr: string[];
}
interface Dropped { lemma: string; gloss: string; pos: string; error: string }

/**
 * Lemmas Ekilex spells more than one way, collected as the run goes.
 *
 * Printed at the end so a person reads the list once and pins what matters in
 * `WordSpec`'s fourth slot. Six of these were the wrong word for a year.
 */
const AMBIGUOUS: { lemma: string; gloss: string; took: number; rivals: number[] }[] = [];

async function harvestWord(word: CourseWord): Promise<Harvested | Dropped> {
  const { lemma, gloss, pos } = word;
  const wantVerb = pos === "VERB";
  const found = await search(lemma);
  const all = (found?.words ?? []).filter((w) => w.lang === "est" && w.wordValue === lemma);
  if (all.length === 0) return { lemma, gloss, pos, error: "not in Ekilex" };

  /*
    A HOMONYM IS RESOLVED BY A PERSON OR REPORTED, NEVER GUESSED THROUGH.

    The loop below took the first candidate whose forms fit and returned, and
    never looked at the next one. 87 of the course's 1,185 words have more
    than one exact match in Ekilex, and six came back as a different word:
    `kohus` with the forms and sentences of moral duty rather than a court,
    `kaste` as dew rather than sauce, `iga` as age rather than every, and
    `pidama`, the A1 verb for must, with the past of the verb for keeping a
    farm, so the conjugation card answered `pidasin` and marked `pidin` wrong.
    The script's own header promises a mismatch is "dropped rather than
    guessed through"; this was the one place it was guessed through.

    A pin in the syllabus (`WordSpec`'s fourth slot) picks one. Without a pin,
    a lemma whose homonyms both carry usable forms is dropped and printed in
    the report beside "not in Ekilex", which is the same honest shape.
  */
  const pinned = word.ekilexWordId
    ? all.filter((w) => w.wordId === word.ekilexWordId)
    : all;
  if (word.ekilexWordId && pinned.length === 0) {
    return { lemma, gloss, pos, error: `pinned Ekilex word ${word.ekilexWordId} is not a match for this lemma` };
  }
  const candidates = pinned;

  // An Estonian adverb does not inflect, so demanding a set of forms for one would
  // drop every single connective in the course. Existing in Ekilex is the whole
  // check that matters here: it is still the authority deciding the word is real,
  // and there are no forms to get wrong.
  if (pos === "ADVERB" || (pos === "PRONOUN" && !hasSingular(await details(candidates[0]!.wordId)))) {
    /*
      A pronoun with no singular, `meie` and `nemad`, has no principal parts in
      the sense the seed stores them, so it is kept the way an adverb is: real
      because Ekilex has it, with its sentences and level, and no forms to get
      wrong. Its case table arrives with the first enrichment.

      WHAT IT DOES NOT ARRIVE WITHOUT ANY MORE IS ITS FORMS. Ekilex records a
      full set of plural forms for these words, `meie` beside `me`, `nemad` beside
      `nad`, `nendel` beside `neil`, and the seed threw all of it away because
      the shape it stores is built round a singular. Nothing derives any of it:
      there is no genitive stem to put an ending on, so the rule reaches
      exactly none of these and the test the other branch applies would keep
      every one. `me`, `te`, `nad` and `neil` are among the commonest words in
      the attested corpus that this dictionary could not vouch for, which is
      how they were found. An adverb has no forms at all and so stores
      nothing, which is the same rule giving the right answer twice.
    */
    const first = candidates[0];
    if (!first) return { lemma, gloss, pos, error: "not in Ekilex" };

    /*
      AND A FORMLESS WORD IS AS AMBIGUOUS AS ANY OTHER.

      The rule three blocks up is that a homonym is resolved by a person or
      reported, never guessed through, and it was enforced on exactly one path.
      This one returned before reaching it, so an adverb or a formless pronoun
      with several Ekilex entries took the first in silence: the same fault
      `kohus` had for a year, left open on the path that has no forms to notice
      it with. Six of the thirty words in the two connective units needed a pin
      and every one of them was found by hand, which is not a method.

      There is no form set to test a rival against here, which is why this
      cannot filter the way the other path does. Every other entry for the
      lemma is a rival, and saying so is the whole job: `siin` is also a steel
      rail a curtain runs along, `liiga` is also a sports league, and `aga` is
      also a noun and a district in Russia.
    */
    if (!word.ekilexWordId && candidates.length > 1) {
      AMBIGUOUS.push({
        lemma, gloss,
        took: first.wordId,
        rivals: candidates.filter((c) => c.wordId !== first.wordId).map((c) => c.wordId),
      });
    }

    const detail = await details(first.wordId);
    const extra = extractLexemeData(detail);
    const formless = pickFormSet(detail, false);
    return {
      lemma, gloss, pos,
      ekilexWordId: first.wordId,
      ekilexPos: extra.ekilexPos,
      parts: {},
      extraForms: formless
        ? [...allForms(formless)]
          // An indeclinable word's one recorded form is itself, under Ekilex's
          // `ID` code. Storing it says nothing the lemma did not already say.
          .filter(([, values]) => values.some((v) => v !== lemma))
          .flatMap(([code, values]) => values.map((value) => ({ code, value })))
        : [],
      cefr: extra.cefr,
      government: null,
      usages: extra.usages,
      note: extra.definition,
      semanticTypes: extra.semanticTypes,
      rus: extra.rus,
      ukr: extra.ukr,
    };
  }

  for (const candidate of candidates) {
    const detail = await details(candidate.wordId);
    const formSet = pickFormSet(detail, wantVerb);
    if (!formSet) continue;

    const forms = formMap(formSet);
    const wanted = wantVerb ? VERB_PARTS : NOMINAL_PARTS;
    const parts: Record<string, string> = {};
    for (const [formType, code] of Object.entries(wanted)) {
      const value = forms.get(code);
      if (value) parts[formType] = value;
    }
    // The forms that make a word teachable at all. Without them the rest
    // cannot be derived, so the word is dropped rather than half-added.
    const required = wantVerb
      ? ["INF_MA", "INF_DA", "PRES_1SG", "PAST_1SG"]
      : ["NOM_SG", "GEN_SG", "PART_SG"];
    if (required.some((r) => !parts[r])) continue;

    /*
      AND THE FORMS NO RULE REACHES, WHICH THE DICTIONARY HAS TO HOLD.

      ADR-005 amendment 1 lets a deterministic rule build a form off a stored
      one, and the rules are real: ten case endings on a genitive stem, six
      persons on a stored first person. What they are not is complete, and a
      deployment without an Ekilex key has nothing else. `olema` showed `olen`
      and stopped, so the commonest verb in the language could not answer
      `olevik · ta`; no verb at all could answer `lihtminevik · ta`, because
      the simple past is not derivable and may not be; and every pronoun's
      short case forms, which is what an Estonian sentence is actually made of,
      were absent, so the pronoun unit shipped with no case cards rather than
      teach `minule` and mark `mulle` wrong.

      The rules are asked which slots they miss rather than told: a list of
      exceptions kept beside the exceptions is two copies of one fact, and this
      one would go stale silently. Stored under `EKILEX:<code>`, which is the
      spelling `conjugatedForms`, `stemsFrom` and `conjugationAnswer` already
      read for a form the seed retrieved, so nothing downstream had to learn a
      new shape.

      They stay `isPrincipal` on the way into the database, which the seed
      decides and this only has to not break: `runEnrich` reads a non-principal
      form as "this entry has been enriched", so a seed writing one would strand
      every reseeded word half-upgraded. See the note on `runEnrich`.
    */
    const recorded = allForms(formSet);
    const extraForms: { code: string; value: string }[] = [];
    // A form the entry can already say is not worth a second row: `olema`
    // reports its whole present as unreachable, first person included, and the
    // first person is `PRES_1SG` sitting in `parts`.
    const held = new Set([lemma, ...Object.values(parts)]);
    if (wantVerb) {
      for (const code of unreachableSlots({ lemma: word.lemma, pres1sg: parts.PRES_1SG })) {
        /*
          Every value, not the first. A verb slot has parallel forms exactly as
          a case does: Ekilex records the polite imperative of `ütlema` as
          `ütelge` and `öelge`, both are Estonian, and keeping one of them is
          the fault the illative taught this project.
        */
        for (const value of recorded.get(code) ?? []) {
          if (!held.has(value)) extraForms.push({ code, value });
        }
      }
      /*
        `pole`. A negative with a stem of its own rather than `ei` plus the
        verb's, and one word in the whole course has one, which is why it is
        named here rather than derived from anything: Ekilex records `IndPrPsN`
        for `olema` and for nothing else the syllabus asks about.
      */
      const negative = recorded.get("IndPrPsN")?.[0];
      if (negative) extraForms.push({ code: "IndPrPsN", value: negative });
    } else {
      for (const [code, values] of Object.entries(unreachableCaseForms(lemma, parts, recorded))) {
        for (const value of values) extraForms.push({ code, value });
      }
    }

    /*
      UNPINNED AND AMBIGUOUS IS REPORTED, LOUDLY, AND STILL HARVESTED.

      Dropping it was the first answer and it is the wrong one: 87 course
      words have more than one exact match, the first homonym is right for
      about eighty of them, and dropping the lot would take a fifth of an
      A1 unit out of the dictionary to fix six words. So the first usable
      homonym is still taken, and every lemma where that was a choice is
      printed at the end of the run for a person to pin or wave through.
      The number beside it is what goes in the syllabus.
    */
    if (!word.ekilexWordId && candidates.length > 1) {
      const rivals: number[] = [];
      for (const other of candidates) {
        if (other.wordId === candidate.wordId) continue;
        if (pickFormSet(await details(other.wordId), wantVerb)) rivals.push(other.wordId);
      }
      if (rivals.length > 0) {
        AMBIGUOUS.push({ lemma, gloss, took: candidate.wordId, rivals });
      }
    }

    const extra = extractLexemeData(detail);
    return {
      lemma, gloss, pos,
      ekilexWordId: candidate.wordId,
      ekilexPos: extra.ekilexPos,
      parts,
      extraForms,
      cefr: extra.cefr,
      government: wantVerb ? formatGovernment(extra.governments) : null,
      usages: extra.usages,
      note: extra.definition,
      semanticTypes: extra.semanticTypes,
      rus: extra.rus,
      ukr: extra.ukr,
    };
  }
  return { lemma, gloss, pos, error: wantVerb ? "no verb forms" : "no nominal forms" };
}

/** True when a nominal form set carries a nominative singular. */
function hasSingular(detail: RawDetails | null): boolean {
  const set = pickFormSet(detail, false);
  return set !== null && formMap(set).has("SgN");
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
 * genitive stem at render time, and every other form is fetched from Ekilex the
 * first time a word is viewed — storing it here would be a second source of
 * truth that goes stale.
 *
 * ${rows.length} words, harvested ${new Date().toISOString().slice(0, 10)}.
 */

export interface HarvestedWord {
  lemma: string;
  /** English gloss. Authored, because Ekilex has no English on a reader key. */
  gloss: string;
  pos: "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB" | "PRONOUN";
  /** Ekilex's own proficiency level, where it records one. */
  cefr: string | null;
  ekilexWordId: number;
  /**
   * What Ekilex calls this word: s, v, adj, adv, konj, pron.
   *
   * Kept beside pos, which is this course's coarser label, because a
   * coarsening you can see is a decision and one you cannot is a mistake.
   * A conjunction is konj to Ekilex and ADVERB here, which is what this course
   * already calls an uninflecting function word. npm run audit:senses reads
   * the pair and reports a disagreement no coarsening explains.
   */
  ekilexPos: string[];
  /** Principal parts by formType. Unpredictable forms only. */
  parts: Record<string, string>;
  /**
   * Whole forms a lexicographer recorded that no rule of this app reaches.
   *
   * Beside parts rather than inside it, because a case can have two of them
   * and a Record can hold one: Ekilex gives the allative of mina as minule
   * and mulle, and Form's own unique key is (lexeme, formType, value) for
   * exactly that reason. The seed writes each as EKILEX:code, which is the
   * spelling the app already reads for a retrieved form.
   *
   * What is in here is decided by asking the rules what they miss, never by a
   * list: unreachableSlots for a verb and unreachableCaseForms for a nominal.
   * So it is the simple past third person for every verb, the present of
   * olema, the imperative of minema, pole, and the short forms of every
   * pronoun and numeral. A regular noun has none.
   */
  extraForms: { code: string; value: string }[];
  /** The case the verb demands of its complement, as Ekilex words it. */
  government: string | null;
  /** Attested sentences. Never generated, only ever hidden or reordered. */
  usages: string[];
  /** Ekilex's Estonian explanatory definition, where it has one. */
  note: string | null;
  /**
   * The Institute's semantic type codes for the word's primary sense.
   *
   * A horse is loom, a teacher is in_elukutse, a room is koht_hoone. Estonian
   * chooses between two whole sets of local cases on this and nothing in a
   * word's spelling carries it, so it is what stops a flashcard asking for the
   * illative of an animal. Read only by lib/estonian/semantics.ts.
   */
  semanticTypes: string[];
  /**
   * The Institute's own Russian and Ukrainian equivalents.
   *
   * Not a translation this app made and not one a model made: they come from
   * the same Ekilex response as the forms and the sentences, written by the
   * same lexicographers. Most people learning Estonian in Estonia already
   * speak one of these languages.
   */
  rus: string[];
  ukr: string[];
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
      `    ekilexPos: [${r.ekilexPos.map(q).join(", ")}],`,
      `    parts: { ${parts} },`,
      `    extraForms: [${r.extraForms.map((f) => `{ code: ${q(f.code)}, value: ${q(f.value)} }`).join(", ")}],`,
      `    government: ${r.government ? q(r.government) : "null"},`,
      `    usages: [${usages}],`,
      `    note: ${r.note ? q(r.note) : "null"},`,
      `    semanticTypes: [${r.semanticTypes.map(q).join(", ")}],`,
      `    rus: [${r.rus.map(q).join(", ")}], ukr: [${r.ukr.map(q).join(", ")}],`,
      "  },",
    ].join("\n");
  }).join("\n");
  return `${head}${body}\n];\n`;
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  // Phrases are the one part of speech that is not a headword, so Ekilex has no
  // forms for them. They stay in the hand-checked built-in list.
  let requests = courseWords().filter((w) => w.pos !== "PHRASE");
  if (ONLY) {
    requests = requests.filter((w) => w.units.includes(ONLY));
  } else {
    /*
      The vocabulary of the units that were cut, kept in the dictionary on
      purpose (docs/13-mvp-status.md §19). Not in any unit, so it carries no
      introducing unit and counts at the top of the course; the syllabus
      never lists it and no card is built from it unasked.
    */
    const named = new Set(requests.map((w) => `${w.lemma}|${w.pos}`));
    for (const w of RETIRED_WORDS) {
      const pos = inferPos(w[0], w[2]);
      if (named.has(`${w[0]}|${pos}`)) continue;
      requests.push({ lemma: w[0], gloss: w[1], pos, unitId: "", level: "C1", units: [] });
    }
  }

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

  if (AMBIGUOUS.length > 0) {
    AMBIGUOUS.sort((a, b) => a.lemma.localeCompare(b.lemma, "et"));
    console.log(`\n${AMBIGUOUS.length} lemmas have more than one Ekilex word with usable forms.`);
    console.log("The first was taken. Pin one with the fourth slot of the word spec where it matters:");
    for (const a of AMBIGUOUS) {
      console.log(`  ${a.lemma} ("${a.gloss}") took ${a.took}, also ${a.rivals.join(", ")}`);
    }
  }

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
