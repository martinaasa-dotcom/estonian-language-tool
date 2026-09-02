import { readFileSync } from "node:fs";
import { HARVESTED } from "../prisma/data/harvested";
import { parseGovernment } from "../lib/estonian/government";

interface Entry { lemma: string; pos: string; government: string | null }
const EXPANDED: Entry[] = JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));

const rows: Entry[] = [
  ...EXPANDED,
  ...HARVESTED.map((w) => ({ lemma: w.lemma, pos: w.pos, government: w.government })),
];

let withGov = 0, parsed = 0;
const unparsed: string[] = [];
const byPos: Record<string, number> = {};
const multi: string[] = [];
for (const e of rows) {
  if (!e.government) continue;
  withGov++;
  byPos[e.pos] = (byPos[e.pos] ?? 0) + 1;
  const g = parseGovernment(e.government);
  if (!g) { unparsed.push(`${e.lemma} (${e.pos}): ${e.government}`); continue; }
  parsed++;
  if (g.alsoGoverned.length) multi.push(`${e.lemma}: ${g.caseKey} + ${g.alsoGoverned.join(", ")}`);
}
console.log(`entries carrying a government: ${withGov}, by pos ${JSON.stringify(byPos)}`);
console.log(`parsed: ${parsed}; unparsed: ${unparsed.length}`);
console.log(unparsed.slice(0, 25).join("\n"));
console.log(`\nmore than one case: ${multi.length}`);
console.log(multi.slice(0, 8).join("\n"));
