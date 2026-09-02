/**
 * Phase 0 of `docs/19-situations.md`: how much of a conversation the dictionary
 * can already say.
 *
 *   npm run measure:scenes
 *   npm run measure:scenes -- --top 40      # more of the missing-word list
 *   npm run measure:scenes -- --scene arsti-aeg
 *
 * The whole Situations design rests on one number nobody had. Where a recorded
 * Ekilex usage fits a beat, the other side's line is attested: it costs a
 * query, needs no model, needs no gate, and works on a deployment with no key.
 * Where none fits, a model composes one inside a closed word list and four
 * checks decide whether the learner ever sees it. So the share of beats that
 * retrieval can fill is the share of the feature that is free and safe, and
 * until it is measured, every estimate of the cost, the risk and the shape of
 * the first build is a guess.
 *
 * This reads the shipped dictionary from the same files `prisma/seed.ts` reads,
 * so "the dictionary" here means what a fresh install actually has. No network,
 * no database, no key. It reports rather than passes or fails: a coverage
 * figure is an input to a decision, not a check somebody can break.
 */
import { NOUNS } from "../prisma/data/nouns";
import { VERBS } from "../prisma/data/verbs";
import { ADJECTIVES, PHRASES } from "../prisma/data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "../prisma/data/advanced";
import { HARVESTED } from "../prisma/data/harvested";
import expandedRaw from "../prisma/data/expanded.json";
import { LEVELS, SYLLABUS, unitById } from "../lib/collections/syllabus";
import { SCENES } from "../lib/scenes/catalogue";
import { buildLexicon, formsOf, withExtras, words, type DictEntry, type Lexicon } from "../lib/scenes/lexicon";
import { fits, isQuestion, spokenLine, topicForms, unknownWords, type Line } from "../lib/scenes/retrieval";
import type { BeatSpec, SceneSpec } from "../lib/scenes/types";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const TOP = arg("top", 25);
/*
  How many example lines to print under each beat.

  A measurement nobody can spot-check is a measurement nobody can trust, and
  this one has a lot of moving parts between a JSON file and a percentage. With
  `--show 3` every beat prints the lines it found, so the reader can see whether
  they are things a receptionist says or an artefact of a filter being wrong.
  Two of the three corrections this script needed were found exactly that way.
*/
const SHOW = arg("show", 2);
const sceneArg = process.argv.indexOf("--scene");
const onlyScene = sceneArg >= 0 ? process.argv[sceneArg + 1] : undefined;

/* The pool, assembled the way the seed assembles it. */

interface ExpandedEntry {
  lemma: string;
  pos: string;
  cefr: string | null;
  examples?: { et: string; en: string | null }[];
  forms?: { formType: string; value: string }[];
}

function clean(parts: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parts)) if (v) out[k] = v;
  return out;
}

const pool: DictEntry[] = [];

for (const [lemma, , cefr, nomSg, genSg, partSg, partPl, genPl, illSgShort] of [
  ...NOUNS,
  ...ADVANCED_NOUNS,
]) {
  pool.push({
    lemma,
    pos: "NOUN",
    cefr,
    parts: clean({
      NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg,
      PART_PL: partPl, GEN_PL: genPl, ILL_SG_SHORT: illSgShort,
    }),
    usages: [],
  });
}

for (const [lemma, , cefr, nomSg, genSg, partSg] of [...ADJECTIVES, ...ADVANCED_ADJECTIVES]) {
  pool.push({
    lemma,
    pos: "ADJECTIVE",
    cefr,
    parts: clean({ NOM_SG: nomSg, GEN_SG: genSg, PART_SG: partSg }),
    usages: [],
  });
}

for (const [lemma, , cefr, infMa, infDa, pres1sg, past1sg, partTud] of [...VERBS, ...ADVANCED_VERBS]) {
  pool.push({
    lemma,
    pos: "VERB",
    cefr,
    parts: clean({ INF_MA: infMa, INF_DA: infDa, PRES_1SG: pres1sg, PAST_1SG: past1sg, PART_TUD: partTud }),
    usages: [],
  });
}

/*
  A course phrase is an attested line in its own right, which is why it goes
  into the corpus and not only into the lexicon. `Tere!` is a thing somebody
  says. It is not a usage recorded against a headword, because Ekilex has no
  headword for a greeting, and the seed carries the hand-checked ones the
  built-in dictionary already had. A greeting beat is filled by exactly these.
*/
for (const [lemma, , cefr] of PHRASES) {
  pool.push({ lemma, pos: "PHRASE", cefr, parts: {}, usages: [lemma] });
}

for (const h of HARVESTED) {
  pool.push({ lemma: h.lemma, pos: h.pos, cefr: h.cefr, parts: h.parts, usages: h.usages });
}

for (const e of expandedRaw as ExpandedEntry[]) {
  const parts: Record<string, string> = {};
  for (const f of e.forms ?? []) if (!parts[f.formType]) parts[f.formType] = f.value;
  pool.push({
    lemma: e.lemma,
    pos: e.pos,
    cefr: e.cefr,
    parts,
    usages: (e.examples ?? []).map((x) => x.et),
  });
}

/* The corpus: every attested line the dictionary ships, tokenised once. */

const corpus: { line: Line; tokens: string[] }[] = [];
const seen = new Set<string>();
for (const entry of pool) {
  for (const text of entry.usages) {
    const key = `${entry.lemma} ${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    corpus.push({ line: { text, lemma: entry.lemma, cefr: entry.cefr }, tokens: words(text) });
  }
}

/* Every form the whole dictionary can account for. */

const allForms = new Set<string>();
const verbForms = new Set<string>();
for (const entry of pool) {
  const forms = formsOf(entry);
  for (const f of forms) allForms.add(f);
  if (entry.pos === "VERB") for (const f of forms) verbForms.add(f);
}
const hasFiniteVerb = (word: string) => verbForms.has(word);

/*
  The words the corpus needs that nothing in the dictionary can account for.

  Measured rather than typed, which matters: a list of Estonian function words
  written into a file would be this project writing Estonian (ADR-005), and a
  frequency ranking is the better answer anyway. What comes out is the shopping
  list for the syllabus unit that turns out to be missing.
*/
const unvouched = new Map<string, number>();
for (const { tokens } of corpus) {
  for (const t of tokens) if (!allForms.has(t)) unvouched.set(t, (unvouched.get(t) ?? 0) + 1);
}
const missing = [...unvouched.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const floor = missing.slice(0, TOP).map(([w]) => w);

/* The report. */

const pct = (n: number, d: number) => (d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`);
const num = (n: number) => n.toLocaleString("en-GB");
const col = (n: number, w: number) => String(n).padStart(w);

const said = corpus.filter((c) => spokenLine(c.line.text, hasFiniteVerb));
const questions = said.filter((c) => isQuestion(c.line.text));
const touched = corpus.filter(({ tokens }) => tokens.some((t) => !allForms.has(t))).length;

console.log("\nWhat the dictionary can already say");
console.log(`  ${num(pool.length)} entries, ${num(allForms.size)} distinct forms`);
console.log(`  ${num(corpus.length)} attested lines, ${num(said.length)} of them things a person says`);
console.log(`  ${num(questions.length)} of those are questions (${pct(questions.length, said.length)})`);

console.log("\nWords the corpus needs that nothing can vouch for");
console.log(`  ${num(unvouched.size)} distinct, in ${pct(touched, corpus.length)} of all attested lines`);
console.log(`  commonest ${TOP}: ${floor.join(" ")}`);

/*
  Every readable question in the corpus, whatever it is about.

  The per-beat funnel below asks for a question that also mentions one of the
  beat's own words, and that is the right test for a line the scene needs to be
  *about* something. It is the wrong test for a question, because a question
  usually does not name the thing it is asking about: "what happened" is a
  perfectly good way to ask what is wrong with somebody and contains no word
  from a health unit. So this is the other bound, and the gap between the two is
  the size of the prize for matching a question by move rather than by topic.
*/
console.log("\nReadable questions in the corpus, whatever they are about");
for (const level of ["A1", "A2", "B1"] as const) {
  const lex = lexiconFor(courseWordsTo(level));
  const floored = withExtras(lex, floor);
  const clean = questions.filter((q) => unknownWords(q.tokens, lex).length === 0).length;
  const one = questions.filter((q) => unknownWords(q.tokens, lex).length <= 1).length;
  const withFloor = questions.filter((q) => unknownWords(q.tokens, floored).length === 0).length;
  console.log(`  ${level}: ${col(clean, 4)} readable, ${col(withFloor, 4)} with the missing words, ${col(one, 4)} allowing one unknown`);
}

interface BeatRow {
  beat: string;
  move: string;
  topical: number;
  shaped: number;
  spoken: number;
  scene: number;
  scene1: number;
  course: number;
  course1: number;
  floored: number;
}

let beatsAll = 0;
let filledScene = 0;
let filledCourse = 0;
let filledFloor = 0;

/**
 * The words a learner at this level has met.
 *
 * Not the scene's own six units. Somebody sitting an A2 scene has been through
 * A1, and a line is readable to them if they have met its words anywhere in the
 * course. Measuring against the scene's units alone answers a different and
 * much harsher question, so both are reported: `scene` is what a learner who
 * has done only these units can read, and `course` is what the level can.
 */
function courseWordsTo(level: string): Set<string> {
  const ceiling = LEVELS.indexOf(level as (typeof LEVELS)[number]);
  const out = new Set<string>();
  for (const unit of SYLLABUS) {
    if (LEVELS.indexOf(unit.level) > ceiling) continue;
    for (const lemma of unit.lemmas) out.add(lemma);
  }
  return out;
}

function lexiconFor(lemmas: Set<string>) {
  return buildLexicon(pool.filter((e) => lemmas.has(e.lemma)));
}

function report(scene: SceneSpec) {
  const sceneWords = new Set<string>();
  for (const id of scene.units) {
    const unit = unitById(id);
    if (!unit) throw new Error(`scene ${scene.id} names a unit that does not exist: ${id}`);
    for (const lemma of unit.lemmas) sceneWords.add(lemma);
  }
  const courseWords = courseWordsTo(scene.level);
  for (const lemma of sceneWords) courseWords.add(lemma);

  const sceneLex = lexiconFor(sceneWords);
  const courseLex = lexiconFor(courseWords);
  const flooredLex = withExtras(courseLex, floor);

  console.log(`\n${scene.id}  ${scene.title}`);
  console.log(
    `  ${scene.level}, tests ${scene.tests}, ${sceneWords.size} words in its own units and ${courseWords.size} in the course to here`,
  );
  console.log("  beat        move       topical  +shape  +spoken   scene  scene+1  course  course+1  +floor");

  const rows: BeatRow[] = [];
  for (const beat of scene.beats) {
    rows.push(measure(beat, sceneLex, courseLex, flooredLex));
  }

  const filled = (pick: (r: BeatRow) => number) => rows.filter((r) => pick(r) > 0).length;
  beatsAll += rows.length;
  filledScene += filled((r) => r.scene);
  filledCourse += filled((r) => r.course);
  filledFloor += filled((r) => r.floored);
  console.log(
    `  filled: ${filled((r) => r.scene)} of ${rows.length} beats on the scene's units, ${filled((r) => r.course)} on the course, `
    + `${filled((r) => r.floored)} with the missing words, ${rows.filter((r) => r.floored >= 5).length} with five lines or more`,
  );
}

function measure(beat: BeatSpec, sceneLex: Lexicon, courseLex: Lexicon, flooredLex: Lexicon): BeatRow {
  const topic = topicForms(beat, courseLex);
  const row: BeatRow = {
    beat: beat.id, move: beat.move,
    topical: 0, shaped: 0, spoken: 0, scene: 0, scene1: 0, course: 0, course1: 0, floored: 0,
  };
  const examples: string[] = [];
  for (const { line, tokens } of corpus) {
    const base = { line, tokens, beat, topic, hasFiniteVerb };
    const onScene = fits({ ...base, lexicon: sceneLex });
    if (onScene.why === "off-topic") continue;
    row.topical++;
    if (onScene.why === "shape") continue;
    row.shaped++;
    if (onScene.why === "not-spoken") continue;
    row.spoken++;
    if (onScene.ok) row.scene++;
    if (onScene.unknown <= 1) row.scene1++;
    const onCourse = fits({ ...base, lexicon: courseLex });
    if (onCourse.ok) {
      row.course++;
      if (examples.length < SHOW) examples.push(`${line.text}  (${line.lemma})`);
    }
    if (onCourse.unknown <= 1) row.course1++;
    if (fits({ ...base, lexicon: flooredLex }).ok) row.floored++;
  }
  console.log(
    `  ${row.beat.padEnd(11)} ${row.move.padEnd(9)} ${col(row.topical, 7)} ${col(row.shaped, 7)} ${col(row.spoken, 8)}`
    + ` ${col(row.scene, 7)} ${col(row.scene1, 8)} ${col(row.course, 7)} ${col(row.course1, 9)} ${col(row.floored, 7)}`,
  );
  for (const example of examples) console.log(`                ${example}`);
  return row;
}

for (const scene of SCENES) {
  if (onlyScene && scene.id !== onlyScene) continue;
  report(scene);
}

console.log(`\nAcross ${beatsAll} beats`);
console.log(`  ${filledScene} fillable from the scene's own units alone (${pct(filledScene, beatsAll)})`);
console.log(`  ${filledCourse} fillable from the whole course to that level (${pct(filledCourse, beatsAll)})`);
console.log(`  ${filledFloor} fillable if the course also taught the ${TOP} commonest words it does not (${pct(filledFloor, beatsAll)})`);
const perScene = beatsAll / SCENES.filter((s) => !onlyScene || s.id === onlyScene).length;
const composed = Math.round(((beatsAll - filledFloor) / beatsAll) * perScene);
console.log(
  `  so one scene of ${perScene} beats needs about ${composed} composed lines, each one metered and past the gate`,
);
console.log("\nWhat this says");
console.log(
  "  Retrieval fills the moves every conversation shares, the greeting, the closing, the offer and the\n"
  + "  confirmation, and almost none of the moves that make it this conversation. The beats it cannot fill\n"
  + "  are the ones where the other side asks about something, and that is not a gap in the dictionary: a\n"
  + `  lexicographer records a sentence to illustrate a word, not to ask a question about it, so ${pct(questions.length, said.length)} of\n`
  + "  what is recorded is a question at all.",
);
console.log(
  "\n  Read the counts as an upper bound. A beat matches a line by keyword, which is the right test for\n"
  + "  whether a line is about something and not a test of whether it performs the move: the offer beat\n"
  + "  above matches a sentence meaning time does not stop, because it mentions the word for time. The\n"
  + "  examples print by default so that stays visible. Nobody should read a filled beat as a filled beat\n"
  + "  without reading its lines.",
);
console.log(
  "\n  So the composer is load-bearing rather than a fallback, and the gate in the design is what the whole\n"
  + "  module rests on. What retrieval buys is real and worth keeping: a scene opens and closes in attested\n"
  + "  Estonian, and a deployment with no key can still be greeted and said goodbye to.\n",
);
