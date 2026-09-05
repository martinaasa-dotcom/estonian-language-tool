/**
 * WHICH WORDS DO NOT FOLLOW THE PATTERN, AND HOW MANY OF THEM ARE THERE?
 *
 *   npx tsx scripts/audit-exceptions.ts            # counts per kind
 *   npx tsx scripts/audit-exceptions.ts --list     # every word, ranked
 *   npx tsx scripts/audit-exceptions.ts --kind STEM --list
 *
 * `lib/estonian/exceptions.ts` states, for each slot, the pattern a course
 * teaches, and reports every word whose stored form disagrees. A rule stated
 * that way is wrong until it has been measured: a first pass over the shipped
 * dictionary flagged four thousand partitive plurals, which is not a language
 * full of exceptions, it is a rule this file had written down badly.
 *
 * So this is the instrument the rules are corrected with, and it is the same
 * one `eval:scene` is: **read the ranked list, not the total**. A kind that
 * flags most of the dictionary is a kind whose rule is wrong or whose name is
 * wrong, and a kind that flags nothing is a rule with nothing behind it.
 *
 * No database and no network: it reads `prisma/data/expanded.json`, which is
 * what `npm run db:seed` loads, and `prisma/data/harvested.ts`, which is where
 * the course words keep the forms no rule reaches. Both are needed, and they
 * cover different halves: the expansion holds the five principal parts of six
 * thousand words, and the harvest holds the simple past's third person and the
 * polite imperative, which only exist for the course.
 */
import { HARVESTED } from "../prisma/data/harvested";
import { readExpanded } from "./lib/expandedFile";
import { exceptionsFor, type ExceptionKind, type WordException } from "../lib/estonian/exceptions";

interface Row {
  lemma: string; pos: string; cefr: string | null;
  forms: { formType: string; value: string }[];
}

const args = process.argv.slice(2);
const wantList = args.includes("--list");
const wantKind = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : null;

/** The course's extra forms, keyed by lemma, in the shape a form row takes. */
function harvestedForms(): Map<string, { formType: string; value: string }[]> {
  const out = new Map<string, { formType: string; value: string }[]>();
  for (const word of HARVESTED) {
    const rows = [
      ...Object.entries(word.parts).map(([formType, value]) => ({ formType, value: value as string })),
      ...word.extraForms.map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
    ];
    out.set(`${word.lemma}|${word.pos}`, rows);
  }
  return out;
}

function main() {
  const expanded = readExpanded() as unknown as Row[];
  const extra = harvestedForms();

  const byKind = new Map<ExceptionKind, { lemma: string; ex: WordException }[]>();
  let words = 0;

  for (const row of expanded) {
    // The harvest's rows win where it has them: they are the same principal
    // parts plus the slots no rule reaches, from the same source.
    const forms = extra.get(`${row.lemma}|${row.pos}`) ?? row.forms;
    const found = exceptionsFor({ lemma: row.lemma, pos: row.pos, forms });
    if (found.length > 0) words += 1;
    for (const ex of found) {
      const list = byKind.get(ex.kind) ?? [];
      list.push({ lemma: row.lemma, ex });
      byKind.set(ex.kind, list);
    }
  }

  const total = [...byKind.values()].reduce((n, list) => n + list.length, 0);
  console.log(`${expanded.length} entries, ${words} of them with at least one exception, ${total} exceptions in all\n`);

  const ranked = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [kind, list] of ranked) {
    const share = ((list.length / expanded.length) * 100).toFixed(1);
    console.log(`${kind.padEnd(16)} ${String(list.length).padStart(5)}  ${share}% of entries`);
    if (!wantList || (wantKind && wantKind !== kind)) continue;
    for (const { lemma, ex } of list.slice(0, 400)) {
      const rule = ex.ruleForm ? `  pattern: ${ex.ruleForm}${ex.ruleFormIsAlsoRight ? " (also right)" : ""}` : "";
      console.log(`    ${lemma.padEnd(20)} ${ex.forms.join(" / ").padEnd(20)}${ex.note ? ` [${ex.note}]` : ""}${rule}`);
    }
    if (list.length > 400) console.log(`    ... and ${list.length - 400} more`);
  }
}

main();
