#!/usr/bin/env node
/**
 * WHAT A CLEAN MERGE TOOK OUT.
 *
 * More than one session works this repository at a time, and the merge that
 * hurts is not the one with conflict markers in it. Twice in one afternoon a
 * merge resolved cleanly and silently reverted somebody's work:
 *
 *   - a `tap-tint` hover, added on main to two of the three weakest-case
 *     panels that a branch was extracting into one component, so taking the
 *     branch's side deleted the improvement along with the code it improved;
 *   - an inset ring on Today's week strip, added on main because mint on that
 *     card is 2.52:1 and the tick inside it the same, on a strip the branch had
 *     moved into another card.
 *
 * Nothing failed in either case. Git had no reason to ask: one side changed
 * lines the other side had moved or deleted, which is a clean resolution by
 * every rule git has. CLAUDE.md's answer is to grep the markers a branch owns
 * after any merge that touched its files, and that works exactly as well as
 * somebody's memory of which markers those are.
 *
 * So this asks the question mechanically. For every line the other side added
 * since the merge base, is it still in the tree? A line that is not is either a
 * deliberate deletion or a silent revert, and this cannot tell those apart —
 * nothing can, which is why the output is a list to read rather than a pass or
 * a fail. What it does is turn "did I lose anything" from a memory test into a
 * page of specific lines.
 *
 * Comments and blank lines count. The comment above a fix is usually the only
 * record of why the fix is shaped the way it is, and losing it is how the next
 * session undoes the same thing again for the same reason.
 *
 *   node scripts/audit-merge.mjs              # against origin/main
 *   node scripts/audit-merge.mjs origin/main  # or whichever side to compare
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const other = process.argv[2] ?? "origin/main";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

let base;
try {
  base = git("merge-base", "HEAD", other).trim();
} catch {
  console.error(`Cannot find a merge base with ${other}. Fetch it first.`);
  process.exit(2);
}

/*
  Only the files the other side touched. A file this branch alone changed
  cannot have lost anything of theirs, and walking the whole tree buries the
  answer in noise.
*/
const touched = git("diff", "--name-only", `${base}..${other}`)
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

if (touched.length === 0) {
  console.log(`Nothing on ${other} since the merge base. Nothing to lose.`);
  process.exit(0);
}

/**
 * Lines the other side added to one file, in order.
 *
 * `-U0` because context lines are not additions, and the unified diff's `+`
 * prefix is the only thing distinguishing them.
 */
function addedBy(file) {
  const patch = git("diff", "-U0", `${base}..${other}`, "--", file);
  return patch
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .filter((l) => l.trim().length > 0);
}

let missingTotal = 0;
const report = [];

for (const file of touched) {
  const added = addedBy(file);
  if (added.length === 0) continue;

  if (!existsSync(file)) {
    report.push({ file, gone: true, added: added.length, missing: added.length, lines: [] });
    missingTotal += added.length;
    continue;
  }

  /*
    Presence, not position. A line that moved to another part of the file, or
    into another function, has not been lost, and reporting it as lost is how
    a tool like this gets ignored. Trimmed, because a line that only changed
    its indentation is the same line: this branch reindented a whole card and
    every line of it would otherwise read as missing.
  */
  const have = new Set(readFileSync(file, "utf8").split("\n").map((l) => l.trim()));
  const missing = added.filter((l) => !have.has(l.trim()));
  if (missing.length === 0) continue;

  missingTotal += missing.length;
  report.push({ file, gone: false, added: added.length, missing: missing.length, lines: missing });
}

if (missingTotal === 0) {
  console.log(`Every line ${other} added since ${base.slice(0, 8)} is still in the tree.`);
  console.log(`Checked ${touched.length} file${touched.length === 1 ? "" : "s"}.`);
  process.exit(0);
}

console.log(`Lines ${other} added since ${base.slice(0, 8)} that are not in this tree.\n`);
console.log("Each one is a deliberate deletion or a silent revert. Only you can tell");
console.log("which, so read them rather than counting them.\n");

// Worst first: a file that lost most of what arrived is the one to look at.
report.sort((a, b) => b.missing / b.added - a.missing / a.added);

for (const r of report) {
  const share = Math.round((r.missing / r.added) * 100);
  console.log(`\n${r.file}${r.gone ? "  (file is gone)" : ""}`);
  console.log(`  ${r.missing} of ${r.added} added lines absent (${share}%)`);
  for (const line of r.lines.slice(0, 12)) console.log(`    - ${line.trim().slice(0, 110)}`);
  if (r.lines.length > 12) console.log(`    … and ${r.lines.length - 12} more`);
}

console.log(`\n${missingTotal} lines across ${report.length} files.`);
/*
  Exit 0 whatever it finds. This is a thing to read after a merge, not a gate:
  a branch that deliberately deletes a file the other side edited is doing
  nothing wrong, and a check that fails on that is a check people learn to skip.
*/
