/**
 * Checks lines somebody typed for the bank, the way the drafter checks its own.
 *
 *   npx tsx scripts/check-lines.ts lines.json
 *
 * `lines.json` is a list of `[scene, beat, text]`, where a beat is a scene
 * beat id or `hurdle:<curveball id>`. Each line goes through the four checks
 * in `lib/scenes/gate.ts` against the scene's own word list and the drafter's
 * own refusals, and the verdict names what failed and which words the scene
 * cannot vouch for. Nothing is written: a line that passes goes into
 * `lib/scenes/bank.ts` by hand with `model: "authored"`, and `bank.test.ts`
 * runs the same checks again on every run of the suite.
 *
 * This is the tool a native speaker uses to add or replace a line, and it
 * exists so that "typed by a person" and "checked by the gate" are the same
 * thing rather than a promise.
 */
import { readFileSync } from "node:fs";
import { SCENES, FALLBACK_PHRASE } from "../lib/scenes/catalogue";
import { runGate } from "../lib/scenes/gate";
import { words } from "../lib/scenes/lexicon";
import { beatById } from "../lib/scenes/scripted";
import { answerForms, keylessContext, lacksFiniteVerb } from "./lib/sceneDraft";

const file = process.argv[2];
if (!file) {
  console.log("Usage: npx tsx scripts/check-lines.ts lines.json");
  process.exit(1);
}
const rows = JSON.parse(readFileSync(file, "utf8")) as [string, string, string][];
const contexts = new Map(SCENES.map((scene) => [scene.id, keylessContext(scene)]));
let failed = 0;
for (const [sceneId, beatId, text] of rows) {
  const scene = SCENES.find((s) => s.id === sceneId);
  const beat = scene ? beatById(scene, beatId) : undefined;
  if (!scene || !beat) { console.log(`??   ${sceneId}/${beatId}: no such beat`); failed++; continue; }
  const context = contexts.get(scene.id)!;
  const verdict = runGate(text, beat, context.gate);
  const why = verdict.failed.map((f) => (f === "vouching" ? `vouching [${verdict.unknown.join(" ")}]` : f));
  if (/\d/.test(text)) why.push("digit");
  if (/[–—:;]/.test(text)) why.push("dash or colon");
  if (words(text).some((w) => answerForms(beat, context.lexicon).has(w))) why.push("hands over the answer");
  if (lacksFiniteVerb(text, beat)) why.push("no finite verb");
  if (words(text).join(" ") === words(FALLBACK_PHRASE).join(" ")) why.push("the way out");
  if (why.length > 0) failed++;
  console.log(`${why.length ? "FAIL" : "ok  "} ${sceneId}/${beatId}: ${text}${why.length ? "   <- " + why.join(", ") : ""}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} pass.`);
process.exit(failed > 0 ? 1 : 0);
