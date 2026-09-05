import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fold } from "@/lib/estonian/fold";
import { LENGTH_FILE, SHARD_DIR, shardKey } from "./formsLayout";

/**
 * IS THAT SPELLING AN ESTONIAN WORD, AND WHICH WORD IS IT A FORM OF?
 *
 * `KnownWord` answers "is that a word" for 155,000 headwords, and a learner
 * meets the language in its forms: `põhjas` went into Sõnad, is the seesütlev
 * of `põhi`, and was refused as not a word. This is the forms list
 * `scripts/build-forms.ts` writes, 5.8 million spellings from every source
 * that may legitimately be used, and it answers two things and no more:
 * whether a spelling is Estonian, and which headwords it belongs to.
 *
 * IT IS AN ACCEPT LIST AND NOT A DICTIONARY, which is what keeps it inside
 * ADR-005. It holds no gloss, no level, no case label and no sentence, so
 * nothing read from it can become a card, a paper, a marking target or a
 * scanned word the app vouches for; `lib/srs`, `lib/exam`, `lib/assessment`
 * and `lib/dict/resolveScan.ts` may not import it, asserted. A synthesised
 * form on this side costs a non-word being let through on a word game. The
 * same form on the answer side would be drilled, and that is the difference
 * between the two sides.
 *
 * FILES RATHER THAN A TABLE, and one file per lookup. The 6,044,103 pairs in
 * Postgres with the index the search would need measured 789 MB, against 15 MB
 * as gzipped shards, for a question whose answer never changes. So a lookup
 * reads one shard keyed on the form's folded first three letters, indexes it by
 * folded spelling on the way in, and keeps it for a while, so a class typing
 * into the same corner of the alphabet reads it once. Folded on both sides,
 * exactly as `isKnownWord` was, because a learner with no õ key is still
 * asking whether their word exists.
 *
 * No Prisma, deliberately: this module reads the filesystem and nothing else,
 * and the pure half (`formsLayout.ts`, `parseShard`) is unit tested.
 */

/** Where the builder wrote the list. */
const DIR = path.join(process.cwd(), "prisma", "data", "forms");

/** How many parsed shards are kept in memory. The largest is a quarter of a million lines. */
const HELD_SHARDS = 48;

/** One line of a shard: the spelling and the headwords it belongs to. */
export interface FormLine {
  form: string;
  lemmas: string[];
}

/** A shard, indexed by folded spelling so a warm lookup is a map read. */
export type Shard = Map<string, FormLine[]>;

/**
 * A shard's lines, parsed and keyed on the folded spelling. Exported for its
 * test. Folded once here rather than on every lookup, because the largest
 * shard is a quarter of a million lines and a scan folding each of them was
 * measured at 250 ms warm; a map read is nothing.
 */
export function parseShard(text: string): Shard {
  const index: Shard = new Map();
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const entry = { form: line.slice(0, tab), lemmas: line.slice(tab + 1).split(",") };
    const key = fold(entry.form);
    const lines = index.get(key);
    if (lines) lines.push(entry);
    else index.set(key, [entry]);
  }
  return index;
}

const held = new Map<string, Shard>();

async function shard(key: string): Promise<Shard> {
  const kept = held.get(key);
  if (kept) {
    // Re-insert so the map's order is least recently used first.
    held.delete(key);
    held.set(key, kept);
    return kept;
  }
  let lines: Shard;
  try {
    const bytes = await readFile(path.join(DIR, SHARD_DIR, `${key}.tsv.gz`));
    lines = parseShard(gunzipSync(bytes).toString("utf8"));
  } catch (error) {
    // A shard nothing starts with is an ordinary answer, not a fault: no
    // Estonian word begins with `qx`. Anything else is worth hearing about.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    lines = new Map();
  }
  held.set(key, lines);
  if (held.size > HELD_SHARDS) {
    const oldest = held.keys().next().value;
    if (oldest !== undefined) held.delete(oldest);
  }
  return lines;
}

/**
 * Every headword this spelling is a form of, folded on both sides. An exact
 * spelling's headwords come first, so `pohjas` and `põhjas` both answer with
 * `põhi` and a spelling that is itself a headword leads with itself.
 */
export async function lemmasOfForm(query: string): Promise<string[]> {
  const trimmed = query.trim().toLowerCase();
  const folded = fold(trimmed);
  if (!folded) return [];
  const lines = (await shard(shardKey(folded))).get(folded) ?? [];
  const exact: string[] = [];
  const near: string[] = [];
  for (const line of lines) {
    (line.form === trimmed ? exact : near).push(...line.lemmas);
  }
  const out: string[] = [];
  for (const lemma of [...exact, ...near]) if (!out.includes(lemma)) out.push(lemma);
  // The spelling itself leads where it is a headword, then everything else.
  out.sort((a, b) => Number(b === trimmed) - Number(a === trimmed));
  return out;
}

/** Whether the spelling is a form of any Estonian word at all. */
export async function isKnownForm(query: string): Promise<boolean> {
  return (await lemmasOfForm(query)).length > 0;
}

/**
 * Every spelling of one length, for a game that hands its accept list to the
 * browser. Read from the file the builder wrote for that length rather than
 * scanned out of the shards, which is the cost the layout exists to avoid;
 * a length the builder was never asked for answers with nothing, and the
 * invariant checks the game's length is one it was asked for.
 */
export async function formsOfLength(length: number): Promise<string[]> {
  try {
    const bytes = await readFile(path.join(DIR, LENGTH_FILE(length)));
    return gunzipSync(bytes).toString("utf8").split("\n").filter(Boolean);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
}
