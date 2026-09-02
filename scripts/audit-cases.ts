/**
 * Checks the case forms this app derives against the ones Ekilex records.
 *
 *   npx tsx scripts/audit-cases.ts             # every nominal in the built dictionary
 *   npx tsx scripts/audit-cases.ts --limit 50  # a sample
 *   npx tsx scripts/audit-cases.ts --write     # and fill in the missing NOM_PL
 *
 * THE VERBS HAD THIS AND THE NOUNS DID NOT.
 *
 * `lib/estonian/derive.ts` builds the ten regular cases off the genitive stem
 * for every noun and adjective in the dictionary, which is the single most
 * load-bearing rule in the app: it is the back of a flashcard, the answer a
 * marker compares against, and the table on every grammar page. It was checked
 * against Ekilex for five words, the ones the landing page demonstrates, and
 * the note about that says so plainly. `scripts/audit-verbs.ts` does the same
 * job for the verb and covers 797 of them.
 *
 * So this is that script pointed at the other half of the language. For every
 * nominal the dictionary ships with an Ekilex word id, it fetches the forms the
 * Institute records, derives the same cases, and prints every disagreement by
 * lemma and case.
 *
 * BOTH COLUMNS, because both are printed. The singular obliques are a suffix on
 * the genitive singular; the plural obliques are the same suffix on the genitive
 * *plural*, and the nominative plural is the genitive singular plus `d`. All
 * three rules reach a learner through `buildCaseTable`, which is what the
 * dictionary entry, the grammar reference and the printable worksheet draw, so
 * a plural rule that is wrong is wrong on the same screens.
 *
 * WHAT COUNTS AS AGREEMENT. `caseAnswer` returns every spelling a marker lets
 * through, not one, because Estonian genuinely has two illatives and a word can
 * carry a stored form beside a derived one. A slot agrees when Ekilex's own
 * value is among them. The illative is where that matters: `tuppa` is the
 * aditiiv and `toasse` the long form, Ekilex records both under different
 * codes, and either is right.
 *
 * `--write` fills in the nominative plural, which is the one slot this audit
 * both checks and can repair. It is the same latitude `audit:glosses --write`
 * takes over a translation: the answer is read off the source the generator
 * reads, and nothing here writes a character of Estonian of its own. It is
 * needed because `prisma/data/.cache/` is not checked in, so re-running the
 * whole expansion would mean asking Wiktionary for six thousand pages to carry
 * one form that Ekilex has already answered. `scripts/expand-seed.ts` produces
 * the same field on a fresh run, through `PRINCIPAL_PARTS` in
 * `lib/ekilex/mapper.ts`, so this is a shortcut to the generator's own output
 * rather than a second source for it.
 *
 * Needs EKILEX_API_KEY and the network. Responses are cached under
 * .ekilex-cache/ in the same files the harvest and the verb audit use, so
 * re-running costs Ekilex nothing.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { HARVESTED } from "../prisma/data/harvested";
import expanded from "../prisma/data/expanded.json";
import { CASES } from "../lib/estonian/cases";
import { buildCaseTable, caseAnswer, stemsFromParts } from "../lib/estonian/derive";
import { EXPANDED_PATH, writeExpanded } from "./lib/expandedFile";
import { isPrincipalFormType } from "../lib/estonian/types";
import type { CaseKey } from "../lib/estonian/types";

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, ".ekilex-cache");
const BASE = "https://ekilex.ee/api";
const API_KEY = process.env.EKILEX_API_KEY ?? "";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const WRITE = process.argv.includes("--write");
/** A few at a time, out of politeness to a research institute's server. */
const WORKERS = Number(
  process.argv.find((a) => a.startsWith("--jobs="))?.slice("--jobs=".length) ?? 6,
);

interface RawDetails {
  word?: { paradigms?: { forms?: { value: string; morphCode: string }[] }[] };
}

/** Ekilex's own singular codes for the ten cases a rule builds. */
const CODE_FOR: Partial<Record<CaseKey, readonly string[]>> = {
  ILLATIVE: ["SgIll", "SgAdt"],
  INESSIVE: ["SgIn"],
  ELATIVE: ["SgEl"],
  ALLATIVE: ["SgAll"],
  ADESSIVE: ["SgAd"],
  ABLATIVE: ["SgAbl"],
  TRANSLATIVE: ["SgTr"],
  TERMINATIVE: ["SgTer"],
  ESSIVE: ["SgEs"],
  ABESSIVE: ["SgAb"],
  COMITATIVE: ["SgKom"],
};

/**
 * And the plural codes.
 *
 * `NOMINATIVE` is here and its singular is not, because the nominative singular
 * is a stored principal part and the nominative *plural* is a rule: genitive
 * singular plus `d`. The genitive and partitive plurals are stored parts and so
 * are checked as stored rather than derived, which is a different question and
 * is asked separately below.
 */
const PLURAL_CODE_FOR: Partial<Record<CaseKey, readonly string[]>> = {
  NOMINATIVE: ["PlN"],
  ILLATIVE: ["PlIll"],
  INESSIVE: ["PlIn"],
  ELATIVE: ["PlEl"],
  ALLATIVE: ["PlAll"],
  ADESSIVE: ["PlAd"],
  ABLATIVE: ["PlAbl"],
  TRANSLATIVE: ["PlTr"],
  TERMINATIVE: ["PlTer"],
  ESSIVE: ["PlEs"],
  ABESSIVE: ["PlAb"],
  COMITATIVE: ["PlKom"],
};

/** The two stored plural principal parts, checked as stored rather than derived. */
const STORED_PLURAL: readonly { part: string; code: string; name: string }[] = [
  { part: "GEN_PL", code: "PlG", name: "omastav pl" },
  { part: "PART_PL", code: "PlP", name: "osastav pl" },
];

/**
 * The values Ekilex records for one slot, lowercased, with its own absences out.
 *
 * Ekilex writes `-` where a word genuinely has no form in a slot, which is a
 * statement that the row is empty rather than a form spelled with a hyphen.
 * `lib/ekilex/client.ts` drops those on the live path and `formMap` drops them
 * in the harvest, and this read them: `seade` records `SgAdt=-` and no long
 * illative at all, so the audit compared the app's perfectly correct
 * `seadmesse` against a hyphen and called it a disagreement.
 */
function real(
  forms: readonly { value: string; morphCode: string }[],
  codes: readonly string[],
): string[] {
  return forms
    .filter((f) => codes.includes(f.morphCode) && f.value && !/^[-\u2013\u2014]$/.test(f.value.trim()))
    .map((f) => f.value.toLowerCase());
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

interface Nominal {
  lemma: string;
  parts: Record<string, string>;
  wordId: number;
}

const NOMINAL = new Set(["NOUN", "ADJECTIVE", "PRONOUN"]);

function nominals(): Nominal[] {
  const seen = new Set<string>();
  const out: Nominal[] = [];
  for (const w of HARVESTED) {
    if (!NOMINAL.has(w.pos) || !w.parts.GEN_SG || seen.has(w.lemma)) continue;
    seen.add(w.lemma);
    out.push({ lemma: w.lemma, parts: { ...w.parts }, wordId: w.ekilexWordId });
  }
  const rows = expanded as {
    lemma: string; pos: string; ekilexWordId?: number;
    forms: { formType: string; value: string }[];
  }[];
  for (const e of rows) {
    if (!NOMINAL.has(e.pos) || !e.ekilexWordId || seen.has(e.lemma)) continue;
    const parts: Record<string, string> = {};
    for (const f of e.forms) parts[f.formType] = f.value;
    if (!parts.GEN_SG) continue;
    seen.add(e.lemma);
    out.push({ lemma: e.lemma, parts, wordId: e.ekilexWordId });
  }
  return out;
}

async function main() {
  if (!API_KEY) {
    console.error("EKILEX_API_KEY is not set; nothing can be checked.");
    process.exit(2);
  }
  await mkdir(CACHE, { recursive: true });

  const all = nominals().slice(0, LIMIT);
  console.log(`${all.length} nominals to check against Ekilex.\n`);

  let checked = 0;
  let unreachable = 0;
  let agreeing = 0;
  const disagreements: {
    lemma: string; key: CaseKey; origin: string; derived: readonly string[]; ekilex: string[];
  }[] = [];
  const uncovered: string[] = [];
  const stored: { lemma: string; name: string; held: string; ekilex: string[] }[] = [];
  const perCase = new Map<CaseKey, { ok: number; bad: number }>();
  const perPlural = new Map<CaseKey, { ok: number; bad: number }>();
  const storedTally = new Map<string, { ok: number; bad: number }>();

  let next = 0;
  async function worker() {
    while (next < all.length) {
      const word = all[next++]!;
      const details = await cached<RawDetails>(`details-${word.wordId}`, () =>
        call<RawDetails>(`/word/details/${word.wordId}`),
      );
      const forms = details?.word?.paradigms?.flatMap((p) => p.forms ?? []) ?? [];
      if (!details || forms.length === 0) {
        unreachable++;
        continue;
      }
      checked++;

      const stems = stemsFromParts(word.parts);
      let clean = true;
      let compared = 0;
      for (const spec of CASES) {
        const codes = CODE_FOR[spec.key];
        if (!codes) continue;
        const answer = caseAnswer(stems, spec.key);
        if (!answer) continue;
        const attested = real(forms, codes);
        if (attested.length === 0) continue; // Ekilex records no such slot: nothing to compare.
        compared++;
        const tally = perCase.get(spec.key) ?? { ok: 0, bad: 0 };
        // Agreement is "Ekilex's own value is one this app would accept".
        const accepted = new Set(answer.accepted.map((v) => v.toLowerCase()));
        if (attested.some((value) => accepted.has(value))) {
          tally.ok++;
        } else {
          tally.bad++;
          clean = false;
          disagreements.push({
            lemma: word.lemma, key: spec.key, origin: answer.origin,
            derived: answer.accepted, ekilex: attested,
          });
        }
        perCase.set(spec.key, tally);
      }

      const table = buildCaseTable(stems);
      for (const row of table) {
        const codes = PLURAL_CODE_FOR[row.spec.key];
        if (!codes || !row.plural) continue;
        const attested = real(forms, codes);
        if (attested.length === 0) continue;
        compared++;
        const tally = perPlural.get(row.spec.key) ?? { ok: 0, bad: 0 };
        if (attested.includes(row.plural.toLowerCase())) {
          tally.ok++;
        } else {
          tally.bad++;
          clean = false;
          disagreements.push({
            lemma: word.lemma, key: row.spec.key, origin: "PLURAL",
            derived: [row.plural], ekilex: attested,
          });
        }
        perPlural.set(row.spec.key, tally);
      }

      // The two stored plural parts. Not a derivation, so a disagreement here
      // is a fact about the seed rather than about a rule, which is worth
      // knowing separately and is why it is tallied on its own.
      for (const { part, code, name } of STORED_PLURAL) {
        const held = word.parts[part];
        if (!held) continue;
        const attested = real(forms, [code]);
        if (attested.length === 0) continue;
        const tally = storedTally.get(name) ?? { ok: 0, bad: 0 };
        if (attested.includes(held.toLowerCase())) tally.ok++;
        else {
          tally.bad++;
          stored.push({ lemma: word.lemma, name, held, ekilex: attested });
        }
        storedTally.set(name, tally);
      }

      if (compared === 0) {
        uncovered.push(word.lemma);
        continue;
      }
      if (clean) agreeing++;
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));

  console.log(`Checked ${checked} nominals against attested paradigms; ${unreachable} could not be fetched.`);
  console.log(`${agreeing} agree on every case that could be compared; ${uncovered.length} compared nothing.\n`);
  console.log("Per case:");
  for (const spec of CASES) {
    if (!CODE_FOR[spec.key]) continue;
    const tally = perCase.get(spec.key) ?? { ok: 0, bad: 0 };
    console.log(
      `  ${spec.et.padEnd(12)} ${spec.en.padEnd(12)} ${String(tally.ok).padStart(6)} agree ${String(tally.bad).padStart(5)} disagree`,
    );
  }
  console.log("\nPer case, plural:");
  for (const spec of CASES) {
    if (!PLURAL_CODE_FOR[spec.key]) continue;
    const tally = perPlural.get(spec.key) ?? { ok: 0, bad: 0 };
    console.log(
      `  ${spec.et.padEnd(12)} ${spec.en.padEnd(12)} ${String(tally.ok).padStart(6)} agree ${String(tally.bad).padStart(5)} disagree`,
    );
  }
  console.log("\nStored plural principal parts:");
  for (const { name } of STORED_PLURAL) {
    const tally = storedTally.get(name) ?? { ok: 0, bad: 0 };
    console.log(
      `  ${name.padEnd(25)} ${String(tally.ok).padStart(6)} agree ${String(tally.bad).padStart(5)} disagree`,
    );
  }
  if (stored.length) {
    console.log(`\n${stored.length} stored parts Ekilex spells otherwise:`);
    for (const d of stored.slice(0, 40)) {
      console.log(`  ${d.lemma.padEnd(18)} ${d.name.padEnd(14)} held ${d.held.padEnd(20)} ekilex ${d.ekilex.join(" / ")}`);
    }
    if (stored.length > 40) console.log(`  ... and ${stored.length - 40} more`);
  }
  if (disagreements.length) {
    console.log(`\n${disagreements.length} disagreements:`);
    for (const d of disagreements.slice(0, 60)) {
      console.log(
        `  ${d.lemma.padEnd(18)} ${d.key.padEnd(12)} ${d.origin.padEnd(9)}` +
        ` app ${d.derived.join(" / ").padEnd(28)} ekilex ${d.ekilex.join(" / ")}`,
      );
    }
    if (disagreements.length > 60) console.log(`  ... and ${disagreements.length - 60} more`);
    process.exitCode = 1;
  } else {
    console.log("\nNo disagreements.");
  }

  await fillNominativePlural();
  oneValuePerPrincipalPart();
}

/**
 * A principal part is one form, and 2,029 shipped entries carried two.
 *
 * `@@unique([lexemeId, formType, value])` puts the value in `Form`'s key
 * because Estonian has genuine parallel forms, which is right for the whole
 * retrieved table and wrong for the six a learner memorises. Ekilex gives two
 * partitive plurals for most nouns (`aadresse` and `aadressisid`) and
 * `mapEkilexDetails` wrote both down as `PART_PL`, so which one the app used
 * was decided by whoever read the rows: `stemsFrom` takes the first it finds,
 * in whatever order the database returns them, and every caller that builds a
 * record with `Object.fromEntries` takes the last.
 *
 * Ekilex lists the primary first and the file preserves that order, so this
 * needs nothing from the network: keeping the first occurrence is exactly what
 * the patched mapper now produces on a fresh build.
 */
function oneValuePerPrincipalPart() {
  const rows = expanded as { lemma: string; forms: { formType: string; value: string }[] }[];
  let dropped = 0;
  const affected: string[] = [];
  for (const e of rows) {
    const taken = new Set<string>();
    const kept: typeof e.forms = [];
    for (const f of e.forms) {
      if (isPrincipalFormType(f.formType)) {
        if (taken.has(f.formType)) {
          dropped++;
          continue;
        }
        taken.add(f.formType);
      }
      kept.push(f);
    }
    if (kept.length !== e.forms.length) {
      affected.push(e.lemma);
      if (WRITE) e.forms = kept;
    }
  }

  console.log(
    `\nPrincipal parts: ${affected.length} entries carry a second value for one, ` +
    `${dropped} rows in all.`,
  );
  if (affected.length === 0) return;
  if (!WRITE) {
    console.log("Re-run with --write to keep the one Ekilex lists first.");
    return;
  }
  writeExpanded(rows);
  console.log(`Dropped ${dropped} duplicate principal parts from ${EXPANDED_PATH}.`);
}

/**
 * Writes the attested nominative plural into `expanded.json` where it is missing.
 *
 * Read-only without `--write`: it says how many entries are short of one and
 * stops, which is the shape every audit here takes.
 *
 * A word Ekilex answers with `-` has no plural and is left alone, which is the
 * whole point of the field. `lib/ekilex/client.ts` drops those on the live
 * path and `formMap` drops them in the harvest, so the three readers agree.
 */
async function fillNominativePlural() {
  const rows = expanded as {
    lemma: string; pos: string; ekilexWordId?: number;
    forms: { formType: string; value: string }[];
  }[];

  let missing = 0;
  let filled = 0;
  let none = 0;
  for (const e of rows) {
    if (!NOMINAL.has(e.pos) || !e.ekilexWordId) continue;
    if (e.forms.some((f) => f.formType === "NOM_PL")) continue;
    missing++;
    const details = await cached<RawDetails>(`details-${e.ekilexWordId}`, () =>
      call<RawDetails>(`/word/details/${e.ekilexWordId}`),
    );
    const value = (details?.word?.paradigms ?? [])
      .flatMap((p) => p.forms ?? [])
      .find((f) => f.morphCode === "PlN" && f.value && !/^[-\u2013\u2014]$/.test(f.value.trim()))
      ?.value;
    if (!value) {
      none++;
      continue;
    }
    if (WRITE) {
      // Beside the other plural principal parts, which is where a reader of the
      // file expects it and is the order `NOMINAL_PARTS` writes in.
      const at = e.forms.findIndex((f) => f.formType === "PART_PL");
      const row = { formType: "NOM_PL", value };
      if (at === -1) e.forms.push(row);
      else e.forms.splice(at, 0, row);
    }
    filled++;
  }

  console.log(
    `\nNominative plural: ${missing} entries had none stored, ` +
    `${filled} can be filled from Ekilex, ${none} have no plural at all.`,
  );
  if (!WRITE) {
    if (filled > 0) console.log("Re-run with --write to store them.");
    return;
  }
  writeExpanded(rows);
  console.log(`Wrote ${filled} nominative plurals into ${EXPANDED_PATH}.`);
}

void main();
