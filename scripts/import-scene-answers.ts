#!/usr/bin/env tsx
/**
 * Turn a filled-in `scene-sentences.csv` into `lib/collections/sceneAnswers.ts`.
 *
 * THE FOURTH DOOR ONTO ONE RULE. A photographed page, a news headline and a
 * frequency corpus all bring in Estonian this project did not write, and all
 * three answer to the same gate: the outside source proposes and the
 * dictionary decides (ADR-021, ADR-024). A native speaker typing sentences
 * into a spreadsheet is the fourth, and gets no exception for being a native
 * speaker. Every word of every sentence goes through `matchEstonianForm` at
 * the confidence a scanned page has to clear, and a sentence carrying one word
 * the dictionary will not vouch for is **reported and not written**.
 *
 * WHY THAT IS NOT AN INSULT TO THE CONTRIBUTOR. What it catches is a typo, a
 * dropped diacritic and a word the dictionary has never heard of, and the last
 * of those is the interesting one: a sentence a learner is shown as a model
 * answer should be made of words that learner can look up. A sentence rejected
 * here is a sentence to discuss, which is why the report names the word rather
 * than the row.
 *
 * WHAT IS DELIBERATELY NOT CHECKED. Whether the sentence is *good*, whether it
 * describes the picture, and whether the grammar is right. No machine here can
 * judge any of those and no model is asked to: the contributor is the
 * authority on their own language, which is the entire reason for asking a
 * person rather than generating one.
 *
 * Writes the file whole, sorted, so re-running gives the same bytes and a diff
 * shows only what changed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SCENES } from "@/lib/collections/scenes";
import { candidatesFor } from "@/lib/dict/resolveScan";
import { matchEstonianForm } from "@/lib/dict/search";
import { sentenceWords } from "@/lib/dict/examples";

const IN = "scene-sentences.csv";
const OUT = "lib/collections/sceneAnswers.ts";

/** RFC 4180 enough for a spreadsheet export: quoted fields, doubled quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

async function main() {
  if (!existsSync(IN)) {
    console.error(`No ${IN}. Run \`npm run scenes:template\` first.`);
    process.exitCode = 1;
    return;
  }

  const rows = parseCsv(readFileSync(IN, "utf8"));
  const header = rows.shift();
  if (!header || header[0] !== "scene") {
    console.error(`${IN} does not look like the template: its first column should be "scene".`);
    process.exitCode = 1;
    return;
  }

  const known = new Set(SCENES.map((s) => s.id));
  const filled = rows
    .map((r) => ({ id: (r[0] ?? "").trim(), et: (r[4] ?? "").trim(), by: (r[5] ?? "").trim() }))
    .filter((r) => r.et.length > 0);

  const unknown = filled.filter((r) => !known.has(r.id));
  for (const row of unknown) {
    console.error(`  ${row.id}: no scene with that id. Renamed, or a typo in the spreadsheet.`);
  }

  const prisma = new PrismaClient();
  const kept: { id: string; et: string; by: string }[] = [];
  const rejected: { id: string; word: string }[] = [];

  for (const row of filled) {
    if (!known.has(row.id)) continue;
    const words = sentenceWords(row.et);
    const candidates = await candidatesFor(words);
    const bad = words.find((word) => !matchEstonianForm(candidates, word));
    if (bad) rejected.push({ id: row.id, word: bad });
    else kept.push(row);
  }
  await prisma.$disconnect();

  for (const row of rejected) {
    console.error(`  ${row.id}: the dictionary does not vouch for "${row.word}". Not written.`);
  }

  kept.sort((a, b) => a.id.localeCompare(b.id));
  const body = kept
    .map((r) => `  ${JSON.stringify(r.id)}: { et: ${JSON.stringify(r.et)}, by: ${JSON.stringify(r.by)} },`)
    .join("\n");

  const source = readFileSync(OUT, "utf8");
  const start = source.indexOf("export const SCENE_ANSWERS");
  const end = source.indexOf("};", start);
  if (start < 0 || end < 0) {
    console.error(`${OUT} no longer has a SCENE_ANSWERS literal to replace.`);
    process.exitCode = 1;
    return;
  }
  const replaced =
    `${source.slice(0, start)}export const SCENE_ANSWERS: Readonly<Record<string, SceneAnswer>> = {` +
    `${body ? `\n${body}\n` : ""}${source.slice(end)}`;
  writeFileSync(OUT, replaced, "utf8");

  console.log(`Wrote ${kept.length} of ${SCENES.length} scenes into ${OUT}.`);
  if (rejected.length) console.log(`${rejected.length} rejected, listed above.`);
}

void main();
