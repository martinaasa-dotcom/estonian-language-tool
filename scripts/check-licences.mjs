#!/usr/bin/env node
/**
 * Fails if a dependency's licence would make `LICENSE` untrue.
 *
 * The other supply chain question, and the one nothing here asked. `npm audit`
 * has an opinion about holes and none at all about terms, and a licence is the
 * thing nobody thinks to check until the answer is already in the tree and
 * shipped: this project's code is MIT, its built dictionary carries
 * Wiktionary's CC BY-SA 4.0, and `LICENSE` says exactly that. A strong copyleft
 * *code* dependency arriving through a transitive bump would quietly make that
 * file wrong, and the moment it is cheap to fix is the commit that introduces
 * it rather than the day somebody asks.
 *
 * WHY THIS AND NOT `dependency-review-action`, WHICH IS THE OBVIOUS ANSWER.
 * It was the first answer, it went in, and it failed on every pull request:
 * "Dependency review is not supported on this repository. Please ensure that
 * Dependency graph is enabled." That is a setting in somebody's dashboard, and
 * a check whose precondition is a step outside the repository is a check that
 * does not run, which is the whole shape of fault this project keeps finding in
 * itself. So the question is asked here, where the answer travels with the code
 * and a clone can run it.
 *
 * It is also the better instrument for this particular question. Reviewing a
 * diff answers "did this change add one"; walking the tree answers "is there
 * one", which is what `LICENSE` actually claims, and it keeps being true of
 * every commit rather than only of the ones that touched a lockfile.
 *
 * PRODUCTION ONLY, and that is the whole of the scoping. A dev dependency's
 * terms do not reach a learner's browser: a copyleft bundler or test runner is
 * a tool this project uses, not code it distributes, and failing on one would
 * be the check crying wolf on the case that does not matter. `npm ls --omit=dev`
 * is what draws that line, so the line is npm's rather than a list here.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The licences that would change what `LICENSE` can say.
 *
 * Deliberately short. This is not a licence policy for a company, it is the
 * set whose reciprocal obligations reach across a network boundary or into a
 * whole application: AGPL requires source for anybody the *service* reaches,
 * and SSPL reaches further still. Ordinary GPL and LGPL are absent on purpose.
 * They are real obligations and they are not ones that would silently falsify
 * this repository's own licence file the way the two above would, and a
 * denylist long enough to need arguing about is one somebody waives.
 *
 * Matched on the SPDX identifier with its version stripped, so `AGPL-3.0`,
 * `AGPL-3.0-only` and `AGPL-3.0-or-later` are one entry rather than three that
 * have to be remembered.
 */
const DENIED = new Set(["AGPL", "SSPL", "OSL", "EUPL"]);

/** SPDX ids in an expression, in upper case, without version or clause suffix. */
function familiesIn(expression) {
  return expression
    .toUpperCase()
    .split(/[^A-Z0-9.+-]+/)
    .filter(Boolean)
    // `AGPL-3.0-or-later` and `MIT` alike reduce to what is before the first
    // digit group, which is the family.
    .map((token) => token.split(/-\d/)[0])
    .filter((token) => token && token !== "OR" && token !== "AND" && token !== "WITH");
}

/**
 * What a package says about itself.
 *
 * `license` is the field; `licenses` is the array some very old packages still
 * carry. A package that states neither is reported rather than assumed to be
 * fine, because "we could not tell" is not "it is permissive".
 */
function licenceOf(dir) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return { name: dir, version: "", expression: null };
  }
  const raw = pkg.license
    ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type ?? l).join(" OR ") : null);
  const expression = typeof raw === "string" ? raw : raw?.type ?? null;
  return { name: pkg.name ?? dir, version: pkg.version ?? "", expression: expression || null };
}

const paths = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  // The first line is the project itself, which is the thing being licensed
  // rather than a dependency of it.
  .filter((dir) => dir.includes("node_modules"));

if (paths.length === 0) {
  console.error("check-licences: no production dependencies found. Run `npm ci` first.");
  process.exit(1);
}

const denied = [];
const unstated = [];

for (const dir of new Set(paths)) {
  const { name, version, expression } = licenceOf(dir);
  if (!expression) {
    unstated.push(`${name}@${version}`);
    continue;
  }
  const hit = familiesIn(expression).find((family) => DENIED.has(family));
  if (hit) denied.push(`${name}@${version}: ${expression}`);
}

if (unstated.length > 0) {
  console.log(`check-licences: ${unstated.length} package(s) state no licence:`);
  for (const p of unstated) console.log(`  ${p}`);
  console.log("  Reported rather than failed: unstated is not the same as copyleft,");
  console.log("  and it is worth a person looking rather than a build stopping.\n");
}

if (denied.length > 0) {
  console.error("check-licences: a production dependency carries a licence LICENSE cannot absorb.\n");
  for (const line of denied) console.error(`  ${line}`);
  console.error(
    "\nThis repository's code is MIT and its data is CC BY-SA 4.0, and LICENSE says so."
    + "\nRemove the dependency, or change LICENSE and every place that quotes it.",
  );
  process.exit(1);
}

console.log(
  `✓ check-licences: ${new Set(paths).size} production packages, none under ${[...DENIED].join(", ")}.`,
);
