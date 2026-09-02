import { readFileSync } from "node:fs";
import { HARVESTED } from "../prisma/data/harvested";
import { parseGovernment } from "../lib/estonian/government";

interface Entry { lemma: string; pos: string; government: string | null }
const EXPANDED: Entry[] = JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));
const rows: Entry[] = [...EXPANDED, ...HARVESTED.map((w) => ({ lemma: w.lemma, pos: w.pos, government: w.government }))];

/** The three the table has no entry for. */
const MISSING: Record<string, string> = {
  kellena: "essive", millena: "essive",
  kelleni: "terminative", milleni: "terminative",
  kelleta: "abessive", milleta: "abessive",
};

const wouldGain: string[] = [];
const alreadyParsed: string[] = [];
for (const e of rows) {
  if (!e.government) continue;
  // Each " · "-separated part is one Ekilex government pattern.
  const parts = e.government.split("·").map((p) => p.trim());
  const hit = parts.find((p) => {
    const bare = p.toLowerCase().replace(/\*/g, "").split("(")[0]!.trim();
    if (/\s/.test(bare)) return false;
    return bare.split("/").every((a) => MISSING[a.trim()]);
  });
  if (!hit) continue;
  (parseGovernment(e.government) ? alreadyParsed : wouldGain).push(`${e.lemma} (${e.pos}): ${e.government}`);
}
console.log(`entries naming essive, terminative or abessive: ${wouldGain.length + alreadyParsed.length}`);
console.log(`  of those, currently unparsed and would gain a case: ${wouldGain.length}`);
console.log(wouldGain.slice(0, 20).join("\n"));
console.log(`\n  already parsed from another part (would gain a second case): ${alreadyParsed.length}`);
console.log(alreadyParsed.slice(0, 10).join("\n"));
