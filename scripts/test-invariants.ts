/**
 * The rules this repository says are not negotiable, asserted.
 *
 * CLAUDE.md lists them and `docs/03-architecture.md` explains each one. A rule
 * written down is a rule until somebody is in a hurry; this is the version
 * that argues back. Every check names the rule it is defending and, where
 * there is one, the failure it already caused.
 *
 * ASSERT THE RULE, NOT TODAY'S MARKUP. Upside Lab kept a suite like this and
 * it drifted to twenty-three failures, because most of its checks matched an
 * exact class string or an exact sentence and so broke on the first honest
 * change. A check that costs more than it protects gets deleted rather than
 * fixed, and then the rule has nothing behind it at all. So these look for
 * the shape of a violation.
 *
 *   npx tsx scripts/test-invariants.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { extractEstonianEntries, extractEstonianSenses } from "../lib/dict/wiktionary";
import { resolvePos } from "../lib/dict/pos";
import { wordNote } from "../lib/estonian/dictation";
import { ACTION_LIMITS } from "../lib/security/actionLimits";
import { NOT_EXPORTED } from "../lib/legal/exportCoverage";
import { CATEGORY_KEYS } from "../lib/suggestions/model";
import { CASES } from "../lib/estonian/cases";
import { SYLLABUS } from "../lib/collections/syllabus";
import { PRACTICE_MODES } from "../lib/ux/modes";
import { CARD_TYPES } from "../lib/srs/cards";
import { buildOptions, parseGovernment, type Government } from "../lib/estonian/government";
import { formatGovernment } from "../lib/ekilex/mapper";
import { OFFICIAL_LEVELS, PASS_PCT, RETAKE_WAIT_PCT, specFor } from "../lib/exam/spec";
import type { Skill } from "../lib/assessment/types";
import { TOPIC_GROUPS } from "../lib/estonian/grammar";
import { NAV_MOTION } from "../lib/ux/navMotion";
import { DESTINATIONS } from "../lib/ux/nav";
import { rungOf } from "../lib/learn/ladder";
import { LETTER_CHARACTERS } from "../lib/ux/letterMotion";
import { DEMO_STEMS } from "../lib/collections/demoWords";
import { grammarGroupTerm, grammarTerm } from "../lib/estonian/terms";
import { CLOSED_CLASS_EXAMPLES, WORKED_FORMS, buildSystemPrompt } from "../lib/tutor/prompt";
import { TELLS, VOICE_RULES, findTells } from "../lib/copy/voice";
import { allGlosses, occasionsFor } from "../lib/copy/almanac";
import { readSituation, wordStanding } from "../lib/readiness/rungs";
import { SITUATIONS } from "../lib/readiness/situations";
import type { WordEvidence } from "../lib/readiness/evidence";
import { glossSenses } from "../lib/dict/gloss";
import {
  COUNT_ROUNDING, LEARNER_BANDS, MAX_LEARNER_SHARE, MIN_LEARNERS, MIN_REVIEWS,
} from "../lib/research/corpus";
import { CORRECT_FROM_RATING, MATURE_STATE } from "../lib/research/sections";
import { REVIEW_STATE } from "../lib/stats/history";
// @ts-expect-error - plain JS, shared with the .mjs browser suites it describes.
import { DECLARES_SUITE, NOT_IN_CI } from "./lib/suites.mjs";

let failures = 0;
let checks = 0;

function check(label: string, run: () => void) {
  checks += 1;
  try {
    /*
      A CHECK THAT RETURNS A PROMISE IS A CHECK THAT CANNOT FAIL.

      Nothing here is awaited, so an `async` body runs its assertions after this
      `try` has already printed PASS, and the rejection lands as an unhandled
      one that never reaches the tally. Written once, by accident, reaching for
      a dynamic `import`: the check passed, and passed again with the thing it
      was checking deliberately broken, which is the only reason it was noticed.

      The suite's whole argument is that a check nobody has made fail once is a
      check nobody knows the state of. This is the shape that makes that
      impossible to tell by reading, so it is refused rather than documented.
    */
    const result = run() as unknown;
    if (result && typeof (result as { then?: unknown }).then === "function") {
      throw new Error(
        "this check is async, so its assertions run after the suite has already "
          + "counted it as passing. Import what it needs at the top of the file.",
      );
    }
    console.log(`PASS  ${label}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.log(`FAIL  ${label}\n      ${message}`);
  }
}

function sourceFiles(dir: string, extensions = /\.(ts|tsx)$/): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, extensions));
    else if (extensions.test(entry)) out.push(full);
  }
  return out;
}

const APP = sourceFiles("app");
const LIB = sourceFiles("lib");
const COMPONENTS = sourceFiles("components");
const ALL = [...APP, ...LIB, ...COMPONENTS];
const read = (file: string) => readFileSync(file, "utf8");
/**
 * A file with its comments removed.
 *
 * Several checks below ask whether a file *calls* something. Matching the raw
 * text answers a different question — whether it mentions it — and a doc comment
 * explaining how a component grades was enough to satisfy the grading check on a
 * component that had stopped grading entirely. Prose about a rule is not
 * compliance with it.
 */
const code = (file: string) =>
  read(file)
    /*
      A comment is replaced by the newlines it spanned, not by a space. Several
      checks report `file:line` from this, and collapsing a forty-line header
      into one space put every one of those numbers well above the line it was
      naming, which sends a reader to the wrong part of the file to look for a
      fault they were told the name of. A single-line block comment still
      becomes a space, since it has no newline to stand in and two tokens must
      not be joined.
    */
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1) || " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * One exported function's body, from its signature to the next export.
 *
 * Coarse on purpose. A check that parses TypeScript is a check that breaks on
 * a syntax nobody thought about; this only needs to know which half of a file
 * a call site is in.
 */
/**
 * Every lemma the shipped dictionary carries, lower-cased.
 *
 * Read off the two files the seed loads rather than out of a database, so this
 * suite stays hermetic like the rest of it.
 */
function seededLemmas(): Set<string> {
  const out = new Set<string>();

  const expanded = "prisma/data/expanded.json";
  if (existsSync(expanded)) {
    const parsed: unknown = JSON.parse(readFileSync(expanded, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : (parsed as { entries?: unknown[] }).entries ?? [];
    for (const row of rows) {
      const lemma = (row as { lemma?: unknown }).lemma;
      if (typeof lemma === "string") out.add(lemma.toLowerCase());
    }
  }

  // The course harvest is a TypeScript module, so its lemmas are read as text.
  const harvested = "prisma/data/harvested.ts";
  if (existsSync(harvested)) {
    for (const m of readFileSync(harvested, "utf8").matchAll(/\blemma:\s*"((?:[^"\\]|\\.)*)"/g)) {
      out.add((m[1] ?? "").toLowerCase());
    }
  }

  return out;
}

function between(source: string, from: string): string {
  const start = source.indexOf(from);
  if (start < 0) return "";
  const rest = source.slice(start + from.length);
  const end = rest.indexOf("\nexport ");
  return end < 0 ? rest : rest.slice(0, end);
}
const SCHEMA = read("prisma/schema.prisma");
const CSS = read("app/globals.css");

/** Files that run in the browser, by their own declaration. */
const CLIENT = ALL.filter((f) => /^["']use client["']/m.test(read(f).trimStart()));

// ── Never ship a credential to the client ────────────────────────────────────

check("no secret carries a NEXT_PUBLIC_ prefix", () => {
  const secrets = /NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)/g;
  for (const file of [...ALL, "middleware.ts", "next.config.ts", ".env.example"]) {
    for (const hit of read(file).match(secrets) ?? []) {
      // The Supabase anon key is designed to be public: it authenticates who
      // is signed in and never reads or writes app data on its own.
      assert.equal(hit, "NEXT_PUBLIC_SUPABASE_ANON_KEY", `${file} exposes ${hit}`);
    }
  }
});

check("no server-only key is read from a file that runs in the browser", () => {
  const serverOnly = /process\.env\.(ANTHROPIC_API_KEY|OPENAI_API_KEY|OPENROUTER_API_KEY|EKILEX_API_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL)/;
  for (const file of CLIENT) {
    const hit = serverOnly.exec(read(file));
    assert.equal(hit, null, `${file} reads ${hit?.[1]} in the browser`);
  }
});

check("the keyed services are only ever reached from the server", () => {
  /*
    Ekilex, Wiktionary and the TartuNLP speech service are proxied through
    Route Handlers. A client calling one directly would put its key, or at
    least its quota, in the browser, and it is why the policy in
    lib/security/headers.ts names no third party in connect-src.

    A `fetch`, specifically, and not a mention: CC BY requires the credit, so
    every entry links to ekilex.ee and must go on doing so.
  */
  const call = /(fetch|axios|XMLHttpRequest)[^\n]{0,80}(ekilex\.ee|en\.wiktionary\.org|api\.tartunlp\.ai)/;
  for (const file of CLIENT) {
    const hit = call.exec(read(file));
    assert.equal(hit, null, `${file} calls ${hit?.[2]} from the browser`);
  }
});

// ── Never write Estonian, never generate morphology (ADR-005, ADR-017) ───────

/*
  AN ATTESTED FORM ALWAYS BEATS A DERIVED ONE, AND THE TYPE IS WHAT ENFORCES IT.

  The app taught `toasse` as the illative of `tuba`. The dictionary held
  `tuppa` the whole time, under `ILL_SG_SHORT`, for 2,969 of the shipped
  entries. The illative is the one case of the eleven with a lexically
  unpredictable short form (the aditiiv), and `NounStems` had no field for it,
  so no screen could have shown it: `deriveCase(genSg, key)` took a bare
  genitive, and eight callers asked it for a form. Two of those decided whether
  a learner was right. A card asked for the illative of `aeg`, expected
  `ajasse`, and marked `aega` wrong; the scheduler then brought that card back
  until the learner stopped typing the correct answer.

  Prose would not have stopped it and did not: ADR-005 already said an attested
  form wins, and the code disagreed for a year. What stops it is that
  `illSgShort` is a REQUIRED field on `NounStems`, so a caller holding only a
  genitive stem does not compile. These two checks are the parts of that a
  regex can see: the field stays required, and nobody rebuilds the old
  shortcut beside it.
*/
/*
  WHAT THE DICTIONARY STORES IS DECIDED BY THE RULES, NOT BESIDE THEM.

  ADR-005 amendment 1 lets a deterministic rule build a form off a stored one,
  and the rules are real: ten case endings on a genitive stem, six persons on a
  stored first person. What they are not is complete. A seeded deployment could
  not say `on`, could not say `oli` for any verb in the language, and had no
  short pronoun forms at all, which is what an Estonian sentence is made of.

  So the two builders store what the rules miss, and they ask the rules rather
  than carrying a list: `unreachableSlots` for a verb and `unreachableCaseForms`
  for a nominal. A list would be two copies of one fact, and the copy in the
  builder is the one that goes stale in silence, because nothing about a
  missing form looks like an error. It looks like a word that inflects less.

  Anchored on the calls, because a builder can import a function and go on using
  a table of its own, which is exactly what the weakest-case query did one
  directory over.
*/
check("the harvest asks the rules which forms they cannot reach", () => {
  for (const file of ["scripts/harvest-ekilex.ts", "scripts/expand-seed.ts"]) {
    const src = code(file);
    assert.match(
      src, /unreachableSlots\(/,
      `${file} stopped asking which verb slots the rule misses, so a seeded verb `
        + "goes back to answering seven of its eight conjugation cards",
    );
    assert.match(
      src, /unreachableCaseForms\(/,
      `${file} stopped asking which case forms the rule misses, so the short `
        + "pronoun forms go back to being absent from the dictionary",
    );
  }
});

/*
  And the pair a learner is shown is two forms somebody wrote down.

  `alsoRight` is what puts `tuppa / toasse` and `minule / mulle` on a screen and
  on a card's back, and it may hold only forms the dictionary attests. The one
  exception is the long illative, which is regular and is the other half of a
  pair Estonian genuinely has; anywhere else a suffix guess printed beside a
  retrieved form would assert the guess is a word.
*/
check("only the illative may offer a derived form as the pair", () => {
  const derive = code("lib/estonian/derive.ts");
  assert.match(
    derive,
    /spec\.key === "ILLATIVE" && short\s*\n?\s*\?\s*retrieved\[0\] \?\? derived/,
    "the illative's own pair rule changed shape, so either the long form stopped "
      + "being offered beside `tuppa` or a suffix guess started standing in as a "
      + "second attested word elsewhere",
  );
  assert.match(
    derive,
    /attested\.length === 2 \? attested\[1\] : undefined/,
    "the pair stopped being drawn only where a case has exactly two attested "
      + "forms, so the second of a list of variants can reach a screen: Ekilex "
      + "records three elatives for `kodu` and the second is not one to teach",
  );
});

check("the short illative is a required stem, not an optional one", () => {
  const derive = code("lib/estonian/derive.ts");
  assert.match(
    derive,
    /readonly illSgShort: string \| null;/,
    "NounStems.illSgShort stopped being required, so a caller that never asked "
      + "the dictionary compiles again and the illative goes back to a suffix rule",
  );
  assert.doesNotMatch(
    derive,
    /illSgShort\?:/,
    "NounStems.illSgShort became optional, which is the shape the bug had",
  );
});

/*
  AND THE NOMINATIVE PLURAL IS THE SAME RULE ON THE OTHER SIDE OF THE TABLE.

  `genSg + d` sat in `buildCaseTable` under a comment calling it "the one
  regular plural", and `npm run audit:cases` put that to the Institute for all
  5,143 nominals the dictionary ships. Right for 5,098, and wrong for a whole
  category rather than a scatter of odd words: a pronoun is suppletive in the
  nominative plural, so `see` goes to `need` and this printed `selled`, `too`
  goes to `nood` and this printed `tolled`, and `kes` and `mis` do not change
  at all and were printed as `kelled` and `milled`. Those are first-lesson
  words on the dictionary entry, the grammar reference and the worksheet.
  Thirty-three mass nouns (`sealiha`, `sularaha`, `tähelepanu`) have no plural
  for Ekilex to record and were being handed one.

  So `nomPl` is required for the reason `illSgShort` is, and nothing derives
  it. `NOM_PL` is on `PRINCIPAL_FORM_TYPES`, which is what makes the harvest,
  the live enrichment, a hand edit and an accepted correction all carry it
  without being told to.
*/
check("the nominative plural is a required stem, and is never an ending", () => {
  const derive = code("lib/estonian/derive.ts");
  assert.match(
    derive,
    /readonly nomPl: string \| null;/,
    "NounStems.nomPl stopped being required, so a caller that never asked the "
      + "dictionary compiles again and the plural goes back to an ending",
  );
  assert.doesNotMatch(derive, /nomPl\?:/, "NounStems.nomPl became optional");
  /*
    The join itself, anywhere in the app. `d` is one letter, so this is anchored
    on the genitive stem rather than on the letter: what is banned is building a
    word out of the stem the singular obliques are built on plus a `d`.
  */
  const offenders = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => /\$\{\s*(?:stems\.)?genSg\s*\}d\b|genSg\s*\+\s*"d"/.test(code(file)));
  assert.deepEqual(
    offenders,
    [],
    "a nominative plural is being built out of the genitive stem and a `d`, "
      + "which is right for 5,098 of the dictionary's 5,143 nominals and wrong "
      + "for every pronoun in it",
  );
  assert.ok(
    (code("lib/estonian/types.ts").match(/"NOM_PL"/g) ?? []).length === 1,
    "NOM_PL left PRINCIPAL_FORM_TYPES, so the harvest and a hand edit stop "
      + "carrying the one form the table now depends on",
  );
});

/*
  A PRINCIPAL PART IS ONE FORM, AND THE MAPPER IS WHERE THAT IS DECIDED.

  `Form`'s unique key includes the value because Estonian has genuine parallel
  forms (`raamatutes` beside `raamatuis`), which is right for the retrieved
  table and wrong for the six a learner memorises. Ekilex gives two partitive
  plurals for most nouns and `mapEkilexDetails` wrote both down as `PART_PL`:
  2,016 shipped entries carried a doubled partitive plural and 120 a doubled
  genitive plural, and which of the pair the app used was decided by whoever
  read the rows, `stemsFrom` taking the first the database returned and every
  `Object.fromEntries` caller taking the last.

  The check is a code check rather than a data one because the data half is
  hermetic and lives in `lib/estonian/attested.test.ts`, where it can fail on a
  word. What a regex can see is that the mapper still keeps one.
*/
/*
  A SUITE FINDS A FORM FIELD BY ITS NAME, NOT BY A PREFIX OF ITS PLACEHOLDER.

  `getByPlaceholder` is a substring match. `scripts/e2e.mjs` and
  `scripts/test-edit.mjs` both addressed the add-word genitive box as
  `getByPlaceholder("toa")`, which was unique until the form grew a nominative
  plural whose example is `toad`. Both suites then threw on their first
  interaction and reported a Playwright timeout, which sends whoever reads it
  to the app rather than to the locator: e2e lost 9 of its 27 checks and the
  editing suite 9 of 10.

  The check is exact rather than a ban on `getByPlaceholder`: a placeholder is
  a perfectly good handle where it is unambiguous, and the English boxes
  ("word", "sõna") stay that way. What is caught is a locator that is a strict
  prefix of another example on the same form, which is the shape that breaks
  when a field is added and is invisible until it does.
*/
check("no browser suite finds a field by a placeholder another field shares", () => {
  const examples = [...code("app/(app)/dictionary/AddWord.tsx")
    .matchAll(/\["[A-Z_]+", "[^"]+", "([^"]+)"\]/g)]
    .map((m) => m[1] as string);
  assert.ok(examples.length >= 10, "the add-word field table stopped being readable from here");

  const bad: string[] = [];
  for (const file of readdirSync("scripts").filter((f) => f.endsWith(".mjs"))) {
    for (const m of code(join("scripts", file)).matchAll(/getByPlaceholder\(\s*"([^"]+)"/g)) {
      const used = m[1] as string;
      const shadowed = examples.filter((e) => e !== used && e.startsWith(used));
      if (examples.includes(used) && shadowed.length > 0) {
        bad.push(`${file}: "${used}" is also the start of ${shadowed.map((e) => `"${e}"`).join(", ")}`);
      }
    }
  }
  assert.deepEqual(
    bad,
    [],
    "a suite addresses a form field by a placeholder that another field's "
      + "placeholder begins with, so adding a field makes the locator ambiguous "
      + "and the suite throws before its first check",
  );
});

/*
  ONE LANGUAGE PER COLUMN, BECAUSE A SCREEN CANNOT MARK WHAT IT CANNOT TELL.

  `Lexeme.notes` held the further English senses Wiktionary lists and, after any
  live lookup, Ekilex's Estonian explanation, which had overwritten them. So the
  entry rendered either in one unlabelled box, a screen reader read the Estonian
  with English sounds, and the first person to look `aadress` up with a key
  deleted "email address" from the shared dictionary for everybody.

  `definition` is the Estonian one. The check is that nothing writes Ekilex's
  explanation into the English column again, which is the mistake that is easy
  to make and impossible to see: both are a `String?` holding a sentence.
*/
/*
  A TASK'S KIND IS ONE TABLE, THE WAY A CARD'S TYPE ALREADY IS.

  It was four, and no two agreed. The schema said `HOMEWORK | VOCABULARY`, the
  data model page said the same, `components/TaskRow.tsx` kept a label table of
  five, and `scripts/demo-data.ts` wrote three of those five. Two actions in the
  app write a tag and between them they write exactly two values, so the other
  three were a kind of task no deployment can produce, drawn in the fixture that
  every screenshot and every browser suite is measured in.
*/
/*
  ONE PLACE PLAYS A CLIP, BECAUSE ONE PLACE KNOWS WHAT A REFUSAL MEANS.

  Every browser blocks `HTMLAudioElement.play()` on a page nobody has touched
  yet and rejects it with a `NotAllowedError`. The clip is in hand and the
  service answered: it is a fact about the gesture. `components/Speak.tsx` knew
  that and said so in a comment; the minimal-pairs round kept its own copy of
  the same three lines and did not, wrapping the fetch and the play in one
  `try` and setting a state that replaces the whole drill with "No audio, no
  drill. It runs on TartuNLP and needs a connection." That round autoplays on
  mount, which is the no-gesture case by construction, so on every phone and
  every Safari a learner opening it was told their connection was the problem
  and never shown the 80px play button behind that screen.

  `playClip` is the one answer. `components/Recorder.tsx` is exempt by name: it
  plays back the learner's own recording, from a blob it already holds, on a
  click, so there is no clip to fetch and no autoplay to be refused.
*/
/*
  EVERY CASE A GOVERNMENT CAN NAME IS A CASE THE TABLE KNOWS.

  Ekilex records a verb's government as the question word it answers, and
  `formatGovernment` names the case beside it so `parseGovernment` can read one
  out. The table of question words was typed and was missing three of the
  fourteen: essive, terminative and abessive. So `kellena` was left unannotated,
  the entry parsed to no case at all, and `töötama` had no government card even
  though "to work as" is a first-year sentence. Worse, `esitama` and `käsitama`
  govern the essive *beside* the partitive, so the drill could offer it as a
  wrong answer and mark a learner wrong for knowing it, which is the exact
  fault `alsoGoverned` was built to prevent, arriving through a gap in a table.

  It is read off `CASES` now, so a case cannot be missing. This checks the
  coverage rather than the code, because the point is the answer.
*/
check("every case a government can name is one the table knows", () => {
  const unread: string[] = [];
  for (const spec of CASES) {
    if (spec.key === "NOMINATIVE") continue; // Nothing governs it.
    // The question a class asks for this case, which is how Ekilex writes a
    // government. If the table knows it, the round trip names the case.
    const asked = spec.question.split(/\s+/)[0]!.replace(/\?/g, "");
    const parsed = parseGovernment(formatGovernment([asked]));
    if (parsed?.caseKey !== spec.key) {
      unread.push(`${spec.key}: "${asked}" reads as ${parsed?.caseKey ?? "no case"}`);
    }
  }
  assert.deepEqual(
    unread,
    [],
    "a case the app teaches cannot be read back out of a government written the "
      + "way Ekilex writes one, so a verb governing it has no card and can be "
      + "offered as a wrong answer",
  );
});

/*
  THE PAPER'S OWN NUMBERS ARE THE BOARD'S, AND THE DOCUMENT IS WHERE THEY COME
  FROM.

  `docs/16-exam.md` cites the state examination's published shape: how long each
  part runs, what it is worth, what a pass is and how far below one a candidate
  has to wait six months. `lib/exam/spec.ts` is a second copy of all of that,
  and the whole feature's claim is that it imitates the real paper: a minute or
  a mark out of step is a candidate rehearsing the wrong exam, which is the one
  thing a mock is for.

  The document is the authority and the code is the copy, so this reads the
  table and compares. It is the shape the README's dictionary size already
  takes: a figure stated twice is a figure that drifts, and the fix is to make
  one of them read the other rather than to check them by eye.
*/
check("the mock paper's minutes and marks are the ones the exam doc cites", () => {
  const doc = read(join("docs", "16-exam.md"));
  /*
    | A2 | 30 min | 30 min | 50 min | 15 min | 80, twenty per part |
    The columns are in the order the document heads them, which is the order a
    candidate sits them in and not the order `specFor` lists its parts, so the
    comparison is by skill rather than by position.
  */
  const HEADED: readonly Skill[] = ["writing", "listening", "reading", "speaking"];
  const wrong: string[] = [];
  let compared = 0;

  for (const level of OFFICIAL_LEVELS) {
    const row = new RegExp(`^\\| ${level} \\|(.+)\\|\\s*$`, "m").exec(doc);
    if (!row?.[1]) { wrong.push(`${level}: the doc has no row for it`); continue; }
    const cells = row[1].split("|").map((c) => c.trim());
    const spec = specFor(level);

    HEADED.forEach((skill, i) => {
      // "30 to 35 min" is the Board publishing a range; the app sits the longer
      // one, which is the honest choice and is what the cell's last number says.
      const minutes = [...(cells[i] ?? "").matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      const published = minutes[minutes.length - 1];
      const part = spec.parts.find((p) => p.skill === skill);
      if (published === undefined || !part) {
        wrong.push(`${level} ${skill}: nothing to compare`);
        return;
      }
      compared++;
      if (part.minutes !== published) {
        wrong.push(`${level} ${skill}: the paper runs ${part.minutes} min, the doc says ${published}`);
      }
    });

    const stated = Number(/^(\d+),/.exec(cells[HEADED.length] ?? "")?.[1]);
    const total = spec.parts.reduce((n, p) => n + p.points, 0);
    compared++;
    if (stated !== total) wrong.push(`${level}: the paper is out of ${total}, the doc says ${stated}`);
  }

  assert.ok(compared >= 20, `only ${compared} figures compared; the doc's table stopped being readable`);
  assert.deepEqual(wrong, [], "the mock paper and the document that cites the Board disagree");

  // The two thresholds the same document states in a sentence rather than a table.
  assert.match(doc, new RegExp(`pass is sixty percent`, "i"), "the doc stopped stating the pass mark");
  assert.equal(PASS_PCT, 60, "PASS_PCT drifted from the sixty percent the doc cites");
  assert.match(doc, /forty five percent/i, "the doc stopped stating the retake threshold");
  assert.equal(RETAKE_WAIT_PCT, 45, "RETAKE_WAIT_PCT drifted from the forty five percent the doc cites");
});

/*
  SLOW IS PLAYBACK, NOT A SECOND CLIP.

  TartuNLP's `speed` is a duration regulator inside the acoustic model, and a
  clip asked for at 0.6 is every phoneme held on repeated frames: flat, buzzing,
  and reported as robotic. The route forwards no speed, the one clip is played
  slower with the pitch held in lib/audio/clip.ts, and every clip is trimmed,
  levelled and written as 16-bit by lib/audio/wav.ts before it is cached. A
  second file setting `playbackRate` would be a second answer to how slow is
  done, and a `speed` reappearing in the route would be the model doing it.
*/
check("slow is the same clip played slower, and every clip is prepared before it is kept", () => {
  const route = code("app/api/tts/route.ts");
  assert.doesNotMatch(route, /\bspeed\b/, "the speech route is asking the model to slow down again");
  assert.match(route, /prepareClip\(raw\)/, "the route stopped calling prepareClip on what the service sent");
  assert.match(
    route,
    /const audio = Buffer\.from\(prepare\(raw\)\);[\s\S]{0,200}writeAudio\(hash, audio\)/,
    "a clip reaches the cache without going through prepareClip",
  );
  const player = code("lib/audio/clip.ts");
  assert.match(player, /preservesPitch\s*=\s*true/, "the slow play stopped holding the pitch");
  assert.match(player, /playbackRate\s*=\s*SLOW_RATE/, "the slow play stopped reading SLOW_RATE");
  const others = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => file !== join("lib", "audio", "clip.ts"))
    .filter((file) => /playbackRate|preservesPitch/.test(code(file)));
  assert.deepEqual(others, [], "a second file decides how slow a clip plays");
});

check("nothing plays a clip outside lib/audio/clip.ts", () => {
  const offenders = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => file !== join("lib", "audio", "clip.ts"))
    .filter((file) => file !== join("components", "Recorder.tsx"))
    .filter((file) => /new Audio\([^)]*\)\s*\.play\(|new Audio\(/.test(code(file)));
  assert.deepEqual(
    offenders,
    [],
    "a clip is played outside `playClip`, so that caller decides for itself "
      + "whether a browser refusing to autoplay is a missing speech service",
  );
  assert.match(
    code(join("lib", "audio", "clip.ts")),
    /NotAllowedError/,
    "playClip stopped telling a blocked autoplay from a real failure",
  );
});

check("the room a clip is heard in is made in one module, and only the rounds that vary it ask", () => {
  /*
    `lib/audio/conditions.ts` is the one table of how people talk (at speed,
    over café noise, down a phone line, from halfway through) and
    `lib/audio/mixer.ts` is the one place a condition becomes sound. A second
    `AudioContext` is a second play path, which is the fault the `new Audio(`
    check above exists for; the feedback tones are the one other legitimate
    holder, because they are not a clip.

    The pairing is the other half. A round that plays a card unseen is the
    round this exists for, so the two deck-based listening rounds have to ask
    `conditionFor` rather than each deciding on its own that a word is clean.
    And the mock exam may not: the real paper is read in a studio, and a
    condition there would be a paper harder than the one it imitates.
  */
  const holders = ALL
    .filter((file) => !/\.(test|itest)\.tsx?$/.test(file))
    .filter((file) => /\bAudioContext\b/.test(code(file)))
    .sort();
  assert.deepEqual(
    holders,
    ["lib/audio/feedback.ts", "lib/audio/mixer.ts"],
    "an AudioContext is opened somewhere other than the mixer and the feedback tones",
  );
  assert.match(code("lib/audio/clip.ts"), /playThrough\(/, "playClip stopped routing a condition through the mixer");
  // The rate is a playback rate on the element with the pitch held, never a
  // number sent to the service, which is the rule the slow play states.
  assert.match(code("lib/audio/clip.ts"), /playbackRate\s*=\s*condition\.speed/, "the player stopped reading the condition's speed");
  assert.doesNotMatch(code("lib/audio/clip.ts"), /speed:/, "a speed is being sent to the speech service again");

  for (const file of [
    "app/(app)/review/listening/ListeningSession.tsx",
    "app/(app)/review/dictation/DictationSession.tsx",
  ]) {
    assert.match(code(file), /conditionFor\(/, `${file} plays a card unseen and no longer asks which room it is heard in`);
    assert.match(code(file), /describeHearing\(/, `${file} stopped saying which room it was, after the answer`);
  }
  for (const file of sourceFiles("app/(app)/exam")) {
    assert.ok(!/condition=/.test(code(file)), `${file} varies the delivery, and the real paper is read in a studio`);
  }

  // The table's own promises: every condition says how it is heard, and a new
  // word is always heard clearly.
  const table = code("lib/audio/conditions.ts");
  assert.match(table, /clean: 0,/, "a new word is no longer guaranteed a quiet room");
  const ids = [...table.matchAll(/\{ id: "([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 4, "the conditions table shrank below the four ways people talk");
  for (const id of ids) {
    assert.match(table, new RegExp(`\\b${id}: \\d+,`), `${id} has no opening point in OPENS_AT`);
  }
});

check("a task's kind is the same set wherever it is written down", () => {
  const table = code("lib/ux/agenda.ts");
  const declared = [...table.matchAll(/^  ([A-Z_]+): "/gm)].map((m) => m[1] as string);
  assert.ok(declared.length >= 2, "TASK_TAGS stopped being readable from lib/ux/agenda.ts");

  const written = new Set<string>();
  for (const file of [...sourceFiles("app"), ...sourceFiles("scripts")]) {
    for (const m of code(file).matchAll(/\btag:\s*"([A-Z_]+)"/g)) written.add(m[1] as string);
  }
  assert.deepEqual(
    [...written].filter((t) => !declared.includes(t)).sort(),
    [],
    `a tag is written that TASK_TAGS does not declare (declared: ${declared.join(", ")})`,
  );
  assert.ok(
    !/TAG_LABEL/.test(code("components/TaskRow.tsx")),
    "TaskRow keeps a second table of task kinds, which is how the first one rotted",
  );
});

check("Ekilex's Estonian explanation has a column of its own", () => {
  assert.match(
    code("lib/ekilex/mapper.ts"),
    /definition: details\.definitions\[0\]/,
    "mapEkilexDetails stopped returning Ekilex's explanation as `definition`",
  );
  const offenders = ["app", "lib", "prisma"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => /\bnotes:\s*(?:\w+\.)*(?:definition|definitions)\b|\bnotes:\s*mapped\.definition\b/.test(code(file)));
  assert.deepEqual(
    offenders,
    [],
    "an Estonian definition is being written into `notes`, which holds English, "
      + "so the entry cannot label it or mark its language and a live lookup "
      + "overwrites the English senses with it",
  );
  assert.match(
    read("prisma/schema.prisma"),
    /definition\s+String\?/,
    "Lexeme.definition left the schema",
  );
  /*
    AND A COLUMN THE SEED ONLY SOMETIMES OWNS IS CLAIMED ONLY WHEN IT HAS A
    VALUE.

    `onlyWhenOwned` means "written for entries whose payload carries this key",
    and it exists because the dictionary editor and the live Ekilex lookup write
    these columns too. Written as `definition: word.note`, the key is present
    even when the value is null, so the harvest would hand `null` to the update
    for every word Ekilex has no explanation for and a reseed would erase a
    definition the live lookup had fetched for one. Spread, and it claims
    nothing it cannot fill. Verified against a real database: a definition
    planted on a harvested word with no explanation survives a reseed.
  */
  assert.match(
    code("prisma/seed.ts"),
    /\.\.\.\(word\.note \? \{ definition: word\.note \} : \{\}\)/,
    "the harvest claims `definition` unconditionally, so a reseed nulls it for "
      + "every word Ekilex has no explanation for, erasing whatever the live "
      + "lookup had fetched",
  );
});

check("a principal part is one form, whatever Ekilex sends", () => {
  const mapper = code("lib/ekilex/mapper.ts");
  assert.match(
    mapper,
    /principalTaken\.has\(principal\)/,
    "mapEkilexDetails stopped keeping one value per principal part, so which "
      + "partitive plural the app teaches goes back to being decided by whoever "
      + "reads the rows",
  );
});

/*
  ONE WRITER OF THE BUILT DICTIONARY, BECAUSE THE DIFF IS HOW ANYBODY REVIEWS IT.

  Four scripts write `prisma/data/expanded.json`: the builder and the three
  audits that correct a gloss, a part of speech and a nominative plural in
  place. Three of them wrote it compact and the file in the repository is one
  key per line, so the next full run of any of them would have collapsed 5,363
  entries into a single 3MB line and buried whatever it actually changed.
  `scripts/lib/expandedFile.ts` is the one serialiser.
*/
check("the built dictionary has one writer", () => {
  const offenders = sourceFiles("scripts")
    .filter((file) => !file.endsWith("lib/expandedFile.ts"))
    .filter((file) => {
      const src = code(file);
      return /writeFileSync\([^)]*expanded\.json|writeFile\([^)]*expanded\.json/.test(src)
        || (/expanded\.json/.test(src) && /JSON\.stringify\([^)]*null,\s*\d/.test(src));
    });
  assert.deepEqual(
    offenders,
    [],
    "a script writes prisma/data/expanded.json itself instead of through "
      + "scripts/lib/expandedFile.ts, so its own indentation decides how the "
      + "next dictionary diff reads",
  );
});

check("nothing builds a case form out of a bare stem and a suffix", () => {
  /*
    `spec.suffix` is the eleven endings, and joining one onto a stem is exactly
    what produced `toasse`. `lib/estonian/derive.ts` owns that operation
    because it is the only module that also holds the exceptions; anywhere else
    it is a second answer to the question, and a second answer is how the first
    one rots.

    WHAT IS CAUGHT IS THE JOIN, not the word `suffix`. Written the wide way
    first, this fired on four honest files and would have been waived, which is
    how a check stops being read: the grammar pages print `-sse` as the name of
    an ending, `lib/tutor/prompt.ts` tells the model what the ending is, and
    `lib/dict/search.ts` sorts the endings by length in order to *strip* them
    off something a learner typed, which is the opposite direction and is how
    `toasse` gets recognised as a word rather than produced as one. None of
    those makes a form.
  */
  const joins = [/\+\s*\w+(?:\.\w+)*\.suffix\b/, /\$\{[^}]+\}\$\{\s*\w+(?:\.\w+)*\.suffix\s*\}/];
  const offenders = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => file !== "lib/estonian/derive.ts" && !/\.i?test\.tsx?$/.test(file))
    .filter((file) => joins.some((join) => join.test(code(file))));
  assert.deepEqual(offenders, [], "a case suffix is being joined to a stem outside lib/estonian/derive.ts");
});

/*
  A SCREEN THAT PRINTS A CASE FORM PRINTS BOTH WHERE ESTONIAN HAS TWO.

  The illative is the one case with two right answers, and every way of
  printing one of them alone is a choice about which word to be wrong about:
  leading with the long form hides `tuppa` and `aega`, and leading with the
  short one prints `aadressi` under the sisseütlev beside the identical
  omastav and osastav, hiding `aadressisse`. Both readings shipped, three
  weeks apart, and each was written as the fix for the other.

  `lib/srs/cards.ts` and `lib/collections/lesson.ts` had been joining on ` / `
  since long before either, so the app had already answered this and three
  screens had not caught up. They read `shownForms` now, and this fails on a
  fourth that renders `singular` or `.value` on its own.

  IT IS ANCHORED ON THE CALL, not on the word "illative", because a screen can
  import the helper and go on printing `row.singular` beside it, which is the
  shape every check in this file has been caught by at least once.
*/
check("a screen that prints a case form prints both where Estonian has two", () => {
  const screens = [
    "app/(app)/dictionary/DictionaryClient.tsx",
    "app/(chromeless)/welcome/page.tsx",
  ];
  for (const file of screens) {
    assert.match(
      code(file),
      /shownForms\(/,
      `${file} prints a case form without asking shownForms, so it shows one illative and hides the other`,
    );
  }
  /*
    The grammar reference goes through `lib/progress/caseExamples.ts`, which
    keeps the two apart on purpose: `form` is matched against attested
    sentences and `tuppa / toasse` is not a word anybody wrote. So the check
    on that pair is that the field survives and the page renders it.
  */
  assert.match(
    code("lib/progress/caseExamples.ts"),
    /alsoRight/,
    "caseExamples stopped carrying the second form, so the grammar reference prints one illative",
  );
  assert.match(
    code("app/(app)/grammar/[caseKey]/page.tsx"),
    /example\.alsoRight/,
    "the grammar reference stopped printing the second form beside the first",
  );
  /*
    And the pair on screen has to be a pair the marker accepts, or a learner
    copies what they were shown and is told they are wrong. ` / ` is the
    separator `acceptedAnswers` splits on, so this is the one spelling of it
    that keeps those two facts the same fact.
  */
  assert.match(
    code("lib/estonian/answer.ts"),
    /split\(\/\\s\*\[\/,;\]/,
    "acceptedAnswers stopped splitting on the separator every screen shows a pair with",
  );
});

check("every screen and marker that needs a case form asks the one function for it", () => {
  /*
    Eight callers used `deriveCase`, and the two that graded answers are the
    reason this is a check rather than a note: `lib/srs/cards.ts` writes the
    back of a flashcard and `lib/estonian/writing.ts` decides what a written
    sentence has to contain. Both now go through `caseAnswer`, which is the one
    place that puts an attested form ahead of a derived one, and both must
    keep doing so.
  */
  const callers = [
    "lib/srs/cards.ts",
    "lib/estonian/writing.ts",
    "lib/progress/caseExamples.ts",
    "lib/collections/lesson.ts",
    "lib/collections/checkpoint.ts",
    "lib/assessment/items.ts",
  ];
  /*
    Reaching it through `lib/estonian/gapForms.ts` counts, and widening the rule
    is what this file's own instruction says to do when a check fires on honest
    code. That module's whole job is to answer "every spelling of this word",
    it asks `caseAnswer` for every case, and it has an invariant of its own
    saying it must keep doing so. Two of these callers stopped writing the loop
    themselves and started asking it.
  */
  const asksForACase = /caseAnswer\(|gapForms(?:FromParts)?\(/;
  for (const file of callers) {
    assert.match(
      code(file),
      asksForACase,
      `${file} produces a case form without asking caseAnswer, so it cannot see the short illative`,
    );
  }
  for (const file of ["app/(app)/dictionary/DictionaryClient.tsx", "app/(chromeless)/welcome/page.tsx"]) {
    assert.match(
      code(file),
      /stemsFrom\(/,
      `${file} builds its case table from hand-picked slots again, which is how the short illative was lost`,
    );
  }
});


/*
  WHICH LOCAL CASES A WORD TAKES IS ONE ANSWER, AND IT WAS EIGHT.

  Estonian has two sets of local cases and a word takes one: `toas` for a room,
  `hobusel` for a horse, `Saksamaal` for a country. `lib/estonian/place.ts` was
  written for the third of those, because the A1 country unit was drilling
  `Venemaas`, and only two of the eight generators that pick a case ever called
  it. So the lesson planner, the writing exercise, the daily quest, the picture
  round and the scene description all went on asking `Saksamaa → milles? kus?`
  after the flashcards had been fixed, and every one of them asked an animal
  for its illative besides.

  `lib/estonian/caseQuestion.ts` is the one answer now and this fails on a
  ninth generator that picks a local case without asking. It is anchored on the
  *call*, not on the import, because a file can import the helper and go on
  reading its own list, which is the shape every check in this file has been
  caught by at least once.
*/
/**
 * A COMMAND THAT DELETES MAY NOT READ SILENCE AS EVIDENCE.
 *
 * `scripts/audit-decks.ts` removes `CASE_FORM` rows from a learner's deck. Its
 * first version decided which by asking `caseFits`, the builder's own test, on
 * the argument that the audit and the builder should share one rule. They are
 * different questions and they come apart exactly where the dictionary has
 * said nothing: `localCasesFor` reads "we do not know" as the inside trio,
 * which is the safe end for something that *makes* cards and the dangerous end
 * for something that *removes* them, because it then refuses the outside trio
 * on every word the dictionary cannot classify.
 *
 * Run against the deployment that reported the original fault, that condemned
 * 318 correct cards: 6,952 entries, none of them carrying `semanticTypes`, and
 * every right answer for a person in the database named for removal.
 * `isa → isale`, `õpetaja → õpetajale`, `arst → arstile`. It was caught because
 * the command prints its list before it writes, which is the whole reason it
 * does.
 *
 * So the rule is `caseIsUnsaidFor`, which asks for positive evidence and only
 * ever in one direction. Asserted on the call rather than on today's prose: a
 * removal path that has gone back to `caseFits` alone is the bug again, and it
 * is invisible on any database whose dictionary happens to be classified.
 */
check("what a deck audit deletes rests on something the dictionary said", () => {
  const rule = code("lib/srs/retire.ts");
  assert.match(
    rule,
    /caseIsUnsaidFor\(/,
    "lib/srs/retire.ts decides what to delete without asking caseIsUnsaidFor, so " +
    "an unclassified dictionary condemns every correct outside-case card",
  );

  /*
    And the predicate really does want evidence. Anchored on the two ways the
    dictionary can supply it, because a version returning true on a bare
    `!caseFits` would satisfy the call above and be the same fault.
  */
  /*
    THE FUNCTION AND NOT THE REST OF THE FILE. Written first as a slice to the
    end, which passed with the body replaced by `return true`, because
    `caseQuestionFor` further down reads `isAnimate` too. A haystack that runs
    past what it is about is the oldest recurring mistake in these checks.
  */
  const owner = code("lib/estonian/caseQuestion.ts");
  const from = owner.indexOf("export function caseIsUnsaidFor");
  assert.ok(from >= 0, "caseIsUnsaidFor is gone from lib/estonian/caseQuestion.ts");
  const closes = owner.indexOf("\n}", from);
  const predicate = owner.slice(from, closes < 0 ? undefined : closes);
  assert.match(
    predicate,
    /isAnimate\(|takesOutsideCases\(/,
    "caseIsUnsaidFor no longer reads the classification or the ending, so it is " +
    "deciding a deletion on the absence of both",
  );
  assert.match(
    predicate,
    /INSIDE_CASES/,
    "caseIsUnsaidFor no longer limits itself to the inside trio, so it would " +
    "delete `isale`, which is the form people actually say",
  );
});

check("every generator that picks a case asks which ones the word takes", () => {
  const askers = [
    "lib/srs/cards.ts",
    "lib/estonian/writing.ts",
    "lib/collections/lesson.ts",
    "lib/progress/caseExamples.ts",
    "lib/progress/target.ts",
    "lib/games/describe.ts",
    "lib/games/flash.ts",
    "app/(app)/review/emoji/page.tsx",
  ];
  const asks = /caseFits\(|localCasesFor\(/;
  for (const file of askers) {
    assert.match(
      code(file),
      asks,
      `${file} picks a case without asking caseFits, so it can drill hobusesse`,
    );
  }
  /*
    And nobody outside that module answers it for themselves. `place.ts` holds
    the two trios and the `-maa` ending; a second reader of those constants is
    a second rule about which set a word takes, which is exactly how this came
    to be wrong in eight places.
  */
  const owners = ["lib/estonian/caseQuestion.ts", "lib/estonian/place.ts"];
  const offenders = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => !owners.includes(file) && !/\.i?test\.tsx?$/.test(file))
    .filter((file) => /\b(INSIDE_CASES|OUTSIDE_CASES|takesOutsideCases)\b/.test(code(file)));
  assert.deepEqual(
    offenders,
    [],
    "a second module decides which set of local cases a word takes",
  );
});

/*
  A CARD ABOUT ONE WORD ASKS THE QUESTION THAT WORD ANSWERS.

  Two facts, and the app had neither. A horse is a `kes`, so `hobune →
  millega?` asks with the interrogative for a thing, which is the first
  distinction anybody learning Estonian is taught. And `kus?` is answered by
  the seesütlev *and* the alalütlev, `kuhu?` by the sisseütlev and the
  alaleütlev, `kust?` by the seestütlev and the alaltütlev: a card wanting one
  of a pair that prints the adverb can be answered correctly and marked wrong.

  `CaseSpec.question` is the case's own *name* and carries all three, which is
  right on a grammar page and on an option label and wrong on a card. This
  fails on a screen that prints one word's case question straight off the spec.
*/
check("a question about one word is worded for that word", () => {
  const perWord = [
    "lib/srs/cards.ts",
    "lib/estonian/writing.ts",
    "lib/collections/lesson.ts",
    "lib/progress/target.ts",
    "lib/games/flash.ts",
    "app/(app)/review/emoji/page.tsx",
    "app/(app)/dictionary/Forms.tsx",
    "app/(app)/dictionary/DictionaryClient.tsx",
    "app/(chromeless)/welcome/page.tsx",
    "app/(app)/review/describe/page.tsx",
    "app/api/describe/route.ts",
  ];
  for (const file of perWord) {
    const source = code(file);
    assert.match(
      source,
      /caseQuestionFor\(/,
      `${file} names a case for one word without asking caseQuestionFor`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:spec|row\.spec|named|c)\.question\b/,
      `${file} prints CaseSpec.question about one word, which names both series and a place adverb`,
    );
  }
  /*
    And the name itself still carries all three, because that is what a class
    writes on the board and what the grammar reference and the option labels
    are for. Derived from the parts rather than typed, so the two halves of the
    table cannot disagree the way they did: the first three cases named both
    pronouns and the other eleven named one.
  */
  const cases = code("lib/estonian/cases.ts");
  assert.match(
    cases,
    /question: \[row\.asksPerson, row\.asksThing, row\.asksWhere\]/,
    "a case's name stopped being built from its own parts",
  );
});

/*
  AND THE FACT BEHIND BOTH COMES FROM THE INSTITUTE.

  Nothing in a word's spelling says it is an animal, so this is data rather
  than a rule: `Lexeme.semanticTypes` holds Ekilex's own classification codes
  and `lib/estonian/semantics.ts` is the only module that reads them. A second
  reader is a second answer to "is this a person", which is how the two sets of
  local cases came apart in the first place.
*/
check("the Institute's classification has one reader", () => {
  /*
    Two files, and the pair is the rule: `semantics.ts` decides what a code
    means and `caseQuestion.ts` is the only thing that acts on the decision.
    Every other file that names the column is carrying it rather than reading
    it, which is a query selecting it, a type declaring it or a mapper joining
    Ekilex's list into it.
  */
  const owners = ["lib/estonian/semantics.ts", "lib/estonian/caseQuestion.ts"];
  const readers = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => !owners.includes(file) && !/\.i?test\.tsx?$/.test(file))
    .filter((file) => /semanticGroup\(|isAnimate\(|bothLocalSetsOrdinary\(/.test(code(file)));
  assert.deepEqual(
    readers,
    [],
    "a module outside lib/estonian/semantics.ts decides what a semantic type means",
  );
  // And the codes stay written out rather than matched by prefix: `in_rahvas_keel`
  // is a language and opens like a person, and a prefix rule read `emakeel` as
  // a being.
  assert.match(
    code(owners[0]!),
    /ANIMATE_CODES/,
    "the animate codes stopped being written out, so a prefix rule decides again",
  );
});

/*
  AN EXERCISE IS BUILT OUT OF A SENTENCE.

  Ekilex records a usage against a *sense*, so what comes back under a headword
  is sometimes lexicography rather than something somebody said. `usableExamples`
  keeps what is worth printing on a dictionary entry, which is the right rule
  for a page and too loose for a question: `Nii ____ on öelda, et ..` trails
  off, `Vanemametnikud on: ... 9) ____;` is an ordinance, and `Ta kannab
  tumedaid ____/teksasid.` leaves the answer standing beside the gap in its
  other spelling.

  `naturalSentence` was the gate on four of the eight doors. The mock exam and
  the level check had it; the deck's gap-fills, the printable worksheet, the
  lesson planner and speaking practice did not, and built 81 cards out of them.
*/
check("every exercise built from a sentence checks that it is one", () => {
  const builders = [
    "lib/srs/cards.ts",
    "lib/collections/worksheet.ts",
    "lib/exam/paper.ts",
    "lib/assessment/items.ts",
    "lib/progress/describe.ts",
    "app/(app)/learn/[unitId]/lesson/page.tsx",
    "app/(app)/review/speaking/page.tsx",
    "app/(app)/review/dictation/page.tsx",
    "app/(app)/review/sentences/page.tsx",
  ];
  for (const file of builders) {
    assert.match(
      code(file),
      /naturalSentence\(/,
      `${file} builds an exercise from a usage without checking that it is a sentence`,
    );
  }
  // One definition of the label pattern, beside the rule it is an argument to.
  // It lived in the level check, which is why the deck never had it.
  assert.match(
    code("lib/estonian/cloze.ts"),
    /export function nominalOpener\(/,
    "the label pattern moved out of the module that owns naturalSentence",
  );
});

check("the module that writes about Estonian holds no Estonian", () => {
  /*
    `lib/estonian/grammar.ts` is the one place that explains the case system at
    length, and every Estonian word on the grammar pages is read from the
    dictionary by `lib/progress/caseExamples.ts` and rendered with its
    provenance. An example typed into the prose would be a form with no source,
    sitting on a page whose whole argument is that every form has one.
  */
  const prose = read("lib/estonian/grammar.ts");
  const estonianLetters = /[õäöüšž]/i;
  const offenders = prose
    .split("\n")
    .filter((line) => estonianLetters.test(line))
    // The case names themselves are Estonian and are the subject, not a form.
    .filter((line) => !/\b(et|estonianName|caseNames?):/i.test(line))
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
  assert.deepEqual(offenders, [], "an Estonian form is written into the grammar prose");
});

check("Anu's worked examples are sourced from a table the dictionary checks", () => {
  /*
    `lib/estonian/grammar.ts` holds no Estonian at all, checked above.
    `lib/tutor/prompt.ts` is the other module that writes about Estonian at
    length, and it used to type its worked examples straight into the
    template: a wrong form there ships to every learner, at every level, in
    every single conversation, and nothing ever re-checked it. `WORKED_FORMS`
    is now the one place a claim is made, and `lib/tutor/prompt.itest.ts`
    checks every one against a real stored `Form` row.

    `CLOSED_CLASS_EXAMPLES` is the honest exception: a pronoun's oblique case,
    a demonstrative and a particle, none of which the dictionary holds a
    form for at all, so they cannot be checked the same way and stay
    hand-verified. Naming the list here, imported rather than retyped, is what
    stops a sixth word joining it silently.
  */
  const prompt = read("lib/tutor/prompt.ts");
  const table = between(prompt, "export const WORKED_FORMS");
  assert.ok(table, "WORKED_FORMS is gone; the worked examples are typed loose again");
  const outside = prompt.replace(table, "");

  for (const word of CLOSED_CLASS_EXAMPLES) {
    assert.ok(outside.includes(word), `"${word}" dropped out of CLOSED_CLASS_EXAMPLES`);
  }

  // Case names (sisseütlev, seesütlev, ...) are Estonian too, but they are the
  // subject of a sentence about how Anu names things, not a form she could get
  // wrong, and CASES is the one place that already governs what they are.
  const caseNames = new Set(CASES.map((c) => c.et));
  const estonianLetters = /[õäöüšž]/i;
  const offenders = outside
    .split("\n")
    .filter((line) => estonianLetters.test(line))
    .filter((line) => !CLOSED_CLASS_EXAMPLES.some((word) => line.includes(word)))
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
    .filter((line) => {
      const words = line.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
      const diacriticWords = words.filter((w) => estonianLetters.test(w));
      return !diacriticWords.every((w) => caseNames.has(w.toLowerCase()));
    });
  assert.deepEqual(offenders, [], "a hardcoded Estonian form appeared in Anu's system prompt, outside WORKED_FORMS and CLOSED_CLASS_EXAMPLES");

  // Every entry on the table is actually quoted somewhere in the template; an
  // entry nobody reads from is a claim nobody is relying on, which is a
  // different thing from a claim that has been checked.
  const template = prompt.slice(prompt.indexOf("return `"));
  for (const key of Object.keys(WORKED_FORMS)) {
    assert.ok(template.includes(`${key}.`), `WORKED_FORMS.${key} is on the table but never read in the prompt`);
  }
});

check("the model may never supply a form that becomes a card", () => {
  /*
    gpt-4o-mini invented "Ma söön aitamat" when asked for an example. An
    unverified form does not simply sit there being wrong: the scheduler
    drills it in. So anything the model produces is stored with provenance
    "AI" and tagged in the UI, and `lib/tutor/translate.ts` is the only path
    from a model to the dictionary at all.
  */
  const translate = read("lib/tutor/translate.ts");
  // The direction is the rule: the model turns Estonian into English, never
  // the other way. Both prompts hand it the Estonian and ask for English.
  assert.match(translate, /English translation of the Estonian/, "the word prompt changed direction");
  assert.match(translate, /Translate this Estonian sentence into natural English/, "the sentence prompt changed direction");
  const writesForms = /prisma\.(form|lexeme)\.(create|update|upsert)/;
  assert.equal(writesForms.test(translate), false, "the model's output reaches a form row directly");
});

check("a withheld note claims Estonian only when it caught Estonian", () => {
  /*
    ADR-005 amendment 2. `verifyComment` withholds on two different findings
    and they are not the same claim. A word carrying one of õäöüšž is Estonian
    whatever else it is. A word of five letters or more that nothing supplied
    is `looksInflected`'s guess, deliberately biased towards withholding, and
    on `/api/exam/write` it is handed no glosses, no forms and an allowlist
    of the learner's own text, so an English word Anu quoted back is the thing
    it usually catches. Both drop the note, which is the safe error either way.

    Only one of them may be reported to the learner as Anu having written
    Estonian. A guard that overstates what it caught is a guard nobody believes
    on the day it catches something real, and both screens used to say the
    stronger sentence unconditionally.
  */
  const verify = read("lib/tutor/verify.ts");
  assert.match(
    verify,
    /reason:\s*certain \? "estonian-form" : "unvouched-word"/,
    "the verifier stopped distinguishing a certain find from a guess",
  );
  assert.match(
    verify,
    /certain = true/,
    "nothing raises the certain flag, so every withhold now reports the same reason",
  );

  // Both routes have to carry it out to the client, and both screens have to
  // branch on it. Anchored on the member rather than on a sentence, because
  // the wording is copy and a copy sweep may rewrite it.
  for (const file of [
    "app/api/write/route.ts",
    "app/api/exam/write/route.ts",
    "app/(app)/review/write/WriteSession.tsx",
    "app/(app)/exam/result/[id]/AnuReading.tsx",
  ]) {
    assert.match(read(file), /withheldReason/, `${file} dropped the withhold reason`);
  }
  for (const file of [
    "app/(app)/review/write/WriteSession.tsx",
    "app/(app)/exam/result/[id]/AnuReading.tsx",
  ]) {
    assert.match(
      read(file),
      /withheldReason === "unvouched-word"/,
      `${file} tells every withheld learner that Anu wrote Estonian, including when she did not`,
    );
  }
});

check("nothing derived from a stem is stored", () => {
  /*
    Five principal parts per lexeme, and the eleven regular cases computed
    from the genitive stem at render time. Storing them creates a second
    source of truth that goes stale the moment a principal part is corrected.
  */
  const derived = /\b(inessive|elative|allative|adessive|ablative|translative|terminative|essive|abessive|comitative|illative)\s+String/i;
  assert.equal(derived.test(SCHEMA), false, "a derived case form has a column in the schema");
});

// ── Review is append-only (ADR-014, ADR-015) ─────────────────────────────────

check("no code path updates a review", () => {
  /*
    It is the one table whose loss is unrecoverable, and it is the input to
    FSRS parameter optimisation. An undo writes a compensating row.

    `code()` rather than `read()`, which is the fifth time this repository has
    made the same mistake and the first time it was caught by a comment saying
    the right thing: a fixture explaining in prose why it does *not* reach for
    `review.update` to arrange a state failed this check. A rule that fires on
    an honest explanation is a rule that gets satisfied by deleting the
    explanation.

    Tests are still in scope, unlike the deletion check below. Setting a state
    up by editing history is exactly what must not be learned from, and a
    fixture can always write the row it wants in the first place.
  */
  for (const file of ALL) {
    assert.equal(/review\.update/.test(code(file)), false, `${file} updates a review`);
  }
});

check("a review is only ever deleted by something the learner asked for", () => {
  /*
    Two paths, and no more. A restore in replace mode no longer touches reviews
    at all — the deck is rebuilt, the history is not — so the only deletion left
    in product code is somebody erasing their own account, which the privacy
    page promises and which outranks the append-only rule.

    Tests are excluded: they set up and tear down their own rows, and are not a
    path anything reaches in production.
  */
  const deleters = ALL
    .filter((f) => !/\.(test|itest)\.tsx?$/.test(f))
    .filter((f) => /review\.delete/.test(read(f)));
  assert.deepEqual(deleters, ["app/actions.ts"], "a review is deleted outside the paths that may");

  const actions = read("app/actions.ts");
  assert.match(
    actions,
    /confirmation\.trim\(\)\.toLowerCase\(\) !== "delete"/,
    "account deletion no longer asks the learner to confirm",
  );
  assert.match(actions, /mode === "replace"/, "the restore no longer guards on an explicit replace");
  assert.equal(
    /mode === "replace"[\s\S]{0,600}?review\.deleteMany/.test(actions),
    false,
    "a replace-mode restore has gone back to deleting the review log",
  );
});

check("a grade made offline keeps the time it was actually answered", () => {
  /*
    Replaying the queue with `new Date()` would tell the scheduler an evening's
    reviews all happened at breakfast, which is worse than losing them: FSRS
    would fit its intervals to a history that never happened.
  */
  const outbox = read("lib/offline/outbox.ts");
  assert.match(outbox, /reviewedAt/, "the queue no longer records when a grade was made");
  // Clamped in *both* directions: a device clock set ahead would schedule a card
  // into the past, and one set years back would blow up the card's stability.
  assert.match(outbox, /clampReviewedAt/, "the queue no longer clamps a device clock");

  const replay = read("lib/srs/replay.ts");
  assert.equal(
    /reviewedAt:\s*new Date\(\)/.test(replay),
    false,
    "the replay re-stamps a grade",
  );
  assert.match(replay, /orderForReplay/, "the replay no longer applies grades in the order they happened");
});

// ── Progress is derived, never stored (ADR-014) ──────────────────────────────

check("no counter column exists for anything the review log can reconstruct", () => {
  /*
    XP, levels, streaks and every chart are computed from the append-only log
    on each request. A stored score is a second source of truth that drifts,
    and it can be awarded for something that never happened. The exceptions
    are the two values no log can reconstruct: a personal best, and which days
    a shield has already covered.
  */
  const counters = /^\s*(xp|totalXp|level|streak|currentStreak|cardsKnown|accuracy)\s+Int/im;
  const hit = counters.exec(SCHEMA);
  assert.equal(hit, null, `the schema stores ${hit?.[1]}, which the review log already answers`);
});

// ── Every mode grades through gradeCard (ADR-016) ────────────────────────────

/**
 * Every door onto the shared review log, and there is one list of them.
 *
 * It was the same alternation typed out in three checks, which is two copies of
 * one fact: the seventh door, `finishScene`, had to be added to all three or the
 * newest and busiest mode would sit outside a rule that reported itself as held.
 * That is the failure this file exists to catch, so it is not a shape this file
 * may have itself.
 */
const GRADING_DOORS =
  /\b(gradeCards?|replayGrades|completeLesson|recordCheckpoint|submitExam|recordSonad|recordCrossword|finishScene)\b/;

/**
 * Sessions that measure rather than practise.
 *
 * The placement test asks about words the learner may never have had a card for,
 * to decide where to start them. Writing those answers to the review log would
 * put grades against cards that do not exist and tell the scheduler somebody had
 * practised material they have not yet met.
 */
const MEASURES_RATHER_THAN_PRACTISES: string[] = [];


check("every practice mode writes to the same review log", () => {
  /*
    Sprint, Listening, Match, Dictation, Sentences and the unit lessons are not
    side games with scores of their own. They grade through the same actions, so
    the scheduler sees what was actually practised.

    The lesson runner is why this names more than one action. It sits under
    /learn/ rather than /review/ and submits a whole finished lesson at once
    through completeLesson, which maps each step to the card it is evidence
    about and hands the batch to applyGradeBatch, the same append-only log
    reached by a different door. Matching only the /review/ path and only
    gradeCard would have declared the rule satisfied while the newest and
    busiest mode sat outside it, which is the failure this file exists to catch.

    submitExam is the third such door and arrived from another branch, which is
    how the point got proved twice. A paper is marked on the server and the
    marks go to applyGradeBatch, so the exam is under this rule rather than
    exempt from it; the invariant below on submitExam is what holds that door
    to applyGradeBatch rather than to Review rows of its own.

    finishScene is the fifth, and it is the exam's shape again: the browser
    plays the conversation and sends the turns, the server draws the same plan
    from the same seed, reads every turn against the dictionary and grades
    through writeGrade. The check below on that action holds it to writeGrade.

    recordSonad is the fourth, and it is the exam's shape exactly. The board
    knows the answer, because marking a guess without a round trip is most of
    how that game feels to play, so a rating posted from it would be a rating
    anybody can type. The client sends the guesses it made, the server rebuilds
    the day's puzzle and works out what the round was worth, and the check
    below holds that door to gradeCard the way submitExam's holds its own.
  */
  const sessions = SESSION_FILES().filter((f) => !MEASURES_RATHER_THAN_PRACTISES.includes(f));
  assert.ok(sessions.length >= 6, `expected the practice sessions, found ${sessions.length}`);
  for (const file of sessions) {
    assert.match(
      code(file),
      GRADING_DOORS,
      `${file} does not write to the shared review log`,
    );
  }

  /*
    The exemption is checked, so it cannot become a parking space. A file listed
    below has to still be there, and has to still write no grades at all: the
    moment one starts grading it is a practice mode, belongs under the rule, and
    this fails until it is taken off the list. Same shape as the ALLOWED list in
    lib/copy/readerCopy.test.ts, and for the same reason — an unexamined
    exemption is how a rule quietly stops applying to anything.
  */
  for (const file of MEASURES_RATHER_THAN_PRACTISES) {
    assert.ok(existsSync(file), `${file} is exempt from grading but no longer exists`);
    assert.doesNotMatch(
      code(file),
      GRADING_DOORS,
      `${file} now grades, so it is a practice mode and must come off the exemption list`,
    );
  }
});


/**
 * Every screen that runs a graded session, wherever it lives.
 *
 * A path-shaped rule ages badly: the modes were all under /review/ when these
 * checks were written, and the first one added somewhere else inherited none of
 * them. The shape that matters is "a component that runs a session", so that is
 * what is matched.
 */
function SESSION_FILES(): string[] {
  return COMPONENTS.concat(APP).filter((f) => /Session\.tsx$/.test(f));
}
check("a mock exam is marked by the server, never by the client", () => {
  /*
    `buildPaper` is deterministic in (level, seed, pool), which is what lets the
    submission carry a level, a seed and the answers, and nothing else. The
    server rebuilds the same paper and marks it. A client that sent its own
    marks would be a client that could award itself a pass at C1, and a mock
    examination whose result is a claim rather than a measurement is worth
    nothing to the person sitting it.

    The shape of the violation, not one spelling: the sitting screen must not
    import the marker at all.
  */
  const session = "app/(app)/exam/[level]/ExamSession.tsx";
  const source = read(session);
  assert.equal(
    /\bmarkPaper\b|\bmarkItem\b|from ["']@\/lib\/exam\/score["']/.test(
      source.replace(/import type[^;]*;/g, ""),
    ),
    false,
    "the exam session marks its own paper",
  );
  const action = read("app/actions.ts");
  assert.match(action, /markPaper\(/, "submitExam no longer marks the paper on the server");
  /*
    The rule is that the paper is rebuilt on the server from its seed, not the
    name of the function that does it. The placement check landed with a
    `paperFor` of its own, so the exam's import is aliased; a pattern matching
    one spelling failed on a merge that changed nothing about the rule.
  */
  assert.match(
    action,
    /\w*[Pp]aperFor\(\s*ownerId,\s*level,\s*seed\s*\)/,
    "submitExam no longer rebuilds the paper from (ownerId, level, seed) before marking",
  );
});

check("a mock exam writes to the same review log as every other mode", () => {
  /*
    ADR-016. An examination is a mode, so the scheduler has to see it: a word
    the learner missed under a clock is a word they missed. It grades through
    `applyGradeBatch`, which is the path the offline outbox already uses, rather
    than writing Review rows of its own.
  */
  const action = read("app/actions.ts");
  const submit = action.slice(action.indexOf("export async function submitExam"));
  assert.match(submit, /applyGradeBatch\(/, "submitExam does not grade through the shared batch");
  assert.equal(
    /prisma\.review\.create/.test(submit),
    false,
    "submitExam writes Review rows directly instead of going through the grade path",
  );
});

check("nothing about the mock exam decides an answer with a model", () => {
  /*
    The rule the whole codebase turns on, applied where it is most tempting to
    break: a paper is thirty questions, and a model would happily mark them all.
    Every mark in `lib/exam/score.ts` comes from a comparison with a form the
    dictionary vouches for. Anu reads the composition back afterwards and her
    note carries no marks, which is why the route that asks her lives apart from
    the marking entirely.
  */
  const score = read("lib/exam/score.ts");
  for (const forbidden of ["@/lib/tutor/provider", "@/lib/tutor/grader", "fetch("]) {
    assert.equal(
      score.includes(forbidden),
      false,
      `lib/exam/score.ts reaches for ${forbidden}, so a model can move a mark`,
    );
  }
  const reader = read("app/api/exam/write/route.ts");
  assert.match(reader, /verifyComment\(/, "the composition reader skips the form check");
  assert.match(reader, /authoriseCall\(/, "the composition reader is not metered");
  assert.match(reader, /checkRateLimit\(/, "the composition reader is not rate limited");
});

check("a session never lets its questions change under the learner", () => {
  /*
    gradeCard is a Server Action, and Next refreshes the route's Server
    Component after every one. A session that reads its questions straight off
    a prop gets a freshly computed set handed down mid-answer: the word under
    the feedback changes while the learner is still reading it, and the last
    grade of a session sees an empty list and renders "nothing due" instead of
    the summary. ReviewSession froze its queue for exactly this. The four modes
    added later started grading and inherited the hazard with it, which is how
    this became a rule rather than a comment in one file.

    The shape of the fix, not one spelling of it: a session that both grades
    and takes a list prop must pass that prop through useState rather than
    index into it directly.
  */
  const sessions = SESSION_FILES();
  assert.ok(sessions.length >= 6, `expected the practice and exam sessions, found ${sessions.length}`);
  for (const file of sessions) {
    const source = code(file);
    // The exam session hands its answers to a Server Action rather than grading
    // per card, and Next refreshes the route after that call just the same, so
    // the freeze matters here too.
    if (!GRADING_DOORS.test(source)) continue;
    // Only the ones actually handed a list by the page can be caught out. The
    // `initial` naming convention is the reliable signal: a prop called
    // initialSteps or initialCards exists precisely because it is meant to be
    // snapshotted. The name list after it is the older spelling, kept for the
    // sessions that predate the convention — and `steps` had to be added to it
    // after the lesson runner slipped through both arms of this check.
    const props = source.match(/export function \w+\(\{([^}]*)\}/)?.[1] ?? "";
    const listProp = /\binitial[A-Z]\w*/.test(props)
      || /\b(cards|prompts|questions|items|gaps|pairs|steps|paper)\b/.test(props);
    if (!listProp) continue;
    /*
      Either spelling of the snapshot. `useState(initialCards)` is the plain
      one; `useState<T>(() => plan(initialCards))` is the lazy one, which the
      review session needs because it expands its cards into a queue of steps
      (lib/srs/learn.ts) and doing that work on every render to throw it away
      is not free.

      The property is the same and the lazy form is the stronger of the two: the
      initialiser runs once on mount and never again, so a refreshed prop cannot
      reach the queue either way. This asserted the plain spelling only, and
      fired on the lazy one, which is a check firing on honest code. The rule is
      widened rather than the code contorted, and what both arms still require
      is that the prop reaches `useState` at all: a session that indexes
      `initialCards` directly matches neither.
    */
    const snapshot = /useState(?:<[\s\S]*?>)?\(\s*(?:initial\w+\s*\)|\(\)\s*=>[\s\S]{0,400}?\binitial\w+)/;
    assert.match(
      source,
      snapshot,
      `${file} indexes a list prop directly; snapshot it with useState so a refresh cannot swap it mid-session`,
    );
  }
});

check("a backup arrives as a request body, never as an action argument", () => {
  /*
    A backup grows with the deck, and a Server Action is the wrong transport
    for it: the encoding has a 1 MB body limit and, past that, React's own
    guard over the decoded payload. A 990 KB export, two months of one
    learner's history, was refused by both. Neither limit is a fact about the
    data, and the person with the most history to lose is always the first to
    meet them, which is the worst possible order to fail in.

    So the file goes to a Route Handler as the request body. This asserts the
    rule rather than today's fetch call: the panel that uploads a backup must
    not call the restore or inspect actions directly, whatever they end up
    being named.
  */
  const panel = read("app/(app)/settings/RestorePanel.tsx");
  assert.match(panel, /\/api\/restore/, "RestorePanel no longer posts the backup to a route");
  assert.doesNotMatch(
    panel,
    /\b(await\s+)?(restoreBackup|inspectBackup)\s*\(/,
    "RestorePanel calls a Server Action with the whole backup; send it as a request body instead",
  );
});

check("nothing about an individual survives into the metrics", () => {
  /*
    Retention is derived from the review log rather than collected, which is
    what lets the privacy page keep saying there is no analytics and no
    tracker. That claim holds only while identity stops at the route: the
    module that computes cohorts is handed activity, never owners, so there is
    no code path in which a person's id can reach an aggregate or a response.

    Asserting the shape rather than one field name: whatever the numbers grow
    into, the pure module must not learn who anybody is.
  */
  const retention = read("lib/stats/retention.ts");
  assert.doesNotMatch(retention, /ownerId|email|userId/, "the retention module learned who somebody is");

  const route = read("app/api/metrics/route.ts");
  // The route groups by owner and must, so what is checked is that it never
  // hands one onward: the grouped rows are reduced to activity before use.
  assert.match(route, /MIN_COHORT|cohortRetention/, "the metrics route no longer aggregates");
  assert.doesNotMatch(
    route,
    /NextResponse\.json\([^)]*ownerId/s,
    "the metrics route puts an owner id in its response",
  );
});

// ── Local mode is a deployment shape, not a switch (ADR-013) ─────────────────

check("nothing can turn auth off on a deployment that has it", () => {
  /*
    Local mode keys off the absence of configuration only. A flag that could
    disable the gate would be one environment variable away from serving every
    learner's deck to anybody.
  */
  const mode = read("lib/auth/mode.ts");
  assert.match(mode, /NEXT_PUBLIC_SUPABASE_URL/, "mode.ts no longer decides on the configuration");
  const flags = /(DISABLE_AUTH|SKIP_AUTH|AUTH_DISABLED|NO_AUTH|ALLOW_ANONYMOUS)/;
  for (const file of [...ALL, "middleware.ts", "next.config.ts"]) {
    const hit = flags.exec(read(file));
    assert.equal(hit, null, `${file} carries ${hit?.[1]}, which could switch the gate off`);
  }
});

check("the public path allowlist is the only way past the gate", () => {
  const middleware = read("middleware.ts");
  assert.match(middleware, /isPublicPath/, "the allowlist is gone");
  for (const path of ["/sign-in", "/welcome", "/auth/callback", "/offline"]) {
    assert.ok(middleware.includes(path), `${path} is no longer in the allowlist`);
  }
});

// ── And the gate answers in a bounded time, or says it could not ─────────────

check("nothing on the request path waits on the auth service without a deadline", () => {
  /*
    The middleware asked Supabase who was signed in on every request, over the
    network, with nothing capping the wait. A slow minute at that service was
    a slow minute for the whole app, and a minute where it stopped answering
    was a 504 from the platform twenty-five seconds later, which is the least
    useful sentence available for "the login server is busy".

    The deadline lives on the transport rather than on one call, because the
    calls are not all in sight: a claims check can refresh a token underneath
    itself, and the allowlist path signs somebody out. A client built without
    it is a client with no ceiling on any of that.

    The shape, not the spelling: whoever resolves an identity builds the client
    with `boundedTransport` and hands its fetch over.
  */
  for (const file of ["middleware.ts", "lib/auth/session.ts"]) {
    const source = read(file);
    assert.match(source, /boundedTransport\(/, `${file} builds its auth client with no deadline on it`);
    assert.match(
      source,
      /fetch:\s*transport\.fetch|createClient\(transport\.fetch\)/,
      `${file} has a bounded transport it does not hand to the client`,
    );
  }
  const identity = read("lib/auth/identity.ts");
  assert.match(identity, /AUTH_TIMEOUT_MS/, "the deadline is no longer a named number");
  assert.match(identity, /signal/, "the bounded transport stopped putting a signal on the request");
});

check("a public page does not pay for an identity it never reads", () => {
  /*
    The landing page, the two policy pages, the offline fallback and the OAuth
    callback render the same whoever is reading, and every one of them was
    costing a round trip to the auth service to establish something nothing on
    the page used. The callback is the expensive one: it is a step of signing
    in, and it was waiting to be told about the session it had not created
    yet.

    /sign-in is the one public path that does read the identity, because a
    learner who is already signed in gets sent home rather than offered a
    button. So the check is positional: the early return for the rest has to
    come before a client is built, or it is not saving anything.
  */
  const middleware = read("middleware.ts");
  const skip = middleware.indexOf("isPublicPath && !path.startsWith(\"/sign-in\")");
  const cookie = middleware.indexOf("hasSessionCookie(");
  const client = middleware.indexOf("createServerClient(");
  assert.ok(skip > 0, "a public page with nothing to read is resolving an identity again");
  assert.ok(cookie > 0, "a request with no session cookie is asking the auth service about it");
  assert.ok(skip < client, "the public path skip runs after the client it exists to avoid");
  assert.ok(cookie < client, "the cookie check runs after the client it exists to avoid");
});

check("an auth service that did not answer is not a sign-out", () => {
  /*
    Three answers, because "we could not tell" is not "signed out". Reading a
    timeout as a sign-out would take a learner's own deck away from them over
    a bad minute at somebody else's server, on the screen they open every day,
    and it would do it at exactly the moment the sign-in page it redirects to
    could not sign them back in either.

    Letting it through costs nothing, because the middleware is not the check
    that decides: every page, action and route resolves its own owner through
    `requireUserId()`, which throws when the session cannot be verified.

    `!== "in"` is the shape that breaks this, and it is the natural thing to
    write. The middleware has to key its refusals on the positive answer.
  */
  const identity = read("lib/auth/identity.ts");
  for (const state of ["\"in\"", "\"out\"", "\"unreachable\""]) {
    assert.ok(identity.includes(state), `the ${state} answer is gone from Identity`);
  }
  const middleware = read("middleware.ts");
  assert.match(
    middleware,
    /identity\.state === "out"/,
    "the middleware stopped refusing on a definite sign-out",
  );
  assert.equal(
    /identity\.state !== "in"/.test(middleware),
    false,
    "the middleware folds an unreachable auth service back into being signed out",
  );
});

// ── The security layer added on top of those ─────────────────────────────────

check("the forged-request gate runs before anything else looks at the request", () => {
  /*
    Every mutation in this app is a Server Action, which is a POST to a page
    path. A gate inside an `/api/` branch would be watching the quiet door. It
    also has to come first: a redirect keeps the method and the body, so
    refusing after one would hand a forged mutation on to be refused a request
    later instead of here.
  */
  const middleware = read("middleware.ts");
  const gate = middleware.indexOf("isSameOriginMutation(request)");
  const auth = middleware.indexOf("if (!supabaseConfigured())");
  assert.ok(gate > 0, "the forged-request gate is gone from the middleware");
  assert.ok(auth > 0, "the local-mode branch is gone from the middleware");
  assert.ok(gate < auth, "the gate runs after the auth branch opens");
  assert.equal(
    /startsWith\("\/api\/"\)[^\n]*\n[^\n]*isSameOriginMutation/.test(middleware),
    false,
    "the gate has been put back inside an /api/ branch",
  );
});

check("every response carries a policy", () => {
  /*
    A Content Security Policy that only covers the happy path is a policy with
    a hole in it exactly where something went wrong. Every `return` in the
    middleware hands its response through `withCsp`, including the two
    refusals and both redirects.

    Only the responses count. The cookie adapter inside `createServerClient`
    returns cookie arrays, and matching those would be matching a shape rather
    than a rule.
  */
  const middleware = read("middleware.ts");
  // Without `withCsp`'s own definition: the `return response` inside it is the
  // helper doing its job, not a branch skipping it.
  const body = middleware.replace(/const withCsp[\s\S]*?\n  \};\n/, "");
  const responses = body.match(/return (?:NextResponse|response|withCsp)[^;]*/g) ?? [];
  assert.ok(responses.length >= 5, `expected every branch to return a response, found ${responses.length}`);
  const bare = responses.filter((line) => !line.startsWith("return withCsp"));
  assert.deepEqual(bare, [], "a response leaves the middleware without the policy on it");
});

check("the routes that spend somebody else's quota are capped", () => {
  for (const route of [
    "app/api/tutor/route.ts",
    "app/api/tts/route.ts",
    "app/api/share/route.tsx",
    "app/api/export/route.ts",
    "app/api/scan/route.ts",
  ]) {
    assert.match(read(route), /checkRateLimit/, `${route} has no cap on it`);
  }
});

check("a cap is charged to the learner, never to their address alone", () => {
  /*
    Twenty-five students on one school network are one IP, and a review
    session asks for audio on nearly every card. Charged per address, a class
    starting together would spend the allowance in the first few seconds and
    every one of them would be told to slow down.
  */
  const tutor = read("app/api/tutor/route.ts");
  assert.match(tutor, /bucketForOwner/, "the tutor's cap is no longer per learner");
});

// ── A photograph is read, never believed ─────────────────────────────────────

check("a word read off a photograph reaches a card only through the dictionary", () => {
  /*
    THIS IS ADR-005 ON THE ONE PATH WHERE A MODEL UNAVOIDABLY READS ESTONIAN.

    Transcribing a printed page is not authorship, but a misread and an
    invention are indistinguishable by the time either reaches a flashcard, and
    an unverified form does not sit there being wrong: the scheduler drills it
    in. So the route hands what the model saw to the dictionary, and only a
    confident match (`matchEstonianForm`, at `VOUCHED_SCORE`) carries a
    lexeme id. Nothing else may mint one.
  */
  const route = read("app/api/scan/route.ts");
  assert.match(route, /resolveScannedItems/, "the scan route no longer consults the dictionary");

  const resolver = read("lib/dict/resolveScan.ts");
  assert.match(resolver, /matchEstonianForm/, "the resolver stopped using the vouched matcher");

  const search = read("lib/dict/search.ts");
  assert.match(
    search,
    /scored\.score\s*<\s*VOUCHED_SCORE/,
    "matchEstonianForm no longer holds its confidence floor, so a prefix would resolve",
  );

  /*
    And a word the dictionary did not recognise gets no forms invented for it.
    A page's own entries are principal-part-free by construction, which is why
    they can only ever produce a recognition and a production card.
  */
  const saveScan = between(read("app/actions.ts"), "export async function saveScan");
  assert.equal(
    /prisma\.form\.(create|createMany|upsert|update)/.test(saveScan),
    false,
    "saving a scanned page writes a form row",
  );
});

check("every path that adds cards reads and writes under one lock", () => {
  /*
    "Is it already there" is check-then-act, and this app has two paths that ask
    it. `addCardsFor` read the learner's existing cards for a word, filtered the
    generated ones against them, and inserted the rest; two requests inside that
    gap both see an empty deck and both insert. Measured against a real database
    rather than reasoned about: two concurrent adds gave two cards, four gave
    four, and eight gave fourteen where two is right.

    `addUnitsToDeck` then arrived as the batched rewrite of the loop that called
    it, kept the shape and did not inherit the lock, which moved the fault from
    one word to a whole unit: eight concurrent adds of an eighteen-word unit
    wrote 180 cards where 36 is right. A learner meets either one by double
    tapping "Add to deck", or the last button of first run, and neither has a
    throttle in front of it because neither should.

    The lock is `lib/usage/ledger.ts`'s, for the reasons its header gives: the
    *transaction* form, so a connection pooler cannot strand it, and the
    blocking one, since the non-blocking form serialises nothing.

    Asserted per path as the three things together, because each on its own is
    satisfied by a version that still races: a transaction with no lock, a lock
    taken outside the transaction, or a lock with the read left outside it. And
    asserted as *one* lock, because two paths guarding themselves with two
    different keys are two paths neither of which guards the other.

    THE TWO BODIES ARE NAMED, AND THEN EVERY INSERT IS COUNTED AGAINST THEM.
    Naming the bodies alone is anchored on today's function names, which broke
    the moment `addUnitsToDeck` became a one-line delegation to the batched
    builder the frequency page also uses: the rule held perfectly and the check
    read an empty body. So the second half asks the question the heading asks,
    that no card is written anywhere but inside one of them, which is what
    catches the *next* caller rather than the last one.
  */
  const lockedPaths = [
    {
      what: "addCardsFor",
      body: /async function addCardsFor\(([\s\S]*?)\n\}/.exec(code("app/actions.ts"))?.[1] ?? "",
      read: "card.findMany",
      write: "card.createMany",
    },
    {
      what: "addPlanToDeck",
      body: /export async function addPlanToDeck\(([\s\S]*?)\n\}/.exec(code("lib/srs/deck.ts"))?.[1] ?? "",
      read: "card.findMany",
      write: "card.createMany",
    },
  ];

  for (const { what, body, read: readCall, write } of lockedPaths) {
    assert.ok(body, `${what} has gone, or changed shape past recognition`);
    assert.match(body, /\$transaction\(/, `${what} no longer runs in one transaction`);
    assert.match(
      body, /lockDeck\(/,
      `${what} stopped taking the deck lock, so two tabs can both insert`,
    );

    const lockAt = body.indexOf("lockDeck(");
    const readAt = body.indexOf(readCall);
    const writeAt = body.indexOf(write);
    assert.ok(readAt >= 0 && writeAt >= 0, `${what} no longer reads what it has before writing`);
    assert.ok(
      lockAt < readAt && readAt < writeAt,
      `${what} takes its lock after the read it is meant to protect, which serialises nothing`,
    );
  }

  /*
    EVERY INSERT OF A CARD IS INSIDE ONE OF THOSE BODIES.

    Counted rather than located, because a body is found by a regex and a
    count is not fooled by one that stops matching: if the two files hold four
    `card.createMany` calls between them and the two locked bodies hold four,
    every insert is covered, and a fifth written anywhere else fails here
    whatever it is called.
  */
  const inserts = (text: string) => [...text.matchAll(/card\.createMany/g)].length;
  const everywhere = inserts(code("app/actions.ts")) + inserts(code("lib/srs/deck.ts"));
  const locked = lockedPaths.reduce((sum, path) => sum + inserts(path.body), 0);
  assert.equal(
    everywhere, locked,
    `${everywhere - locked} card insert(s) are outside the locked paths, so two tabs can both write them`,
  );

  /*
    And the lock itself. The transaction form and the blocking one, keyed on the
    owner and nothing else: a key naming the word, which is what the per-word
    path used before the batched builder existed, is safe against another add of
    the same word and says nothing about a unit add that contains it.
  */
  const deck = code("lib/srs/deck.ts");
  const lock = /export async function lockDeck\(([\s\S]*?)\n\}/.exec(deck)?.[1] ?? "";
  assert.ok(lock, "lockDeck has gone, and with it the one definition both paths read");
  assert.match(
    lock, /pg_advisory_xact_lock/,
    "lockDeck stopped taking the transaction advisory lock",
  );
  assert.doesNotMatch(
    lock, /pg_try_advisory/,
    "lockDeck went to the non-blocking lock, which serialises nothing",
  );
  assert.match(
    lock, /\$\{`deck:\$\{ownerId\}`\}/,
    "lockDeck stopped keying on the owner alone, so the per-word and batched paths no longer exclude each other",
  );

  assert.equal(
    (deck.match(/pg_advisory_xact_lock/g) ?? []).length
      + (code("app/actions.ts").match(/pg_advisory_xact_lock/g) ?? []).length,
    1,
    "a deck write is taking a lock of its own again; there is one definition and it is lockDeck",
  );
});

check("a screen built from a list of lemmas shows one entry per lemma", () => {
  /*
    `@@unique` is on `(lemma, pos)`, so a lemma can hold more than one row, and
    the syllabus names lemmas. Every screen built from a unit's word list asked
    `where: { lemma: { in: [...unit.lemmas] } }` and rendered whatever came
    back, so a lemma with two entries appeared twice on all of them. Measured
    with a scanned `tuba` confirmed beside the Ekilex one: `/learn/kodu` listed
    the word twice, its printable worksheet printed it six times, the unit
    counted more words than it teaches, the lesson planner split the duplicate
    into the sitting, `addUnitToDeck` built two sets of cards for one word (one
    of them unanswerable, the stub having no forms), and React warned about two
    children with the same key, which it says may duplicate or omit a row. The
    landing page demonstrates `tuba` and would have shown an empty paradigm.

    The adjective/noun pairs of open question Q8 are the same shape and ship
    with a fresh seed. There were thirteen when this was written and the answer
    to Q8 took it to two, which changes how often this fires and not whether it
    has to: a word confirmed off a photograph makes a pair for any lemma at
    all, and no upstream correction reaches that.

    A `Set` of lemmas is fine and two places legitimately build one: asking
    which of a unit's words the dictionary has at all cannot double-count.
    What may not happen is rows reaching a render or a write.
  */
  for (const file of ALL) {
    // A test builds its own fixture and may want both rows on purpose.
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    let at = src.indexOf("lemma: { in:");
    while (at !== -1) {
      // The statement this query is part of, which is where the answer to
      // "and then what" has to be.
      const from = src.lastIndexOf("prisma.", at);
      /*
        Back to the start of the statement, not just to the `prisma.` call: two
        of these read `oneEntryPerLemma(await prisma.lexeme.findMany({...}))`,
        so the answer sits to the *left* of the query rather than under it.
      */
      const statement = Math.max(0, src.lastIndexOf("\n\n", from), from - 400);
      /*
        A window rather than a statement, because "and then what" is a
        different line from the query about half the time, and it is generous
        on purpose. It was 900 characters and fired on the lesson page the
        first time anything was added between the `findMany` and the
        `oneEntryPerLemma` twelve lines below it: an honest page, correctly
        written, failing because a check measured in characters. Widening is
        the answer the file's own rule gives, since a check that fires on
        honest code is a check people learn to waive; what bounds it is the
        blank line before the next statement group, which is where a reader
        would stop looking too.
      */
      const window = src.slice(statement, at + 2000);
      /*
        Only a query for the *words*. `/review?unit=` filters the learner's own
        cards by their lexeme's lemma, and one row per card is right there:
        those cards exist and are due. What creates them is `addUnitToDeck`,
        which is a lexeme query and is checked.
      */
      if (!src.slice(from, at).includes("prisma.lexeme.")) {
        at = src.indexOf("lemma: { in:", at + 1);
        continue;
      }
      /*
        Three answers, not two. `oneEntryPerLemma` picks the row the app leads
        with; a `Set` counts lemmas and cannot double-count; and keying the rows
        by lemma *and* part of speech addresses one specific row per pair, which
        is the unique key itself and so the strongest of the three. The importer
        does the last: it looks a paste up by lemma because that is the indexed
        column, then reads `${lemma}|${pos}` out of the result, and asking it to
        pick "the" entry for a lemma would be wrong, since a row it wants may be
        the one that loses. This check fired on it, which is a check firing on
        honest code, which is how a check becomes one everybody waives.
      */
      const keyedOnBoth = /\.lemma\b[\s\S]{0,40}\.pos\b|\.pos\b[\s\S]{0,40}\.lemma\b/.test(window);
      assert.ok(
        /oneEntryPerLemma/.test(window) || /new Set\(/.test(window) || keyedOnBoth,
        `${file}: looks a list of lemmas up and uses every row. A lemma can hold two `
        + `entries, so pass the result through oneEntryPerLemma() (lib/dict/search.ts), `
        + `which applies the same rule the dictionary leads with. Counting distinct `
        + `lemmas into a Set, or keying the rows on lemma and pos together, are the `
        + `other two honest answers.`,
      );
      at = src.indexOf("lemma: { in:", at + 1);
    }
  }
});

check("there is one assembly of the shipped dictionary", () => {
  /*
    `prisma/seed.ts` reads six files and writes them into `Lexeme` under a
    conflict key of `(lemma, pos)`, keeping the first writer. A script that
    wants to measure or audit what shipped has to read the same six and dedupe
    the same way, or its numbers describe a dictionary nobody has.

    `scripts/measure-scenes.ts` grew one copy of that and did not dedupe, so a
    word in both the hand-checked seed and the course harvest was counted twice
    and its sentences with it: the corpus read 15,920 attested lines where it
    has 13,683, and the entry count read 7,127 where `SEED_SET_SIZE` says 6,083.
    Nothing was wrong with the conclusions and every absolute figure was.
    `scripts/audit-senses.ts` was about to be the second copy.

    So the assembly lives in `scripts/lib/dictionary.ts` and the check is that
    nothing else builds one. The seed itself is the exception it has to be: it
    is the thing being described, it writes rows rather than reading them, and
    it computes gradation on the way.
  */
  const HOME = "scripts/lib/dictionary.ts";
  assert.ok(existsSync(HOME), `the one assembly has gone from ${HOME}`);

  // Reading one of these is ordinary. Reading several is assembling the seed.
  const sources = [
    /prisma\/data\/nouns/, /prisma\/data\/verbs/, /prisma\/data\/other/,
    /prisma\/data\/advanced/, /prisma\/data\/harvested/, /prisma\/data\/expanded/,
  ];
  /*
    Two exceptions and both have to be exceptions.

    `prisma/seed.ts` is the thing being described: it writes rows rather than
    reading them, and it computes gradation on the way.

    `lib/collections/seedSize.test.ts` is the independent count that
    `SEED_SET_SIZE` is checked against, and independence is the whole of its
    value. A counter that read the shared assembly could not catch the shared
    assembly being wrong, which is exactly the fault that made this check
    necessary. It compares its own total against `shippedDictionary()` instead,
    so the two are pinned to each other without either one trusting the other.
  */
  const allowed = new Set([HOME, "prisma/seed.ts", "lib/collections/seedSize.test.ts"]);

  const copies: string[] = [];
  for (const file of [...LIB, ...APP, ...sourceFiles("scripts")]) {
    if (allowed.has(file)) continue;
    const src = code(file);
    if (sources.filter((pattern) => pattern.test(src)).length > 2) copies.push(file);
  }
  assert.deepEqual(
    copies, [],
    "these assemble the shipped dictionary out of the seed's own data files. There is one, in "
    + `${HOME}, and two of them disagree about how big the dictionary is.`,
  );
});

check("there is one shuffle, and the sort-comparator kind is not a shuffle at all", () => {
  /*
    There were ten, in three implementations. Four in `app/` were Fisher-Yates
    character for character, four in `lib/` were the same again with an rng
    passed in, and two places used a comparator instead:

        [...cards].sort(() => Math.random() - 0.5)

    A comparator is asked about a pair and expected to answer the same way each
    time. One that answers at random leaves the sort finishing early over runs
    it believes are ordered, so an element stays near where it started.
    Measured over 200,000 rounds at the sizes the app uses: in the 40-card
    sprint the first card led 7.0% of rounds against a uniform 2.5%; in the
    20-card listening round, 11.7% against 5.0%. Those pools arrive
    `orderBy: { due: "asc" }`, so that is the most overdue card leading about
    three times as often as chance while the tail went under-practised.

    Both halves are asserted, because fixing the two wrong copies and leaving
    eight right ones is how a ninth gets written. `lib/exam/paper.ts` is the one
    exception and says why in its own header: the server rebuilds a paper from
    its seed to mark it, so changing how that one draws would mis-mark a paper
    somebody started before a deploy.
  */
  const SHUFFLE_HOME = "lib/random/shuffle.ts";
  const EXCEPTION = "lib/exam/paper.ts";

  assert.ok(existsSync(SHUFFLE_HOME), "the one shuffle has gone from lib/random/shuffle.ts");

  for (const file of ALL) {
    if (file === SHUFFLE_HOME || file === EXCEPTION) continue;
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    assert.ok(
      !/\.sort\(\s*\(\s*\)\s*=>/.test(src),
      `${file}: sorting with a comparator that ignores its arguments is not a shuffle. `
      + `It leaves elements near where they started. Use shuffle() from ${SHUFFLE_HOME}.`,
    );
    assert.ok(
      !/function shuffled?\s*</.test(src),
      `${file}: a hand-rolled shuffle. There is one in ${SHUFFLE_HOME} and it takes the `
      + `generator as a parameter, so a seeded caller passes its own.`,
    );
    /*
      And the third implementation, which was inline six times and has no
      function to name: decorate each item with a random key, sort on it,
      undecorate. Sorting on independent random keys is a fair shuffle, unlike
      the comparator above, so this is about there being one of these rather
      than about correctness. The tell is the decorate step, a property whose
      value is a draw *and nothing else*: `left: Math.random() * 100` is a
      confetti piece's position and was the first thing this caught.
    */
    assert.ok(
      !/[{,]\s*\w+:\s*(Math\.)?random\(\)\s*[,}]/.test(src),
      `${file}: an inline shuffle, keyed on a random draw and sorted. Use shuffle() from `
      + `${SHUFFLE_HOME}. Two of these were weighted ("the deck's own words first"), and `
      + `that reads better as two shuffles concatenated than as a key trick whose two `
      + `ranges happen not to overlap.`,
    );
  }

  // And the exception carries its reason, so nobody reads it as an oversight.
  assert.match(
    read(EXCEPTION),
    /rebuilds the paper from that seed to mark it/,
    `${EXCEPTION} keeps its own shuffle and its header stopped saying why`,
  );
});

check("a `take` beside a `distinct` bounds nothing, so it is scoped to one owner", () => {
  /*
    Prisma applies `distinct` in the client. A `LIMIT` would cut rows before the
    deduplication, so it emits none: `findMany({ distinct, take })` reads every
    matching row, adds an id column of its own to deduplicate with, sorts, and
    throws the surplus away in JavaScript. The `take` reads exactly like a bound
    and is not in the query at all.

    Measured, not inferred. `countGroups` in the suggestion queue carried a
    comment saying a `groupBy` "would read every matching group to count them,
    which at the volume this queue is built for is the one query that would stop
    being cheap", and its replacement emitted
    `SELECT id, groupKey FROM Suggestion WHERE status = $1 ORDER BY id` for a
    single number. It read every row where the query it replaced read one per
    group, on the one table open sign-up lets strangers grow.

    So the rule is not "never pair them", because a query for one learner's own
    cards is bounded by the size of their deck whatever the `take` says, and two
    of those are honest. It is that the pairing may only ever be owner-scoped:
    an unscoped one reads the whole table however small the number beside it
    looks. Anything deployment-wide counts in Postgres.
  */
  for (const file of ALL) {
    // Comments out, or this fires on the paragraph in `practice/page.tsx` that
    // describes the query it stopped making. Which it did, once.
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    let at = src.indexOf("distinct: [");
    while (at !== -1) {
      // The enclosing call: back to the `prisma.` that opened it, forward to
      // the end of that argument object.
      const opened = src.lastIndexOf("prisma.", at);
      const call = src.slice(opened, src.indexOf("})", at) + 2);
      assert.ok(
        /ownerId/.test(call),
        `${file}: a Prisma \`distinct\` with no ownerId in its where. That reads the whole `
        + `table however small the \`take\` beside it looks, because Prisma emits no LIMIT `
        + `next to a distinct. Count it in Postgres instead.`,
      );
      at = src.indexOf("distinct: [", at + 1);
    }
  }
});

check("which of two entries for one word wins is decided, not left to the rows", () => {
  /*
    `@@unique` is on `(lemma, pos)`, so one lemma can hold more than one entry
    and sometimes should: `hall` is grey and also frost. What may not happen is
    the app having no rule about which of them it leads with, because the entry
    page renders `hits[0]` and nothing else.

    It had none. Both rows score 100, the tiebreak compared `lemma` against
    `lemma` and returned 0, and neither query behind the search carried an
    `ORDER BY`, so the winner came out of the plan. A fresh seed shipped thirteen
    such pairs (open question Q8, since answered, which takes it to two), and a
    learner confirming a scanned word the dictionary already knows makes another
    with no forms in it, which took the whole paradigm off the entry page for a
    word the app knows perfectly well. That second path is why this rule is not
    retired by the part-of-speech fix.
    Three browser suites failed on it in one run and passed in the next with
    nothing changed.

    Asserted on both comparators, because the search box and the gate in front
    of a flashcard had the same fault in different words: one sorted, the other
    kept whichever candidate the array listed first.
  */
  const search = read("lib/dict/search.ts");

  assert.match(
    search,
    /function bySubstance\([\s\S]*?a\.id\.localeCompare\(b\.id\)/,
    "the tiebreak stopped ending on id, so it can return 0 for two different rows",
  );
  /*
    And the order of its first two tests, which is not a detail. Provenance has
    to come second: a word confirmed off a photograph is filed as USER, which
    counts as written by a person and has no forms in it, so ranking provenance
    first hands a formless stub the entry page again. Ranking forms before
    provenance is the other way to get it wrong, and did: `vana` the built noun
    has six principal parts and the hand-checked course adjective has five.
  */
  const body = /function bySubstance\(([\s\S]*?)\n\}/.exec(search)?.[1] ?? "";
  const posAt = body.indexOf('pos !== "OTHER"');
  const provAt = body.indexOf("HAND_WRITTEN.has");
  const formsAt = body.indexOf("forms.length");
  assert.ok(posAt >= 0 && provAt >= 0 && formsAt >= 0, "bySubstance lost one of its three tests");
  assert.ok(
    posAt < provAt && provAt < formsAt,
    "bySubstance reordered: a known part of speech, then a hand-written source, then how much is stored",
  );
  assert.match(
    search,
    /\.sort\(\(a, b\) =>[\s\S]{0,200}?bySubstance\(a\.hit, b\.hit\)\)/,
    "rankCandidates no longer breaks a tie between two entries for one word",
  );
  assert.match(
    search,
    /scored\.score === best\.score && bySubstance\(/,
    "matchEstonianForm is back to keeping whichever equal candidate came first",
  );
  /*
    And the candidate set itself is ordered, because it is truncated: which 600
    of a broad match you get was otherwise the plan's choice, and the ranker can
    only rank what it was handed.
  */
  assert.match(
    search,
    /ORDER BY id\s*\n\s*LIMIT 600/,
    "the truncated candidate query lost its order, so it can return a different 600",
  );
});

check("the photograph itself is never stored", () => {
  /*
    A picture of somebody's homework has their name at the top of it, and the
    app needs it for the four seconds it takes to read the words off. The cloze
    exercise makes the same promise about a pasted passage. Keeping it is a
    property of the schema and of the route, not a habit.
  */
  const scanModel = /model Scan \{[^}]*\}/.exec(SCHEMA)?.[0] ?? "";
  assert.ok(scanModel, "the Scan model is gone, so this check is watching nothing");
  assert.equal(
    /image|photo|base64|dataUrl/i.test(scanModel),
    false,
    "the Scan model has grown somewhere to keep the picture",
  );

  const route = read("app/api/scan/route.ts");
  assert.equal(
    /prisma\.\w+\.(create|createMany|update|upsert)/.test(route),
    false,
    "the scan route writes to the database, which is where the picture would land",
  );
});

// ── A headline is read, never believed ───────────────────────────────────────

check("a word off a news feed reaches the screen only as a word the dictionary holds", () => {
  /*
    THE SAME RULE AS THE PHOTOGRAPH ABOVE, ON THE SECOND PATH WHERE ESTONIAN
    THIS APP DID NOT WRITE COMES IN FROM OUTSIDE.

    The dictionary's suggestion row offers words that are in the news this
    morning, which means a text nobody here wrote is proposing Estonian. It
    proposes and nothing more: `matchEstonianForm` decides, at the same
    confidence floor a photographed page has to clear, and what is offered is
    the dictionary's own headword rather than the spelling the headline used.
    A feed could carry anything and the worst case is a shorter row.
  */
  const suggest = read("lib/dict/suggest.ts");
  const vouching = between(suggest, "async function vouchNews");
  assert.match(vouching, /matchEstonianForm\(/, "news words no longer go through the vouched matcher");
  assert.match(
    vouching,
    /lemma: match\.lemma/,
    "the row carries something other than the lemma the dictionary matched",
  );
  assert.equal(
    /(push|add)\(\s*word\b|lemma: word\b/.test(vouching),
    false,
    "a word as the headline spelled it is being carried through to the row",
  );

  /*
    And the reading of the feed stays a reading. Nothing under lib/news/ may
    touch the database or run in a browser: it turns XML into candidate
    strings and hands them on.
  */
  for (const file of sourceFiles("lib/news")) {
    if (/\.i?test\.tsx?$/.test(file)) continue;
    const source = read(file);
    assert.equal(
      /@\/lib\/db|prisma\./.test(source),
      false,
      `${file} reaches the database, so the feed could write to it`,
    );
    assert.equal(
      /"use client"/.test(source),
      false,
      `${file} runs in a browser, so a learner's own address would fetch the feed`,
    );
  }
});

check("nothing is suggested that the dictionary has not graded", () => {
  /*
    THE ROW OFFERED `aberratsioon` FOR THE WHOLE LIFE OF THE APP.

    It read the first forty rows of an alphabetical list and drew twelve of
    them, so the invitation to use the dictionary was `aasialane`,
    `aastatuhat` and `aatomipomm`. Two filters keep that from coming back and
    they apply to all three sources: a word carries a CEFR level, which is the
    record that the course or the graded seed vouched for it rather than the
    tail of the Wiktionary expansion, and it is a noun, a verb or an
    adjective, which are the entries with a paradigm for the chip to open.

    Asserted against every read of the table rather than against one query,
    because a fourth source added without both filters is exactly how this
    comes back.

    AND A THIRD FILTER, which is about a different question and so is drawn
    differently. A chip links to `/dictionary?q=<lemma>` and the dictionary
    answers a lemma with one entry, `bySubstance`'s, while `@@unique` is on
    `(lemma, pos)`: filtering the rows asks whether *some* entry has a table to
    open and the chip's promise is about the one a learner lands on. `oma` is
    the shipped instance, an adjective in the Wiktionary expansion and the
    pronoun the course teaches. `withATable` is that gate, it drops a lemma any
    of whose entries has nothing to open, and its own read is the one query here
    that must constrain neither: it is looking for the entries the filters would
    have hidden.
  */
  const suggest = read("lib/dict/suggest.ts");
  assert.match(suggest, /const POS = \[/, "the suggestion row stopped naming which parts of speech it offers");

  const gate = between(suggest, "export async function withATable");
  assert.match(gate, /opensATable/, "the gate stopped asking which parts of speech open a table");
  assert.match(
    suggest,
    /const words = await withATable\(/,
    "a source's words reach the row without passing the gate",
  );

  const chooses = suggest.replace(gate, "");
  for (const read_ of chooses.matchAll(/prisma\.lexeme\.\w+\(|FROM "Lexeme"/g)) {
    const window = chooses.slice(read_.index, read_.index + 400);
    assert.match(window, /cefr/, "a suggestion query does not constrain the CEFR level");
    assert.match(window, /pos/i, "a suggestion query does not constrain the part of speech");
  }

  /*
    The news source filters in TypeScript rather than in SQL, because the
    matcher has already returned the row. Both halves still have to be there.
  */
  const news = between(suggest, "async function vouchNews");
  assert.match(news, /match\.cefr/, "a news word is offered without a level behind it");
  assert.match(news, /POS\.includes\(match\.pos\)/, "a news word is offered whatever its part of speech");
});

check("the seasonal row names units of the course, never words of its own", () => {
  /*
    A hand-written seasonal word list would be this app writing Estonian
    (ADR-005), and the first misspelling would ship in silence. So the
    calendar names unit ids and the words come out of the syllabus, where a
    lemma is a request the Ekilex harvest either honoured or reported.
    `topical.test.ts` checks every id is a real unit; this checks the table
    has not started carrying words instead.
  */
  const topical = read("lib/collections/topical.ts");
  const table = between(topical, "export const THEMES");
  for (const units of table.matchAll(/units: \[([^\]]*)\]/g)) {
    for (const id of units[1]!.split(",")) {
      const trimmed = id.trim().replace(/^"|"$/g, "");
      if (!trimmed) continue;
      assert.equal(
        /[\u00C0-\u024F]/.test(trimmed),
        false,
        `${trimmed} is spelled like a word rather than like a unit id`,
      );
    }
  }
  assert.match(
    topical,
    /import \{ SYLLABUS \} from "\.\/syllabus"/,
    "the seasonal table stopped reading its words out of the course",
  );
});

// ── The model is named from the run that answered ────────────────────────────

check("the chat says which model actually replied", () => {
  /*
    `openWithFallback` walks past a throttled provider, so the model
    configured first may not have written a word of what is on screen. A
    screen naming the wrong model is worse than one naming none.
  */
  const route = read("app/api/tutor/route.ts");
  assert.match(route, /x-model-provider/, "the reply no longer carries which model wrote it");
  assert.match(route, /open\.config/, "the header names something other than the run that answered");
  // Shared by the full `/tutor` page and the floating Anu button, so both
  // read it from the one place that actually asks the response for it.
  const chat = read("components/anu/useAnuChat.ts");
  assert.match(chat, /x-model-provider/, "the chat no longer reads it back");
});

check("Anu's prose is cleaned on its way to the learner", () => {
  assert.match(read("app/api/tutor/route.ts"), /ProseStream/, "the humanize pass is gone");
});

check("Anu's reply is drawn as typography, shown once finished, and the marker lines have one shape", () => {
  /*
    Every model writes markdown whether asked or not, and her bubble drew it
    as text: `**raamatut**` with the asterisks in, on the one word the
    sentence was about, and a list as four lines beginning `1.`. Drawn a
    chunk at a time it was worse, because bold that has opened and not yet
    closed is asterisks for as long as the model takes to reach the closing
    pair. So `lib/tutor/markdown.ts` reads a reply into blocks, `AnuProse` is
    the one place they become elements, and `useAnuChat` gathers the stream
    and shows the finished reply once. The route still streams; the screen
    waits.

    And a model allowed bold bolds its markers, so `**FIX:**` arrives as
    readily as `FIX:`. Three modules recognise those lines for three reasons
    and each carried its own regex; `lib/tutor/markers.ts` is the one shape
    now, and a reader that grows a copy back is a reader that stops agreeing
    with the other two the day the model changes its typography.
  */
  const parts = code("components/anu/AnuParts.tsx");
  assert.match(parts, /<AnuProse text=\{rest\}/, "Anu's reply is no longer drawn through AnuProse");
  assert.match(parts, /from "\.\/Prose"/, "AnuParts stopped importing the one renderer");
  assert.match(parts, /from "@\/lib\/tutor\/markers"/, "AnuParts stopped reading the marker table");
  assert.doesNotMatch(parts, /\/\^[^\n]*(?:FIX|VOCAB)/, "AnuParts has grown its own FIX or VOCAB regex again");
  assert.match(code("components/anu/Prose.tsx"), /parseReply\(/, "AnuProse no longer parses the reply");
  assert.match(
    code("app/(app)/exam/result/[id]/AnuReading.tsx"),
    /<AnuProse/,
    "Anu's reading of a composition is drawn as raw text again",
  );

  const hook = code("components/anu/useAnuChat.ts");
  const loopStart = hook.indexOf("while (true)");
  const loopEnd = hook.indexOf("acc += decoder.decode();");
  assert.ok(loopStart !== -1 && loopEnd > loopStart, "the read loop in useAnuChat has changed shape; re-anchor this check");
  assert.doesNotMatch(hook.slice(loopStart, loopEnd), /setMessages/, "the chat draws the reply a chunk at a time again");

  for (const file of ["lib/tutor/humanize.ts", "lib/tutor/verify.ts"]) {
    const source = code(file);
    assert.match(source, /from "@\/lib\/tutor\/markers"/, `${file} stopped reading the marker table`);
    assert.doesNotMatch(source, /\(\?:VOCAB\|FIX\)/, `${file} has grown its own copy of the marker regex`);
  }

  // The prompt says what formatting is allowed, in the terms the renderer understands.
  const prompt = buildSystemPrompt("A2");
  assert.match(prompt, /\*\*bold\*\*/, "the prompt no longer says what bold is for");
  assert.match(prompt, /No headings, no tables/, "the prompt no longer rules out the shapes the renderer will not draw");
});

check("Anu's free chat prose is checked against the dictionary, not just her graded comments", () => {
  /*
    `verifyComment` withholds a graded comment before it is ever shown
    (app/api/write/route.ts, app/api/exam/write/route.ts, both checked
    above). The main chat is the higher-traffic path, it is where the system
    prompt asks Anu to give worked examples and minimal pairs inline, and
    until now nothing checked a word of it: `ProseStream` cleans punctuation
    and explicitly never touches Estonian, and the two lines that were boxed
    and tagged, FIX: and VOCAB:, are the only ones a learner was ever told to
    doubt. `scripts/eval-anu.mjs` already caught a model inventing a form on
    exactly this kind of question, which is the whole argument for a check
    here rather than a stronger request in the prompt.
  */
  const route = read("app/api/tutor/route.ts");
  assert.match(route, /chatEstonianTokens\(/, "the chat route no longer extracts candidate Estonian tokens");
  assert.match(route, /matchEstonianForm\(/, "the chat route no longer checks tokens against the dictionary");
  assert.match(route, /UNVERIFIED:/, "the chat route no longer flags what it could not confirm");

  // Shared by the full `/tutor` page and the floating Anu button, so both
  // render the flag the same way.
  const chat = read("components/anu/AnuParts.tsx");
  assert.match(chat, /UNVERIFIED:/, "the chat screen no longer reads the flag back");
});

// ── Never re-add the iframes (docs/00-audit-v4.md section A) ─────────────────

check("nothing tries to embed Sonaveeb or Ekilex", () => {
  // Both send X-Frame-Options: DENY. This was verified, not assumed.
  for (const file of ALL) {
    const source = read(file);
    assert.equal(
      /<iframe[^>]*(sonaveeb|ekilex|speakly)/i.test(source),
      false,
      `${file} embeds a site that refuses to be embedded`,
    );
  }
});

// ── Conventions that hold the design together ────────────────────────────────

check("how much of the app a screen leads with is decided in one place", () => {
  /*
    The feedback that produced `lib/ux/disclosure.ts` was that this app
    overwhelms somebody just getting started, and the cause was that every
    screen decided on its own how much to show and every one of them decided
    "everything". A rule that lives in one module is only a rule while the
    next screen reaches for it instead of writing its own threshold, so this
    fails on two shapes: Today no longer asking the module, and anybody
    outside it comparing a review count against a number of their own.
  */
  const today = code("app/(app)/page.tsx");
  assert.match(today, /from "@\/lib\/ux\/disclosure"/, "Today decides for itself again");
  assert.match(today, /\bshows\(/, "Today imports the rule without applying it");

  for (const file of ALL) {
    if (file.startsWith("lib/ux/")) continue;
    const source = code(file);
    // A comparison of a review total against a literal is somebody inventing a
    // second answer to "has this learner started yet". `stageOf` is the answer.
    assert.equal(
      /reviewsAllTime\s*[<>]=?\s*\d/.test(source),
      false,
      `${file} sets its own threshold for a new learner instead of calling stageOf`,
    );
  }
});

check("where a screen lives is decided in one table", () => {
  /*
    The rail, the phone sheet and the command palette are three answers to
    "where does this live", and for a while they were three lists plus a
    walkthrough. The palette offered six practice modes while the hub offered
    eleven, so the Leech clinic was reachable from one screen and unfindable
    from the box that promises to go anywhere; `components/PracticeModes.tsx`
    held a seventh copy of them that no screen rendered at all; and
    `lib/copy/tour.ts` named nine screens a second time with their own icons.

    That last one is gone with the page it fed. `/guide` was a second
    description of an app the landing page already describes, offered to
    somebody who had just pressed the button saying they wanted to start, and
    the tour table was the last thing keeping a second set of screen names
    alive. The rule it existed under stands for whatever is written next.

    Two shapes fail here. A navigation surface that stops reading
    `lib/ux/nav.ts` or `lib/ux/modes.ts`, and anybody else collecting this
    app's own routes into a table that also names them. Prose keyed by route is
    fine, and so is a link: it is the second copy of the *names* that rots.
  */
  const readers: [string, RegExp][] = [
    ["components/Sidebar.tsx", /lib\/ux\/nav/],
    ["components/CommandPalette.tsx", /lib\/ux\/nav/],
    ["app/(app)/practice/page.tsx", /lib\/ux\/modes/],
    ["app/(app)/page.tsx", /lib\/ux\/modes/],
  ];
  for (const [file, table] of readers) {
    assert.match(code(file), table, `${file} navigates by a list of its own again`);
  }

  for (const file of ALL) {
    if (file.startsWith("lib/ux/")) continue;
    // The syllabus, the badges and the quests carry a route into their own
    // page beside their own content. That is content with a link on it.
    if (/^lib\/(collections|achievements|gamification)\//.test(file)) continue;
    for (const literal of code(file).match(/\[[^[\]]*\]/g) ?? []) {
      const routes = literal.match(/href:\s*"\/[a-z]/g)?.length ?? 0;
      const named = /\b(label|title):\s*"/.test(literal) && /\bicon:\s*"/.test(literal);
      assert.ok(
        routes < 3 || !named,
        `${file} names ${routes} destinations in a table of its own instead of reading lib/ux/nav.ts`,
      );
    }
  }
});

check("the rail shows every place, rather than hiding some behind a button", () => {
  /*
    The rail used to promote four destinations and put the other twelve behind
    a button marked "More", and the button had a bug that only showed up in
    use: the group opened itself whenever the current page was inside it, so on
    Practice or Progress the label read "Less" and pressing it did nothing.
    `showRest` was `railOpen || secondaryActive`, the click flipped `railOpen`,
    and the second half of that held it open regardless.

    Fixing the toggle was the small half. Sixteen links behind a disclosure are
    the same sixteen links somewhere a learner has to remember, so the rail
    draws every section it is given. This fails on the shape that came back:
    the rail keeping a piece of state that decides which links exist. The phone
    sheet keeps its button, because five cells across a phone is a different
    problem from a column with a screen of height in it, and what it opens is
    the same sections under the same headings.

    `scripts/smoke-new.mjs` is the other half of this and the one that counts:
    it opens the app at desktop width and asserts every destination in the
    table is a link you can see.
  */
  const rail = code("components/Sidebar.tsx");
  assert.match(rail, /PLACES\.map/, "the rail stopped drawing the sections it is given");
  for (const gate of ["railOpen", "showRest", "secondaryActive"]) {
    assert.equal(
      rail.includes(gate),
      false,
      `the rail hides some of its links behind ${gate} again`,
    );
  }
});

check("where you are is one pane, and it arrives under a pointer", () => {
  /*
    The rail and the phone bar say where you are with one pane that moves
    between their cells, rather than each cell painting itself when its turn
    comes. Three things hold that up and each one has already been the bug.

    ONE SOURCE FOR THE MOTION. Both surfaces take their marker from
    `lib/layout/navMarker.ts`, which takes its arithmetic from
    `lib/ux/navMotion.ts`. A surface that grows a marker of its own is two
    answers to one question, drifting apart a number at a time.

    NOTHING ANIMATES A LAYOUT PROPERTY. `top`, `left`, `width` and `height`
    are laid out and painted on the main thread, and the main thread is what a
    page navigation is busy with: Upside Lab measured its own marker on those
    running three frames, stalling five while the new room rendered, then
    teleporting the rest of the way in one. The travel is a transform
    animation with a clock of its own, so a transition naming any of those
    four on either pane is the regression.

    AND THE ROW STILL CARRIES ITS OWN CARD UNTIL A PANE EXISTS. A marker is
    placed by measuring, which cannot happen on a server, so every hard load
    paints once before there is one. The well declares the material as
    `--nav-marker-bg` and the current cell wears it until `data-nav-marked`
    says a pane has taken over.
  */
  const rail = code("components/Sidebar.tsx");
  assert.match(rail, /useNavMarker\(/, "the navigation stopped reading lib/layout/navMarker.ts");
  assert.match(
    code("lib/layout/navMarker.ts"),
    /from "@\/lib\/ux\/navMotion"/,
    "the marker grew geometry of its own instead of reading lib/ux/navMotion.ts",
  );

  const motion = read("app/nav.css");
  for (const pane of [".nav-marker", ".nav-ghost"]) {
    assert.ok(motion.includes(pane), `app/nav.css no longer draws ${pane}`);
  }
  for (const rule of motion.split("}")) {
    if (!/\.nav-(marker|ghost)\b/.test(rule)) continue;
    const transition = /transition:([^;]*)/.exec(rule)?.[1] ?? "";
    assert.doesNotMatch(
      transition,
      /\b(top|left|right|bottom|width|height|all)\b/,
      "a marker pane is back on a layout property, which a route change freezes",
    );
  }

  assert.match(
    motion,
    /\.nav-cell\[data-nav-on\][^{]*\{[^}]*--nav-marker-bg/,
    "the current row stopped carrying its own card for the paint before hydration",
  );
  assert.match(rail, /data-nav-marked/, "nothing tells the row when a pane has taken the card over");

  /*
    REACHING AND ARRIVING ARE ONE OBJECT AT TWO WEIGHTS.

    The pointer's pane was the accent's softest tint, three pixels bigger than
    the row it sat under, while the marker was a white card the row's own size,
    so the two states of one row were two different objects and on the row you
    were already on the tint stuck out round the card as a second outline. They
    read one fill now, `--nav-marker-bg`, and the marker's own lift is the only
    difference; a pane painted from a fill of its own, or reaching past the cell
    it was measured on, is the regression either way.
  */
  /* Comments first: this one carries commas and the word `box-shadow`. */
  const rules = motion.replace(/\/\*[\s\S]*?\*\//g, "");
  const ghost =
    rules
      .split("}")
      .map((rule) => rule.split("{"))
      .filter((parts) => parts.length === 2 && parts[0]!.trim().endsWith(".nav-ghost") &&
        !parts[0]!.includes(","))
      .map((parts) => parts[1]!)
      .join("\n");
  assert.match(
    ghost,
    /background:\s*var\(--nav-marker-bg/,
    "the pointer's pane is painted something other than the marker's own fill",
  );
  assert.doesNotMatch(
    ghost,
    /box-shadow/,
    "the pointer's pane reaches past the cell it was measured on again",
  );

  /*
    A TRAVELLING MARKER IS COMPANY FOR A FINGER AND AN ARGUMENT WITH A POINTER.

    A thumb has nothing else to do while a server answers, so the bar's pill
    slides from the cell you left to the cell you asked for. A pointer has
    already arrived, and its own pane has been following it down the rail all
    along, so the rail is written straight to its resting geometry and the
    marker is simply there on the row you pressed. Asserted as the pair rather
    than as either number: what may not happen is the two surfaces answering
    the same way, and `glide` has to have the zero-duration way out for the
    rail's answer to mean anything at all.
  */
  assert.equal(NAV_MOTION.rail.travelMs, 0, "the rail's marker travels again under a pointer");
  assert.ok(NAV_MOTION.bar.travelMs > 0, "the phone bar's marker stopped travelling");
  assert.match(
    code("lib/layout/navMarker.ts"),
    /durationMs\s*<=\s*0/,
    "a pane with no travel would animate anyway, since `glide` lost its way out",
  );
});

check("the pure modules stay free of React, Next and Prisma", () => {
  /*
    These are the ones with unit tests around them, and a test is only cheap
    while the module under it can be imported without a framework.
  */
  const pure = [
    "assessment", "collections", "copy", "estonian", "exam", "funding", "games", "gamification",
    "learn", "offline", "random", "research", "scan", "security", "stats", "time", "ux",
  ];
  for (const file of LIB) {
    const area = file.split("/")[1];
    if (!pure.includes(area ?? "")) continue;
    const source = read(file);
    for (const forbidden of ["@prisma/client", "next/", "react"]) {
      assert.equal(
        new RegExp(`from ["']${forbidden.replace("/", "\\/")}`).test(source),
        false,
        `${file} imports ${forbidden}`,
      );
    }
  }
});

check("colour comes from a token, never a raw hex", () => {
  /*
    The five hues carry fixed meanings: mint is "recalled", peach is
    "missed", and neither is free for decoration. A hex typed into a
    component is a sixth meaning nobody agreed to.
  */
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  const offenders: string[] = [];
  for (const file of [...COMPONENTS, ...APP]) {
    // The social card and the app icons are painted outside the browser,
    // where a CSS custom property does not resolve.
    // global-error renders when the root layout itself failed, so globals.css
    // may never have loaded and a custom property would resolve to nothing.
    if (/api\/share|apple-icon|icon\.tsx|manifest\.ts|layout\.tsx|global-error/.test(file)) continue;
    for (const [i, line] of read(file).split("\n").entries()) {
      if (!hex.test(line)) continue;
      if (line.trim().startsWith("*") || line.trim().startsWith("//")) continue;
      offenders.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [], "a raw hex is used instead of a token");
});

check("an Estonian text input gets the letter bar, from one list", () => {
  /*
    õ ä ö ü š ž are not on a UK or US keyboard, and a learner typing an answer
    should not have to know an alt code to be marked right.

    The list is read from the module rather than from the component that draws
    it, which is the change this check needed: there used to be a `DIACRITICS`
    constant in `EstonianInput` and a second one in `DiacriticBar`, and this
    check read both, so it was asserting that two copies each said six things
    rather than that there was one list. A seventh letter added to one of them
    would have passed.
  */
  const letters = read("lib/ux/letterBar.ts");
  for (const letter of ["õ", "ä", "ö", "ü", "š", "ž"]) {
    assert.ok(letters.includes(letter), `lib/ux/letterBar.ts no longer offers ${letter}`);
  }

  // And there is one bar. Anything drawing the row has to be the shared
  // component, whose letters come from the module above.
  const bar = read("components/DiacriticBar.tsx");
  assert.match(bar, /ESTONIAN_LETTERS/, "the bar no longer reads the shared list of letters");
  const drawers = ALL.filter((f) => /className="letter-bar|className={`letter-bar/.test(read(f)));
  assert.deepEqual(
    drawers,
    ["components/DiacriticBar.tsx"],
    "something other than DiacriticBar draws its own letter bar",
  );
});

check("the letter bar is a desktop thing, and a choice, and reversible", () => {
  /*
    THREE PROPERTIES, ONE FEATURE. See lib/ux/letterBar.ts for the argument.

    A phone keyboard already carries these letters, so the row buys it nothing
    and costs it the only vertical space it has. A learner on an Estonian
    keyboard has them as keys, so the row is clutter under every field in the
    app. Neither is detectable, so it is asked at first run and changed after.

    Asserted as shapes rather than as today's declarations: what matters is
    that the bar is off by default and turned on only where there is a real
    pointer, that the answer is asked and stored, and that there is a way back.
  */
  const css = read("app/globals.css");

  // Off by default, so a device that matches nothing draws no bar. A rule that
  // hid it inside a `max-width` query instead would leave every browser
  // without that query drawing one.
  // Anchored to a rule of its own, because the first version of this matched
  // the `[data-letters="off"] .letter-bar` rule *inside* the query and passed
  // happily with the default rule deleted, which draws the bar on every phone.
  assert.match(
    css,
    /(^|\n)\s*\.letter-bar[^{}]*\{[^}]*display:\s*none/,
    "the letter bar is no longer hidden by default",
  );

  /*
    A REAL POINTER, AND DELIBERATELY NOT A WIDTH.

    This asserted `(min-width: 768px) and (pointer: fine)` and so asserted
    today's declaration rather than the rule, which is the mistake this file
    keeps warning about one layer up. The width was wrong: a viewport width is
    not a fact about a keyboard, so dragging a desktop window to half the screen
    took the row away on a machine whose keys had not changed and still had no õ
    among them.

    What the rule has to say is that the bar is drawn where there is a fine
    pointer, which is the test that was doing the work: a tablet with nothing
    attached reports a coarse one. So the query is read for `pointer: fine`, and
    a width in it is a *failure*, because reintroducing one brings the fault
    back. `scripts/test-mobile.mjs` measures the other side of this in a
    browser at 480, 640 and 760 with a mouse, which is the combination that was
    broken.
  */
  const query = /@media\s*\(pointer:\s*fine\)\s*\{([\s\S]*?)\n  \}/.exec(css);
  assert.ok(query, "the letter bar is no longer drawn under a bare pointer query");
  assert.equal(
    /@media[^{]*min-width[^{]*pointer:\s*fine/.exec(css),
    null,
    "the letter bar is keyed on a width again, so a half-width desktop window loses it",
  );
  assert.match(query[1]!, /\.letter-bar\s*\{\s*display:\s*flex/, "the query no longer draws the bar");
  assert.match(
    query[1]!,
    /\[data-letters="off"\][^{]*\.letter-bar[^{]*\{[^}]*display:\s*none/,
    "the learner's own answer no longer turns the bar off",
  );

  // The answer is stored through the settings store, like every other setting.
  assert.match(read("lib/settings/store.ts"), /letterBar:/, "letterBar is not declared in the store");
  for (const file of ALL) {
    if (file === "lib/settings/store.ts") continue;
    assert.equal(
      /["']letterBar["']/.exec(read(file)),
      null,
      `${file} writes the letterBar key as a literal`,
    );
  }

  // Published for every signed-in screen, from the setting, in the render
  // rather than from an effect: an attribute written after hydration shows the
  // bar for a frame to everybody who asked for it to be gone.
  const layout = read("app/(app)/layout.tsx");
  assert.match(layout, /SETTING_KEYS\.letterBar/, "the app shell no longer reads the answer");
  assert.match(layout, /<LetterBarScope/, "the app shell no longer publishes the answer");
  assert.match(
    read("components/DiacriticBar.tsx"),
    /data-letters=\{value\}/,
    "the scope no longer renders the answer as an attribute",
  );

  // Asked at first run, which is the point of asking at all: a learner meets
  // Estonian fields on the very next screen of the wizard.
  assert.match(
    read("app/(chromeless)/start/WelcomeWizard.tsx"),
    /letterBar:\s*letters/,
    "first run no longer asks which keyboard the learner has",
  );
  assert.match(
    read("app/actions.ts"),
    /completeOnboarding[\s\S]*?SETTING_KEYS\.letterBar/,
    "first run's answer is no longer written",
  );

  // And two ways back, because the moment somebody notices they do not need
  // the row is the moment they are looking at it.
  assert.match(
    read("components/DiacriticBar.tsx"),
    /setLetterBar\("off"\)/,
    "the bar no longer offers to remove itself",
  );
  assert.match(
    read("app/(app)/settings/PreferencesPanel.tsx"),
    /setLetterBar/,
    "Settings can no longer turn the letters back on",
  );
});

check("nothing a person reads is smaller than the scale allows", () => {
  /*
    THE FLOOR IS 10.5px, AND THAT NUMBER IS THIS APP'S TYPE SCALE RATHER THAN
    A GENERAL RULE.

    Upside Lab's is 12px, and copying it here would have failed on 37 lines
    across nearly every screen, because this app has a real 11.5px tertiary
    tier that it uses consistently: a card's sub-line, a chip's hint, the
    caption under a heatmap. That is a tier, not drift, and an assertion that
    calls it a violation is one somebody deletes rather than acts on, which
    leaves the rule with nothing behind it at all.

    What the floor is for is the genuinely unreadable end, and there were two:
    the phone bar's labels at 9.5px under a 16px glyph, and a forecast axis at
    9px. Both were fixed rather than exempted.

    `label-xs` is 10.5px uppercase with wide tracking and is read as a marker
    rather than as a sentence, so it sets the floor rather than breaking it.
  */
  const FLOOR = 10.5;
  const tiny = /text-\[(\d+(?:\.\d+)?)px\]/g;
  const offenders: string[] = [];
  for (const file of [...COMPONENTS, ...APP]) {
    for (const [i, line] of read(file).split("\n").entries()) {
      for (const match of line.matchAll(tiny)) {
        const size = Number(match[1]);
        if (size >= FLOOR) continue;
        if (/label-xs|uppercase|tracking-|<kbd/.test(line)) continue;
        offenders.push(`${file}:${i + 1}: ${size}px`);
      }
    }
  }
  assert.deepEqual(offenders, [], `text below the ${FLOOR}px floor`);
});

check("an empty cell goes through NO_VALUE, never a literal", () => {
  /*
    THIS HAS GONE WRONG TWICE, THE SAME WAY, AND THE COPY GUARD CANNOT SEE IT.

    Ten call sites used an em dash to mean "no value here". A mechanical sweep
    of reader copy cannot tell that from a dash used as punctuation, so both
    times it rewrote them into `", "`: a bare comma sitting in a table of forms
    where a form should be. `readerCopy.test.ts` passes on that happily,
    because a comma is not a dash, which is exactly why the rule needs its own
    assertion rather than relying on the other one.

    Anything that renders a placeholder reads it from `lib/copy/values.ts`.
  */
  const literals = /(\?\?|\|\||\?)\s*["'`](\s*[,.\u2013\u2014-]\s*)["'`]/;
  const offenders: string[] = [];
  for (const file of [...APP, ...COMPONENTS]) {
    for (const [i, line] of read(file).split("\n").entries()) {
      if (literals.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 70)}`);
      if (/>\s*[,\u2013\u2014]\s*<\/(span|td)>/.test(line)) {
        offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a placeholder is typed in rather than read from NO_VALUE");
});

check("the voice is one table, and everything that speaks reads from it", () => {
  /*
    THE RULE THAT KEEPS THE COPY SOUNDING LIKE A PERSON, AND THE WAY IT ROTS.

    Three files stated it and no two of them agreed. `humanize.ts` held seven
    stock openers it stripped out of Anu's stream; `prompt.ts` asked the model
    for roughly the same thing in a sentence of its own; `readerCopy.test.ts`
    swept hand-written copy for nine brochure words across six hand-listed
    public files. So "delve" was banned in Anu's answer and fine in the panel
    beside it, the 73-unit course page and every empty state were outside the
    sweep entirely, and nobody reading any one of those files could see any of
    that. The same fault `PROVIDER_KEY_ENV` was consolidated for.

    `lib/copy/voice.ts` is the table. This asserts the shape rather than the
    contents: the table exports what its readers import, the stream and the
    prompt both read it rather than carrying a copy, and the sweep runs over
    the whole file set rather than a list somebody typed.
  */
  const table = "lib/copy/voice.ts";
  assert.ok(TELLS.length > 20, `${table} has been emptied out`);
  assert.ok(VOICE_RULES.length >= 5, `${table} no longer states the voice`);

  const humanize = code("lib/tutor/humanize.ts");
  assert.match(humanize, /from "@\/lib\/copy\/voice"/, "the stream stopped reading the voice table");
  assert.doesNotMatch(
    humanize,
    /(important to note|at the end of the day|great question)/i,
    "the stream has grown its own copy of the opener list again",
  );

  /*
    The prompt has to carry the rules, not merely import them. A file that
    imports a constant and never interpolates it type-checks perfectly and
    asks the model for nothing, which is the failure worth catching here.
  */
  const prompt = buildSystemPrompt("A2");
  for (const rule of VOICE_RULES) {
    assert.ok(prompt.includes(rule), `Anu is not given the rule: ${rule.slice(0, 48)}`);
  }
  assert.doesNotMatch(
    code("lib/tutor/prompt.ts"),
    /Never use an em dash/,
    "the prompt has gone back to typing the voice rules out beside the table",
  );

  /*
    And what she is told about the learner is read off their own log, never
    off the request. The chat used to post `level: "B1"` for everybody and
    the route believed it, so every learner was taught as B1. The level, the
    weakest case and the open unit come from `learnerContextFor` now, in a
    block sent after the static prompt so the cached part stays cached.
  */
  const tutorRoute = code("app/api/tutor/route.ts");
  assert.doesNotMatch(tutorRoute, /body\.level/, "the tutor route reads a level from the client again");
  assert.match(tutorRoute, /learnerContextFor\(ownerId\)/, "the tutor route no longer asks who is asking");
  assert.match(tutorRoute, /learnerNote\(learner\)/, "the tutor route no longer hands Anu the learner note");
  assert.doesNotMatch(
    code("components/anu/useAnuChat.ts"),
    /level:/,
    "the chat posts a level again, which the server would have to distrust",
  );

  /*
    And the sweep still sweeps everything. Narrowing it back to a hand-listed
    set of public files is exactly how it spent its first life, and a list is
    what a rule decays into: it covers the screens somebody was looking at on
    the day they wrote it and nothing added since.
  */
  const sweep = read("lib/copy/readerCopy.test.ts");
  assert.match(sweep, /FILES[\s\S]{0,300}findTells/, "hand-written copy is no longer swept for tells");
  assert.match(sweep, /FILES[\s\S]{0,300}EMOJI/, "the emoji rule no longer runs over the tree");

  /*
    And it still reaches the documentation. `docs/` was outside this rule until
    somebody counted: 388 dashes, plus three empty table cells written as a bare
    dash, which is the `NO_VALUE` fault from the source tree wearing a different
    hat. The pages a contributor reads first are the ones that teach them which
    of a project's rules are real, so the shape asserted is that the markdown
    set is built by walking `docs/` rather than by listing what somebody
    remembered.
  */
  assert.match(sweep, /sourceFiles\("docs"/, "the documentation sweep no longer walks docs/");
  assert.match(sweep, /MARKDOWN[\s\S]{0,300}findTells/, "the docs are no longer swept for tells");

  /*
    The half a machine cannot hold has to be written down somewhere a person
    will find it, or the enforceable half becomes the whole rule and the copy
    gets cold while passing every check.
  */
  assert.ok(existsSync("docs/18-voice.md"), "the voice standard has no written half");
  assert.match(read("CLAUDE.md"), /18-voice\.md/, "CLAUDE.md does not point at the voice standard");
});

check("the app does not talk about itself the way a brochure would", () => {
  /*
    The behavioural end of the same rule, asserted against what a stranger
    actually meets first rather than against the source tree the unit sweep
    walks. `readerCopy.test.ts` is the sweep; this is the check that the sweep
    is pointed at the right thing, since a table with no reader passes every
    test in it.
  */
  const publicSurfaces = [
    "app/(chromeless)/welcome/page.tsx",
    "app/(chromeless)/sign-in/page.tsx",
    "app/(chromeless)/start/WelcomeWizard.tsx",
    "README.md",
  ];
  const offenders: string[] = [];
  for (const file of publicSurfaces) {
    assert.ok(existsSync(file), `${file} is gone, so this check is pointed at nothing`);
    for (const [i, line] of read(file).split("\n").entries()) {
      for (const tell of findTells(line)) offenders.push(`${file}:${i + 1}: ${tell.name}`);
    }
  }
  assert.deepEqual(offenders, [], "the first thing a stranger reads is written in brochure");
});

// ── The browser suites, and the two ways one can lie ─────────────────────────

check("no browser suite hardcodes one machine's Chromium", () => {
  /*
    Every one of these was written inside a sandbox that ships Chromium at a
    fixed path, so every one of them said `executablePath:
    "/opt/pw-browsers/chromium"` and every one was correct exactly there.
    Anywhere else, CI included, Playwright reports a missing executable rather
    than a wrong assumption, and `npm run test:e2e` was a command one machine
    could run. `scripts/lib/browser.mjs` keeps that path as a fallback and puts
    Playwright's own resolution first.

    Asserted because the fix is invisible once it works, and because a new
    script gets written by copying an old one.
  */
  for (const file of sourceFiles("scripts", /\.mjs$/)) {
    if (file === "scripts/lib/browser.mjs") continue;
    assert.equal(
      /executablePath/.test(read(file)),
      false,
      `${file} names a browser path instead of using launchChromium()`,
    );
  }
});

check("every browser suite can be pointed at a different server", () => {
  /*
    `test-design.mjs` hardcoded localhost:3000, so it threw on its first
    navigation anywhere else, before check one, and printed no FAIL line. That
    is what a pass looks like to anything reading the output.
  */
  for (const file of sourceFiles("scripts", /^test-.*\.mjs$|^e2e\.mjs$/)) {
    /*
      Comments out. A suite explaining in prose why it does not use `baseUrl()`
      satisfied a check looking for that call, which is this repository's oldest
      recurring mistake in its own checks and was committed here again while
      writing the exemption below.
    */
    const source = code(file);
    if (!/newPage|goto\(/.test(source)) continue;
    /*
      A suite that starts its own server is the one case this cannot ask for.
      `test-error.mjs` runs a build against a database that is not there, which
      is the whole of what it checks, so pointing it at the working server would
      leave it nothing to see. What the rule is really about still applies and
      is still asserted below: no suite is pinned to a server on port 3000 that
      it did not start.
    */
    const startsItsOwn = /spawn\(/.test(source) && /"next", "start"/.test(source);
    if (!startsItsOwn) assert.match(source, /baseUrl\(\)/, `${file} does not read BASE_URL`);
    assert.equal(
      /"http:\/\/localhost:3000"/.test(source.replace(/baseUrl[\s\S]*?\n/, "")),
      false,
      `${file} still carries a hardcoded server`,
    );
  }
});

check("every browser suite says how many checks it reached", () => {
  /*
    Counting failures alone cannot tell a suite that passed from one that ran
    nothing, and cannot show that five checks behind a failed gate were never
    looked at. Both happened here. The floor is the count CI reaches.
  */
  for (const file of sourceFiles("scripts", /^test-.*\.mjs$|^e2e\.mjs$/)) {
    /*
      Comments out. A suite explaining in prose why it does not use `baseUrl()`
      satisfied a check looking for that call, which is this repository's oldest
      recurring mistake in its own checks and was committed here again while
      writing the exemption below.
    */
    const source = code(file);
    if (!/newPage|goto\(/.test(source)) continue;
    /*
      A trailing comma is ordinary and this used to reject one, which fired on
      a suite whose floor was declared correctly and carried a paragraph saying
      how the number was arrived at. A floor is exactly the sort of number that
      deserves its reasoning written beside it, so the rule widens rather than
      the declaration being squeezed onto one line.
    */
    const floor = /suite\([^)]*\{\s*floor:\s*(\d+)\s*,?\s*\}/.exec(source);
    assert.ok(floor, `${file} does not declare a check floor`);
    assert.ok(Number(floor![1]) > 0, `${file} declares a floor of zero, which asserts nothing`);
    assert.equal(
      /let failures = 0/.test(source),
      false,
      `${file} still counts failures on its own instead of using suite()`,
    );
  }

  /*
    And any other script that keeps its own tally, whatever it is called. The
    rule above matched `test-*` and `e2e` because those were all there were;
    `load-test.mjs` arrived as a CI gate with its own `let failures = 0`, and
    the name is the only reason it slipped through. What makes a script one of
    these is that it counts checks, so that is what this asks about.
  */
  for (const file of sourceFiles("scripts", /\.mjs$/)) {
    const source = read(file);
    if (!/\bcheck\(/.test(source)) continue;
    assert.equal(
      /let failures = 0/.test(source),
      false,
      `${file} counts failures on its own instead of using suite() from lib/checks.mjs`,
    );
  }
});

check("a check a state cannot reach is waived by number, never by a printed word", () => {
  /*
    A floor is only honest while the count is a property of the code rather
    than of the machine. `test-teaching.mjs` was measured with an Ekilex key
    behind it, so dictation built a real round and Anu had a text box; CI has
    neither, ran the same correct code, and came in four checks short, which
    the floor read as a block having stopped running.

    `absent(n, why)` is the answer: it lowers the target by exactly n and says
    what is missing. What it replaces is the shape this asserts against, a
    `console.log` with the word SKIP in it, which is what `test-modes.mjs` did
    for three checks. That prints the same word to a person and nothing at all
    to the tally, so the block reads as handled and the floor never notices.
  */
  for (const file of sourceFiles("scripts", /^test-.*\.mjs$|^e2e\.mjs$/)) {
    /*
      Comments out. A suite explaining in prose why it does not use `baseUrl()`
      satisfied a check looking for that call, which is this repository's oldest
      recurring mistake in its own checks and was committed here again while
      writing the exemption below.
    */
    const source = code(file);
    if (!/newPage|goto\(/.test(source)) continue;
    assert.equal(
      /console\.log\(\s*[`"'][^`"']*SKIP/.test(source),
      false,
      `${file} prints a skip instead of waiving it with absent()`,
    );
    // A waiver with no number, or with a zero, is a comment wearing a
    // function's clothes: it would leave the target where it was.
    for (const waiver of source.matchAll(/\babsent\(\s*([^,]+),/g)) {
      assert.match((waiver[1] ?? "").trim(), /^[1-9]\d*$/, `${file} waives a count that is not a positive number`);
    }
  }
});

check("a rating key works wherever a rating button is drawn", () => {
  /*
    A CONTROL'S VISIBILITY AND ITS SHORTCUT ARE ONE CONDITION.

    The fault this is about: a card nobody has seen used to lead with its
    answer and its rating buttons while `revealed` stayed false, because
    nothing had been revealed. The render worked that out in four places and
    spelled it out longhand in each; the keydown handler is where the fifth
    copy should have been and was not, so it read `!revealed` and returned
    before the rating branch. The buttons sat there, the mouse graded the card,
    and the number keys did nothing at all on the one shape a learner meets
    every time they start a new word.

    The screen has since been reshaped so that a first meeting teaches and
    carries on rather than being graded, and only a flip card asks the learner
    for a grade. That dissolves the old shape rather than fixing it, so what is
    asserted is the rule underneath rather than the name the old fix used.

    The strong form is that one table drives both. `SELF_GRADES` is what the
    buttons are drawn from and what the keydown handler looks a key up in, so
    the two cannot come to disagree about which keys exist or what they grade;
    a handler matching digits by hand is how they would.
  */
  const source = read("app/(app)/review/ReviewSession.tsx");

  assert.match(
    source, /SELF_GRADES\.map\(/,
    "the rating buttons are no longer drawn from SELF_GRADES, so the keys can disagree with them",
  );
  assert.match(
    source, /SELF_GRADES\.find\(/,
    "the keydown handler no longer looks its key up in SELF_GRADES, which is how the two drift apart",
  );

  /*
    And the guard in front of those keys is the condition the buttons render
    under: revealed, and a flip card. On a typed or picked card the app has
    already marked the answer, so a stray digit must not overrule it.
  */
  const beforeGrade = source.slice(0, source.indexOf("SELF_GRADES.find("));
  assert.match(
    beforeGrade.slice(-400),
    /if \(!revealed\) return;/,
    "the rating keys are not gated on the answer being revealed",
  );
  assert.match(
    beforeGrade.slice(-400),
    /if \(ask !== "flip"\) return;/,
    "the rating keys are not gated on the shape that actually draws them",
  );
});

check("a suite that writes to the shared dictionary invents the word it writes", () => {
  /*
    A BROWSER SUITE MAY NOT LEAVE A ROW THAT SHADOWS A SEEDED ENTRY.

    Ticking a word the dictionary did not vouch for is how `saveScan` makes a
    learner their own entry, and it is a path worth driving. But `Lexeme` is
    unique on `[lemma, pos]` rather than on the lemma alone, deliberately,
    because `hall` is a noun meaning frost and an adjective meaning grey. So a
    fixture that ticks a word the seed already holds does not collide with it,
    it sits *beside* it, with no paradigm behind it, in a dictionary every
    later suite shares.

    `test-containment.mjs` ticked `tuba`. `e2e.mjs` opens with three checks on
    `/dictionary?q=tuba`, and CI runs it two steps later on the same database.
    The cost was not one wrong check: the suite threw on its first wait and
    reported a Playwright timeout with none of its twenty-one checks run.

    `test-scan.mjs` and `test-suggestions.mjs` each worked this out for
    themselves and each carries an invented string. This is the rule they were
    both following, written down: the Estonian in a fixture that will be
    written to the dictionary has to be a word no dictionary has.
  */
  const lemmas = seededLemmas();
  assert.ok(lemmas.size > 100, "the built dictionary could not be read, so this check sees nothing");

  for (const file of sourceFiles("scripts", /\.mjs$/)) {
    const source = read(file);
    /*
      An item the dictionary did not vouch for, in a stubbed scan response.
      `lexemeId: null` is what makes it one, and the `et` beside it is what
      would be written. Matched in either order, because an object literal has
      no canonical one.
    */
    for (const item of source.matchAll(/\{[^{}]*lexemeId:\s*null[^{}]*\}/g)) {
      const et = /\bet:\s*"([^"]+)"/.exec(item[0])?.[1];
      if (!et) continue;
      assert.equal(
        lemmas.has(et.toLowerCase()),
        false,
        `${file} ticks "${et}", which the dictionary already holds, so it leaves a second entry beside it`,
      );
    }
  }
});

check("every type size in the tree is a step on the scale", () => {
  /*
    `test-design.mjs` measures what is rendered, and it can only measure the
    sixteen pages it visits. Forty-four literal sizes were sitting in states
    those pages do not reach, in modals, empty states and the review modes:
    twenty-three of them 13px, half a pixel off the 13.5px step, which is the
    exact fault the scale was introduced to end. The suite passed the whole
    time, honestly, on its route list.

    So this one reads the source instead. A route list cannot go stale against
    it and a state does not have to be reachable to be checked. The named step
    is what the design system defines (docs/14-design-system.md §3), so a
    literal that happens to land on a step is still worth turning into
    `text-sm`; what fails here is a size that is not a step at all.
  */
  // There is no exception any more. There was one, for a 92px step numeral set
  // large enough to read as a shape behind a card on the landing page, and the
  // rule it was granted under is unchanged (docs/14-design-system.md §3): an
  // aria-hidden ornament may be off the scale because it is not type. That
  // section of the page went when the landing page was shortened, so the
  // exception went with it rather than staying behind as a size somebody could
  // park a literal on. `data-ornament` in the markup is still what tells the
  // contrast pass in test-design.mjs the same thing, and the next ornament that
  // earns its place gets its exception back here, named and argued for.
  const STEPS = new Set([
    "11.5px", "12.5px", "13.5px", "15px", "17px", "19px",
    "22px", "27px", "32px", "40px", "52px", "68px",
  ]);

  const offScale: string[] = [];
  for (const file of [...sourceFiles("app", /\.tsx$/), ...sourceFiles("components", /\.tsx$/)]) {
    const source = read(file);
    for (const found of source.matchAll(/text-\[([0-9.]+px)\]/g)) {
      const size = found[1] ?? "";
      if (STEPS.has(size)) continue;
      offScale.push(`${file} ${size}`);
    }
  }
  assert.deepEqual(offScale, [], "type sizes that are not a step on the scale");
});

// ── The phone, and the faults that were measured on it ───────────────────────

check("the root declares no overflow", () => {
  // An overflow on the root makes it a scroll container, and every popper
  // anchored to the sticky rail or the fixed phone bar is then drawn one
  // scroll offset from where it belongs.
  assert.equal(
    /(?:^|\n)\s*html\s*\{[^}]*overflow(-x|-y)?\s*:/.test(CSS),
    false,
    "an overflow has gone back on html",
  );
  assert.match(CSS, /overflow-x:\s*clip/, "the body no longer clips sideways");
});

/*
  TEXT AND ICONS STAY INSIDE THE BOXES THEY WERE DRAWN INTO.

  The rules that make this true are four declarations in app/globals.css and
  `lib/layout/containment.test.ts` asserts each of them against the
  stylesheet. What is here is the part a stylesheet cannot promise on its own:
  that nothing in the markup opts back out, and that the one exemption is
  still paying for itself.

  `scripts/test-containment.mjs` is the third leg and the only one that can
  see a rectangle. It walks every text-bearing element, every lucide icon and
  everything that arrives with a width of its own, on every route the app has
  at 360, 768 and 1280, in the dark as well as the light, and asks whether any
  of them is cut off by an ancestor that clips, drawn outside a border
  somebody painted, drawn on top of something else, or resized away from the
  size it declared. Then it swaps every run of text for a run of letters OF
  THE SAME LENGTH with no space and no hyphen in it and asks all four again,
  which is the question Estonian actually poses: a row fits today because the
  gloss it happens to hold has commas in it, and the compound of the same
  width has to fit as well.

  768 is where it earns its keep. It is neither end, so it went unmeasured
  longest, and it is the width at which the rail appears and the content
  column is therefore narrowest: five faults were waiting there, one of them
  in the shell every page is drawn inside. With the four declarations removed
  it fails 395 of its 1010 checks, which is how anybody knows it is looking.
*/
check("nobody opts back out of the wrapping default", () => {
  /*
    `overflow-wrap: anywhere` is inherited from the body so that a screen has
    to opt out rather than remember to opt in, and the only ways back out are
    setting it to something else or asking for a word to be kept whole. Both
    are findable, and both are how a card starts overflowing again on one
    screen while every other screen stays right.

    `white-space: nowrap` is deliberately NOT on this list. A one-line label is
    a real thing to want and a short one cannot overflow anything; what is
    banned is undoing the rule for text that is allowed to be any length.
  */
  for (const file of [...APP, ...COMPONENTS, ...LIB]) {
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    const source = read(file);
    for (const found of source.matchAll(/overflowWrap:\s*"([a-z-]+)"/g)) {
      assert.equal(
        found[1],
        "anywhere",
        `${file} sets overflow-wrap to ${found[1]}, which takes the containment default off ` +
        "for everything under it. The exemption for a table of forms is on `table` in app/globals.css.",
      );
    }
    assert.equal(
      /wordBreak:\s*"keep-all"/.test(source) || /\bbreak-keep\b/.test(source),
      false,
      `${file} asks for a word to be kept whole, which is the same opt-out by another name`,
    );
  }
});

check("no icon is given a flex of its own", () => {
  /*
    `svg.lucide { flex: none }` is one declaration standing in for `shrink-0`
    on several hundred icons, and it is beaten by anything more specific. With
    it off, `lucide-eye-off` was measured at 0x15 in a deck row and
    `lucide-sun` at 28x16 in the rail: a flex item with no `flex` of its own
    both shrinks and grows, so an icon is deformed by a label being too long
    and by it being too short.

    `shrink-0` on an icon is not a violation. It says the same thing the rule
    says and costs nothing; what would break it is a `flex-1`, a `grow`, or a
    `flexShrink` written into a style prop.
  */
  const ICON = /<[A-Z][A-Za-z0-9]*\b[^>]*\bsize=\{[0-9]+\}[^>]*>/g;
  for (const file of [...APP, ...COMPONENTS]) {
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    for (const found of read(file).matchAll(ICON)) {
      const tag = found[0];
      assert.equal(
        /\b(?:flex-1|flex-auto|grow)\b/.test(tag) || /flexShrink|flexGrow|flex:/.test(tag),
        false,
        `${file} gives an icon a flex of its own: ${tag.slice(0, 80)}`,
      );
    }
  }
});

check("a table sits in a scroller, which is what buys it the exemption", () => {
  /*
    A table is the one thing allowed to keep its words whole, because a
    table of forms is read by comparing them down a column and a form broken across
    two lines has to be reassembled before it can be compared. That is only an
    honest trade while the table has something to give instead, and what it
    gives is a sideways scroll of its own rather than the page's.

    The worksheet's table was the one that did not, and it was not a near
    miss: a blank to write on is 110px because that is what a hand needs, so
    three of them and their padding came to 103px more than a 360px phone has.
  */
  for (const file of [...APP, ...COMPONENTS]) {
    const source = read(file);
    for (const found of source.matchAll(/<table\b/g)) {
      const before = source.slice(Math.max(0, found.index - 400), found.index);
      assert.match(
        before,
        /overflow-x-auto/,
        `${file} has a table with no scroller around it. A table keeps its words whole ` +
        "(app/globals.css), so a table too wide for a phone has to have a way out.",
      );
    }
  }
});

check("nothing fixed over content carries a backdrop filter", () => {
  /*
    That pairing re-filters its backdrop on every frame of every scroll.
    Measured on Upside Lab's landing page at 412x915 with the CPU throttled
    ten times: 42 repainted frames in one pass down, the worst of them with
    38% of the bottom eighth of the screen behind where the page was.
  */
  for (const file of [...COMPONENTS, ...APP]) {
    const source = read(file);
    if (!/backdropFilter/.test(source)) continue;
    assert.equal(
      /fixed[^"'\n]*"[\s\S]{0,400}backdropFilter/.test(source),
      false,
      `${file} pins a backdrop filter over content that moves`,
    );
  }
});

check("a notice pinned to the bottom clears a measured dock, not a typed guess", () => {
  assert.match(CSS, /:root\[data-dock\]\s*\.bottom-notice/, "the measured clearance rule is gone");
  for (const file of ["components/OfflineProvider.tsx", "components/InstallPrompt.tsx", "components/achievements/AchievementToasts.tsx"]) {
    const source = read(file);
    assert.match(source, /bottom-notice/, `${file} no longer uses the shared rule`);
    assert.equal(
      /className="[^"]*\bbottom-\d/.test(source),
      false,
      `${file} has gone back to typing its own offset`,
    );
  }
});

check("the gesture that replaced the browser's pull to refresh is still mounted", () => {
  // `overscroll-behavior-y: none` is the same switch for the rubber band and
  // for the browser's own pull to refresh, and installed to a home screen
  // there is no address bar to offer a reload instead.
  assert.match(CSS, /overscroll-behavior-y:\s*none/, "the bounce is back");
  assert.match(read("app/(app)/layout.tsx"), /<PullToRefresh \/>/, "the gesture is not mounted");
});


// ── The placement check (ADR-018, ADR-005) ───────────────────────────────────

check("no model decides anybody's level", () => {
  /*
    The same rule the writing exercise follows, in the place it would hurt
    most. Every question is marked against a stored index, a recorded
    sentence, or a form the dictionary vouches for, and the level comes out of
    `placement()`. A learner meeting this app for the first time has no way to
    know when the machine is the one that is confused, so the machine is never
    allowed to be the judge.
  */
  const modules = LIB.filter((f) => f.startsWith("lib/assessment/"));
  assert.ok(modules.length >= 5, `expected the assessment modules, found ${modules.length}`);
  for (const file of modules) {
    const source = read(file);
    assert.equal(
      /from ["']@\/lib\/(tutor|usage)\//.test(source),
      false,
      `${file} reaches for a model provider`,
    );
  }
  // The routes that run a check may not either.
  for (const file of APP.filter((f) => f.includes("/assess/"))) {
    assert.equal(/resolveProvider|openWithFallback/.test(read(file)), false, `${file} calls a model`);
  }
});

check("a question never fills itself with free eliminations", () => {
  /*
    ADR-020 amendment 1, and the same fault in the mock exam. The wrong answers
    used to be the first three a shuffle handed back: the placement check drew
    them from the whole dictionary, so "black" was asked against a plastic bag
    and two C1 nouns, and the exam drew them from a deck spanning four levels
    and could offer a word's own synonym. Both questions could be answered
    without reading the Estonian, and a level or a mark built on those measured
    nothing.

    `lib/questions/distractors.ts` is the one table of what makes a wrong
    answer hard to cross out, and what is asserted is that every builder still
    reads it and that none of them goes back to assembling its own options,
    since that is the shape the fault had and the shape a new question kind
    would arrive in.
  */
  const builders = ["lib/assessment/items.ts", "lib/exam/paper.ts", "lib/estonian/government.ts"];
  for (const file of builders) {
    assert.match(
      read(file),
      /from "@\/lib\/questions\/distractors"/,
      `${file} decides what a wrong answer is worth on its own`,
    );
  }

  for (const file of ["lib/assessment/items.ts", "lib/exam/paper.ts"]) {
    const source = read(file);
    // A field assigned in an item, rather than declared in an interface: the
    // declaration ends in a semicolon and the assignment in a comma.
    const optionLines = source.split("\n").filter((line) => /^\s*options:.*,\s*$/.test(line));
    assert.ok(optionLines.length >= 5, `${file}: expected the choice questions, found ${optionLines.length}`);
    for (const line of optionLines) {
      assert.match(line, /set\.options/, `${file} builds its own options: ${line.trim()}`);
    }

    const picks = source.match(/pickOptions\(\{/g) ?? [];
    assert.equal(picks.length, optionLines.length, `${file} asks a question without picking its options`);
    assert.equal(
      picks.length,
      (source.match(/nearness:/g) ?? []).length,
      `${file} picks wrong answers without ranking them`,
    );
  }

  // And the ranking may not become a filter. A question the dictionary can
  // fill has to stay askable, which is what keeps a thin section honest.
  const distractors = read("lib/questions/distractors.ts");
  assert.match(distractors, /wrong\.length < WRONG/, "the picker stopped refusing what it cannot fill");
});

check("a placement question is answered in Estonian, not about it", () => {
  /*
    Nobody sitting a real Estonian placement test is asked to name a case.
    The state examination's published reading tasks are `valikvastustega
    ülesanne`, `valikvastustega lünkülesanne` and `sobitamine`; the placement
    tests Estonian language schools set are almost entirely the middle one, a
    sentence with a hole in it and three or four forms of one word to choose
    between. Grammatical terminology is what a teacher uses to *talk* about the
    answer, afterwards.

    This module used to lead with it, and half of every reading section was
    metalanguage. It cost more than tone. "Which case does the verb kõlbama
    demand of its object?" was asked of 45 entries that are nouns and
    adjectives rather than verbs, and of verbs that take no object at all; and
    18 of those questions offered a second genuinely correct case as a wrong
    answer, because a word's government string names every case it governs and
    the distractors were drawn from all of them. `segama` governs the partitive
    and the comitative, and a learner who knew the comitative was marked wrong
    for it.

    So: a case name may appear in the explanation after an answer, where it is
    a cross-reference for somebody who is also taking a course, and it may not
    appear in a question. Anchored on the question strings the builders write,
    because that is the thing a learner has to answer.
  */
  const source = read("lib/assessment/items.ts");
  const questions = [...source.matchAll(/^\s*question:\s*(.+?),?$/gm)].map((m) => m[1] ?? "");
  assert.ok(questions.length >= 5, `expected the item questions, found ${questions.length}`);

  const NAMES = [...CASES.map((c) => c.et), ...CASES.map((c) => c.en.toLowerCase())];
  for (const question of questions) {
    const lower = question.toLowerCase();
    for (const name of NAMES) {
      assert.equal(
        lower.includes(name),
        false,
        `a placement question names the ${name}: ${question}`,
      );
    }
    // `caseOptionLabel` builds "seesütlev · milles? kus?", so a question
    // interpolating it names a case without spelling one out.
    assert.equal(
      /caseOptionLabel|spec\.(et|en|question)/.test(question),
      false,
      `a placement question is built out of a case name: ${question}`,
    );
  }

  // And the options a learner picks between are never a list of case names.
  assert.equal(
    /const caseNames\b|CASES\.map\(caseOptionLabel\)/.test(source),
    false,
    "the placement check offers case names as multiple choice again",
  );
});

check("a listening question never offers the meaning of another word it played", () => {
  /*
    The placement plays a whole sentence and asks for the meaning of "a word
    you heard in it", without saying which. So the meaning of *any* word in the
    recording is a right answer, and a distractor that is one marks a learner
    wrong for listening correctly. It shipped: `Moraali ja eetika kategooriad.`
    was asked about `eetika` with "morality" among the wrong ones. Measured
    over ten pools, 22 of 4,320 such questions carried one.

    Three things hold it. The builder reads every meaning in the sentence out
    of the pool *and* out of an index it is handed, and treats them as senses
    no wrong answer may share (`lib/assessment/heard.ts`). `paperFor` hands it
    the whole dictionary's index from the facts cache, because the word that
    makes a distractor true is usually outside the two-hundred-word window the
    question was drawn from. And the audit asks the same thing of every paper
    it builds, since a `heard` item was excluded from the "is the answer shown"
    question and would otherwise be checked by nothing at all.

    Anchored on the calls, comments stripped, because this paragraph names
    every one of them.
  */
  const items = code("lib/assessment/items.ts");
  const sentenceQuestion = between(items, "export function listeningItems");
  assert.match(
    sentenceQuestion,
    /distinct:\s*meaningTest\(word,\s*pool,\s*meaningsHeard\(sentence\.et,\s*inPool,\s*heard\)\)/,
    "the sentence question no longer rules out the meanings of the other words it played",
  );
  assert.match(sentenceQuestion, /const inPool = heardIndex\(pool\)/, "the pool's own meanings are no longer indexed");
  assert.match(
    between(items, "export function buildPaper"),
    /listeningItems\(words,\s*rng,\s*heard\)/,
    "buildPaper no longer hands the listening section the dictionary's meanings",
  );

  const progress = code("lib/progress/assessment.ts");
  assert.match(progress, /heardMeanings\(\)/, "paperFor no longer reads the dictionary's meanings");
  assert.match(progress, /buildPaper\(words,\s*seed,\s*heard\)/, "paperFor builds the paper without them");

  const facts = between(code("lib/dict/facts.ts"), "export function heardMeanings");
  assert.match(facts, /remember\(/, "the dictionary's meanings are rebuilt per sitting rather than cached");
  assert.match(facts, /heardIndex\(/, "facts.ts builds a second index rather than the builder's own");

  const audit = code("scripts/audit-questions.ts");
  assert.match(audit, /buildPlacement\(poolFor\(seed\),\s*seed,\s*heard\)/, "the audit builds papers without the dictionary's meanings");
  assert.match(audit, /meaningsHeard\(/, "the audit no longer asks whether a wrong answer was also heard");
});

check("a government question never offers a case the word itself governs", () => {
  /*
    The same fault as the placement check's, in the two drills that keep asking
    the question rather than replacing it: the mock exam's `rektsioon` task and
    `/review/government`. An Ekilex entry records a word's whole government,
    not one case, and `parseGovernment` returns the primary. `buildOptions`
    used to filter only that one out of the distractor pool, so any of the
    others could stand as a wrong answer.

    Measured over the shipped dictionary, 60 of the 268 governed verbs name
    more than one case: `aitama` is "keda/mida* (partitive) · millest
    (elative)" and takes both, so a learner who knew `see ei aita millestki`
    chose the elative and was marked wrong. `alustama` governs three and could
    be shown two of them as distractors at once. Government is the one thing
    an English speaker has no way to reason out, so a drill that marks them
    wrong for being right is the drill teaching them to ignore it.

    Asserted against the real dictionary rather than a fixture, because the
    fault was in the data's shape rather than in any one entry, and drawn many
    times because the options are shuffled: a single draw passes by luck.
  */
  const entries = JSON.parse(read("prisma/data/expanded.json")) as
    { lemma: string; pos: string; government: string | null }[];

  const verbs = entries
    .filter((e) => e.pos === "VERB" && e.government)
    .map((e) => ({ lemma: e.lemma, government: parseGovernment(e.government) }))
    .filter((e): e is { lemma: string; government: Government } => e.government !== null);
  assert.ok(verbs.length > 100, `expected the governed verbs, found ${verbs.length}`);

  const multi = verbs.filter((v) => v.government.alsoGoverned.length > 0);
  assert.ok(
    multi.length > 20,
    `expected verbs governing more than one case, found ${multi.length}: either the dictionary ` +
    "changed shape or the parser stopped reading past the first case name",
  );

  const pool = verbs.map((v) => v.government.caseKey);
  for (const verb of multi) {
    const alsoTrue = new Set<string>(verb.government.alsoGoverned);
    for (let draw = 0; draw < 40; draw++) {
      const options = buildOptions(verb.government, pool, 4, Math.random);
      if (!options) continue; // dropped rather than padded, which is allowed
      const wrong = options.find((o) => alsoTrue.has(o));
      assert.equal(
        wrong,
        undefined,
        `${verb.lemma} governs the ${wrong} as well as the ${verb.government.caseKey}, and it ` +
        "was offered as a wrong answer",
      );
      assert.ok(options.includes(verb.government.caseKey), `${verb.lemma} lost its own answer`);
      assert.equal(new Set(options).size, options.length, `${verb.lemma} was offered a repeat`);
    }
  }
});

/**
 * The other half of the same question: it says "the verb", so it asks a verb.
 *
 * The dictionary records a government for 36 nouns and 12 adjectives too, and
 * they are real: `osa` takes the partitive and the elative. But the task is
 * titled "Which case does the verb take?", and asking that about a noun is a
 * question worded as a fact the entry does not support. The review drill has
 * filtered on part of speech since it was written; the exam builder never did.
 */
check("a question that says \"the verb\" is asked about a verb", () => {
  for (const file of ["lib/exam/paper.ts", "app/(app)/review/government/page.tsx"]) {
    const source = code(file);
    const builder = /buildGovernment[\s\S]*?\n}/.exec(source)?.[0] ?? source;
    assert.match(
      builder,
      /pos === "VERB"|pos: "VERB"/,
      `${file} builds a verb-government question without filtering to verbs`,
    );
  }
});

check("a recording never moves a level", () => {
  /*
    ADR-018: there is no verified Estonian speech recogniser available here, so
    the speaking section is the learner's own judgement and is reported as
    theirs. A number invented on top of a recogniser that does not handle
    Estonian would be believed, which is what makes it worse than silence.
  */
  const score = read("lib/assessment/score.ts");
  const scored = /SCORED_SKILLS[^=]*=\s*\[([^\]]*)\]/.exec(score)?.[1] ?? "";
  assert.ok(scored.includes("reading"), "the scored skills list moved or was renamed");
  assert.equal(scored.includes("speaking"), false, "speaking counts towards the level");

  // And nothing in the runner may score a recording either.
  const question = read("components/assessment/Question.tsx");
  assert.match(question, /selfRating/, "the speaking answer stopped being self reported");
  assert.equal(
    /credit:\s*[^0\s]/.test(question.slice(question.indexOf("export function SpeakQuestion"))),
    false,
    "a speaking answer carries credit",
  );
});

check("a placement check never grades a card", () => {
  /*
    Its questions are drawn from words the learner does *not* have in their
    deck, on purpose: a test made of cards somebody has been drilling measures
    the deck, not the Estonian. Grading them would write scheduling history
    against cards that do not exist, and would let a level check inflate the
    streak it is supposed to be independent of.
  */
  for (const file of [...COMPONENTS.filter((f) => f.includes("/assessment/")), ...APP.filter((f) => f.includes("/assess/"))]) {
    assert.equal(/gradeCards?\(/.test(read(file)), false, `${file} grades a card from the level check`);
  }
});

check("a sat check is never edited, and is deleted only on request", () => {
  /*
    Append-only for the same reason Review is: it is a measurement made at a
    moment, it cannot be recomputed from anything, and a history that can be
    rewritten is not a history. A later check is another row.

    Deletion has exactly one path, the same one Review has: somebody erasing
    their own account, which the privacy page promises and which outranks the
    append-only rule. Tests set up and tear down their own rows and are not a
    path anything reaches in production.
  */
  const product = [...ALL, "prisma/seed.ts"].filter((f) => !/\.(test|itest)\.tsx?$/.test(f));
  for (const file of product) {
    const hit = /(prisma|tx)\.assessment\.(update|updateMany|upsert)/.exec(read(file));
    assert.equal(hit, null, `${file} rewrites a stored assessment`);
  }
  const deleters = product.filter((f) => /(prisma|tx)\.assessment\.delete/.test(read(f)));
  assert.deepEqual(deleters, ["app/actions.ts"], "a level check is deleted outside account deletion");
  assert.match(
    read("app/actions.ts"),
    /deleteMyAccount[\s\S]*?tx\.assessment\.deleteMany/,
    "account deletion no longer removes the level checks it promises to",
  );
});

check("the goal a learner states is stored through the settings store", () => {
  /*
    Settings go through lib/settings/store.ts, keys included. Five string
    literals scattered through a wizard is one typo away from a goal that
    silently reverts to nothing for ever.
  */
  const store = read("lib/settings/store.ts");
  for (const key of ["goalReason", "goalTarget", "goalDeadline", "goalDays", "goalNote"]) {
    assert.match(store, new RegExp(`${key}:`), `${key} is not declared in the settings store`);
  }
  for (const file of ALL) {
    if (file === "lib/settings/store.ts") continue;
    const hit = /["'](goalReason|goalTarget|goalDeadline|goalDays|goalNote)["']/.exec(read(file));
    assert.equal(hit, null, `${file} writes the ${hit?.[1]} key as a literal`);
  }
});

/*
  The built dictionary's glosses.

  These are the answer side of a flashcard, so a wrong one is drilled rather
  than merely displayed. Both checks assert the shape of a fault rather than a
  word list: naming today's twenty-five corrections would pass for ever and
  defend nothing.
*/
check("no built gloss carries the marks of markup that was removed badly", () => {
  const entries = JSON.parse(read("prisma/data/expanded.json")) as
    { lemma: string; translation: string }[];
  /*
    A template deleted out of the middle of a line takes its slot's contents
    and leaves the separators around it. `sort` shipped as "kind, , brand",
    `esimees` as "chairman, chairperson, , president", `segama` as
    "to , to , to". A hole reads as a typo rather than as missing data, which
    is exactly why none of them was noticed: every check watching this file
    was happy with a plausible English string.
  */
  const damaged = [
    { shape: /[,;]\s*[,;]/, why: "an empty slot in a list" },
    { shape: /\s+[,;.]/, why: "a space before punctuation" },
    { shape: /\(\s*\)/, why: "parentheses left empty" },
    { shape: /[{}]|\[\[|\]\]/, why: "wiki markup" },
  ];
  for (const entry of entries) {
    for (const { shape, why } of damaged) {
      assert.ok(
        !shape.test(entry.translation),
        `"${entry.lemma}" is glossed ${JSON.stringify(entry.translation)}, which has ${why}`,
      );
    }
    /*
      A gloss with nothing in it but punctuation. `päiline` and `suiline` both
      reached the dictionary as the single character ".", and a card cannot be
      answered with a full stop.
    */
    assert.ok(
      entry.translation.replace(/[^\p{L}\p{N}]/gu, "").length >= 2,
      `"${entry.lemma}" is glossed ${JSON.stringify(entry.translation)}, which is not a word`,
    );
  }
});

check("the gloss parser unwraps an English link and never an Estonian one", () => {
  /*
    ADR-005, at the one place an English gloss touches Estonian source text.
    `{{l|en|lamp}}` renders as the word "lamp" and has to survive; `{{m|et|
    kohta}}` is an Estonian word quoted inside an English note and may not.
    Deleting both was how `lamp` came to be drilled as "random". Asserted
    against the parser rather than the data, because the data is a snapshot
    and the rule is not.
  */
  const senses = extractEstonianSenses(
    "==Estonian==\n\n===Noun===\n\n# {{l|en|lamp}}\n# to [[depend]] on {{m|et|kõrb}}\n",
  );
  assert.equal(senses[0], "lamp", "an English link template is no longer unwrapped");
  /*
    Both halves matter and the second one is easy to assert too weakly. An
    earlier version of this check quoted `{{m|et|kohta}}` inside a trailing
    parenthetical and looked for Estonian letters: the parenthetical is
    stripped anyway and "kohta" has no diacritic in it, so removing the
    language guard left the check passing. The mention sits mid-line now and
    the whole sense is compared.
  */
  assert.equal(senses[1], "to depend on", "an Estonian mention reached an English gloss");
});

check("a part of speech is read off the sense the gloss came from", () => {
  /*
    The gloss and the label are two facts about one definition line, and they
    used to come from different places: the gloss from the first sense on the
    page, the label from whichever of Wiktionary's four categories the
    candidate happened to be drawn from first. Nouns were drawn first, so
    `kallis`, `valge`, `sinine`, `noor` and 57 others shipped as NOUN, and
    reversing the order would only have moved the fault onto `lamp` and `pea`,
    which are in the adjective and adverb categories for senses they do not
    ship.

    Nothing looked wrong either way: every answer is a real part of speech
    spelled correctly, and an Estonian adjective declines exactly like a noun.
    Asserted against the parser, because the data is a snapshot and the rule is
    not.
  */
  const page =
    "==Estonian==\n\n===Noun===\n{{et-noun}}\n\n# [[head]]\n\n" +
    "===Adverb===\n{{et-adv}}\n\n# [[almost]]\n";
  const senses = extractEstonianEntries(page);
  assert.equal(senses[0]?.pos, "NOUN", "a sense no longer carries its own heading");
  assert.equal(senses[1]?.pos, "ADVERB", "a heading no longer applies to the senses under it");

  // The four words where the heading and the headword template disagree, and
  // the reason only one of them may overturn the other: `{{et-adj}}` carries a
  // superlative and is a claim, `{{et-noun}}` is the declension an adjective
  // shares and is a shrug.
  const base = { ekilexSaysVerb: false, fallback: "NOUN" };
  assert.equal(
    resolvePos({ ...base, sensePos: "NOUN", headwordPos: "ADJECTIVE" }), "ADJECTIVE",
    "an adjective headword no longer overturns a noun heading (võimas)",
  );
  assert.equal(
    resolvePos({ ...base, sensePos: "ADJECTIVE", headwordPos: "NOUN" }), "ADJECTIVE",
    "a noun headword now overturns an adjective heading (üksik, lämbe, lämmi)",
  );
  // And Ekilex still draws the one line it actually draws, because that line
  // decides which principal parts the entry has.
  assert.equal(
    resolvePos({ ...base, sensePos: "NOUN", headwordPos: "VERB", ekilexSaysVerb: true }), "VERB",
    "Ekilex no longer settles the verb question",
  );
  assert.equal(
    resolvePos({ ...base, sensePos: "VERB", headwordPos: "VERB" }), "NOUN",
    "a nominal can now be labelled a verb on the page's word alone",
  );
});

check("every corrected label agrees with the dictionary it was corrected in", () => {
  /*
    `pos` is half of `Lexeme`'s conflict key, so `prisma/data/pos-corrections.json`
    is not a changelog: the seed replays it to move an already-seeded row onto
    the label this build carries. If the two ever disagree, the replay moves a
    row onto a label the dictionary no longer uses and the insert then adds the
    right one beside it, which is the duplicate entry the ledger exists to
    prevent.
  */
  const corrections = JSON.parse(read("prisma/data/pos-corrections.json")) as
    { lemma: string; from: string; to: string }[];
  const entries = JSON.parse(read("prisma/data/expanded.json")) as { lemma: string; pos: string }[];
  const byLemma = new Map(entries.map((e) => [e.lemma, e.pos]));

  for (const c of corrections) {
    assert.notEqual(c.from, c.to, `${c.lemma} is recorded as moving to the label it already had`);
    const shipped = byLemma.get(c.lemma);
    // A word dropped from the dictionary since is fine; a word still in it
    // wearing neither label is not.
    if (shipped !== undefined) {
      assert.equal(shipped, c.to, `${c.lemma} ships as ${shipped} but is recorded as moving to ${c.to}`);
    }
  }

  // One hop per word, or the replay's order would decide the outcome.
  const froms = new Map<string, string>();
  for (const c of corrections) {
    const seen = froms.get(c.lemma);
    assert.equal(seen, undefined, `${c.lemma} is recorded as moving twice (${seen} and ${c.to})`);
    froms.set(c.lemma, c.to);
  }

  // And the built file may never hold one key twice, which is what the seed
  // would fail on rather than silently deduplicate.
  const keys = new Set<string>();
  for (const e of entries) {
    const key = `${e.lemma} ${e.pos}`;
    assert.ok(!keys.has(key), `${key} appears twice in the built dictionary`);
    keys.add(key);
  }
});


// ── What a person has to be told, and who is answerable (GDPR, IKS) ──────────

check("the policy pages name whoever is answerable, and never invent them", () => {
  /*
    Kodukeel is software somebody installs rather than a service with one
    address, so the controller is the person or school running the copy. That
    is a real answer and it used to be the whole answer, which left the pages
    saying "ask whoever runs this" with no way to find out who that is.
    Article 13(1)(a) wants a name and a contact at the point of collection, and
    the Information Society Services Act wants the same of a provider.

    So the identity is configuration, and both pages render it. What this
    guards is the second half: an unset deployment must say it is unset. A
    placeholder would read as an answered question and would be worse than the
    sentence it replaced.
  */
  for (const file of ["app/privacy/page.tsx", "app/terms/page.tsx"]) {
    const source = read(file);
    assert.match(source, /resolveOperator/, `${file} does not name the operator`);
    assert.match(source, /operator\.identified/, `${file} does not branch on whether it is set`);
    assert.match(
      source,
      /has not filled their name in/,
      `${file} does not say out loud when the operator is unnamed`,
    );
    // Read per request: a notice baked in at build time describes the build
    // machine's environment, which is nobody's.
    assert.match(source, /dynamic = "force-dynamic"/, `${file} is rendered at build time`);
  }
});

check("the privacy notice carries what Article 13 requires", () => {
  /*
    Not a copy check and not a word count: each of these is a distinct thing a
    reader is entitled to be told, and each was missing. A page that describes
    what is stored and stops is the shape this one had.
  */
  const privacy = read("app/privacy/page.tsx");
  const required: [RegExp, string][] = [
    [/SUPERVISORY_AUTHORITY/, "who to complain to (13(2)(d))"],
    [/transfersOutsideEea|leavesTheUnion/, "whether anything leaves the EEA (13(1)(f))"],
    [/resolveRecipients/, "who else sees it (13(1)(e))"],
    [/How long it is kept/, "how long it is kept (13(2)(a))"],
    [/What you can demand/, "the rights (13(2)(b))"],
    [/decides anything about you/, "that nothing here decides anything (13(2)(f))"],
    [/age of\s*\n?\s*13|from the age\s*\n?\s*of 13/, "the age of consent Estonia sets"],
  ];
  for (const [pattern, what] of required) {
    assert.match(privacy, pattern, `the privacy page no longer states ${what}`);
  }
});

check("a deletion that leaves something behind says so", () => {
  /*
    `deleteMyAccount` empties every table this app owns. The identity is not in
    any of them: the email address and the sign-in history live in Supabase
    Auth, and deleting the rows left all of it with no route to remove it and
    nothing on screen admitting it. Erasure is erasure wherever the data sits.

    Two halves, and the second is the one that rots. Where the key that can
    erase an identity is not configured, the learner has to be told what is
    left rather than shown a success. A button that reports a deletion it did
    not entirely do is worse than one that refuses.
  */
  const actions = read("app/actions.ts");
  assert.match(
    actions,
    /deleteMyAccount[\s\S]*?eraseAuthIdentity/,
    "account deletion no longer erases the sign-in identity",
  );
  assert.match(
    actions,
    /deleteMyAccount[\s\S]*?remainingIdentityNote/,
    "account deletion no longer reports what it could not reach",
  );
  const danger = read("app/(app)/settings/DangerZone.tsx");
  assert.match(danger, /result\.remaining/, "the screen ignores what the deletion left behind");
});

/**
 * A PANEL NOBODY RENDERS IS A FEATURE NOBODY HAS.
 *
 * `DangerZone.tsx` and `UsagePanel.tsx` were complete, commented, correct, and
 * imported by nothing. Not dropped by a merge: `git log -S` finds no commit on
 * any branch where the settings page ever named either. So for the whole life
 * of this app there was no way to delete an account from inside it, while
 * `/privacy` promised somebody could take everything away, and the tutor's own
 * spending meter, which several rules above describe as the place a learner
 * reads what they have used, was on no screen.
 *
 * The check above is how that survived. It reads `DangerZone.tsx` and asserts
 * the copy inside it, so it passed with feeling on a component the router
 * could not reach: this repository's oldest recurring mistake is a check that
 * reads a file rather than the screen, and this is that mistake pointed at a
 * whole component instead of a comment. A file being right is not the same
 * claim as a reader being able to get to it.
 *
 * So the pairing is asserted rather than either half. Every module beside
 * `page.tsx` in that folder has to put something on the page, tested on a name
 * the module actually exports being used as an element, because an import
 * nobody renders is the same silence one import earlier. It carries a floor
 * for the reason every sweep here does: a folder that stops matching would
 * otherwise assert nothing and say so in the same words as a folder that is
 * entirely fine.
 */
check("every settings panel is on the settings screen", () => {
  const dir = join("app", "(app)", "settings");
  const panels = readdirSync(dir).filter((f) => f.endsWith(".tsx") && f !== "page.tsx");
  assert.ok(
    panels.length >= 10,
    `only found ${panels.length} settings panels, so this check stopped looking`,
  );

  const page = code(join(dir, "page.tsx"));
  for (const file of panels) {
    const exported = [...code(join(dir, file))
      .matchAll(/export\s+(?:async\s+)?(?:function|const)\s+([A-Z]\w*)/g)]
      .map((m) => m[1]!);
    assert.ok(exported.length > 0, `${file} exports no component for the page to render`);

    /*
      The element, not the import. An unused import is what a lint rule
      catches; a rendered-nowhere component is what nothing did.
    */
    assert.ok(
      exported.some((name) => new RegExp(`<${name}[\\s/>]`).test(page)),
      `app/(app)/settings/${file} exports ${exported.join(", ")} and the settings page renders ` +
      `none of them, so whatever it does is unreachable. Render it, or delete the file.`,
    );
  }
});

/** Every model in the schema carrying an `ownerId`: one person's own data. */
function ownerScopedModels(): string[] {
  const owned = [...SCHEMA.matchAll(/model (\w+) \{([^}]*)\}/g)]
    .filter(([, , body]) => /^\s*ownerId\s/m.test(body ?? ""))
    .map(([, name]) => name!);
  assert.ok(owned.length >= 12, `expected the owner-scoped models, found ${owned.length}`);
  return owned;
}

const accessorFor = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

check("the actions that do real work per call are throttled", () => {
  /*
    Every mutation a learner makes here is a Server Action, which is a POST to
    a page path. The five Route Handlers had a limiter and none of the
    forty-odd actions did, so the gate was on the quiet door: the same
    misreading that would have put the forged-request check inside an `isApi`
    branch.

    Not every action needs one, and most must not have one — grading a card is
    a single indexed write and a limit there would be met by learners and by
    nobody else. What is listed in `ACTION_LIMITS` is the per-call expensive
    work, and each entry has to be applied to an action that exists, which is
    the half a typed list gets wrong.

    Asserted through the table rather than by naming actions here, so adding a
    limit means adding it in one place and using it, and adding a name nobody
    uses fails.
  */
  const source = code("app/actions.ts");
  const keys = Object.keys(ACTION_LIMITS);
  assert.ok(keys.length >= 6, `expected the throttled actions, found ${keys.length}`);

  /*
    THE NAMES A THROTTLE MAY BE CHARGED TO, READ OFF THE FILE.

    This used to require the literal `ownerId`, which was right while every
    throttled action was a learner acting on their own data. The review queue
    is the first one that is not: `reviewSuggestion` resolves an *admin*
    through `requireAdminId`, and calling that binding `ownerId` to satisfy a
    regex would be naming a variable after the check that reads it.

    So what is asserted is the property the literal was standing in for: the
    id was resolved here, by a `require...()` helper, and did not arrive as an
    argument. Every export of a "use server" file is a public endpoint, so an
    action taking the id to charge from its caller would let anybody spend
    somebody else's allowance, or spend none at all by passing a fresh string
    every time.
  */
  const resolvedIds = new Set(
    [...source.matchAll(/const (\w+) = await require(\w*)\(/g)].map(([, name]) => name!),
  );
  assert.ok(
    resolvedIds.size >= 1,
    "no action resolves its own identity, which would make the check below vacuous",
  );

  for (const key of keys) {
    const applied = new RegExp(`throttleAction\\((\\w+), "${key}"\\)`).exec(source);
    assert.ok(applied, `${key} has an allowance in the table and no action applying it`);
    assert.ok(
      resolvedIds.has(applied[1]!),
      `${key} is charged to ${applied[1]}, which this file never resolved for itself`,
    );
  }

  for (const [, charged] of source.matchAll(/throttleAction\(([^,)]*),/g)) {
    assert.ok(
      resolvedIds.has(charged!.trim()),
      `an action throttles against ${charged!.trim()}, which is not an identity it resolved`,
    );
  }
});

check("every dead end in the app offers a way to report it", () => {
  /*
    THE RULE: nothing here may tell somebody it cannot help them and then
    stop. A search that found nothing, an answer marked wrong that was right, a
    screen that threw, a link that went nowhere — each of those used to end in
    a sentence and a back button, and the person who knew what was actually
    wrong was the one person with nowhere to put it.

    Asserted on the four screens where the dead end is structural rather than
    incidental, and asserted in both halves: the failure copy has to still be
    there, and the way out has to be beside it. Half of that on its own is
    what decays. A file that stops rendering the failure is a screen that was
    rewritten and should be looked at again; a file that keeps the failure and
    loses the button is the regression this check exists for.
  */
  const deadEnds: [string, RegExp, string][] = [
    [
      "app/(app)/dictionary/DictionaryClient.tsx",
      /Nothing found for/,
      "a search that found nothing",
    ],
    [
      "app/error.tsx",
      /didn&rsquo;t load|did not load/,
      "a screen that threw",
    ],
    [
      "app/not-found.tsx",
      /There&rsquo;s no page here|no page here/,
      "a link that led nowhere",
    ],
    [
      "app/(app)/review/ReviewSession.tsx",
      /verdict\.verdict !== "correct"/,
      "an answer the app marked wrong",
    ],
  ];

  for (const [file, failure, what] of deadEnds) {
    const source = read(file);
    assert.match(source, failure, `${file} no longer renders ${what}, so this check is watching nothing`);
    assert.match(
      source,
      /<SuggestFix/,
      `${file} shows ${what} and offers no way to tell anybody about it`,
    );
  }
});

check("a category nobody can send is not a tab in the review queue", () => {
  /*
    The same shape as the throttle table above, for the same reason. The
    categories are what the queue filters, counts and reasons by, so one that
    no screen can produce is a permanently empty tab and a branch in the apply
    path that is never exercised. Reading the table rather than a list typed
    here means adding a category is adding it in one place and using it.
  */
  /*
    Read out of the mounted components rather than out of the files. A key
    also appears in the queue's own fallback and in a filter, and matching
    those would let a category pass this check while being unreachable from
    any dead end, which is the exact failure it is here to catch.
  */
  const mounted = [...APP, ...COMPONENTS]
    .flatMap((file) => [...read(file).matchAll(/<SuggestFix[\s\S]*?\/>/g)].map(([usage]) => usage))
    .join("\n");
  assert.ok(mounted.length > 0, "nothing in the app mounts the report button at all");

  for (const key of CATEGORY_KEYS) {
    assert.ok(
      mounted.includes(`"${key}"`),
      `${key} is a category in the review queue that no screen can send`,
    );
  }
});

check("pushing a change through the queue is gated on more than being signed in", () => {
  /*
    `reviewSuggestion` writes to the shared dictionary on one person's say-so,
    and every export of a "use server" file is a public endpoint. So it
    resolves a reviewer rather than a user, and it resolves them rather than
    taking an id: an action that trusted an argument here would let anybody
    accept their own suggestion.

    `lib/auth/admin.ts` is the whole answer to who that is, and it may never
    learn it from the request. A deployment with sign-in configured and nobody
    named has no admins, which is why the empty list is checked too: falling
    back to "anybody signed in" on an open sign-up would be the same hole with
    a friendlier shape.
  */
  const review = between(read("app/actions.ts"), "export async function reviewSuggestion");
  assert.match(review, /requireAdminId\(\)/, "the review action does not establish who is reviewing");
  assert.doesNotMatch(
    review,
    /requireUserId\(\)/,
    "the review action settles for a signed-in user where it needs a reviewer",
  );

  const admin = read("lib/auth/admin.ts");
  assert.match(
    admin,
    /admins\.length === 0\) return false/,
    "a deployment that has named no reviewer no longer refuses everybody",
  );
});

check("nothing a model wrote can reach the dictionary through the queue", () => {
  /*
    ADR-005 stated over the newest write path into the dictionary. Every
    Estonian character an accepted suggestion writes was typed by a person, in
    a form, exactly like a hand edit — and the way that stays true is that no
    module in this feature can reach a provider at all.

    The apply path also writes forms, so it carries the same restriction the
    hand-edit path does: a principal part may be replaced and a retrieved
    Ekilex form may not. That is stated here as well as in the module,
    because it is one `if` between a correction and a learner's forms being
    overwritten by whoever shouted loudest.
  */
  for (const file of sourceFiles("lib/suggestions")) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /lib\/tutor|openWithFallback|ANTHROPIC|OPENAI|OPENROUTER/,
      `${file} can reach a model, and this path writes Estonian into the shared dictionary`,
    );
  }
  const apply = read("lib/suggestions/apply.ts");
  assert.match(
    apply,
    /isPrincipalFormType\(/,
    "an accepted correction can now overwrite a retrieved Ekilex form",
  );
});

check("audio a page has fetched is released, not merely remembered", () => {
  /*
    An object URL is a file the browser holds until it is told not to.
    `Speak` and `PairsSession` each kept a cache of them and neither ever
    revoked one: `Speak`'s was module-level and so outlived every navigation,
    `PairsSession`'s went unreachable when the round ended and was still
    held. Review plays audio on nearly every card, so a phone left in the app
    accumulated a WAV per word for the whole session.

    The presence of a cache is what made this look solved, which is why the
    check is about revocation rather than about caching. One bounded cache in
    lib/audio/clipCache.ts, and no component minting its own url beside it:
    a second copy of a pattern with a cleanup step is where the cleanup step
    goes missing, which is the argument lib/cache/singleFlight.ts makes about
    itself.
  */
  const cache = code("lib/audio/clipCache.ts");
  assert.match(cache, /revokeObjectURL/, "the clip cache no longer releases anything");

  for (const file of ALL) {
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    if (file === "lib/audio/clipCache.ts" || file === "components/Recorder.tsx") continue;
    const source = code(file);
    if (!/createObjectURL/.test(source)) continue;
    assert.match(
      source,
      /revokeObjectURL/,
      `${file} makes an object URL and never revokes it`,
    );
  }
});

check("dictation says which kind of mistake it was, in text", () => {
  /*
    "The marking shows which word you missed and whether you only lost its
    Estonian letters" is the README's promise about this exercise, and it is
    the reason the exercise exists rather than being another listening round.

    `diacritics` and `typo` share a background, correctly: the palette has one
    colour for "nearly" and inventing a sixth hue to carry a distinction is
    exactly what the design system forbids. So the distinction has to be
    carried by words — and it was carried by a `title` attribute instead,
    which is a hover tooltip. This app is measured at 360px and the README
    leads with "works on a phone". Hover does not happen there, so on the
    primary device the two marks were one mark.

    Asserted by calling the function rather than by matching markup: two
    different, non-empty notes, and a component that actually renders them.
  */
  const diacritics = wordNote({ expected: "õues", typed: "oues", status: "diacritics" });
  const typo = wordNote({ expected: "kool", typed: "koll", status: "typo" });

  assert.ok(diacritics, "a dropped diacritic is marked with no words on it");
  assert.ok(typo, "a typo is marked with no words on it");
  assert.notEqual(diacritics, typo, "dictation tells the two kinds of nearly apart by colour alone");

  const session = code("app/(app)/review/dictation/DictationSession.tsx");
  assert.match(session, /wordNote\(/, "the dictation marking stopped showing which mistake it was");
});

check("a daily reminder fires on the learner's clock, not the server's", () => {
  /*
    The hour somebody picks in Settings is a reading on their own clock. This
    route ran `setHours()`, which sets an hour in whatever timezone the Node
    process is configured with, and wrote the result back out as a `Z`-suffixed
    instant. On Vercel that process is in UTC and Estonia is two or three hours
    ahead of it, so the entire intended audience of this app was reminded two
    or three hours after they asked, every day, with nothing anywhere saying a
    timezone had been assumed.

    A floating time is the shape RFC 5545 has for this, and it fixes the second
    bug behind the first for free: an absolute instant on a daily rule keeps
    one UTC offset for ever, and Estonia moves its clocks twice a year.

    Asserted on the builder rather than on today's output: no `Z` on the
    recurring start, and no `setHours`, which is the call that cannot know
    whose hour it is being asked about.
  */
  const source = code("lib/time/reminder.ts");
  assert.doesNotMatch(
    source,
    /setHours|setUTCHours/,
    "the reminder builds its start time from a timezone nobody chose",
  );
  assert.doesNotMatch(
    source,
    /DTSTART:\$\{[^}]*\}Z|`DTSTART:.*Z`/,
    "the reminder pins its recurring start to one UTC offset, which the clocks change twice a year",
  );
  assert.match(source, /DTSTAMP/, "the reminder no longer stamps when it was written");

  const route = code("app/api/reminder/route.ts");
  assert.match(route, /buildReminderIcs\(/, "the reminder route builds its own file again");
  assert.doesNotMatch(route, /setHours/, "the reminder route is back to the server's clock");
});

check("nothing reaches a paid provider without going through the ledger", () => {
  /*
    CLAUDE.md: "Any new path that calls a paid provider goes through
    `authoriseCall` before the call and `recordUsage` after it." Four routes
    did. `lib/tutor/translate.ts` did not, and it is reachable from the
    dictionary search box: a word the local table and Wiktionary both missed
    fired a real completion with no burst limit, no daily allowance, no global
    budget check and no row written afterwards. The Settings usage meter then
    reported that nothing had been spent, because from the ledger's point of
    view nothing had.

    Asserted by finding the provider chain's own entry points rather than by
    listing today's four callers, because the rule is about the next one. A
    module that opens a provider and does not mention the ledger fails here,
    whether it is a route, an action or a helper — which is what makes putting
    the meter inside `ask()` a fix rather than a patch: every future caller of
    it inherits the meter instead of having to remember it.
  */
  const entryPoints = /\b(openWithFallback|completeWithImage)\s*\(/;
  const callers = ALL.filter(
    (f) =>
      !/\.(test|itest)\.tsx?$/.test(f) &&
      f !== "lib/tutor/provider.ts" &&
      entryPoints.test(read(f)),
  );
  assert.ok(callers.length >= 3, `expected the provider callers, found ${callers.length}`);

  for (const file of callers) {
    const source = read(file);
    /*
      AUTHORISED IN THE SAME FILE, WITHOUT EXCEPTION.

      This was widened once, to admit a route that proved a booking made
      somewhere else: the scene booked one call for a whole conversation, on
      the argument that running out of allowance halfway through one is the
      worst failure available to it. The widening was wrong, and it was wrong
      in the direction this file exists to catch. A call is written down when
      it is *authorised*, because two of the three limits count `CALL` rows, so
      one booking in front of a dozen composed turns is eleven calls the
      allowance never saw. The rule was fine; the code was not, and widening a
      rule to fit code is the one move that turns a check into a formality.

      "A check that fires on honest code is a check people learn to waive" is
      still true and is not a licence: the test of honest code is whether the
      rule is right, and here it was.
    */
    assert.match(
      source,
      /authoriseCall\(/,
      `${file} opens a provider without asking the ledger first`,
    );
    assert.match(source, /recordUsage\(/, `${file} opens a provider and never files what it spent`);
  }

  /*
    A RELEASE GIVES BACK THE CALL, NOT ONLY THE MONEY, and a route that books
    before it knows whether it will compose is exactly where that comes due.
    The scene's ladder walks past the model to the fallback rung as an ordinary
    outcome rather than an error, and a booking left standing there rations a
    learner over a line nobody was shown.
  */
  const scene = read("app/api/scene/route.ts");
  assert.match(
    scene, /releaseReservation\(/,
    "the scene books a turn it may not compose and never hands the booking back",
  );
  /*
    And the settlement and the release both go through `after()`, because the
    deployment target suspends a function once its response is sent and does not
    guarantee a pending promise runs. Comment-blind, since this is the shape the
    rest of the app is already held to.
  */
  for (const call of ["recordUsage", "releaseReservation"]) {
    assert.match(
      code("app/api/scene/route.ts"),
      new RegExp(`after\\(\\(\\) => ${call}\\(`),
      `the scene leaves ${call} to a promise nobody is holding`,
    );
  }
});

check("an export holds every category the account holds", () => {
  /*
    Article 20 is a right to receive the personal data concerning you, and
    /privacy says in as many words that nothing is held back. It was: settings,
    tutor conversations, level checks, starred words and badges were all
    absent, and two of those cannot be reconstructed from anything.

    Asserted against the schema rather than against a list typed here, so a new
    owner-scoped table is a failure until somebody decides about it.

    THAT WAS TRUE OF THE CHECK AND NOT OF ITS SKIP LIST, WHICH IS THE SAME BUG
    ONE LEVEL UP. Three models had been added to the exemption rather than to
    the query — mock exam sittings, classes and class memberships — so the
    backup stopped at ten tables out of thirteen and this check called it
    complete. A sat paper carries the learner's own composition, which is the
    single least reconstructable thing in the schema.

    The exemptions live in lib/legal/exportCoverage.ts now and each one has to
    carry a written reason, so appending a model name is no longer a way to
    make this pass. UsageEvent is the one that earns it.
  */
  const route = read("app/api/export/route.ts");
  for (const model of ownerScopedModels()) {
    if (Object.hasOwn(NOT_EXPORTED, model)) continue;
    assert.match(
      route,
      new RegExp(`prisma\\.${accessorFor(model)}\\.findMany`),
      `the export leaves ${model} out, and the privacy page promises it does not`,
    );
  }
});

check("an exclusion from the backup is a decision somebody wrote down", () => {
  /*
    The check above is only as strong as the thing it consults, so the skip
    list gets its own. An entry has to name a model the schema actually has
    (a stale one is an exemption nothing needs, and it would silently cover a
    future table of the same name), and it has to carry an argument rather
    than a word. Forty characters is not a quality bar, it is a floor low
    enough that any real sentence clears it and high enough that "internal" or
    "not needed" does not.
  */
  const owned = new Set(ownerScopedModels());
  const entries = Object.entries(NOT_EXPORTED);
  assert.ok(entries.length >= 1, "the exclusion list is empty, which would make the check above trivial");
  for (const [model, reason] of entries) {
    assert.ok(owned.has(model), `${model} is exempted from the export but is not an owner-scoped model`);
    assert.ok(
      reason.trim().length >= 40,
      `${model} is exempted from the export with no reason worth the name`,
    );
  }
});

check("erasure has no exemptions at all", () => {
  /*
    "Delete everything" is the promise on /privacy, and unlike the export it
    has nothing it is allowed to keep: even the spending record goes, because
    it is a record about a person and the cap it enforced dies with the
    account it capped.

    Read off the schema for the same reason as the export, and it caught the
    same three: mock sittings, classes and memberships were all left behind by
    a transaction that named ten tables. So the one category of long-form
    writing in the whole app survived its author asking for it to be gone.
  */
  const action = between(read("app/actions.ts"), "export async function deleteMyAccount");
  for (const model of ownerScopedModels()) {
    assert.match(
      action,
      new RegExp(`tx\\.${accessorFor(model)}\\.deleteMany`),
      `account deletion leaves ${model} behind, and /privacy promises it does not`,
    );
  }
});

check("nothing is stored on a device that would need asking first", () => {
  /*
    Estonian law wants agreement before something is stored on somebody's
    device unless it is strictly necessary for the service they asked for. The
    theme, the install prompt's memory and the offline outbox all clear that
    bar, which is why this app has no cookie banner and why /privacy explains
    the reasoning rather than asserting the conclusion.

    That stays true only while the list stays short. An analytics or
    advertising library reaching for storage would need consent, a banner and a
    withdrawal path, none of which exist here.
  */
  const storage = ALL.filter((f) => /localStorage|sessionStorage|indexedDB|document\.cookie/.test(read(f)))
    .filter((f) => !/\.(test|itest)\.tsx?$/.test(f));
  const allowed = [
    "components/InstallPrompt.tsx",
    "components/Sidebar.tsx",
    "app/layout.tsx",
    "lib/offline/db.ts",
    // The sign-out that removes all of the above, and so has to name them.
    "lib/offline/forget.ts",
    // An exam paper started and not handed in. Strictly necessary by the same
    // argument the outbox is: a mock exam that loses three hours of a B2 paper
    // to a closed tab is broken rather than private. Answers only, never marks
    // and never questions, and removed the moment the paper is handed in.
    "app/(app)/exam/[level]/resume.ts",
    // Today's word puzzle, by the same argument one size down: a board that
    // loses its guesses to a notification taking the tab away is unplayable on
    // a phone. Guesses only, never the answer, which is worked out from the
    // date on the server, and swept by the same sign-out.
    "app/(app)/sonad/resume.ts",
    // And the crossword's grid, which is the same argument a size up: fifteen
    // minutes rather than three. Letters and which clues were shown, never the
    // answers, which are rebuilt on the server to mark it.
    "app/(app)/crossword/resume.ts",
  ];
  for (const file of storage) {
    assert.ok(
      allowed.includes(file),
      `${file} stores something on the reader's device, which /privacy does not account for`,
    );
  }
  assert.match(
    read("app/privacy/page.tsx"),
    /What is kept on your own device/,
    "the privacy page stopped saying what is kept on the device",
  );
});

check("a headline is read through the dictionary's gate, and the feed writes nothing down", () => {
  /*
    The front page is the most ordinary Estonian this app can put in front of
    somebody, and it is somebody else's. So it is printed as the feed spelled
    it, attributed, and every word that opens an entry does so because
    `matchEstonianForm` vouched for it at the scanned-page floor (ADR-021): a
    word it will not vouch for is left plain rather than guessed at. The block
    is rendered from the hourly cache and stored nowhere.
  */
  const reader = code("lib/dict/headlines.ts");
  assert.match(reader, /matchEstonianForm\(candidates/, "headline words are no longer vouched by the dictionary");
  assert.match(reader, /newsHeadlines\(\)/, "the reader no longer reads the feed's own cache");
  assert.doesNotMatch(reader, /prisma\.(lexeme|form|card)\.(create|update|upsert|delete)/, "the headline reader writes to the dictionary");
  const screen = code("components/Headlines.tsx");
  assert.match(screen, /token\.lemma \?/, "the screen links something other than a vouched lemma");
  assert.match(screen, /encodeURIComponent\(token\.lemma\)/, "a link carries the headline's spelling rather than the headword");
  assert.match(screen, /from \{host\}/, "the block no longer names where the headline came from");
  // The feed module stays pure: no database, no browser, nothing of the learner's goes out.
  const feed = code("lib/news/feed.ts");
  assert.doesNotMatch(feed, /ownerId|cookies|headers\(/, "the feed request carries something of the learner's");
});

check("a response built out of one learner's own rows is never cacheable", () => {
  /*
    THE FRAMEWORK'S SILENCE IS NOT A CACHE POLICY.

    `/api/share` renders a picture carrying a name, a streak and an XP total,
    and `ImageResponse` stamps `public, immutable, max-age=31536000` on
    anything that does not say otherwise: measured on the running build, three
    fetches made one request, the last two served from the browser's own cache
    after everything a sign-out clears had been cleared. `/api/export` and
    `/api/reminder` sent no freshness directive at all, and the export is
    every review, every conversation and every exam composition the learner
    has written.

    So a Route Handler that resolves an owner says who the response belongs
    to. `no-store` and a `Cookie` vary, asserted from the source, because the
    next such route will inherit the same silence.
  */
  const routes = ALL.filter((f) => /^app\/api\/.*route\.tsx?$/.test(f));
  const owned = routes.filter((f) => /requireUserId\(/.test(code(f)));
  assert.ok(owned.length >= 3, "no route handler resolves an owner any more");
  for (const file of owned) {
    const src = code(file);
    // A route that only ever writes has nothing to cache; the ones that hand
    // back a body built from the learner's rows are the ones this is about.
    if (!/new Response\(|ImageResponse\(/.test(src)) continue;
    assert.match(
      src,
      /"cache-control":\s*"(private, )?no-store"/,
      `${file} builds a response from one learner's rows without saying it is not to be kept`,
    );
    /*
      A download and a picture are the two shapes a cache in front of the app
      would otherwise be free to keep and hand on, so those say whose they are
      as well as that they are not to be stored.
    */
    if (/content-disposition|ImageResponse\(/.test(src)) {
      assert.match(src, /"cache-control":\s*"private, no-store"/, `${file} is a download or a picture and does not say it is private`);
      assert.match(src, /vary:\s*"Cookie"/, `${file} does not vary on the cookie that chose it`);
    }
  }
});

check("a call is booked only once the request is worth answering", () => {
  /*
    The ledger writes a call down when it authorises it, which is what stops
    ten tabs reading the same "under the limit"; the price is that anything
    refused after that point has to hand the booking back. /api/tutor
    authorised first and then returned 400 on an empty message list, so four
    empty posts left four pending calls against the global budget and spent
    four of that learner's ten for the day. Every paid route validates first.
  */
  const paid = ALL.filter((f) => /^app\/api\/.*route\.tsx?$/.test(f));
  for (const file of paid) {
    const src = code(file);
    const at = src.indexOf("authoriseCall(");
    if (at === -1) continue;
    const before = src.slice(0, at);
    assert.ok(
      !/status:\s*400/.test(src.slice(at)) || /releaseReservation\(/.test(src.slice(at)),
      `${file} can refuse a request after booking it without handing the booking back`,
    );
    assert.ok(
      before.length > 0,
      `${file} books a call before it has read anything about the request`,
    );
  }
});

check("a card never answers the card before it", () => {
  /*
    A word's cards are written together, graded together and come back
    together, so a queue ordered by `due` alone puts them side by side: 13 of
    32 due cards on the demo deck sat next to a card of the same word, and
    seven case cards of one word ran consecutively. That is a re-read logged
    as a recall, and the scheduler raises the interval on it.

    The daily review passes its due list through the spacer. The new cards do
    not, deliberately: `inTeachingOrder` puts a word's cards together in the
    order a lesson teaches them, because a first meeting is a teaching screen
    rather than a retrieval.
  */
  const review = code("app/(app)/review/page.tsx");
  assert.match(review, /spaceSiblings\(due,/, "the review queue no longer spaces a word's cards apart");
  assert.match(review, /inTeachingOrder\(fresh\)/, "new cards no longer arrive in teaching order");

  const queue = code("lib/srs/queue.ts");
  assert.match(queue, /export function spaceSiblings/, "the spacer is gone");
  // It reorders and never drops: the set out is the set in.
  assert.match(queue, /remaining\.splice/, "the spacer no longer moves cards rather than filtering them");
  assert.doesNotMatch(queue, /\.filter\(/, "the spacer filters, which would silently drop a due card");
});

check("signing out forgets the device", () => {
  /*
    Signing out cleared one cookie and left everything the app keeps in the
    browser for the next person on the same machine: the worker's page cache,
    which is somebody's own deck and progress rendered and ready to serve, the
    stashed review session, any grade still queued, and an unfinished exam
    paper with the composition in it. `lib/offline/forget.ts` removes all of
    it, after the outbox has had its chance to drain, and every place that
    signs a learner out has to go through it. The callback route is the one
    exception, since it signs out a session it refused rather than a person
    leaving a device, and runs on a server with no device to forget.
  */
  const forget = read("lib/offline/forget.ts");
  const leavers = ALL.filter((f) => /auth\.signOut\(/.test(code(f)))
    .filter((f) => f !== "app/auth/callback/route.ts");
  assert.ok(leavers.length >= 2, "no client signs anybody out any more");
  for (const file of leavers) {
    assert.match(code(file), /forgetThisDevice/, `${file} signs out without forgetting the device`);
  }
  // The outbox goes first, because a grade still queued is the one thing the
  // device cannot keep and must not quietly drop.
  const rail = code("components/Sidebar.tsx");
  assert.ok(
    rail.indexOf("flush()") < rail.indexOf("forgetThisDevice()"),
    "the rail forgets the device before the outbox has been given its chance to drain",
  );
  // The three stores it forgets are named by the modules that write them.
  const sw = read("public/sw.js");
  assert.match(sw, /`\$\{VERSION\}-pages`/, "the worker no longer names its page cache by suffix");
  assert.match(forget, /PAGES_CACHE_SUFFIX = "-pages"/, "forget.ts deletes a cache the worker does not keep");
  assert.match(forget, /deleteLocalDatabase/, "forget.ts no longer removes the outbox and the stash");
  assert.match(
    code("app/(app)/exam/[level]/resume.ts"),
    /SITTING_KEY_PREFIX/,
    "an unfinished paper is stored under a key a sign-out does not know",
  );
  // And the case where nobody signed out: a different account on the same
  // browser clears what the last one left, from the shell, on every render.
  assert.match(forget, /forgetIfOwnerChanged/, "a change of account no longer forgets the device");
  assert.match(code("components/DeviceOwner.tsx"), /forgetIfOwnerChanged\(owner\)/);
  const shell = code("app/(app)/layout.tsx");
  assert.match(shell, /<DeviceOwner owner=\{ownerDigest\(ownerId\)\}/, "the shell no longer mounts DeviceOwner");
  assert.match(shell, /createHash\("sha256"\)/, "the browser is handed the account id itself rather than a digest");
});


// ── Not asking the same question twice (cache) ───────────────────────────────

check("a source that will not answer is written down as a miss", () => {
  /*
    The seed learned this the expensive way: a source that would not answer was
    never recorded as a miss, the run looked clean, and four fifths of the
    dictionary was absent. The live path had the same bug and nobody had
    noticed, because its symptom is not an absence but a cost. A word Ekilex
    cannot answer for was re-asked, twice over, on every render of the page it
    appeared on, for ever, against a free academic service.

    `lookupMissAt` is deliberately not `fetchedAt`: the exam pool orders by
    `fetchedAt` to mean "words the dictionary knows most about", so writing a
    miss there would have sorted the least known words to the front of a mock
    paper.
  */
  assert.match(SCHEMA, /lookupMissAt\s+DateTime\?/, "the miss marker is gone from the schema");
  const lookup = read("lib/dict/lookup.ts");
  assert.match(lookup, /lookupMissAt: new Date\(\)/, "a miss is no longer recorded");
  assert.match(lookup, /lookupMissAt: null/, "an answer no longer clears an earlier miss");
  assert.equal(
    /fetchedAt: new Date\(\)[\s\S]{0,80}recordMiss/.test(lookup),
    false,
    "a miss is being written to fetchedAt, which the exam pool reads as a ranking",
  );
});

check("the page you were on is cached before you need it, not by luck", () => {
  /*
    The page cache fills as a side effect of a navigation the worker
    intercepts, and the worker never serves the navigation that installed it:
    on a first visit the page is fetched, the worker installs behind it, and
    `clients.claim()` takes over a client whose own page was never seen. Go
    offline and reload there and the fallback has nothing to match, so it goes
    to /offline. The first journey failed and the second worked, which is the
    worst possible shape for a bug to have.

    `warmOpenPages` on activate is the fix, and it is somebody else's: two
    sessions found this in the same week and the other one was better, because
    it caches whatever window is actually open rather than a hardcoded list of
    routes. The rule is "the page you were last on opens again", not "one route
    is special". This invariant is what that fix did not come with, and the
    reason for writing it here rather than deleting both: a rule in this
    repository is supposed to have something asserting it.
  */
  const sw = read("public/sw.js");
  assert.match(sw, /function warmOpenPages\(/, "the warm-up on takeover is gone");
  assert.match(
    sw,
    /clients\.claim\(\)\s*\)?\s*\.then\(\(\) => warmOpenPages\(\)\)/,
    "the warm-up no longer runs when the worker takes over",
  );
  assert.match(
    sw,
    /matchAll\(\{[^}]*includeUncontrolled:\s*true/,
    "the warm-up no longer reaches the client that installed it, which is the only one that matters",
  );
  /*
    And the shell is warmed one URL at a time. `addAll` is atomic, so a single
    URL that will not fetch throws away the batch, and /offline is in that
    batch: the fallback is the one thing here with no fallback of its own.
  */
  assert.equal(
    /cache\.addAll\(|caches\.open\([^)]*\)\.then\(\(cache\) => cache\.addAll/.test(sw),
    false,
    "the worker caches its shell atomically, so one bad URL loses the offline page too",
  );
});

check("one upstream request per thing, however many callers ask at once", () => {
  /*
    A cache consulted before a call and written after it has a gap exactly as
    wide as the call, and a class of twenty-five starting the same unit lands
    in it. Speech worked this out first; the dictionary needed the same thing.

    What this guards is that there is one implementation. A second copy is
    where the `finally` gets dropped, and a bad minute upstream is then
    remembered as a failure until the next deploy.
  */
  const owners = ALL.filter((f) => /new Map<string, Promise</.test(read(f)));
  assert.deepEqual(
    owners,
    ["lib/cache/singleFlight.ts"],
    "somebody wrote a second in-flight map instead of using lib/cache/singleFlight.ts",
  );
  for (const file of ["app/api/tts/route.ts", "lib/dict/lookup.ts"]) {
    const source = read(file);
    // Both halves, because the import path alone is not evidence of a call:
    // the first version of this check matched the string "singleFlight" inside
    // `@/lib/cache/singleFlight` and passed happily on a file that had stopped
    // calling it.
    assert.match(
      source,
      /from "@\/lib\/cache\/singleFlight"/,
      `${file} does not use the shared in-flight map`,
    );
    assert.match(
      source,
      /\bsingleFlight(Tagged)?\(/,
      `${file} imports the deduplication and then does not call it`,
    );
  }
});

// ── Named the way Estonian is taught, not the way English names it ───────────

/**
 * Estonian is not taught anywhere by its Latin case names or by the English
 * names of tenses it does not inflect for. A class, a textbook and the state
 * examination all name a case by its Estonian name and, more often, by the
 * question it answers, and they name the verb by mood, tense, voice and person
 * as four separate axes rather than as a row of English-shaped tenses.
 *
 * This app is in English and keeps the English name, because a learner reading
 * an English reference grammar needs it. What is asserted here is which one
 * leads: a screen that shows a learner "the inessive" and nothing else has
 * taught them a word their own teacher will not say.
 */
check("every grammar point the course can name carries the name a class uses", () => {
  for (const spec of CASES) {
    const term = grammarTerm(spec.key.toLowerCase());
    assert.equal(term?.et, spec.et, `${spec.key} has no Estonian name`);
    assert.ok(term?.question, `${spec.key} does not carry the question it answers`);
  }
  for (const group of TOPIC_GROUPS) {
    assert.ok(grammarGroupTerm(group.id), `the ${group.id} group has no Estonian name`);
  }
  // The verb is where the English names were worst and where a new point is
  // most likely to arrive carrying only one.
  const verb = TOPIC_GROUPS.find((g) => g.id === "verb");
  assert.ok(verb, "the grammar reference no longer groups the verb");
  for (const id of verb!.ids) {
    assert.ok(grammarTerm(id)?.et, `the verb point "${id}" has only an English name`);
  }
});

/**
 * The same rule where it is actually broken: a screen.
 *
 * Every place that puts a case in front of a learner holds both names already,
 * so showing one is a choice rather than a shortage. This is the shape of the
 * ledger check above, and for the same reason: prose in CLAUDE.md kept four
 * screens honest and did not catch the fifth, which was the level check
 * offering "Inessive, Elative, Allative" to somebody who had been learning for
 * a week.
 */
check("a screen that names a case in Latin names it in Estonian too", () => {
  // Anchored on a member access rather than on the word, because a file
  // declaring `caseEt: string` in an interface and then never rendering it
  // satisfied the first version of this check. That is the same fault the
  // comment on `code()` above describes: naming a thing is not using it.
  const LATIN = /\.caseEn\b|\bspec\.en\b/;
  const ESTONIAN = /\.caseEt\b|\.caseQuestion\b|\bspec\.et\b|\bspec\.question\b|caseOptionLabel/;
  for (const file of [...APP, ...COMPONENTS]) {
    const source = code(file);
    if (!LATIN.test(source)) continue;
    assert.match(
      source,
      ESTONIAN,
      `${file} shows a learner the Latin case name with no Estonian name or question beside it`,
    );
  }
});

/**
 * A day boundary rendered on a server belongs to the learner, not to the box.
 *
 * Every day-shaped figure in this app is derived on the server: the streak,
 * the daily goal, the quests, the week strip, the heatmap, the two badges
 * about the hour of the day. `lib/time/day.ts` had a header saying its days
 * were "the learner's own calendar days" and a body reading
 * `date.getFullYear()`, which is the day boundary of whichever process is
 * running. On Vercel that process is UTC, so the shortcut the file was written
 * to forbid was being taken one layer down.
 *
 * The bill it ran up: a learner in Tallinn who studied on Monday morning, at
 * one in the morning on Tuesday and again on Wednesday morning kept a
 * three-day streak. Those sittings fall in two UTC days with a hole between
 * them, so the app reported a streak of 1 and, with a shield banked, spent it
 * bridging a Tuesday they had not missed.
 *
 * So the rule is: a module that reaches the database is a module rendering for
 * somebody, and it takes a `DayClock` rather than calling the process-bound
 * free functions. Anchored on the import, because that is what a new caller
 * writes first and it is the one line a person adding a fifth day-shaped panel
 * would copy from a fourth.
 */
check("a day boundary on the server is the learner's, never the deployment's", () => {
  const PROCESS_BOUND = /\bimport\s*\{([^}]*)\}\s*from\s*"@\/lib\/time\/day"/g;
  const FREE = ["dayKey", "startOfDay", "shiftDay", "recentDayKeys", "daysBetween"];

  for (const file of [...APP, ...LIB]) {
    if (file.endsWith(".test.ts") || file.endsWith(".itest.ts")) continue;
    if (file === join("lib", "time", "day.ts")) continue;
    const source = code(file);
    // Reaching the database is what makes a module one that renders for a
    // particular person. A pure module with no owner in sight has no learner
    // whose clock it could be reading.
    if (!/@\/lib\/db|prisma\./.test(source)) continue;

    for (const match of source.matchAll(PROCESS_BOUND)) {
      const named = (match[1] ?? "").split(",").map((n) => n.trim().replace(/^type\s+/, ""));
      const bare = named.filter((n) => FREE.includes(n));
      assert.equal(
        bare.length, 0,
        `${file} counts days with ${bare.join(", ")}, which reads the server's midnight. ` +
        `Take a DayClock (lib/progress/dayClock.ts) instead.`,
      );
    }
  }

  // And the module itself still offers one, so the check above cannot be
  // satisfied by there being nothing to take.
  const day = code(join("lib", "time", "day.ts"));
  assert.match(day, /export function dayClock/, "there is no clock to pass any more");
  assert.match(day, /timeZone: zone/, "the clock stopped reading a zone at all");

  /*
    The naive-timestamp trap, asserted where it bit. Prisma maps `DateTime` to
    `timestamp without time zone`, and on a naive value `AT TIME ZONE z`
    *interprets* rather than converts: a single one read 22:00 UTC as 22:00 in
    Tallinn and filed the review under the wrong day. The correct form labels
    the column as the UTC it is and only then converts.
  */
  const summary = code(join("lib", "progress", "summary.ts"));
  const single = /"reviewedAt"\s+AT TIME ZONE\s+\$\{/;
  assert.doesNotMatch(
    summary, single,
    "the streak converts a naive timestamp with one AT TIME ZONE, which interprets it instead",
  );
  assert.match(
    summary,
    /\("reviewedAt" AT TIME ZONE 'UTC'\) AT TIME ZONE/,
    "the streak no longer labels its naive column as UTC before converting it",
  );
});

/**
 * A screen says which screen it is, in the tab and in the history.
 *
 * Thirty-four of the forty-five routes here set no title at all, so Next fell
 * back to the one in the root layout and every one of them was called
 * "Kodukeel. Estonian that finally sticks". That is the landing page's
 * marketing line, and it was the name of /review, /settings, /progress, the
 * dictionary and the exam alike: two tabs open side by side were
 * indistinguishable, a bookmark said nothing about what had been bookmarked,
 * and a screen reader announcing the document name announced the pitch.
 *
 * The three that did set one each invented their own suffix, which is what the
 * `title.template` in `app/layout.tsx` is now for: a page states its own name
 * and the app's name is added for it.
 *
 * Asserted on every `page.tsx` because this is exactly the kind of thing that
 * is remembered on the first four screens of a feature and forgotten on the
 * fifth.
 */
check("every screen names itself in the browser tab", () => {
  const pages = APP.filter((file) => file.endsWith(`${"/"}page.tsx`) || file.endsWith("\\page.tsx"));
  assert.ok(pages.length > 30, `only found ${pages.length} pages, so this check stopped looking`);

  for (const file of pages) {
    const source = code(file);
    assert.match(
      source,
      /export const metadata|export async function generateMetadata|export function generateMetadata/,
      `${file} sets no title, so its tab reads as the landing page`,
    );
  }

  /*
    And the template exists, so a page that sets "Review" is not a page whose
    tab says only "Review". Checked on the layout rather than on a rendered
    page: this suite reads source, and a template that is deleted would leave
    every check above passing.
  */
  const layout = code(join("app", "layout.tsx"));
  assert.match(layout, /template:\s*"%s/, "the root layout no longer adds the app's name to a page title");
  assert.match(layout, /default:/, "the root layout has no fallback title for a route without one");
});

/**
 * A suite that exists is a suite CI runs.
 *
 * The workflow's own comment names this fault: "This list is written out
 * rather than deferring to `npm run test:browser`, so a suite added to that
 * script alone is a suite CI never runs: `test-exam.mjs` sat here unrun for
 * its first two builds, floor and all." That is the drift in one direction.
 * It had also drifted in the other, and nothing was counting: the npm scripts
 * named seventeen suites and the workflow ran eleven, so five of them had
 * nothing watching them at all. Among the five was `test-restore.mjs`, the
 * wipe-and-restore round trip, which guards the only failure in this app that
 * cannot be recovered from.
 *
 * They were all green when somebody finally ran them, which is the least
 * useful moment to find that out: a suite nobody runs reports on the code it
 * was written against rather than on the code you have. That is the same
 * sentence `scripts/lib/checks.mjs` opens with, one level up.
 *
 * The source of truth is the filesystem rather than either list, so a new
 * suite fails this until somebody decides where it runs. An exemption carries
 * a written reason, on the shape of `lib/legal/exportCoverage.ts`: appending
 * a filename is not a way to make a check pass.
 */
check("every browser suite that exists is a browser suite CI runs", () => {
  const declared = readdirSync("scripts")
    .filter((f) => f.endsWith(".mjs"))
    .filter((f) => DECLARES_SUITE.test(read(join("scripts", f))));
  assert.ok(declared.length > 10, `only found ${declared.length} suites, so this check stopped looking`);

  const workflow = read(join(".github", "workflows", "ci.yml"));
  const exempt = NOT_IN_CI as Record<string, string>;

  for (const file of declared) {
    if (workflow.includes(`scripts/${file}`)) continue;
    const reason = exempt[file];
    assert.ok(reason, `scripts/${file} declares a suite that nothing in CI runs, and no reason is written down`);
    assert.ok(
      reason.length > 80,
      `the reason scripts/${file} is out of CI is too short to be one`,
    );
  }

  // And nothing is exempted that CI turns out to run after all, which is how
  // a reason outlives the thing it was a reason for.
  for (const file of Object.keys(exempt)) {
    assert.ok(
      declared.includes(file),
      `scripts/lib/suites.mjs exempts scripts/${file}, which is not a suite any more`,
    );
    if (file === "load-test.mjs") continue;
    assert.ok(
      !workflow.includes(`node scripts/${file}`),
      `scripts/${file} is exempted from CI and CI runs it`,
    );
  }

  /*
    And every suite is reachable by a person too, through one of the two npm
    scripts. `test-anu.mjs` was in neither: a whole suite that no command in
    the repository ran, discoverable only by listing the directory.
  */
  const pkg = read("package.json");
  for (const file of declared) {
    if (file === "load-test.mjs") continue;
    assert.ok(
      pkg.includes(`scripts/${file}`),
      `scripts/${file} is in no npm script, so nobody can run it without knowing it is there`,
    );
  }
});

/**
 * And the other one, at the far end of the same list.
 *
 * `test-restore.mjs` empties the shared dictionary and rebuilds it from a
 * backup, which is the whole of what it exists to prove. Everything it puts
 * back is created as the restorer's own, because that is what a restore is
 * allowed to do to a word it does not already hold, so afterwards not one row
 * in the dictionary is marked `SEED`. Every suite that reads a seeded word is
 * then looking at a dictionary that no longer has one.
 *
 * `test-scan.mjs` says so out loud when it happens, which is the right
 * behaviour and is not a substitute for the ordering: it reports "no seeded
 * words" and waives seventeen checks, and the person reading that is sent to
 * reseed a database that was seeded correctly an hour ago. Run second to last
 * on somebody's own machine it costs a suite; the only thing keeping it
 * harmless in CI is the order of two lines in a workflow file.
 *
 * Asserted inside the browser job, because the sign-in suite is a separate job
 * with a database of its own and appears later in the same file.
 */
check("the suite that empties the dictionary runs after every suite that reads it", () => {
  const workflow = read(join(".github", "workflows", "ci.yml"));
  const start = workflow.indexOf("name: The browser suites");
  assert.ok(start > 0, "ci.yml no longer has a job called The browser suites");
  const next = workflow.indexOf("\n  signin:", start);
  const job = workflow.slice(start, next > 0 ? next : undefined);

  const suites = [...job.matchAll(/node scripts\/([\w-]+)\.mjs/g)].map((m) => m[1]);
  assert.ok(suites.includes("test-restore"), "the browser job does not run scripts/test-restore.mjs");
  assert.equal(
    suites[suites.length - 1],
    "test-restore",
    `scripts/test-restore.mjs has to be the last browser suite: ${suites[suites.length - 1]} runs after it, ` +
    "against a dictionary it has just rebuilt with no SEED row in it",
  );

  // And it is last because of what it does, not because somebody put it there.
  assert.match(
    read(join("scripts", "test-restore.mjs")),
    /lexeme\.deleteMany/,
    "test-restore.mjs no longer empties the dictionary, so its position no longer has to be last",
  );
});

/**
 * And the one suite whose *position* in that list is the whole of its value.
 *
 * `/start` redirects anyone carrying `onboardedAt` or a single card, which is
 * right: a first-run wizard reappearing for an established learner is worse
 * than no wizard. It also means the demo fixture closes that door. CI built
 * the fixture before it started the server, so `test-assess.mjs` had never
 * once reached the walkthrough — sixteen of its forty-two checks waived on
 * every run there has ever been, honestly reported, under the half that fails
 * a suite outright, and therefore silent. The screen a learner meets before
 * any other was verified by nothing at all. All nineteen of those checks pass;
 * they had simply never been asked.
 *
 * This is the `absent()` machinery's one blind spot and worth naming as its
 * own rule: a waiver states a fact about the run, and a waiver that is true on
 * every possible run is a hole wearing a waiver's clothes. The suite reaches
 * 43 checks before the fixture and 26 after it.
 *
 * Asserted on the order of the two lines rather than on either alone, because
 * both will still be present when somebody tidies them back together.
 */
check("first run is exercised, which means two suites run before the fixture", () => {
  const workflow = read(join(".github", "workflows", "ci.yml"));
  const fixture = workflow.indexOf("scripts/demo-data.ts");
  const server = workflow.indexOf("Start the server");
  assert.ok(fixture > 0, "CI does not build the demo fixture");

  /*
    Two, and for the same reason. `test-assess.mjs` walks the first-run wizard,
    which `/start` refuses to show anybody holding a card. `test-first-day.mjs`
    walks every route in the app against a learner who has none, which is the
    branch every panel computed from a review log takes and which no suite
    rendered until it existed. Both are checks on a *state*, and the fixture is
    what ends that state, so both belong above it.
  */
  for (const name of ["test-first-day", "test-assess"]) {
    const suite = workflow.indexOf(`node scripts/${name}.mjs`);
    assert.ok(suite > 0, `CI does not run scripts/${name}.mjs at all`);
    assert.ok(
      suite < fixture,
      `CI builds the demo deck before ${name}.mjs runs, so it measures a learner with `
        + "two months of history rather than one on their first evening. It has to run "
        + "against an empty deck.",
    );
    assert.ok(
      server < suite,
      `${name}.mjs is a browser suite and CI runs it before the server is up`,
    );
  }

  /*
    And the one that cannot tell says so rather than passing. `test-first-day`
    reads the app's own answer for whether the deck is empty and stops when it
    is not, because every check in it would pass against the wrong state, which
    is the shape of the waiver that left the wizard verified by nothing.
  */
  assert.match(
    read(join("scripts", "test-first-day.mjs")),
    /No cards yet/,
    "test-first-day.mjs stopped checking that the deck is actually empty, so it can "
      + "pass having walked the app as an established learner sees it",
  );

  /*
    And the suite still says what it needs, so the developer who takes the
    other branch on their own seeded machine reads a precondition rather than
    a number. `scripts/lib/prefs.mjs` makes the same argument about a stored
    preference: a suite states its preconditions, it does not inherit them.
  */
  const assess = read(join("scripts", "test-assess.mjs"));
  assert.match(
    assess,
    /absent\(\s*\d+[\s\S]{0,200}?demo fixture/,
    "test-assess.mjs waives its first-run checks without saying which state would reach them",
  );
});

/**
 * And the other waiver that fired on every run, which was worse: it was not
 * true.
 *
 * `test-containment.mjs` waived ten checks — five at each width — with the
 * reason "the deck had nothing due", while the deck had forty cards due. A
 * review card is asked as a flip, as multiple choice or as typing, decided per
 * card, and the only thing that suite knew how to press was the flip. So the
 * revealed layout, the one with the most in it (the answer, the note about why
 * this card, and four rating buttons across a 360px phone) was never measured,
 * and the line explaining why sent anybody reading it off to seed a database
 * that was already seeded.
 *
 * `smoke-offline.mjs` had found this first and its own comment says it plainly:
 * "a test that only knows about `Show answer` silently stops testing anything
 * the day the default changes. It did." Four more suites had each worked it out
 * separately, and `test-teaching.mjs` had two of the three shapes and got the
 * third by accident, its `3` keypress landing on the third option rather than
 * on a grade.
 *
 * So there is one definition, `scripts/lib/review.mjs`, and this asserts that a
 * suite reaching for the flip knows there are others. Read comment-blind,
 * because four checks in this repository's history have been satisfied by
 * prose, one of them mine.
 */
/**
 * THE LEDGER IS NEVER WRITTEN BY A PROMISE NOBODY IS HOLDING.
 *
 * Every settlement and every release was `void recordUsage(...)` immediately
 * before the response was returned. The deployment target is Vercel, where a
 * function may be suspended the moment its response is sent and a pending
 * promise is not guaranteed to run: a settlement that never lands leaves the
 * reserve standing, so a free model's call is billed at its estimate for ever,
 * and a release that never lands rations a learner over a call they did not
 * receive. `after()` is the platform's own answer, and it is the one thing
 * here that says "keep this invocation alive until this finishes".
 *
 * Read comment-blind, because a paragraph explaining why `void` is wrong would
 * otherwise satisfy a check looking for it.
 */
/**
 * EVERY PROVIDER KEY IS IN THE CREDENTIAL CANARY.
 *
 * CI builds with a marked value in every server-only variable and greps
 * `.next/static` for it, which is the check CLAUDE.md leads with. It is only
 * as good as the list of variables it marks, and that list was seven names
 * somebody typed: `GROQ_API_KEY` and `GEMINI_API_KEY` joined the provider
 * chain, `PROVIDER_KEY_ENV` grew to five, and the canary stayed at three of
 * them. A key nothing marks is a key the grep cannot find, so the check would
 * have passed over exactly the two the default free chain holds.
 *
 * `PROVIDER_KEY_ENV` is the one list of provider keys and the chain reads it,
 * so this reads it too rather than keeping a fourth copy. Adding a provider
 * now fails here until its key is marked.
 */
check("every provider key the chain can hold is marked in the credential canary", () => {
  const chain = read(join("lib", "tutor", "provider.ts"));
  const listed = chain.match(/export const PROVIDER_KEY_ENV = \[([\s\S]*?)\] as const;/);
  assert.ok(listed, "PROVIDER_KEY_ENV is not where this check expects it");
  const keys = [...listed![1]!.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
  assert.ok(keys.length >= 3, `only ${keys.length} provider keys found, so this check stopped looking`);

  const ci = read(join(".github", "workflows", "ci.yml"));
  for (const key of keys) {
    assert.match(
      ci,
      new RegExp(`^\\s*${key}: .*canary-${key}-must-not-ship`, "m"),
      `${key} is in PROVIDER_KEY_ENV and is not marked in the CI credential canary, ` +
      "so a build that leaked it into the client bundle would pass the grep.",
    );
  }

  /*
    And the marker carries the variable's name. Every one of them used to be
    the same string, so a failure could say that something had leaked and not
    which: on the one check whose whole job is naming a leak.
  */
  const assigned = [...ci.matchAll(/^\s*([A-Z_]+): .*canary-([A-Z_]+)-must-not-ship/gm)];
  const mismatched = assigned.filter(([, variable, marker]) => variable !== marker);
  assert.deepEqual(
    mismatched.map(([, v, m]) => `${v} is marked canary-${m}`), [],
    "a variable's canary marker does not carry its own name, so a failure cannot say which leaked",
  );
  assert.ok(assigned.length >= 10, `only ${assigned.length} variables are marked, so this stopped looking`);
});

check("no ledger write is left to a promise the platform may drop", () => {
  const roots = ["app", "lib"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|itest)\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  for (const root of roots) walk(root);

  let callers = 0;
  for (const file of files) {
    const source = code(file);
    if (!/\b(recordUsage|releaseReservation)\s*\(/.test(source)) continue;
    callers += 1;
    assert.doesNotMatch(
      source,
      /\bvoid\s+(recordUsage|releaseReservation)\s*\(/,
      `${file} leaves a ledger write to an unawaited promise. Wrap it in after() ` +
      "from next/server, which is what keeps the invocation alive long enough to write it.",
    );
  }
  assert.ok(callers >= 5, `only ${callers} files write to the ledger, so this check stopped looking`);
});

/**
 * THE RUSSIAN AND THE UKRAINIAN COME FROM EKILEX, AND FROM NOWHERE ELSE.
 *
 * `Lexeme.translationRu` and `translationUk` are the one place in this schema
 * holding a language neither the app nor the person reviewing this code
 * necessarily reads, and the whole argument for putting them on a flashcard is
 * that a lexicographer at the Institute of the Estonian Language wrote them.
 * A model that could reach them would be ADR-005 pointed at a second language
 * with nobody able to check the output, which is worse than the case the ADR
 * was written for rather than milder: a wrong form looks exactly like a right
 * one, and more so in a language you cannot read.
 *
 * So the files that may name the columns at all are a closed list, the way
 * `prisma/columns.ts` is a closed list of what the seed writes. A new one
 * forces somebody to decide rather than falling through, and nothing on the
 * provider chain is on it.
 */
check("only the harvest, the seed and the screens name a Russian or Ukrainian meaning", () => {
  const allowed = new Set([
    // Written here, out of an Ekilex response and nothing else.
    join("scripts", "harvest-ekilex.ts"),
    join("prisma", "schema.prisma"),
    join("prisma", "seed.ts"),
    join("prisma", "columns.ts"),
    // Read here: the choice of language, and the four screens that print it.
    join("lib", "collections", "glossLanguage.ts"),
    join("lib", "collections", "glossLanguage.test.ts"),
    join("app", "(app)", "dictionary", "page.tsx"),
    join("app", "(app)", "dictionary", "DictionaryClient.tsx"),
    /*
      The review screen reads them in `cards.ts` rather than in `page.tsx` now:
      two routes render that session (the daily loop and the Flash cards round)
      and a second copy of the select is two selects that drift apart. The page
      itself no longer names the columns, so its entry is gone rather than left
      as a parking space.
    */
    join("app", "(app)", "review", "cards.ts"),
    /*
      And the Learn ladder reads them for the same screen the review session
      does. A first meeting is the one moment where a meaning in the language
      somebody already thinks in earns the most, because the word is being
      learned there rather than tested, and the ladder is where a first meeting
      now happens.
    */
    join("lib", "progress", "learn.ts"),
    join("app", "(app)", "learn", "[unitId]", "lesson", "page.tsx"),
    join("lib", "collections", "lesson.ts"),
    join("app", "(app)", "learn", "[unitId]", "lesson", "LessonSession.tsx"),
  ]);

  const roots = ["app", "lib", "components", "scripts", "prisma"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "data") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|prisma)$/.test(entry.name)) files.push(full);
    }
  };
  for (const root of roots) walk(root);

  const naming = files.filter((f) =>
    /translation(Ru|Uk)/.test(f.endsWith(".prisma") ? read(f) : code(f)));
  assert.ok(
    naming.length >= 6,
    `only ${naming.length} files name the columns, so this check stopped looking`,
  );
  assert.deepEqual(
    naming.filter((f) => !allowed.has(f)), [],
    "a new file names a Russian or Ukrainian meaning. Decide what it is doing with it: " +
    "these come from Ekilex and no model may reach them (ADR-005 in a language nobody here reads).",
  );
});

check("a suite that reveals a review card knows all the shapes it comes in", () => {
  const suites = readdirSync("scripts")
    .filter((f) => f.endsWith(".mjs"))
    .filter((f) => DECLARES_SUITE.test(read(join("scripts", f))));
  assert.ok(suites.length > 10, `only found ${suites.length} suites, so this check stopped looking`);

  let drivers = 0;
  for (const file of suites) {
    const source = code(join("scripts", file));
    /*
      A suite that *presses* the pill, which is the one that can stop driving.
      Reaching for it through a Playwright locator is what pressing looks like;
      naming it inside `page.evaluate` is measuring the drawn page, which is
      what the landing page's letter check does to the demo card's own footer
      button, and that suite reveals no card at all.
    */
    if (!/(?:getByRole|getByText|getByLabel|locator)\([^;]*?Show answer/i.test(source)) continue;
    drivers += 1;
    const knowsTheRest =
      /revealAnswer/.test(source) || /Pick the meaning/.test(source);
    assert.ok(
      knowsTheRest,
      `scripts/${file} presses "Show answer" and knows no other shape, so it stops driving ` +
      `the moment a choice or typed card comes up first. Use revealAnswer from lib/review.mjs.`,
    );
  }
  assert.ok(drivers > 0, "no suite drives a review card any more, so this check stopped looking");

  /*
    And the helper is one helper. It reveals and never grades: the containment
    suite runs third and everything after it reads the same deck, so a shared
    driver that graded would quietly change what the rest of them measure.
  */
  const helper = code(join("scripts", "lib", "review.mjs"));
  /*
    Named for the buttons the screen actually draws. This used to read
    `Again|Hard|Good|Easy`, and those left the review screen when a card the
    marker can mark stopped being asked how well it went: the check could no
    longer fail, and `gradeButtons` in the same file had gone stale unnoticed
    for exactly as long. What grades now is "Not yet", "Got it" and the
    "Got it, next" a miss leaves behind, and "Got it, ask me later" is the
    first meeting, which writes nothing and is the one this helper may press.
  */
  assert.doesNotMatch(
    helper.replace(/export function gradeButtons[\s\S]*?\n\}/, ""),
    /(Not yet|Got it, next)[\s\S]{0,160}?\.click\(/,
    "lib/review.mjs grades a card. It reveals only: a caller that wants the grade clicks it.",
  );
});

/**
 * A query that is cut short is ordered all the way down to the primary key.
 *
 * CLAUDE.md has said for a while that "a query that is cut short says where to
 * cut", and nothing asserted it, so eleven queries in the derived-progress
 * layer had drifted from it or had never been brought in line. Every one of
 * them ordered on a column that is not unique and then took the first N.
 *
 * Two of those ties are not theoretical. `Card` was ordered by
 * `(createdAt, lexemeId)`, and `addCardsFor` writes a word's recognition and
 * production cards in one `createMany`, so both share both keys exactly. And
 * `Lexeme` was ordered by `(fetchedAt, lemma)` while `@@unique` is on
 * `(lemma, pos)`: on a freshly seeded deployment every `fetchedAt` is null, so
 * the two entries for `hall` tied outright.
 *
 * The exam pool is the one where that is a correctness fault rather than an
 * inconsistency. `submitExam` rebuilds the paper from (level, seed, pool) in
 * order to mark it, so a pool that comes back in another order marks a learner
 * on questions they were never asked, and the `take` means a tie at the five
 * hundredth row decides which of a pair is in the paper at all.
 *
 * Ordering is free where the index is already there, and it was in all eleven.
 * What is not free is a number that moves on its own.
 *
 * Scoped to `lib/progress/`, which is where every derived figure is read, and
 * asserted on the *last* key, because an order that is total in the middle and
 * loose at the end is loose.
 */
/*
  AND EVERYWHERE ELSE, A TRUNCATED QUERY AT LEAST SAYS WHERE TO CUT.

  The check below holds `lib/progress/` to a total order, because a figure drawn
  from those rows has to be the same figure twice. The rest of the app was held
  to nothing, and five reads had drifted to a `take` with no `orderBy` at all,
  which is not a weaker version of the rule: it is the plan choosing which rows
  the screen is built from. Today's weakest cases took an arbitrary five
  thousand; the government drill and the minimal-pairs round each took an
  arbitrary two thousand cards to decide which words were already in the deck,
  so whether an answer graded a real card changed between visits; the class week
  counted three figures off an arbitrary three hundred; and the dictionary's
  suggestion row shuffled an arbitrary two hundred.

  This asks only for an order, not for a unique one. Ending every truncated read
  in the app on the primary key is a larger change than this rule needs to be
  useful, and where a screen orders by `due` and cuts, arbitrary-but-stated
  still beats arbitrary-and-silent. The stricter rule stays where a number is
  derived.
*/
check("a truncated query outside the progress layer still says where to cut", () => {
  let looked = 0;
  const silent: string[] = [];

  for (const file of [...APP, ...LIB]) {
    if (file.includes(join("lib", "progress"))) continue;
    const src = code(file);
    for (const found of src.matchAll(/\.findMany\(\{/g)) {
      let depth = 0;
      let end = found.index + found[0].length - 1;
      for (let i = end; i < src.length; i += 1) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      const block = src.slice(found.index, end + 1);
      if (!/\btake:/.test(block) && !/\bskip:/.test(block)) continue;
      looked += 1;
      if (!/\borderBy:/.test(block)) {
        silent.push(`${file}:${src.slice(0, found.index).split("\n").length}`);
      }
    }
  }

  assert.deepEqual(
    silent, [],
    `${silent.join(", ")} cuts a query short without saying where to cut, so which rows `
    + "the screen is built from is the plan's choice rather than anybody's",
  );
  assert.ok(looked > 20, `only ${looked} truncated reads found, so this check stopped looking`);
});

check("a truncated query in the progress layer ends on the primary key", () => {
  const dir = join("lib", "progress");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes(".itest."));
  assert.ok(files.length > 3, `only found ${files.length} files, so this check stopped looking`);

  let looked = 0;
  for (const file of files) {
    const src = code(join(dir, file));
    for (const found of src.matchAll(/\.findMany\(\{/g)) {
      // The block this call opens, by brace depth.
      let depth = 0;
      let end = found.index + found[0].length - 1;
      for (let i = end; i < src.length; i += 1) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      const block = src.slice(found.index, end + 1);
      if (!/\btake:/.test(block) && !/\bskip:/.test(block)) continue;
      looked += 1;

      const line = src.slice(0, found.index).split("\n").length;
      const where = `lib/progress/${file}:${line}`;
      /*
        The outermost `orderBy`, not a relation's. A nested one (`forms:
        { orderBy: ... }`) sorts rows inside one parent and is never the thing
        `take` cuts, so matching the first `orderBy:` in the text would read
        the wrong one and pass.
      */
      const top = /\n    orderBy:\s*(\[[\s\S]*?\]|\{[\s\S]*?\}),/.exec(block)
        ?? /orderBy:\s*(\[[\s\S]*?\]|\{[^{}]*\}),/.exec(block);
      assert.ok(top, `${where} takes a slice of an unordered query, so which rows it gets is Postgres's choice`);
      assert.match(
        top[1]!.replace(/\s+/g, " "),
        /\{ id: "(asc|desc)" \} *\]$|^\{ id: "(asc|desc)" \}$/,
        `${where} orders on ${top[1]!.replace(/\s+/g, " ")} and then cuts. None of those keys is unique, ` +
        "so two tied rows are ordered by whatever the plan did that day. End it on { id: \"asc\" }.",
      );
    }
  }
  assert.ok(looked > 8, `only ${looked} truncated queries found, so this check stopped looking`);
});

/**
 * THE FUNDING PAGE PRICES THE TUTOR OUT OF THE APP'S OWN LEDGER.
 *
 * `/funding` projects what a month costs at a given number of learners, and
 * the one line on it that could run away is the model. The app already answers
 * that question twice a second: `lib/usage/pricing.ts` says what a call of a
 * given shape costs, and `lib/usage/quota.ts` says what everybody together may
 * spend in a day, with no off switch. A projection that priced a tutor answer
 * with a number of its own would be a second answer to a question this
 * repository has already answered, and the two would come apart the first time
 * anybody tuned the reservation.
 *
 * That is not hypothetical about this file in particular: the reservation
 * profile it reads used to live inside `ledger.ts`, next to Prisma, where a
 * pure module could not reach it. It moved into the pricing table rather than
 * being copied, which is the whole reason this check can exist.
 *
 * Anchored on the calls rather than on the imports, because a file can import
 * the ledger's numbers and then use its own beside them.
 */
check("the funding model prices a call the way the ledger prices one", () => {
  const model = code(join("lib", "funding", "services.ts"));

  assert.match(
    model,
    /reserveMicros\(/,
    "lib/funding/services.ts no longer asks the pricing table what a call costs, so its model line " +
    "and the app's ledger are two guesses about one number.",
  );
  assert.match(
    model,
    /DEFAULT_LIMITS\.dailyMicrosGlobal/,
    "lib/funding/services.ts no longer reads the app's own daily spend cap, so it can project " +
    "a bill the running app would refuse to run up.",
  );
  /*
    A per-token rate typed in here would be the drift this exists to prevent,
    and it is the shape somebody reaches for when the import gets awkward.
  */
  assert.doesNotMatch(
    model,
    /PerMTok|per[ _]?million[ _]?tokens/i,
    "lib/funding/services.ts has grown a token price of its own. Rates live in lib/usage/pricing.ts.",
  );
});

/**
 * A PRICE ON THE FUNDING PAGE CARRIES THE PAGE IT CAME OFF.
 *
 * Every figure on `/funding` is one of three things: measured on this
 * repository, published by a vendor, or an assumption. The published ones date
 * fastest and are the only ones a reader has no way to check for themselves,
 * so each carries a source and the day it was read, and the page renders both.
 *
 * A price with no link is the failure mode this stops, and it is a quiet one:
 * the number stays plausible for years after the vendor changed it, on a page
 * whose entire claim is that its numbers can be checked.
 */
check("every price the funding page quotes links to where it came from", () => {
  const page = read(join("app", "funding", "page.tsx"));
  const facts = readFileSync(join("lib", "funding", "facts.ts"), "utf8");

  const sources = [...facts.matchAll(/source:\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1]!);
  assert.ok(sources.length >= 4, `only found ${sources.length} priced sources, so this check stopped looking`);

  /*
    Counted rather than matched by URL, and the first version of this matched
    by URL and failed honestly. The page renders `{VERCEL.ref.source}` rather
    than the address itself, which is the right way round: an address typed
    into the page is a second copy of it, and the two would disagree the day
    a vendor moved their pricing page. So what is asserted is that every
    priced source is rendered *through* its reference.
  */
  const linked = [...page.matchAll(/\.ref\.source/g)].length;
  assert.ok(
    linked >= sources.length,
    `lib/funding/facts.ts prices ${sources.length} sources and the funding page links ${linked}. ` +
    "A price with no link is a number a reader is asked to take on trust.",
  );

  assert.match(
    page,
    /PRICES_CHECKED|MEASURED_ON/,
    "the funding page no longer says when its numbers were taken, which is the half that dates.",
  );
});

/**
 * A PUBLIC PAGE THAT READS THE ENVIRONMENT READS IT AS A YES OR A NO.
 *
 * `/funding` says which parts of the infrastructure this deployment has
 * switched on, which it can only know by looking at the environment, and
 * several of those variables are API keys. The page is public and needs no
 * session, so a `process.env` read that reached a rendered string would put a
 * credential in front of anybody with the URL. The bundle scan in CI cannot
 * see this one: nothing is shipped to the client, the value is simply printed
 * by the server.
 *
 * So the rule is the shape rather than the intent. `lib/funding/` reads the
 * environment not at all, and the page reads it in exactly one place, through
 * a helper that can only return a boolean. Two reads is where the second one
 * stops being a boolean.
 */
check("the funding page reads the environment once, and only for a yes or a no", () => {
  for (const file of sourceFiles(join("lib", "funding"))) {
    if (file.includes(".test.")) continue;
    assert.doesNotMatch(
      code(file),
      /process\.env/,
      `${file} reads the environment. lib/funding is a pure layer and the page is the only ` +
      "place allowed to ask what this deployment has configured.",
    );
  }

  const page = code(join("app", "funding", "page.tsx"));
  const reads = [...page.matchAll(/process\.env/g)];
  assert.equal(
    reads.length,
    1,
    `app/funding/page.tsx reads process.env ${reads.length} times. One helper returning a ` +
    "boolean is the whole allowance: this page is public and several of those variables are keys.",
  );
  assert.match(
    page,
    /Boolean\(process\.env\[[^\]]+\]\?\.trim\(\)\)/,
    "the funding page's environment read is no longer wrapped in Boolean(), so it can render a key.",
  );
});

/**
 * THE INFRASTRUCTURE LIST NAMES VARIABLES THAT DO SOMETHING.
 *
 * `lib/funding/services.ts` is a catalogue of what this app runs on, and each
 * entry that can be switched on names the variable that switches it. A name
 * that nothing in the app reads is worse than no name: the page prints "not
 * set here" for ever, whoever is running it sets the variable, and nothing
 * changes.
 *
 * Checked against the source rather than against a list, so renaming a
 * variable fails here rather than in a reader's eyes a year later.
 */
check("every variable the funding page names is one the app actually reads", () => {
  /*
    The schema is in the haystack because `DATABASE_URL` is read by Prisma's
    own `env()` rather than by anything in `app/` or `lib/`, and leaving it out
    made this check fail on the most load-bearing variable in the app.
  */
  const everywhere = [
    ...ALL, join("middleware.ts"), join("next.config.ts"), join("prisma", "schema.prisma"),
  ].map((f) => read(f)).join("\n");

  const named = [...read(join("lib", "funding", "services.ts")).matchAll(/setBy:\s*"([A-Z_0-9]+)"/g)]
    .map((m) => m[1]!);
  assert.ok(named.length >= 4, `only found ${named.length} named variables, so this check stopped looking`);

  for (const key of named) {
    assert.ok(
      new RegExp(
        `process\\.env\\.${key}\\b|process\\.env\\["${key}"\\]|\\benv\\.${key}\\b|env\\("${key}"\\)`,
      ).test(everywhere),
      `lib/funding/services.ts says ${key} switches something on, and nothing in the app reads it. ` +
      "The page would print \"not set here\" whatever anybody configured.",
    );
  }
});

/**
 * WHAT IT COSTS IS PUBLIC, LIKE WHAT IT STORES.
 *
 * `/privacy` and `/terms` are outside the sign-in gate because somebody has to
 * be able to read what an app holds about them before they hand it anything.
 * The funding page is the same question pointed at the money, and the readers
 * most likely to want it (somebody deciding whether to fund this, and somebody
 * deciding whether to trust a free app) have no account here at all.
 */
check("the funding page is readable without signing in", () => {
  const middleware = code("middleware.ts");
  assert.match(
    middleware,
    /path\.startsWith\("\/funding"\)/,
    "middleware.ts no longer lets /funding through, so the page about what this costs is " +
    "behind the sign-in it exists to explain.",
  );
});

/**
 * THE BILL IS GENERATED FROM THE REGISTRY, NEVER ASSEMBLED BESIDE IT.
 *
 * What this app runs on, what a reader is told it runs on, and what appears on
 * the bill used to be three lists: a catalogue in one module, a set of
 * hand-written line functions in the cost model, and whatever the page had
 * been told about. Adding a service meant remembering all three, and the one
 * certain to go stale is the bill, because nothing fails when a line is
 * missing from a total. It simply comes out lower than the truth, which is the
 * worst way for a page like this to be wrong.
 *
 * So `lib/funding/services.ts` is the list, and everything downstream maps
 * over it. This is what makes adding a new tool one edit, and it is exactly
 * the property that decays the first time somebody finds it quicker to special
 * case one service in the page.
 */
check("the funding bill is generated from the registry rather than a list beside it", () => {
  const model = code(join("lib", "funding", "model.ts"));
  assert.match(
    model,
    /SERVICES\.map\(/,
    "lib/funding/model.ts no longer maps over the registry, so a service added to it " +
    "would not reach the bill.",
  );

  /*
    And nothing downstream names a service. Anchored on the ids rather than on
    the vendor names, because the page is allowed to *write about* Vercel in a
    sentence and is not allowed to single it out in the arithmetic.
  */
  const ids = [...read(join("lib", "funding", "services.ts")).matchAll(/^\s{4}id: "([a-z]+)",$/gm)]
    .map((m) => m[1]!);
  assert.ok(ids.length >= 6, `only found ${ids.length} services, so this check stopped looking`);

  for (const file of [join("app", "funding", "page.tsx"), join("app", "funding", "CostExplorer.tsx")]) {
    const source = code(file);
    assert.match(
      source,
      /\.map\(/,
      `${file} draws no list, so it cannot be reading the registry.`,
    );
    for (const id of ids) {
      assert.doesNotMatch(
        source,
        new RegExp(`["']${id}["']`),
        `${file} singles out the "${id}" service by name. Everything on this page is drawn ` +
        "from lib/funding/services.ts, so that a tool added there appears without touching a screen.",
      );
    }
  }
});

/**
 * NOTHING THIS APP RUNS ON IS COUNTED AS FREE.
 *
 * The first version of the funding page modelled a free tier for the host and
 * one for the database and picked between them by traffic. It described a
 * deployment nobody runs: a free plan pauses when nobody is on it, forbids
 * commercial use, and hands out an allowance that disappears the week somebody
 * launches. What it produced was a page that said this app costs nothing to
 * run at a hundred learners, which was cheerful and wrong.
 *
 * The rule now is that a service is charged, or it is inside another charge,
 * or somebody other than the operator pays for it and the page says who. There
 * is no fourth answer, and in particular a service that sends no invoice is
 * priced at what the same thing costs elsewhere rather than at nothing.
 *
 * Asserted on the shape of the tables, because that is where a free tier comes
 * back: somebody adds a cheaper plan object beside the paid one and a branch to
 * pick it.
 */
check("the funding page keeps no free tier for anything it is billed for", () => {
  const facts = code(join("lib", "funding", "facts.ts"));

  for (const [pattern, what] of [
    [/\bhobby\s*:/i, "a Hobby tier"],
    [/\bfree\s*:\s*\{/i, "a free tier"],
    [/name:\s*"(Free|Hobby)"/i, "a plan named Free or Hobby"],
  ] as const) {
    assert.doesNotMatch(
      facts,
      pattern,
      `lib/funding/facts.ts has grown ${what}. Nothing this app runs on is modelled as free: ` +
      "a plan that pauses, forbids commercial use, or hands out an allowance is not what " +
      "anybody hosting this for other people is on.",
    );
  }

  /*
    And the cost shape itself has no way to say "free". Four answers, and the
    ones that read as nothing have to say who is paying or who is giving.
  */
  const types = code(join("lib", "funding", "types.ts"));
  for (const [shape, what] of [
    [/kind: "charged"/, "a charged shape"],
    [/kind: "notOurs"/, "a way to say who else pays"],
    [/kind: "given"/, "a way to credit what is given"],
  ] as const) {
    assert.match(types, shape, `the funding cost type no longer has ${what}`);
  }
  assert.doesNotMatch(
    types,
    /kind: "free"/,
    "the funding cost type has grown a free shape, which is the thing this page exists to avoid.",
  );
});

/**
 * WHAT IS GIVEN IS CREDITED, AND NEVER BILLED.
 *
 * Ekilex, Wiktionary and TartuNLP are public institutions that have decided
 * this work should be available, and they ask for nothing. An earlier version
 * of this page priced them at what the same thing costs commercially and added
 * it to the total, which turns a thing to be grateful for into a line on an
 * invoice nobody sent.
 *
 * So a `given` service names what it gives and is kept out of every total.
 * Where there is a commercial equivalent the page may say what buying it would
 * come to, and that figure lives in `wouldCostUsd`, which no total reads. The
 * two halves of the rule pull in opposite directions, which is why both are
 * asserted: a charged service may never be free, and a given one may never be
 * charged for.
 */
check("what is given to this app is credited rather than added to the bill", () => {
  const services = code(join("lib", "funding", "services.ts"));

  /*
    Anchored on the shape of a returned cost: a `given` branch that also
    carried a `usd` would be back to charging for the gift, and it is the exact
    edit somebody makes when they want the total to look complete.
  */
  for (const match of services.matchAll(/kind: "given",([\s\S]{0,600}?)\n      \};/g)) {
    const body = match[1]!;
    assert.doesNotMatch(
      body,
      /\busd:/,
      "a given service in lib/funding/services.ts carries a `usd`. Public infrastructure that " +
      "asks for nothing is credited, not billed: the figure for what it would cost belongs in " +
      "`wouldCostUsd`, which no total reads.",
    );
    assert.match(
      body,
      /gives:/,
      "a given service names no gift. Crediting is the whole of what this shape is for.",
    );
  }

  const model = code(join("lib", "funding", "model.ts"));
  assert.match(
    model,
    /creditedUsd/,
    "lib/funding/model.ts no longer counts what is given, so the page cannot show the size of it.",
  );
  /*
    The one line that would undo all of it: adding the credit into the total.
  */
  assert.doesNotMatch(
    model,
    /totalUsd \+?= [^;\n]*creditedUsd|creditedUsd[^;\n]*\+ totalUsd/,
    "lib/funding/model.ts adds what is given into the total somebody is billed. It is credit, " +
    "not a charge.",
  );
});

/**
 * The layers that are pure are still pure, which nothing was checking.
 *
 * CLAUDE.md names the directories that "stay free of React, Next.js and
 * Prisma: pure functions, unit tested", and that was prose alone. All of them
 * hold today, which is the moment to assert it rather than the moment after
 * one of them stops.
 *
 * It is not a tidiness rule. The unit suite gates every commit on being
 * hermetic, with no database, no network and no clock nobody controls, and it
 * has to stay fast enough that nobody is tempted to skip it. One
 * `import { prisma }` inside `lib/stats/` puts a database behind a function
 * that four hundred unit tests call, and the suite does not fail: it gets
 * slower, or it passes against whatever rows happen to be there. A React
 * import is the same boundary from the other side, since these modules are
 * what a Server Component and a Route Handler share.
 *
 * The directories are listed rather than discovered, because "which layers are
 * pure" is a decision rather than a fact about the filesystem, and each is
 * checked to exist so a rename fails here instead of silently covering
 * nothing.
 */
check("the layers that promise to be pure import no database, React or Next", () => {
  const pure = [
    "assessment", "estonian", "exam", "games", "gamification", "stats", "collections", "time",
    "offline", "security", "scan", "questions", "ux", "random", "copy", "funding", "research",
    "learn", "scenes", "readiness",
  ];
  const banned = [
    [/from "@\/lib\/db"/, "the database"],
    [/from "@prisma\/client"/, "Prisma"],
    [/from "react"|from "react\//, "React"],
    [/from "next\//, "Next"],
    [/from "server-only"/, "a server-only marker, which is a Next concern"],
  ] as const;

  let looked = 0;
  for (const name of pure) {
    const dir = join("lib", name);
    assert.ok(
      existsSync(dir),
      `lib/${name} is named as a pure layer and is not there. Rename it here or put it back.`,
    );
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      if (file.includes(".test.") || file.includes(".itest.")) continue;
      looked += 1;
      const src = code(join(dir, file));
      for (const [pattern, what] of banned) {
        assert.doesNotMatch(
          src,
          pattern,
          `lib/${name}/${file} imports ${what}. That layer is unit tested hermetically, ` +
          "so anything needing the database belongs in lib/progress/ or a route.",
        );
      }
    }
  }
  assert.ok(looked > 40, `only read ${looked} files in the pure layers, so this check stopped looking`);
});

/**
 * Nothing hands a raw error message back to a browser.
 *
 * `restoreBackup` and `deleteMyAccount` both end in "and nothing was changed"
 * followed by whatever the database said, which is the right shape: those are
 * the two operations where somebody is owed a reason. What the database says
 * is the problem. Prisma quotes the datasource in an initialisation failure,
 * and a restore runs a two-minute transaction, which is exactly the window a
 * connection drops in, so the sentence on a learner's Settings screen could
 * carry the deployment's own host, user and password.
 *
 * `redact` in lib/observability already knows a DSN is a credential, because
 * the error log has to be safe to post to a webhook. A message rendered in
 * somebody's browser is at least as public as that log, and it was the one
 * path not going through it. `safeMessage` is that function plus a length, and
 * this asserts every `"use server"` export uses it rather than reaching for
 * `.message` itself.
 *
 * Read comment-blind, and scoped to the file that is a public endpoint by
 * definition: every export of `app/actions.ts` is reachable by anybody who can
 * POST to a page path.
 */
check("no server action returns an error message it has not redacted", () => {
  const actions = code(join("app", "actions.ts"));
  assert.match(actions, /"use server"/, "app/actions.ts is not a server action file any more");

  const raw = [...actions.matchAll(/\berror(?:\s+instanceof\s+Error\s*\?)?\s*\.?message\b/g)];
  for (const found of raw) {
    const line = actions.slice(0, found.index).split("\n").length;
    assert.fail(
      `app/actions.ts:${line} puts an error's own message into a value the browser reads. ` +
      "Use safeMessage from lib/observability/report: a Prisma failure can name the " +
      "deployment's database host, user and password.",
    );
  }

  assert.match(
    actions,
    /safeMessage\(/,
    "app/actions.ts explains no failure at all any more, which is the dead end SuggestFix exists for",
  );

  /*
    And the helper still redacts. A `safeMessage` that stopped calling `redact`
    would satisfy the name and nothing else, which is this repository's oldest
    lesson about checks.
  */
  const reporter = code(join("lib", "observability", "report.ts"));
  assert.match(
    reporter,
    /function safeMessage[\s\S]{0,400}?redact\(/,
    "safeMessage no longer redacts, so the name is the only thing protecting the connection string",
  );
});

/**
 * The worker's caches have ceilings too.
 *
 * `lib/audio/clipCache.ts` exists because "a cache of object URLs that never
 * revokes one is a leak with a hit rate", and its invariant watches components
 * that mint an object URL. One layer down, the service worker had exactly the
 * same shape twice over and nothing was watching either: speech is a WAV per
 * phrase and review plays audio on nearly every card, so a phone kept every
 * clip it had ever heard, and the build-output cache was worse, because
 * `_next/static` names are hashed per build while the cache name is typed by
 * hand, so every deploy added a set of chunks and nothing ever removed the
 * previous one's.
 *
 * The consequence is not a slow app, it is a lost fallback: when the browser
 * finally evicts storage for an origin it takes all of it, and /offline is the
 * one entry in here with nothing behind it.
 *
 * So every cache the worker writes to has a ceiling, except the shell, whose
 * exemption is the point rather than an oversight: it holds /offline, and
 * trimming the thing that has no fallback is what a ceiling must never do.
 */
check("every cache the service worker writes to is bounded, except the one that must not be", () => {
  const sw = read(join("public", "sw.js"));

  const names = [...sw.matchAll(/^const (SHELL|STATIC|PAGES|AUDIO) = /gm)].map((m) => m[1]);
  assert.ok(names.length >= 4, `expected the worker's four caches, found ${names.join(", ") || "none"}`);

  const limits = sw.match(/const LIMITS = \{([^}]*)\}/)?.[1] ?? "";
  for (const name of names) {
    if (name === "SHELL") {
      assert.ok(
        !new RegExp(`\\[${name}\\]`).test(limits),
        "the shell cache has a ceiling, so /offline can be evicted to make room for a chunk",
      );
      continue;
    }
    assert.match(limits, new RegExp(`\\[${name}\\]:\\s*\\d+`), `${name} has no ceiling`);
  }

  // And every write is followed by a trim. A ceiling nothing enforces is a
  // comment, which is what the previous version of this file amounted to.
  const puts = [...sw.matchAll(/cache\.put\([^)]*\)/g)].length;
  const trims = [...sw.matchAll(/trim\(/g)].length;
  assert.ok(
    trims >= puts,
    `${puts} cache writes and only ${trims - 1} trims, so at least one cache grows without a ceiling`,
  );

  // The version is what clears whatever a previous one accumulated, and
  // `activate` is the only thing that has ever removed a stale entry here.
  assert.match(sw, /const VERSION = "kodukeel-v\d+"/, "the worker's caches are no longer versioned");
  assert.match(
    sw,
    /keys\.filter\(\(k\) => k\.startsWith\("kodukeel-"\) && !k\.startsWith\(VERSION\)\)/,
    "activate stopped deleting the caches of previous versions",
  );
});

/**
 * A route that spends something is a route with a ceiling in front of it.
 *
 * `lib/security/rateLimit.ts` opened by saying "three of them do" and naming
 * three, and there were five by then. That drift is exactly how `/api/write`
 * ended up without one: it is `/api/exam/write` with a different prompt, its
 * twin has been throttled since the day it landed, and the only difference
 * between them was which had been written first. Meanwhile `/api/restore` read
 * a body of any size the caller liked and handed it to `JSON.parse` before
 * anything had counted the request.
 *
 * The ledger is what actually bounds the spend, and this is not a second
 * ledger. It is the thing that refuses an obvious loop before it makes a
 * database round trip per attempt, and the only ceiling at all on the routes
 * the ledger does not price: speech, the share card, the export and the
 * restore.
 *
 * Read from the routes rather than from the prose, on the shape of the ledger
 * check above and for the same reason: a paragraph kept four of these honest
 * and did not catch the fifth.
 */
check("a route that spends something is throttled", () => {
  const routes = APP.filter((file) => /[\\/]api[\\/].*route\.tsx?$/.test(file));
  assert.ok(routes.length >= 8, `only found ${routes.length} route handlers, so this check stopped looking`);

  /*
    Exempt, each for a reason that is a fact about the route:

    metrics  carries its own bearer token, 404s when none is configured, and is
             read by whoever runs the deployment rather than by a learner.
    research is the same shape and the same reader, and the expensive work is
             behind the token rather than in front of it: with no token set the
             route 404s having read one environment variable, and with one set
             the only caller who can reach the queries is the person who holds
             the deployment's own secret. A per-owner bucket is also the wrong
             instrument here, since there is no owner to resolve: the caller is
             not a learner and `requireUserId` would have nothing to say.
    reminder is one indexed read and some string building, so a ceiling there
             would be met by a person tapping twice and by nobody else, which
             is the same argument `lib/security/actionLimits.ts` makes about
             grading a card.
  */
  const exempt = new Set(["metrics", "reminder", "research"]);

  for (const file of routes) {
    const name = file.split(/[\\/]/).slice(-2, -1)[0] ?? file;
    if (exempt.has(name)) continue;
    const source = code(file);
    assert.match(
      source,
      /checkRateLimit\(/,
      `${file} does per-call expensive work with no ceiling in front of it`,
    );
    /*
      And charged to the learner rather than to their address. Twenty-five
      students on one school network are one IP, so an address bucket would
      refuse a whole classroom in its first few seconds.
    */
    assert.match(
      source,
      /bucketForOwner\(|bucketForRequest\(/,
      `${file} throttles against something other than the account it resolved`,
    );
  }

  /*
    And the file that reads a whole upload states a ceiling on it. Without one
    `request.text()` reads whatever arrives, which is one signed-in account
    away from holding an arbitrary amount of a server's memory per request.
  */
  const restore = code(join("app", "api", "restore", "route.ts"));
  assert.match(restore, /MAX_BACKUP_BYTES/, "the restore route reads an upload of any size again");
  assert.match(restore, /content-length/, "the restore route no longer refuses an oversized upload before reading it");
});

/**
 * Every route group has a loading state.
 *
 * `docs/08-ux-ia-a11y.md` §4 asks each view for four states, and CLAUDE.md
 * repeats it: "A view without an empty state is not finished." Loading is one
 * of the four and it is the one a route group can lose wholesale, because it
 * is a file rather than a branch in a component. `app/(app)/` had one. The
 * chromeless group and the two policy pages had none, so the landing page,
 * sign-in, first run, /privacy and /terms each showed a blank screen until
 * their data arrived.
 *
 * First run is the worst of those to lose. It builds a whole level check on
 * the server before rendering, which is a handful of queries paid for
 * deliberately, and what it showed for the length of them was nothing at all,
 * as the first screen this app puts in front of anybody.
 *
 * Checked per group rather than per page, because that is the granularity
 * Next resolves a `loading.tsx` at and therefore the granularity at which one
 * can go missing.
 */
check("every route group says it is loading rather than showing nothing", () => {
  /*
    A directory owns a loading state if it or an ancestor up to `app/` has one.
    Only directories that hold a page need one; a bare segment inherits.
  */
  const owners = new Set(
    APP.filter((file) => /[\\/]loading\.tsx$/.test(file)).map((file) => file.replace(/[\\/]loading\.tsx$/, "")),
  );

  const covered = (dir: string): boolean => {
    let at = dir;
    for (;;) {
      if (owners.has(at)) return true;
      const up = at.replace(/[\\/][^\\/]+$/, "");
      if (up === at || up.length < "app".length) return false;
      at = up;
    }
  };

  for (const file of APP.filter((f) => /[\\/]page\.tsx$/.test(f))) {
    const dir = file.replace(/[\\/]page\.tsx$/, "");
    // The offline page is static by construction and renders from the service
    // worker's cache, where there is nothing to wait for.
    if (dir.endsWith("offline")) continue;
    assert.ok(covered(dir), `${file} has no loading state above it, so a slow request shows a blank screen`);
  }
});

/**
 * The screen a learner spends the round on has a heading too.
 *
 * A browser run only ever sees the state the database happens to produce, and
 * that is precisely what hid this. Every one of these files renders three or
 * four screens from one component: an empty state, sometimes a start screen,
 * the round itself, and a finished screen. The empty and finished ones each
 * carried an `h1`, so an accessibility run that met an empty deck saw a
 * heading and passed, and a run against a full one saw none. The whole set was
 * caught in two passes for that reason: five modes on a deck with cards in it,
 * and four more the next time the fixture put them into a different state.
 *
 * So it is asserted from the source, where every branch is visible at once,
 * rather than from whichever branch a fixture happened to render. Anchored on
 * the visually hidden heading, because on these screens that is what the rule
 * has to mean: there is nothing on a progress bar and a card that a visible
 * heading could be added to without taking space from the card, which is why
 * they were written without one.
 */
check("a practice round has a heading, not only its empty and finished screens", () => {
  const sessions = APP.filter((file) =>
    /[\\/]review[\\/].*Session\.tsx$/.test(file));
  assert.ok(
    sessions.length >= 10,
    `only found ${sessions.length} review session components, so this check stopped looking`,
  );

  for (const file of sessions) {
    assert.match(
      code(file),
      /<h1 className="sr-only">/,
      `${file} renders a round with no heading on it; only its empty or finished screen has one`,
    );
  }
});

/**
 * A date is written the way the reader writes dates.
 *
 * `lib/time/clock.ts` pins the hour and deliberately leaves date order and
 * month names to the reader, "because those are genuinely theirs". That is
 * true of a client component and was false of the two places this app
 * formatted a date on the server, where `undefined` as a locale means the
 * deployment's: on a machine set to en-US, Today's greeting line read "Sunday,
 * August 30" to a learner in Tartu who writes "pühapäev, 30. august".
 *
 * The same class of mistake as the day boundary and one notch less severe,
 * because it is the shape of a reading rather than which day it names. It is
 * checked separately because the fix is different: a zone can be stored and
 * passed to the server, and a locale is a list of preferences that only the
 * browser has.
 */
/*
  A MISSING EXAMPLE IS NEWS. A PHRASE HAVING NONE IS NOT.

  Ekilex records a usage against a *word*, to illustrate it in a sentence, so
  the twenty entries the A1 greetings unit teaches have none and never will:
  `Tere!`, `Aitäh!`, `Kuidas läheb?`, `Ma ei saa aru` are already the sentence.
  Both screens that report an absence reported theirs. The first meeting said
  "No example sentence for this one yet" on the first twenty cards a beginner
  ever sees, and the dictionary entry went further and promised that one "shows
  up the first time you look this word up", which nothing was ever going to
  keep.

  So a screen that tells somebody an example is missing has to know the
  difference, and `isPhrase` in `lib/dict/pos.ts` is where that difference
  lives. Anchored on the copy rather than on the two filenames, because the next
  screen to grow an empty state for examples is the one this is for.
*/
/*
  A DATASET SAYS WHICH VALUES ITS COLUMNS ACTUALLY TAKE.

  `GradationType` allows `QUANTITATIVE` and `classifyGradation` has never
  returned it, on any of the 5,363 entries the dictionary ships. That is the
  language rather than an omission: Estonian's third quantity is not written
  down, so `kooli` the genitive and `kooli` the partitive are the same letters
  and a classifier reading forms as strings cannot tell them apart. What is
  spelled is the consonant centre changing, which is what the field records.

  `lib/research/sections.ts` describes the exported crosstab to somebody
  outside this project, and it named all three, so a researcher was told the
  column takes a value no row has ever held. The two are paired here: the day
  the classifier learns to assign it, this fails and the description has to
  catch up, which is the only way a note about data stays true of the data.
*/
check("the research note names the gradation values the classifier assigns", () => {
  const classifier = code(join("lib", "estonian", "gradation.ts"));
  const note = read(join("lib", "research", "sections.ts"));
  const assigns = /type:\s*"QUANTITATIVE"/.test(classifier);
  const saysNoRowHasIt = /no row carries it/.test(note);
  assert.equal(
    assigns, !saysNoRowHasIt,
    assigns
      ? "lib/estonian/gradation.ts now assigns QUANTITATIVE, so lib/research/sections.ts must stop "
        + "telling a researcher that no row carries it."
      : "lib/estonian/gradation.ts assigns only NONE and QUALITATIVE, so lib/research/sections.ts "
        + "has to say so: a column described as three-valued whose third value no row holds is a "
        + "dataset note that is not true of the dataset.",
  );
});

/*
  A MATCHING BOARD IS UNIQUE BY WHAT IT ASKS WITH, NOT BY WHAT IT ANSWERS.

  313 words carry a picture and there are 249 pictures: 🏠 is `maja` and
  `elamu`, 🚌 is `buss` and `autobuss`, 👨 is `mees`, `meesisik` and
  `meesterahvas`, fifty of them in all. That is the table being right; Estonian
  has more than one word for plenty of things and `scripts/build-emoji.ts` has
  no business choosing between two true ones.

  `/review/emoji` is a matching board, so the picture is the question and two
  words sharing one put the same tile up twice against two different forms,
  with no way for the learner to tell which goes with which. Getting it wrong
  then marks a card they knew. Both of its pickers deduplicated on the lemma,
  which cannot see this, because the two really are different words.

  Anchored on the pairing rather than on either line: a picker that writes a
  word down has to write its picture down too, so a third one cannot be added
  knowing only half the rule.
*/
/*
  A CHARACTER A READER CANNOT SEE IS WRITTEN DOWN BY NAME.

  `lib/research/corpus.ts` joined a cell's key parts on a NUL, which is the
  right separator (it cannot occur inside a dimension value, so two keys collide
  only if they really are the same key) and was typed as the byte itself. A
  literal control character makes the file **binary** to every text tool that
  reads it: `grep` stops printing matches and says "binary file matches"
  instead, which is how this was found, by searching that very file for its
  anonymity floor and getting no lines back. `git diff` and a review go the same
  way, and an editor or a paste can drop one leaving no visible change.

  Twice in one session a literal control character got into a file here and
  changed what a regular expression matched, invisibly, both times through a
  heredoc: a `\b` written in a Python string is a backspace, and the check it
  was in could no longer fire on anything. `"\\0"` and `"\\b"` are the same
  strings at runtime and leave a text file on disk. It is the argument
  `DASH_SEPARATED` already makes: a character a reader cannot see is named
  rather than pasted.

  Tab, newline and carriage return are how a text file is laid out and are
  allowed. `lib/auth/access.test.ts` is exempt by name, because the NUL in it is
  the thing under test: it checks that a path with one embedded is refused, and
  writing that as an escape would be testing a different string.
*/
check("no source file holds a control character it could have named", () => {
  const EXCUSED = new Map([
    ["lib/auth/access.test.ts", "The NUL is the subject: it checks that a path with one embedded is refused."],
  ]);
  const NAMED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

  for (const file of [...ALL, ...sourceFiles("scripts"), ...sourceFiles("prisma")]) {
    if (EXCUSED.has(file)) continue;
    const raw = read(file);
    const at = raw.search(NAMED);
    if (at < 0) continue;
    const code = raw.charCodeAt(at);
    assert.fail(
      `${file}:${raw.slice(0, at).split("\n").length}: holds U+${code.toString(16).padStart(4, "0")} `
      + "as a literal character. Write it as an escape: a control character makes the file binary to "
      + "grep and to git diff, and an editor can drop it leaving no visible change.",
    );
  }

  // And the exemption stays honest: an entry for a file that no longer holds
  // one is a parking space for the next person who wants to paste a byte.
  for (const [file] of EXCUSED) {
    assert.match(read(file), NAMED, `${file} no longer holds a control character, so its exemption is stale`);
  }
});

check("the emoji board is unique by picture as well as by word", () => {
  const file = join("app", "(app)", "review", "emoji", "page.tsx");
  const source = code(file);
  const words = (source.match(/usedLemmas\.add\(/g) ?? []).length;
  const pictures = (source.match(/usedEmoji\.add\(/g) ?? []).length;
  assert.ok(words > 0, `${file}: no longer tracks which words are on the board`);
  assert.equal(
    pictures, words,
    `${file}: ${words} places put a word on the board and ${pictures} put its picture down. `
    + "A picture stands for more than one word 50 times in lib/collections/emoji.ts, and this is a "
    + "matching board, so the same tile would appear twice against two different forms.",
  );
  assert.ok(
    /usedEmoji\.has\(/.test(source),
    `${file}: writes down which pictures are used and never asks, so nothing is deduplicated.`,
  );
});

check("a screen that reports a missing example knows a phrase is not one", () => {
  const POS_HOME = "lib/dict/pos.ts";
  assert.match(
    code(POS_HOME), /export function isPhrase\(/,
    `${POS_HOME} stopped answering whether an entry is a whole utterance`,
  );

  let screens = 0;
  for (const file of [...APP, ...COMPONENTS]) {
    const source = code(file);
    if (!/No example sentences? /.test(source)) continue;
    screens++;
    /*
      The answer, however it reached the screen. A client component is handed
      it by its page rather than calling the predicate itself, which is the
      right way round: the review card's own page already narrows what crosses
      the wire and is the only side holding the entry's part of speech. What
      may not happen is a screen reporting the absence without the answer in
      its hands at all.
    */
    assert.match(
      source, /\bisPhrase\b/,
      `${file}: tells a reader an example sentence is missing without asking whether the entry `
      + `is a phrase. Ekilex records a usage against a word, so a phrase has none and never `
      + `will, and saying it is missing reports a gap in the dictionary that is not there. `
      + `Ask isPhrase() from ${POS_HOME}.`,
    );
  }
  assert.ok(screens >= 2, `only ${screens} screens report a missing example; this check has stopped looking`);

  /*
    AND THE ANSWER IS THE PREDICATE'S, NOT A COMPARISON SOMEBODY WROTE OUT.
    A page that hands a screen `isPhrase: entry.pos === "PHRASE"` is a second
    copy of the one fact, and it is the copy that stops agreeing the day the
    dictionary grows another kind of whole utterance. Whoever writes the field
    imports the function that decides it.
  */
  for (const file of [...APP, ...COMPONENTS]) {
    const source = code(file);
    /*
      A value being written, not the field's type on the interface that
      declares it: `isPhrase: boolean` is the shape, `isPhrase: isPhrase(pos)`
      is the answer, and only the second one decides anything.

      Read as a capture and compared, rather than as a negative lookahead after
      `\s*`: the lookahead backtracks to zero width and passes on the very
      declaration it was written to skip, which is how this check first failed
      on a file holding no decision at all.
    */
    const written = [...source.matchAll(/\bisPhrase\s*:\s*([A-Za-z_$][\w$]*)/g)]
      .map((m) => m[1])
      .filter((token) => token !== "boolean");
    if (written.length === 0) continue;
    assert.match(
      source, /import \{[^}]*\bisPhrase\b[^}]*\} from "@\/lib\/dict\/pos"/,
      `${file}: writes an isPhrase field without importing the predicate from ${POS_HOME}, so `
      + `it is deciding what a phrase is on its own.`,
    );
  }
});

check("a date is written in the reader's own locale, not the server's", () => {
  for (const file of [...APP, ...COMPONENTS]) {
    const source = code(file);
    /*
      Only a call that leaves the locale to the runtime. A literal locale is a
      deliberate choice and is usually not about a date at all: the landing
      page writes a word count with `toLocaleString("en-GB")` so the thousands
      separator does not move about, which is the opposite of this fault.
    */
    /*
      THREE SPELLINGS, NOT ONE. This asked only about `toLocaleString`, which
      is one of the three ways to write a date here and the one nobody uses
      twice: `lib/time/clock.ts` exports `formatDateTime` and `formatTime`
      precisely so a screen does not have to write the options out, and both
      end in `Intl.DateTimeFormat(undefined, …)` with no `timeZone`. So four
      server components went straight through a check whose own header says
      what they were doing wrong, and a learner in Tallinn who sat a paper at
      01:30 read "2 Sept, 22:30" on the exam hub, the result page, their own
      reports and the level check. The wrong hour is a nuisance. The wrong day
      on a page whose subject is when something happened is not.

      A bare `new Intl.DateTimeFormat()` is left alone, because that is how
      `TimeZoneSync` asks the browser which zone it is in and it formats
      nothing.
    */
    const LEFT_TO_THE_RUNTIME =
      /toLocale(?:Date|Time)?String\(\s*(?:undefined|\))|\bformat(?:DateTime|Time)\(|new Intl\.DateTimeFormat\(\s*undefined/;
    if (!LEFT_TO_THE_RUNTIME.test(source)) continue;
    /*
      A client component is the reader's own machine, so there is nothing to
      get wrong there. Anywhere else the call has to be handed to one, which
      is what `LocalDate` is: a server rendering that a browser replaces with
      its own on mount. A file that formats on the server AND mounts a
      LocalDate is the shape of that fix, since the server's rendering is the
      fallback.
    */
    if (/^\s*"use client"/m.test(read(file))) continue;
    /*
      EVERY SUCH CALL, NOT THE FILE.

      This used to ask whether the file mentions `<LocalDate` anywhere, and a
      file that hands one date to the browser and formats two others itself
      passed. `app/(app)/class/[classroomId]/page.tsx` was exactly that: the
      joined date went through `LocalDate` with a server-rendered fallback,
      and the classwork history three sections above formatted `createdAt` and
      `dueAt` on the server and shipped them as text. A teacher in Tartu read
      their own homework list as "30 Aug".

      So each call is checked where it stands. The legitimate one is the
      `fallback` a `LocalDate` renders while it waits, which is what the server
      is *supposed* to write, and it is the only shape that passes.
    */
    const call =
      /toLocale(?:Date|Time)?String\(\s*(?:undefined|\))|\bformat(?:DateTime|Time)\(|new Intl\.DateTimeFormat\(\s*undefined/g;
    for (let m = call.exec(source); m; m = call.exec(source)) {
      const before = source.slice(Math.max(0, m.index - 160), m.index);
      assert.ok(
        /fallback=\{?$|fallback=\{[^}]*$/.test(before),
        `${file}: formats a date on the server outside a LocalDate fallback, so it is written `
        + `in the deployment's locale rather than the reader's. Hand it to <LocalDate>, with `
        + `this rendering as its fallback.`,
      );
    }
  }

  const local = code(join("components", "LocalDate.tsx"));
  assert.match(local, /^\s*"use client"/m, "LocalDate stopped being a client component");
  assert.match(local, /fallback/, "LocalDate no longer renders what the server wrote while it waits");

  /*
    AND THE FALLBACK IS WRITTEN IN THE LEARNER'S ZONE, WHICH IS THE HALF THE
    RULE ABOVE CANNOT SEE. A server rendering handed to `LocalDate` is only
    right for a couple of hundred milliseconds either way; what it must not do
    is name the wrong *day*, and it will whenever the deployment's zone is not
    the reader's, which on Vercel is everybody. `DateText` is the pairing:
    one set of options for the fallback and for the client formatter, in the
    zone `learnerDayClock` resolved, so the two cannot drift and neither can
    be written without the zone.
  */
  const dateText = code(join("components", "DateText.tsx"));
  assert.ok(
    !/^\s*"use client"/m.test(dateText),
    "DateText became a client component, so nothing writes the server's rendering any more",
  );
  assert.match(
    dateText, /timeZone: zone/,
    "DateText stopped writing its fallback in the learner's zone, so the server can name the wrong day",
  );
  assert.match(
    dateText, /hourCycle: "h23"/,
    "DateText stopped pinning the hour, so a browser in en-US would read the time back in am and pm",
  );
});

/*
  A CONTROL LOOKS LIKE A CONTROL, AND A CHOSEN ONE LOOKS CHOSEN.

  Three faults, one cause: there was no primitive for "pick one of these", so
  every screen that asked invented its own answer and two of the three were
  wrong.

  The worst was a bare `<button>` wrapped round a `<Chip>`. A chip is the
  app's *label*: it is what the dictionary uses to say "B1" and "verb", and it
  carries no border, no shadow and no hover. Eight of them in a row under a
  heading read as a legend, so first run, the screen that decides a learner's
  year, did not read as a form at all. Selection swapped `--raised` for
  `--accent-soft`, which on the dark theme is two percent of lightness: the
  answer to the question was being carried by a difference somebody could look
  straight at and not see. And every option carried `aria-pressed`, so eight
  mutually exclusive answers announced as eight unrelated switches and cost
  eight tab stops.

  `components/Choice.tsx` is the one answer now, and its states live in
  `.choice` in app/globals.css rather than in a `style` prop, because an inline
  style beats a stylesheet and a control that paints its resting look inline
  can never define a hover. That is not a detail: it is the mechanism that made
  the missing hover unfixable in place.

  Asserted as a shape rather than as today's markup: a chip inside a button is
  the fault, wherever it appears.
*/
/**
 * Every `<button …>` opening tag in a source file, with what follows it.
 *
 * A regex cannot do this and the first version of the two checks below proved
 * it by passing over a deliberately reintroduced fault: `<button[^>]*>` ends
 * at the first `>` it meets, and `onClick={() => pick(x)}` puts one inside the
 * tag. Both checks then matched an empty prefix and found nothing. So the tag
 * ends at the first `>` outside any brace, which is where JSX actually ends it.
 */
function buttonTags(source: string): { tag: string; after: string }[] {
  const out: { tag: string; after: string }[] = [];
  for (let i = source.indexOf("<button"); i !== -1; i = source.indexOf("<button", i + 1)) {
    let depth = 0;
    for (let j = i + 7; j < source.length; j += 1) {
      const c = source[j];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) {
        out.push({ tag: source.slice(i, j + 1), after: source.slice(j + 1, j + 400) });
        break;
      }
    }
  }
  return out;
}

check("an option a learner picks is a control, not a label in a button", () => {
  for (const file of [...APP, ...COMPONENTS]) {
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    for (const { tag, after } of buttonTags(read(file))) {
      assert.ok(
        !/^\s*(?:\{[^{}]*\}\s*)?<Chip\b/.test(after),
        `${file} wraps a Chip in a button (${tag.slice(0, 60)}…): a chip is a label and has ` +
        "no pressable state. Use ChoiceChip from components/Choice.tsx.",
      );
    }
  }

  // And the primitive still has the three things that make it one.
  const choice = read("components/Choice.tsx");
  assert.match(choice, /role: "radio"/, "the single-select group stopped being a radio group");
  assert.match(choice, /"aria-pressed"/, "the multi-select group stopped being toggle buttons");
  assert.match(choice, /tabIndex = r === stop \? 0 : -1/, "the radio group lost its roving tab stop");

  for (const name of [".choice-btn", ".choice-chip[data-on]", ".choice-card[data-on]", ".choice-btn:hover"]) {
    assert.ok(CSS.includes(name), `app/globals.css no longer defines ${name}`);
  }
});

/*
  A HOVER MAKES A CONTROL MORE PRESENT, NEVER LESS.

  Twenty-odd controls carried `transition-opacity hover:opacity-80` as their
  entire hover state: the multiple-choice options in two practice modes, the
  self-rating buttons on the level check, the starred words in the dictionary,
  the case rows on three screens, the delete buttons in two lists. Fading a
  thing under the pointer is the one hover the rest of this interface uses for
  nothing else, because dimming is exactly how every disabled control here is
  drawn. So the strongest signal a mouse got on those screens was the control
  appearing to switch off, which is worse than no hover at all. `.choice-btn`
  and `.tap-tint` in app/globals.css are the two replacements, and `.choice-btn`
  is main's rather than this branch's: two sessions found the same fault the
  same day from different ends, and a custom property is the better way to let
  a caller's tone through a class hover.

  The exemption is a link, and it is deliberate rather than a hole: an `<a>`
  fading slightly is the oldest link hover there is, and a `<button>` that is
  drawn as underlined text is a link wearing the right element. So the rule is
  written against `<button>` and reads the underline, rather than being
  switched off per file.
*/
check("a hover makes a control more present, never less", () => {
  for (const file of [...APP, ...COMPONENTS]) {
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    for (const { tag } of buttonTags(read(file))) {
      if (!/hover:opacity-/.test(tag)) continue;
      assert.match(
        tag,
        /\bunderline\b/,
        `${file} fades a button on hover, which is how this app draws "disabled". ` +
        "Use .choice-btn (a box) or .tap-tint (a bare row or icon) from app/globals.css.",
      );
    }
  }

  for (const name of [".choice-btn:hover", ".tap-tint:hover"]) {
    assert.ok(CSS.includes(name), `app/globals.css no longer defines ${name}`);
  }
});

/**
 * A control the 44px floor makes bigger still centres what is inside it.
 *
 * The floor is a `min-width` and a `min-height`, and an inline box lays its
 * content out from the top left, so on an icon-only button all of the slack
 * lands on two sides. Measured in a browser at 390px, the cross on the phone's
 * More sheet sat six pixels left of the middle of the circle it was drawn in,
 * and every other icon-only control that had not thought to say `flex` for
 * itself was drawn the same way. It reads as a rendering fault because it is
 * one.
 *
 * Asserted as the pairing rather than as one rule: a floor that inflates a box
 * with no rule centring the box's content is the state that produced this, and
 * a later edit that keeps the floor and drops the centring would put it back.
 */
check("a control inflated to the tap-target floor centres its own content", () => {
  const floor = /@media\s*\(pointer:\s*coarse\)\s*\{[^]*?min-width:\s*2\.75rem/;
  assert.match(CSS, floor, "the 44px tap-target floor is gone from app/globals.css");

  /*
    Every block whose selector reaches an icon-only control, not merely the
    first: the coarse-pointer floor names the same shape now, so matching the
    first one found the floor's own declarations and reported the centring
    rule missing while it sat ten lines below.
  */
  const blocks = [...CSS.matchAll(/:has\(>\s*svg:only-child\)[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
  assert.ok(blocks.length > 0, "nothing in app/globals.css reaches an icon-only control");
  const centred = blocks.find((b) => b.includes("display: inline-flex"));
  assert.ok(centred, "nothing in app/globals.css centres an icon-only control's content");
  for (const declaration of ["display: inline-flex", "align-items: center", "justify-content: center"]) {
    assert.ok(
      centred.includes(declaration),
      `the icon-only rule no longer sets ${declaration}, so the floor's slack lands on one side`,
    );
  }
});

/**
 * A pointer over something pressable says so.
 *
 * Tailwind 3's preflight put `cursor: pointer` on every button. Tailwind 4's
 * hands the element back to the browser, whose default for a `<button>` is the
 * arrow, and this app is built almost entirely out of real buttons: the rail,
 * the practice chips, the four rating keys, the multiple-choice answers, the
 * letter bar and every close cross drew the same arrow as the paragraph beside
 * them. The only things in the whole interface that changed under a mouse were
 * the handful of plain `<a href>`s, so a learner working out what is pressable
 * by hovering it was told "nothing here", everywhere, wrongly.
 *
 * Asserted as the shape rather than as the selector list, because the way this
 * comes back is somebody restoring it on a class. `.press` and `.tap-tint` are
 * how a control moves, which is not the same set as the controls that can be
 * pressed, and a rule keyed on one of them reaches only the controls that
 * remembered to ask for it. A control is covered here by being a control.
 */
check("a pointer over something pressable says so", () => {
  const css = code(join("app", "globals.css"));
  const pointer = css.match(/([^{}]*)\{\s*cursor:\s*pointer;\s*\}/);
  assert.ok(
    pointer,
    "nothing in app/globals.css gives a control a pointer cursor, and Tailwind 4's " +
    "preflight does not either, so every button in the app draws the arrow",
  );

  const selector = pointer[1]!;
  for (const control of ["button", '[role="button"]', "summary", 'input[type="checkbox"]']) {
    assert.ok(
      new RegExp(`(^|[,\\s])${control.replace(/[[\]"^$.*+?()|{}\\]/g, "\\$&")}\\s*(,|$)`, "m").test(selector),
      `the pointer-cursor rule no longer reaches ${control}`,
    );
  }
  assert.ok(
    !/\.[a-zA-Z]/.test(selector),
    "the pointer cursor is keyed on a class, so it reaches only the controls that " +
    "remembered to carry it. Key it on what a control is.",
  );

  /*
    And a disabled control goes back to the arrow rather than to a rebuke.
    Everything disabled in this app is waiting for the learner (a send button
    with an empty box, a rating key before the answer is shown), never refusing
    them.
  */
  const off = css.match(/([^{}]*)\{\s*cursor:\s*default;\s*\}/);
  assert.ok(off, "app/globals.css no longer takes the pointer back off a disabled control");
  assert.match(off[1]!, /:disabled/, "the disabled-cursor rule stopped reading :disabled");
  assert.match(
    off[1]!, /\[aria-disabled="true"\]/,
    'the disabled-cursor rule stopped reading [aria-disabled="true"], which is how ' +
    "this app disables anything that is not a form control",
  );
  assert.ok(
    !css.includes("not-allowed"),
    "a control is drawn as refusing the learner. Nothing here refuses them; use the arrow.",
  );
});

/**
 * The accessibility sweep is axe, and it runs in both themes.
 *
 * This suite spent its whole life describing itself as "not a substitute for
 * axe". That was honest and it was also the reason five real failures sat in
 * the app unseen: the hand-rolled contrast pass scoped to `main`, so the
 * navigation rail on every signed-in screen was outside it, and it read a
 * colour's own alpha but not an `opacity` inherited from a parent, so a faded
 * container reported as passing while its text sat at 2.63. axe found both in
 * one run, plus an `<ol>` whose `<li>`s were behind a wrapper `div` and which
 * therefore announced itself as an empty list.
 *
 * Asserted here because the alternative is a suite that quietly goes back to
 * checking what it finds easy. `best-practice` is part of it on purpose: that
 * is the tag the broken list came in under, and a list that says it is empty
 * is not a matter of taste.
 */
check("the accessibility sweep runs axe, over both themes", () => {
  const suite = code(join("scripts", "a11y-check.mjs"));
  assert.match(suite, /axe-core\/axe\.min\.js/, "the a11y suite no longer loads axe");
  assert.match(suite, /window\.axe\.run\(/, "the a11y suite loads axe and never runs it");
  assert.match(
    suite, /"best-practice"/,
    "axe runs without best-practice, which is the tag the broken list came in under",
  );
  /*
    The dark palette is chosen, never inherited, so the suite stores the choice
    the way the toggle does rather than emulating a system preference the
    stylesheet no longer reads; the theme invariant near the end of this file
    is the other half of that.
  */
  assert.match(
    suite, /localStorage\.setItem\("theme", "dark"\)/,
    "the a11y suite stopped sweeping the dark palette, which is half of what ships",
  );
  // Both themes get the same sweep, so neither can be the one nobody looks at.
  const runs = [...suite.matchAll(/axeViolations\(/g)].length;
  assert.ok(runs >= 3, `axe is invoked ${runs} times; light and dark each need one plus the helper`);

  const pkg = JSON.parse(read("package.json")) as { devDependencies?: Record<string, string> };
  assert.ok(pkg.devDependencies?.["axe-core"], "axe-core is not a dependency, so CI cannot run it");
});

/*
  A figure shaped for a screen is never a divisor.

  `project` rounded the learner's pace to one decimal place and then divided
  the published hours by it. Three minutes a day three days a week is 0.15
  hours; it was shown and used as 0.2, which is a third more study than the
  learner said they would do and took a quarter off the weeks the app alone
  would need. The rule is that the projection is exact and `PlanPanel` rounds
  on the way to a tile, so the check is that the arithmetic module does no
  rounding at all and the panel does some.
*/
check("the plan is arithmetic on exact figures, rounded only on its way to a screen", () => {
  const plan = read("lib/assessment/plan.ts");
  const projectBody = plan.slice(plan.indexOf("export function project("));
  assert.doesNotMatch(
    projectBody.slice(0, projectBody.indexOf("\nexport function weeksNeeded")),
    /Math\.round\(/,
    "project() rounds a figure it goes on to divide by, which is the fault this rule exists for",
  );
  const panel = read("components/assessment/PlanPanel.tsx");
  assert.match(
    panel, /Math\.round\(n \* 10\) \/ 10/,
    "PlanPanel no longer rounds, so an exact projection reaches a tile with every decimal it has",
  );
});

/*
  The headline and the sentence under it are one claim.

  "It fits, but only with study outside this app" was drawn at ten hours a week
  measured against the optimistic end of the range, while the note under it
  quoted the distance at five found hours a week. 335 of the 704 combinations a
  learner could click said the plan fitted over a sentence saying the date was
  years out. Both read one figure now, and the figure is no longer a constant:
  it is what the learner's own week holds, built by `foundHours` from the
  baseline plus the reasons they gave, drawn against by the verdict inside
  `project`, and quoted by the panel off the projection it gets back. The
  panel doing the arithmetic itself, with a number of its own, is the exact
  shape the fault took; so is the panel quoting the baseline constant, which
  would be right for somebody abroad and wrong for everybody the change was
  made for.
*/
check("the verdict band and the found-hours sentence read one figure", () => {
  const plan = read("lib/assessment/plan.ts");
  assert.match(
    plan, /export const FOUND_HOURS_PER_WEEK/,
    "the baseline found-hours figure has stopped being a named constant",
  );
  assert.match(
    between(code("lib/assessment/plan.ts"), "export function foundHours"), /FOUND_HOURS_PER_WEEK/,
    "foundHours no longer starts from the baseline, so a learner with no exposure is told their week holds nothing",
  );
  const verdictLine = plan.slice(plan.indexOf("const verdict: Verdict"), plan.indexOf("const verdict: Verdict") + 300);
  assert.match(verdictLine, /found\.low/, "the verdict band no longer reads the least the learner's week holds");
  assert.match(verdictLine, /found\.high/, "the verdict band no longer reads the most the learner's week holds");
  const panel = code("components/assessment/PlanPanel.tsx");
  assert.doesNotMatch(
    panel, /weeksNeeded\(/,
    "PlanPanel is doing the found-hours arithmetic itself again rather than reading it off the projection",
  );
  assert.doesNotMatch(
    panel, /FOUND_HOURS_PER_WEEK/,
    "PlanPanel quotes the baseline constant rather than the learner's own found hours",
  );
  assert.match(panel, /plan\.weeksWithFound/, "PlanPanel no longer quotes the weeks the projection computed");
  assert.match(panel, /plan\.found\b/, "PlanPanel no longer quotes the found hours the verdict was drawn against");
});

/*
  A plan is built on a standing, never on a bare level.

  A level a paper measured and a level a stranger ticked ninety seconds into
  the app are the same letter and are not worth the same distance, and for a
  year every caller handed the panel the letter alone. `Standing` carries how
  the level was arrived at, and the measured kind carries the per skill
  levels, so a learner who reads at B2 and listens at A1 is costed skill by
  skill rather than as a B1. The rule is asserted at the door: every
  `<PlanPanel>` in the tree passes a standing, `/assess` gets its standing
  from the same timestamp rule the course opens on (`currentLevelAnswer`), so
  the plan and the course cannot disagree about whether a learner was measured,
  and nobody outside `lib/progress/level.ts` compares those two timestamps.
*/
check("a plan is built on a standing that says how the level was arrived at", () => {
  const callers = ALL.filter((f) => /<PlanPanel\b/.test(code(f)));
  assert.ok(callers.length >= 2, "PlanPanel is rendered from fewer screens than it was");
  for (const file of callers) {
    const src = code(file);
    for (const use of src.match(/<PlanPanel\b[^>]*>/g) ?? []) {
      assert.match(use, /\bstanding=\{/, `${file} renders PlanPanel without a standing: ${use}`);
      assert.doesNotMatch(use, /\blevel=\{/, `${file} hands PlanPanel a bare level again: ${use}`);
    }
  }
  assert.match(
    code("app/(app)/assess/page.tsx"), /standingFor\(/,
    "/assess stopped asking standingFor, so its plan can disagree with the level the course opens on",
  );
  const level = code("lib/progress/level.ts");
  assert.match(level, /export async function currentLevelAnswer/, "the one level rule has lost its name");
  assert.match(between(level, "export async function courseLevelFor"), /currentLevelAnswer\(/,
    "courseLevelFor no longer reads the shared rule, so the course and the plan hold two answers");
  const elsewhere = ALL.filter((f) =>
    f !== "lib/progress/level.ts"
    && /cefrPlacementAt[\s\S]{0,400}takenAt|takenAt[\s\S]{0,400}cefrPlacementAt/.test(code(f)));
  assert.deepEqual(elsewhere, [], "a second file compares the declared level's timestamp with the check's, which is the two-answers fault again");
});

/*
  The pace the plan quotes is the pace the log records, read once.

  `Review.durationMs` and `reviewedAt` are written on every grade, so a
  fortnight in, the app knows what a learner actually does and quoting what
  they said instead is the app choosing not to look. `measuredPace` in
  `lib/stats/pace.ts` is the one reading of that, `lib/progress/plan.ts` is
  the one caller that fetches rows for it, and the sitting it counts in is the
  same ten minutes `perfect_session` uses, defined once: a sitting cannot be
  one length for a badge and another for a plan.
*/
check("the plan's pace is read off the review log through one module, in one sitting length", () => {
  const progress = code("lib/progress/plan.ts");
  assert.match(progress, /durationMs:\s*true/, "measuredPaceFor stopped selecting the durations it measures with");
  assert.match(progress, /measuredPace\(/, "measuredPaceFor no longer hands its rows to lib/stats/pace.ts");
  assert.match(code("app/(app)/assess/page.tsx"), /measuredPaceFor\(/, "/assess no longer reads the learner's real pace");
  const gaps = ALL.filter((f) => /export const SESSION_GAP_MS\s*=/.test(code(f)));
  assert.deepEqual(gaps, ["lib/stats/pace.ts"], `the sitting length is defined in ${gaps.join(", ")}; it is one figure`);
  assert.match(code("lib/progress/session.ts"), /from "@\/lib\/stats\/pace"/, "the badge's session stopped reading the shared sitting length");
});

/*
  The hours table is derived, not typed, and its surcharge is a shape.

  `CUMULATIVE_HOURS` used to be five literals with a paragraph explaining that
  they were "close to double" the published figures. A literal table can drift
  from its own explanation without anything noticing; a table built from the
  published hours and a factor per step cannot, and the factor's shape, the
  surcharge peaking where the morphology is, is asserted in plan.test.ts. This
  only checks the table has not gone back to being typed.
*/
check("the hours table is built from published hours and a per-step factor", () => {
  const plan = code("lib/assessment/plan.ts");
  assert.match(plan, /export const CUMULATIVE_HOURS[^=]*=\s*buildCumulative\(\)/, "CUMULATIVE_HOURS is a typed table again");
  assert.match(plan, /export const GUIDED_LEARNING_HOURS/, "the published hours are no longer named");
  assert.match(plan, /export const ESTONIAN_FACTOR/, "the surcharge is no longer a table of its own");
});

/*
  One pace per card, and the log replaces it.

  The plan budgeted three cards a minute and Today's "about N minutes" divided
  by six, so the screen somebody opens every morning promised half the time the
  plan was allowing for the same cards. `DEFAULT_CARDS_PER_MINUTE` is defined
  once, every screen that turns cards into minutes goes through
  `minutesForCards`, and a learner with a fortnight of log gets their own rate
  rather than either constant.
*/
check("cards become minutes through one rate, measured where the log has one", () => {
  const defs = ALL.filter((f) => /export const DEFAULT_CARDS_PER_MINUTE\s*=/.test(code(f)));
  assert.deepEqual(defs, ["lib/stats/pace.ts"], `the default cards-a-minute figure lives in ${defs.join(", ")}`);
  const today = code("app/(app)/page.tsx");
  assert.match(today, /minutesForCards\(/, "Today no longer turns cards into minutes through the shared rate");
  assert.match(today, /measuredPaceFor\(/, "Today no longer reads the learner's measured pace");
  assert.doesNotMatch(
    between(today, "function lead("), /\/\s*\d+\s*\)/,
    "Today's lead divides the cards due by a literal again; the rate is the learner's own or the shared default",
  );
  assert.match(
    between(code("components/assessment/PlanPanel.tsx"), "export function minutesFor"), /minutesForCards\(/,
    "PlanPanel's minutesFor keeps a rate of its own again",
  );
});

/*
  The distance on Today and on the exam hub is the plan's, off the same
  projection, in the plan's own sentence.

  Today's countdown said how likely a pass was that morning and the hub said
  how many weeks were left, and neither said whether the pace this learner
  keeps arrives by then. Both print `distanceLine` over `project` now, built
  from `standingFor`, the reasons and the measured pace, so a learner cannot
  read one timeline on the level check screen and another on Today.
*/
check("Today and the exam hub print the plan's distance off the plan's own projection", () => {
  const countdown = code("lib/progress/countdown.ts");
  for (const name of ["project(", "distanceLine(", "standingFor(", "foundHours("]) {
    assert.ok(countdown.includes(name), `lib/progress/countdown.ts no longer calls ${name}`);
  }
  assert.match(code("components/ExamCountdown.tsx"), /countdown\.distance/, "the countdown card no longer prints the distance");
  const hub = code("app/(app)/exam/page.tsx");
  for (const name of ["project(", "distanceLine(", "standingFor(", "measuredPaceFor("]) {
    assert.ok(hub.includes(name), `the exam hub no longer calls ${name}`);
  }
  // Nobody phrases the distance for a screen by hand: the sentence is the plan's.
  const rephrased = ALL.filter((f) =>
    f !== "lib/assessment/plan.ts" && !/\.(i)?test\.ts$/.test(f)
    && /weeksWithFound[^\n]*weeks (away|off)/.test(code(f)));
  assert.deepEqual(rephrased, [], "a screen writes its own sentence over weeksWithFound rather than reading distanceLine");
});

/*
  Anu is told how the level is known and what Estonian the learner lives in.

  A tutor told "B1" and nothing else treats a guess and a measurement alike,
  and a briefing that names the learner's situation reads it off the same
  reasons table the plan prints, so she and the plan cannot describe one
  learner two ways.
*/
check("Anu's briefing reads the shared level rule and the reasons table", () => {
  const context = code("lib/progress/tutorContext.ts");
  assert.match(context, /currentLevelAnswer\(/, "learnerContextFor no longer asks how the level is known");
  assert.match(context, /describeSituation\(/, "learnerContextFor no longer reads the situation off the reasons table");
  const note = between(code("lib/tutor/prompt.ts"), "export function learnerNote");
  assert.match(note, /standing/, "learnerNote no longer says how the level is known");
  assert.match(note, /situation/, "learnerNote no longer says what Estonian the learner lives in");
  const phrases = ALL.filter((f) => f !== "lib/assessment/goals.ts" && /"live in Estonia"/.test(code(f)));
  assert.deepEqual(phrases, [], "a situation phrase is typed outside the reasons table");
});

// ── Checks about the checks ──────────────────────────────────────────────────

check("anything a model wrote carries the mark the terms page promises", () => {
  /*
    `/terms` says what the AI suggests "is marked *AI · verify* and needs your
    confirmation". That is a promise on a page somebody can hold the app to, so
    every screen showing a model's words has to actually say it.

    It had already drifted. Six places said `AI · verify` and three said a bare
    `AI` with the rest in a `title`, which is a hover: this app is measured at
    360px and its README leads with "works on a phone", where a hover does not
    exist, so on the grammar case page, the dictation round and the dictionary's
    own examples the useful half of the tag was not there at all. The word that
    matters is `verify`, because `AI` says where a sentence came from and
    `verify` says what to do about it.

    One constant, read from `lib/copy/values.ts`, on the argument `NO_VALUE`
    already makes next to it: a phrase retyped in nine places drifts in one of
    them, and this one had. Asserted as "nobody retypes it" rather than "the
    string is right", because a literal is exactly how it came apart.

    AND IT READS THE CODE, NOT THE PROSE, which it did not. Both halves used
    `read`, so a comment explaining why a word is marked `AI · verify` counted
    as a screen that draws it, and a comment naming the phrase failed the check
    outright. That is the oldest recurring mistake in this repository's own
    checks and this is the fifth time: the marker sweep whose haystack included
    the list of markers, the `AI_TAG` assertion that matched its own import
    line, the lemma check that fired on a paragraph describing the query it had
    removed, and the suite whose comment satisfied a check looking for a call.
    `code()` is what strips them.
  */
  const tagged = [...APP, ...COMPONENTS].filter((f) => code(f).includes("AI_TAG"));
  assert.ok(
    tagged.length >= 6,
    `only ${tagged.length} screens read AI_TAG; the tag is being written some other way`,
  );

  const retyped = [...APP, ...COMPONENTS].filter((f) => /AI\s*·\s*verify/.test(code(f)));
  assert.deepEqual(
    retyped, [],
    `the AI tag is typed out rather than read from lib/copy/values: ${retyped.join(", ")}`,
  );

  /*
    And no screen marks a model's words with a bare `AI` and leaves the rest to
    a tooltip, which is the shape the three drifted ones had.
  */
  const bare = [...APP, ...COMPONENTS].filter((f) =>
    /<Chip[^>]*title="Machine translation[^"]*">\s*AI\s*<\/Chip>/.test(read(f)));
  assert.deepEqual(
    bare, [],
    `a machine translation is marked "AI" with its meaning in a hover: ${bare.join(", ")}`,
  );

  /*
    The terms page has to be making the promise this is holding it to.

    Asserted on the rendered `{AI_TAG}` rather than on the token, and with the
    imports stripped first: the first version matched the import line, so it
    passed on a terms page that had stopped saying it. A check that cannot fail
    is the thing this file exists to prevent, and writing one while adding a
    check is a good argument for the discipline of taking each new rule away
    once and watching it complain.
  */
  const terms = read("app/terms/page.tsx").replace(/^import [^\n]*\n/gm, "");
  assert.match(
    terms,
    /\{AI_TAG\}/,
    "the terms page stopped naming the mark, so there is no promise to keep",
  );
});

check("every marker the merge ritual names is still somewhere in the tree", () => {
  /*
    CLAUDE.md ends its section on more than one session at a time with a list of
    markers to grep for after a merge, learned from an afternoon when two clean
    conflict-free merges each silently reverted somebody's work: git had no
    reason to ask, because one side changed lines the other side had moved.

    It was good guidance that depended entirely on a person remembering to run
    it, which is the same shape as every rule this file exists to take out of
    prose. So the list is read from CLAUDE.md rather than copied here: a copy is
    the drift `PROVIDER_KEY_ENV` was consolidated to prevent, and a list that
    can fall behind the paragraph naming it is worse than no list.

    This is deliberately the blunt question, "is it still here at all", not
    "does it still work" — most of these have an invariant of their own further
    up, and the ones that do not are markers precisely because what they protect
    is hard to assert. A marker that vanished in a merge is the one thing a
    machine can see that a reviewer reading a green diff cannot.

    CLAUDE.md is not in the haystack, and that is the whole check: the list
    names each marker in backticks, so searching a corpus that includes the list
    finds every marker in the list by definition and passes for ever. The first
    version of this did exactly that, and the way it was found is the way this
    repository says to find it, by renaming a marker and watching nothing fail.
  */
  const claude = read("CLAUDE.md");
  const ritual = between(claude, "Grep the markers the branch owns");
  const markers = [...ritual.slice(0, ritual.indexOf("Most of them now"))
    .matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

  assert.ok(
    markers.length >= 25,
    `only ${markers.length} markers parsed out of CLAUDE.md; the list or its wording moved`,
  );

  const haystack = [
    ...ALL, ...sourceFiles("scripts", /\.(ts|tsx|mjs)$/), ...sourceFiles("prisma"),
    "middleware.ts", "next.config.ts", "app/globals.css",
  ].filter((f) => existsSync(f)).map(read).join("\n");

  const gone = markers.filter((marker) => !haystack.includes(marker));
  assert.deepEqual(
    gone, [],
    `named in the merge ritual and no longer anywhere in the tree: ${gone.join(", ")}`,
  );
});

check("every script a workflow runs is a script that exists", () => {
  /*
    The invariants already assert that a browser suite CI can run is one CI does
    run. One layer up, nothing checked the workflow files themselves: a job
    calling `npm run test:whatever` after somebody renamed the script fails at
    the point where a failure looks like the code being broken, and a job that
    quietly stopped being the thing it claims to run does not fail at all.

    Both directions, because they are different faults. A workflow naming a
    script that is gone is a broken job; a `scripts/*` path that no longer
    exists is the same thing wearing the other spelling.
  */
  const workflows = sourceFiles(".github/workflows", /\.ya?ml$/);
  assert.ok(workflows.length >= 1, "no workflow files found, so this check is looking in the wrong place");
  const yaml = workflows.map(read).join("\n");

  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  /*
    npm's own flags come between `run` and the script name, so they are
    consumed rather than captured: `npm run --silent audit:decks` names
    `audit:decks`, and the first version of this read `--silent` as a script
    and failed on a workflow that was perfectly correct. A check that fires on
    honest code is a check people learn to waive, so the rule widened rather
    than the workflow contorting to suit it.
  */
  const named = [...new Set(
    [...yaml.matchAll(/npm run (?:-{1,2}[a-z][\w-]*\s+)*([a-z][\w:-]*)/g)].map((m) => m[1]!),
  )];
  const missing = named.filter((name) => !(name in scripts));
  assert.deepEqual(missing, [], `a workflow runs an npm script that no longer exists: ${missing.join(", ")}`);

  const paths = [...new Set([...yaml.matchAll(/scripts\/([\w.-]+\.(?:mjs|ts))/g)].map((m) => m[1]!))];
  assert.ok(paths.length >= 5, `only ${paths.length} script paths found in the workflows; the pattern moved`);
  const absent = paths.filter((file) => !existsSync(join("scripts", file)));
  assert.deepEqual(absent, [], `a workflow runs a script file that is not there: ${absent.join(", ")}`);
});

// ── A deck is counted by building it, and built in a bounded number of queries ─

/*
  THE NUMBER ON THE SCREEN AND THE DECK IT DESCRIBES COME FROM ONE PLACE.

  First run offered a starter deck and printed `words * 2` under it as the card
  count. Two is what a unit that drills nothing builds: a recognition card and a
  production card. Every A1 unit but the first also drills seven cases and up to
  two recorded sentences, so the deck it was describing as 104 cards was 404, and
  a learner budgeting their evenings off that number was out by a factor of four
  before they started. Measured across the course the multiplier runs from 2.00
  to 10.94, which is the argument against any constant at all: it is a property
  of the unit and of what the dictionary happens to hold for each word.

  So the count is `previewUnits`, which runs the same generator the deck builder
  runs and counts what comes out. This asserts the arithmetic did not come back
  rather than asserting today's markup: a screen offering a deck may not
  multiply a word count by anything.
*/
check("a deck is counted by building it, not by a cards-per-word guess", () => {
  const wizard = code("app/(chromeless)/start/WelcomeWizard.tsx");
  const page = code("app/(chromeless)/start/page.tsx");

  assert.match(
    page, /previewUnits\(/,
    "first run stopped counting its starter deck with previewUnits, so its card count is a guess again",
  );
  assert.doesNotMatch(
    wizard, /\bword(Count|s)\s*\*\s*\d/,
    "first run is multiplying a word count into a card count again; cards per word runs 2 to 11 across the course",
  );
  assert.doesNotMatch(
    code("lib/assessment/plan.ts"), /\*\s*2\s*;/,
    "weeksToLearn is doubling a word count again; it takes cards for the same reason",
  );
});

/*
  AND THE BUILD IS A FIXED NUMBER OF QUERIES, NOT ONE PER WORD.

  `completeOnboarding` used to call `addUnitToDeck` in a loop, and that resolved
  the session again, read the dictionary a word at a time, read the learner's
  cards a word at a time and revalidated three paths, per unit. Six units of
  eighteen words measured 330 queries against 5 for the same 982 cards. On a
  socket that is half a second; on a hosted database at a 25ms round trip it is
  eight seconds of latency before anything else, and it was reported as the
  screen having hung. It is the one place in the app where a stranger is asked
  to wait with nothing to look at, so the loop may not come back.
*/
check("first run builds a deck in a fixed number of queries, not one set per word", () => {
  const actions = code("app/actions.ts");
  const onboarding = between(actions, "export async function completeOnboarding");

  assert.match(
    onboarding, /addUnitsToDeck\(/,
    "completeOnboarding stopped using the batched builder",
  );
  assert.doesNotMatch(
    onboarding, /for\s*\([^)]*\)\s*\{[\s\S]{0,400}?addUnitToDeck\(/,
    "completeOnboarding is calling addUnitToDeck in a loop again, which is a session check and three reads per unit",
  );

  const deck = code("lib/srs/deck.ts");
  assert.doesNotMatch(
    between(deck, "export async function addUnitsToDeck"),
    /for\s*\([^)]*\)\s*\{[\s\S]{0,300}?await\s+prisma\.lexeme\./,
    "the deck builder is reading the dictionary inside a loop, which is the shape it was written to remove",
  );
  assert.match(
    deck, /INSERT_CHUNK/,
    "the deck builder inserts unchunked; a whole level is over 2000 rows and Postgres binds at most 65535 parameters",
  );
});

/*
  A duration is read in the unit that makes it honest.

  The plan's pace tile printed hours to one decimal place, so nine minutes a
  week came out as "0.2h", which is twelve, and the shortfall note reached
  "roughly 0 to 0 hours a week" on a real 1.3 minutes. `lib/time/duration.ts`
  picks minutes below an hour and hours above, and steps a range down a unit
  rather than rounding its smaller end to a zero it is not.

  The rule asserted is that the pace is never printed except through that
  module: `weeksNeeded` may take the raw figure because it divides by it rather
  than showing it, and everything else has to go through the formatter.
*/
check("the plan reads a duration through the one module that units it", () => {
  const panel = read("components/assessment/PlanPanel.tsx");
  assert.match(
    panel, /from "@\/lib\/time\/duration"/,
    "PlanPanel no longer reads the duration module, so it is spelling a unit itself",
  );
  const printed = panel
    .split("\n")
    .filter((line) => line.includes("appHoursPerWeek") && !line.trimStart().startsWith("*"))
    .filter((line) => !/formatDuration|weeksNeeded/.test(line));
  assert.deepEqual(
    printed, [],
    `the pace reaches a screen without a unit chosen for its size: ${printed.join(" | ")}`,
  );
});

/**
 * Every custom property a screen reads is one something sets.
 *
 * This failure is silent by construction, which is the whole reason for the
 * check. `var(--nothing)` is not a syntax error and does not warn: the
 * declaration is invalid at computed-value time, so the property falls back to
 * its inherited value or, where it does not inherit, to its initial one.
 * Nothing throws, nothing logs, and the contrast pass happily measures whatever
 * colour actually landed.
 *
 * Two were live when this was written, and they failed in the two different
 * ways the fallback rule produces. `--ink-soft` was read 25 times across the
 * lesson, checkpoint and placement screens; `color` inherits, so every caption
 * meant to sit back from its content was drawn in the full body ink, and "A new
 * word" carried the same weight as the word being taught. `--r-md` was read
 * ten times; `border-radius` does not inherit, so it landed on 0 and ten padded
 * boxes had square corners inside cards rounded to 16px, the lesson's own
 * answer buttons among them.
 *
 * A token may be set from a stylesheet or written from a component, since
 * `--dock-clearance`, the nav marker's material and the confetti's drift are
 * all measured at runtime and set as inline styles. So what this asserts is
 * that the name is set *somewhere*, not that it is in the palette.
 */
/*
  THE WEAKEST CASES ARE ONE CALCULATION OVER ONE QUERY.

  "Your weakest cases, click to drill" was drawn three ways on three pages, and
  consolidating the component and the calculation fixed only the half you can
  see: the *input* stayed three, and Progress read the last half-year while two
  other screens each took an arbitrary five thousand rows of all time with no
  order between them. A learner who got the partitive wrong three hundred times
  last year and right three hundred times this month was told 100% on one screen
  and 50% on another, on the same day, about the same case. `caseReviewsFor` is
  the shared input that ended that.

  It came back anyway. Today's dashboard was rewritten, reached for
  `caseAccuracy` like everybody else, and wrote the old query beside it, which
  made the home page the fourth answer. So the pairing is asserted rather than
  described: a screen that runs the calculation reads the query, and nobody
  gathers those rows themselves.

  Anchored on the call rather than on the import, because a file can import a
  function and go on using its own rows, which is exactly what happened.
*/
check("every screen that draws the weakest cases reads the one query behind them", () => {
  /*
    The panel is one component and one calculation, and consolidating those
    fixed only the half you can see: the *input* stayed three. Progress read the
    last half-year while two other screens each took an arbitrary five thousand
    rows of all time with no order between them, so a learner who got the
    partitive wrong three hundred times last year and right three hundred times
    this month was told 100% on one screen and 50% on another, on the same day,
    about the same case. `caseReviewsFor` is the shared input that ended it.

    It came back anyway. Today's dashboard was rewritten, reached for
    `caseAccuracy` like everybody else, and wrote the old query beside it, which
    made the home page the fourth answer.

    Scoped to `app/`, because a screen drawing this panel is the thing that has
    to agree with the other screens drawing it. Two modules under `lib/` score
    cases for different questions and each says so in its own header: the class
    roster rolls a whole class up at once, which one learner's query cannot
    express, and the badge stats read all time on purpose, because a badge is a
    claim about what somebody has done rather than about what to drill now.
    Widening this to `lib/` would fire on both, and a check that fires on honest
    code is a check people learn to waive.

    Anchored on the call rather than on the import, because a file can import a
    function and go on using its own rows, which is exactly what happened.
  */
  const screens: string[] = [];
  for (const file of APP) {
    const src = code(file);
    if (!/\bcaseAccuracy\(/.test(src)) continue;
    screens.push(file);

    assert.match(
      src, /caseReviewsFor\(/,
      `${file} scores the cases off rows it gathered itself. A shared calculation over an `
      + "unshared input is not a shared answer: read them with caseReviewsFor",
    );
    /*
      And it does not gather them itself as well. Matched on the *filter* rather
      than on the column: Progress selects `targetCase` among eight others for
      the heatmap and the forecast, which is a different chart over a different
      window, and only a query that narrows to the case reviews is this panel's
      input wearing another name.
    */
    assert.doesNotMatch(
      src, /review\.findMany\(\{[\s\S]{0,300}?targetCase: \{ not: null \}/,
      `${file} selects its own case reviews beside the shared query, which is the second `
      + "input caseReviewsFor exists to prevent",
    );
  }

  assert.ok(
    screens.length >= 3,
    `only ${screens.length} screens draw the weakest cases, so this check stopped looking`,
  );
});

/*
  ONE TYPEFACE, AND NOTHING WEARING THE SECOND ONE'S CLASS.

  Estonian used to be set in a second face, which put two typefaces inside one
  card wherever a prompt and its answers are in different languages, and that is
  most of this app. The face was removed and `components/Et.tsx` says so: the
  `lang` attribute is the whole of what marking Estonian means now.

  What the removal left behind is an `est` class that nothing defines. Four
  branches open at the time reintroduced it and three were stripped in the
  merge; the fourth reached the tree and sat on `/review/government` styling
  nothing, because a class no stylesheet declares is silent rather than broken.
  That is the shape worth asserting: the typeface cannot come back through a
  second `next/font` call, and a screen cannot go on asking for it through a
  class that was deleted underneath it.
*/
check("Estonian is marked by its language, not by a second typeface", () => {
  const layout = code("app/layout.tsx");
  const faces = [...layout.matchAll(/from "next\/font\/google"/g)].length;
  assert.equal(
    faces, 1,
    `app/layout.tsx loads ${faces} font imports. Estonian is marked with lang, not with a face of its own`,
  );

  const wearing: string[] = [];
  for (const file of ALL) {
    const src = code(file);
    for (const match of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = (match[1] ?? match[2] ?? "").split(/\s+/);
      if (classes.includes("est")) {
        wearing.push(`${file}:${src.slice(0, match.index).split("\n").length}`);
      }
    }
  }
  assert.deepEqual(
    wearing, [],
    `${wearing.join(", ")} still applies the "est" class, which the second typeface carried and `
    + "nothing defines any more, so it styles nothing and reads as though it does",
  );
});

check("every custom property a screen reads is one something sets", () => {
  const stylesheets = sourceFiles("app", /\.css$/).map(read).join("\n");

  // Tailwind's @theme exposes `--color-ink` as `--ink`, `--radius-lg` as
  // `--radius-lg` and so on, so a namespaced declaration sets the bare name too.
  const declared = new Set<string>();
  const add = (name: string | undefined) => {
    if (!name) return;
    declared.add(name);
    declared.add(name.replace(/^--(?:color|radius|font|text|shadow|ease|animate)-/, "--"));
  };
  for (const match of stylesheets.matchAll(/(--[\w-]+)\s*:/g)) add(match[1]);
  // A component that writes the property itself: style={{ "--dock-clearance": x }}
  // or element.style.setProperty("--nav-marker-bg", …).
  for (const file of ALL) {
    for (const match of read(file).matchAll(/["'`](--[\w-]+)["'`]\s*[,:)]/g)) add(match[1]);
  }
  // next/font declares its own variable on <html> rather than in a stylesheet.
  for (const match of read("app/layout.tsx").matchAll(/variable:\s*"(--[\w-]+)"/g)) add(match[1]);

  const missing = new Map<string, string>();
  for (const file of [...ALL, ...sourceFiles("app", /\.css$/)]) {
    for (const match of read(file).matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)) {
      const name = match[1];
      if (name && !declared.has(name) && !missing.has(name)) missing.set(name, file);
    }
  }

  assert.equal(
    missing.size,
    0,
    `nothing sets ${[...missing].map(([n, f]) => `${n} (read in ${f})`).join(", ")}. ` +
    "An unset custom property is not an error: the declaration is dropped and the " +
    "property inherits or resets, so the screen renders in the wrong colour or shape " +
    "with nothing to say so.",
  );
});

/**
 * A fade never goes on words.
 *
 * `opacity` multiplies through everything inside a box, so a fade meaning
 * "secondary" is applied to the sentence as well as to the idea of it, and
 * there is no way to reason about the result from the palette. CLAUDE.md and
 * `docs/14-design-system.md` both say this; until now neither had anything
 * behind it.
 *
 * The four grading buttons are what made the case for asserting it rather than
 * writing it down again. Their ink is already the hue's own ink, which clears
 * 4.5:1 on its tint by construction, so nothing in the palette was wrong: the
 * fades on top of it were. Measured in a browser, the interval under each
 * button read 3.49 to 3.75 in the light theme and the keyboard hint 2.45 to
 * 2.62, on the screen a learner opens every day. axe reported four of those
 * twelve runs, and `test-design.mjs` none, because it walks `/review` as the
 * page arrives and the grading row is not drawn until a card is revealed.
 *
 * A fade is still how you quieten something that carries no words, which is
 * what `aria-hidden` marks: the padlock on a locked course unit is faded and
 * the sentence beside it is not. `disabled:` and `hover:` variants are a
 * control's own states rather than a way of ranking content, and 0 and 100 are
 * an animation's endpoints.
 *
 * This reads the utility form. An inline `style={{ opacity }}` is not covered
 * and cannot be: whether a box holds words is not a question the source can
 * answer once the value is computed.
 */
check("a fade never goes on words", () => {
  const offenders: string[] = [];
  for (const file of [...APP, ...COMPONENTS]) {
    if (/\.(test|itest)\.tsx?$/.test(file)) continue;
    for (const match of read(file).matchAll(/<([a-zA-Z][^>]*?)\/?>/g)) {
      const tag = match[1];
      if (!tag || /aria-hidden/.test(tag)) continue;
      for (const token of tag.split(/[\s"'`{}]+/)) {
        const bare = /^opacity-(\d+)$/.exec(token);
        if (!bare) continue;
        const pct = Number(bare[1]);
        if (pct === 0 || pct === 100) continue;
        offenders.push(`${file}: ${tag.slice(0, 70).replace(/\s+/g, " ")}`);
      }
    }
  }
  assert.deepEqual(
    offenders, [],
    "a fade on an element that is not aria-hidden fades whatever words it holds. " +
    "Quieten content with a defined ink instead, or move the fade onto the icon.",
  );
});

// ── The word of the day ──────────────────────────────────────────────────────

check("the almanac asks for a meaning and never supplies a word", () => {
  /*
    ADR-005 on the newest path onto the home page.

    `lib/copy/almanac.ts` decides what today is and therefore which word gets
    printed on Today every morning, which makes it the single most-read piece
    of copy in the app. A word typed into it would be this project inventing
    Estonian vocabulary and presenting it under a heading saying it was chosen
    for you, with nothing between the invention and the learner.

    So the table is English. It names a *meaning*, `lib/progress/wordOfDay.ts`
    asks the dictionary who carries that meaning, and every Estonian character
    on the card came from Ekilex or the built expansion. The English gloss is
    the only authored column, which is exactly the latitude the syllabus takes.
  */
  const almanac = read("lib/copy/almanac.ts");
  const estonianLetters = /[õäöüšž]/i;
  const offenders = almanac.split("\n").filter((line) => estonianLetters.test(line));
  assert.deepEqual(offenders, [], "an Estonian word was typed into the almanac");

  // And the module that resolves it cannot ask a model instead of the dictionary.
  for (const file of ["lib/progress/wordOfDay.ts", "lib/copy/almanac.ts", "lib/dict/gloss.ts"]) {
    assert.doesNotMatch(
      code(file),
      /lib\/tutor|openWithFallback|ANTHROPIC|OPENAI|OPENROUTER/,
      `${file} can reach a model, and this path decides what Estonian goes on the home page`,
    );
  }
});

check("every meaning the almanac can ask for is one the dictionary can answer", () => {
  /*
    The same argument the syllabus makes about itself: a lemma in a unit is a
    request and Ekilex decides whether it exists, so a misspelled word cannot
    reach the dictionary, it can only fail to arrive, loudly.

    A gloss here is a request too. One the shipped dictionary cannot meet is
    not a crash, because every occasion carries several and there is always a
    month underneath, and that is exactly what makes it worth checking: a dead
    gloss fails silently and for ever, and the card quietly stops being about
    the date. Five were dead when this table was first written, "star" and
    "bonfire" and "elk" among them.
  */
  const entries = JSON.parse(read("prisma/data/expanded.json")) as { translation: string }[];
  const senses = new Set(entries.flatMap((e) => glossSenses(e.translation)));
  const dead = allGlosses().filter((gloss) => !glossSenses(gloss).every((s) => senses.has(s)));
  assert.deepEqual(dead, [], "the almanac asks for a meaning no word in the dictionary carries");

  // And every day of the year reaches something, so the card is never blank.
  for (const year of [2026, 2027, 2028]) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 31; day++) {
        const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (new Date(`${key}T00:00:00Z`).getUTCDate() !== day) continue;
        assert.ok(occasionsFor(key).length > 0, `${key} reaches no occasion at all`);
      }
    }
  }
});

check("the word of the day is one the learner has not met", () => {
  /*
    The whole claim of the panel. It is the one thing on Today that the rest of
    the app is not already going to show you, and a word that turns out to be
    card four of this afternoon's review is a coincidence rather than a
    present.

    Three ways to have met a word and all three are excluded: a card in the
    deck, a star, and a row in the review log. The log is checked separately
    because `Review` deliberately has no relation to `Card` (it outlives one),
    so a word whose card was deleted last month has no card and has certainly
    been met.
  */
  const source = code("lib/progress/wordOfDay.ts");
  assert.match(source, /cards:\s*\{\s*none:/, "the word of the day no longer skips words in the deck");
  assert.match(source, /stars:\s*\{\s*none:/, "the word of the day no longer skips starred words");
  assert.match(source, /withoutReviewed\(/, "the review log is no longer consulted");
  // Both ways of picking one go through it, not just the themed path.
  const uses = [...source.matchAll(/withoutReviewed\(/g)].length;
  assert.ok(uses >= 3, `withoutReviewed is used ${uses} times; it is defined once and called on both paths`);

  /*
    And the card says where its sentence came from. Every Estonian sentence in
    this app was recorded by a lexicographer, and a page that prints one
    without saying so is asking to be trusted rather than checked, which is the
    rule the grammar pages already keep.
  */
  const card = read("components/WordOfDay.tsx");
  assert.match(card, /SENTENCE_SOURCE/, "the word of the day prints a sentence with no provenance");
  assert.match(card, /Ekilex/, "the sentence's provenance no longer names its source");
});

check("Today's date is Estonian, tagged as Estonian, and has a way out", () => {
  /*
    The one date in this app that is not written the reader's way, and the
    three things that make that safe rather than a rule broken by accident.

    It is TAGGED. `lang="et"` is what tells a screen reader to say
    `kolmapäev` in Estonian, and it is also what makes the third rule matter:
    English read aloud under an Estonian tag is worse than English printed
    plainly, which is exactly what a small-icu build would produce.

    It COMES FROM CLDR AND NOT FROM A STRING. `lib/time/estonianDate.ts` reads
    the weekday and the month out of the platform's locale data, in the sense
    the almanac reads nothing and the syllabus writes nothing (ADR-005): every
    Estonian character on that line came from an attested source.

    It HAS A FALLBACK. `dateLine` returns null on a build with no Estonian in
    it, and the page renders the reader's own date instead, which is the line
    it had before any of this.
  */
  const page = code("app/(app)/page.tsx");
  assert.match(page, /dateLine\(/, "Today no longer reads the Estonian date");
  assert.match(
    page,
    /lang="et">\{today\.et\}/,
    'Today prints the Estonian date without lang="et", so a screen reader says it in English',
  );
  assert.match(page, /<LocalDate/, "Today lost its fallback for a build whose locale data has no Estonian");

  const dateModule = code("lib/time/estonianDate.ts");
  assert.match(dateModule, /hasEstonian\(\)/, "the Estonian date no longer checks that the platform has Estonian");
  /*
    And it never asks Intl for the deployment's locale, which is the fault
    `components/LocalDate.tsx` exists for: `undefined` there means whatever
    machine the server happens to be, so a build set to en-US would answer an
    Estonian request in English with nothing to say it had.
  */
  assert.doesNotMatch(
    dateModule,
    /DateTimeFormat\(\s*undefined/,
    "the Estonian date asks Intl for the deployment's locale",
  );
});

check("there is one table of which Estonian letters fold", () => {
  /*
    There were three, and they agreed, which is the dangerous state rather than
    the safe one. `lib/dict/search.ts` had a `replaceAll` chain, and
    `lib/estonian/dictation.ts` and `lib/estonian/answer.ts` each had the same
    `Record` written out again. A marker and a search box disagreeing about
    whether `ž` folds would mark somebody wrong for a spelling the dictionary
    had just offered them.

    The fourth case is what found it: the command palette matched with a plain
    `includes`, so typing `sonad` found nothing and Sõnad was unreachable from
    the box that promises to go anywhere, for exactly the learner who has no õ
    key.

    Two exemptions, both by name and both for a different question.
    `lib/estonian/sounds.ts` folds *sounds a learner confuses*, b against p and
    k against g, and says so at length. `lib/suggestions/model.ts` has a
    function called `fold` that collapses whitespace for a grouping key and
    touches no diacritic, which is a name collision rather than a copy.
  */
  const HOME = "lib/estonian/fold.ts";
  assert.ok(existsSync(HOME), "the one fold has gone from lib/estonian/fold.ts");

  const excused = ["lib/estonian/sounds.ts", "lib/estonian/fold.ts"];
  const table = /["']?õ["']?\s*:\s*["']o["']/;
  const offenders = [...LIB, ...APP, ...COMPONENTS]
    .filter((file) => !excused.includes(file) && !/\.(test|itest)\.tsx?$/.test(file))
    .filter((file) => table.test(code(file)) || /replaceAll\("õ"/.test(code(file)));
  assert.deepEqual(
    offenders, [],
    "a second table of which Estonian letters fold. There is one, in lib/estonian/fold.ts.",
  );

  /*
    And the SQL half comes from it too. `translate(lower(lemma), FOLD_FROM,
    FOLD_TO)` narrows a search in Postgres and `fold` decides it in JavaScript;
    two hand-kept lists with a comment asking them to agree is what this
    replaced.
  */
  assert.match(
    code(HOME), /export const FOLD_FROM[\s\S]{0,200}export const FOLD_TO/,
    "the Postgres pair no longer lives beside the table it is derived from",
  );
  assert.match(
    code("components/CommandPalette.tsx"), /fold\(/,
    "the palette matches without folding, so a place with an Estonian name is unreachable from it",
  );
});

check("the game of the day comes from the one table of them", () => {
  /*
    "Each weekday could have a different game focus. It becomes predictable and
    also something to look forward to" was the ask, and the failure mode is the
    one every list-in-two-places has: a round renamed in `lib/ux/modes.ts` and
    still called something else by the home page, or a seventh game added to
    the app and never reaching a day.

    So Today asks the table and the table names modes by href.
    `weekGames.test.ts` is the half that resolves every one of them through
    `modeAt`, which is the check that can fail on a rename; this is the half
    that keeps the page reading it at all.

    Nothing is *hidden* by any of this, which is the distinction `within`
    already draws in lib/ux/nav.ts: every round stays on /practice, in the
    palette and at its own URL on every day of the week. What the table decides
    is what the home page leads with.
  */
  const page = code("app/(app)/page.tsx");
  assert.match(page, /gameOn\(/, "Today no longer asks which game today's is");
  assert.match(page, /gameAfter\(/, "Today stopped saying what is on tomorrow, which is what makes it a week");
  assert.match(
    page, /modeAt\(/,
    "Today names the featured round itself rather than reading lib/ux/modes.ts, so a rename splits",
  );

  const table = code("lib/ux/weekGames.ts");
  assert.doesNotMatch(
    table, /title:|icon:|tone:/,
    "the week table has started describing a mode, which lib/ux/modes.ts already does",
  );
});

check("Sonad decides nothing on the client but what to type", () => {
  /*
    THE BOARD KNOWS THE ANSWER AND MUST NOT KNOW THE SCORE.

    Marking a guess without a round trip is most of how the game feels to play,
    so the word crosses to the browser deliberately: anybody who opens the
    network tab has spoiled their own morning, which is the bargain every
    offline word game makes. What may not cross the other way is a rating.
    `recordSonad` takes the guesses, rebuilds the day's puzzle from the date and
    the learner's own level, and works out what the round was worth on this
    side, which is `submitExam`'s shape exactly (ADR-022) and for the same
    reason: a result anybody can type is not a measurement.

    TWO WORD LISTS, AND THEY ARE NOT THE SAME LIST. The answers are graded
    dictionary entries, because an answer has to be a word the app can teach
    and link to. The guesses are `KnownWord`, the 154,995 headwords the Ekilex
    enumeration brought back, because telling somebody an ordinary Estonian
    word is not a word is the one thing a game like this must never do, and the
    built dictionary alone would do it several times a round.
  */
  const action = /export async function recordSonad\(([\s\S]*?)\n\}/.exec(code("app/actions.ts"))?.[1] ?? "";
  assert.ok(action, "recordSonad has gone, or changed shape past recognition");
  assert.match(action, /puzzleFor\(/, "recordSonad no longer rebuilds the puzzle, so it is trusting the board");
  assert.match(action, /ratingFor\(/, "recordSonad no longer works out the rating on the server");
  /*
    The signature and not the body, which the first version of this got wrong:
    a pattern for the word `rating` matched the perfectly correct
    `gradeCard(card.id, rating, 0)` inside, so the check fired on honest code,
    which is how a check becomes one people waive.
  */
  const signature = /export async function recordSonad\(([^)]*)\)/.exec(code("app/actions.ts"))?.[1] ?? "";
  assert.doesNotMatch(
    signature, /rating|score|grade/i,
    "recordSonad takes a rating from its caller, which is a score anybody can type",
  );

  const picker = code("lib/progress/sonad.ts");
  assert.match(
    picker, /guessableWords\(|guessList/,
    "Sonad no longer takes its guesses from the whole language",
  );
  assert.match(picker, /bandsAround\(/, "Sonad's answer is no longer banded on the learner's level");
  // And the far end of that: the wide list really is the enumeration's table
  // and not the built dictionary, which would refuse a real word every round.
  assert.match(
    code("lib/dict/facts.ts"), /guessableWords[\s\S]{0,600}"KnownWord"/,
    "the guess list is no longer read from KnownWord",
  );

  /*
    AND THE MOVEMENTS ARE ITS OWN, WHICH IS A LEGAL POSITION AND NOT A TASTE.
    The game this is shaped like turns a square over to reveal a colour and
    shakes a row sideways to refuse a guess, and both are recognisable enough
    to be part of what that game is. A class here naming keyframes nobody wrote
    is not an error: it is a circle sitting perfectly still, looking exactly
    like one that was meant to.
  */
  const css = read("app/globals.css");
  for (const name of ["sonad-settle", "sonad-refuse", "sonad-rise"]) {
    assert.match(css, new RegExp(`@keyframes ${name}\\b`), `${name} is used and never declared`);
    assert.match(
      css,
      new RegExp(`\\.${name}\\s*\\{[^}]*animation:`),
      `${name} has keyframes and no class to run them`,
    );
  }
  assert.match(
    css,
    /prefers-reduced-motion[\s\S]{0,400}sonad-settle/,
    "Sonad's movements are not held under prefers-reduced-motion",
  );
});

check("the commonest words are counted, gated, and never written down twice", () => {
  /*
    A corpus proposes and the dictionary decides, which is ADR-021's rule about
    a photographed page and ADR-024's about a headline, arriving through a
    third door. Four things hold it up and each was a way of getting this
    wrong.

    THE TABLE HOLDS NO ENGLISH. A generated file carrying a gloss beside each
    lemma is a second copy of the dictionary that goes stale the first time
    somebody corrects one, and the correction path in this app is a queue
    strangers write to. So the table is lemmas and the page joins.

    THE COUNTING NEVER FOLDS A DIACRITIC. `matchEstonianForm` accepts a lemma
    with its diacritics folded away, which is right for somebody typing `room`
    meaning `rõõm` and wrong over a corpus that is spelled correctly: it put
    `õli` at the top of the nouns on the 294,452 occurrences of `oli`, which
    is the past of `olema`.

    A WORD CARRIES A BAND. The same filter the suggestion row takes, and here
    it is what keeps an entry that happens to be spelled like a very common
    form of something else off the front of the list.

    AND THE ACTION TAKES A GROUP, NOT A LIST OF WORDS. Every export of
    `app/actions.ts` is a public endpoint whose arguments are JSON off the wire
    whatever the types say, so one taking lemmas would let a caller choose what
    gets built into a deck. A group name indexes a table in the repository and
    can name nothing else.
  */
  const table = read("lib/collections/frequency.ts");
  assert.doesNotMatch(
    table, /translation|gloss:/,
    "the frequency table carries English, which is a second copy of the dictionary that will go stale",
  );

  const builder = code("scripts/build-frequency.ts");
  assert.doesNotMatch(
    builder, /\bfold\(|FOLD_FROM/,
    "the frequency builder folds diacritics, which credits `oli` to `õli`",
  );
  assert.match(
    builder, /\.cefr\b/,
    "the frequency builder stopped requiring a band, so the Wiktionary tail can reach the list",
  );
  assert.doesNotMatch(
    builder, /lib\/tutor|openWithFallback|ANTHROPIC|OPENAI|OPENROUTER/,
    "the frequency builder can reach a model, and this path decides which words a learner is offered",
  );

  const action = /export async function addCommonWords\(([\s\S]*?)\n\}/.exec(code("app/actions.ts"))?.[1] ?? "";
  assert.ok(action, "addCommonWords has gone, or changed shape past recognition");
  assert.match(
    action, /FREQUENCY_GROUPS\.includes\(/,
    "addCommonWords no longer checks its argument against the closed list of groups",
  );
  assert.match(
    action, /lemmasIn\(/,
    "addCommonWords takes its words from somewhere other than the checked-in table",
  );
});

check("a frequency list is named once, asked one way, and never built by a render", () => {
  /*
    THE FOUR LISTS ARE NOW TWO SCREENS AND A ROUND, AND EACH IS A WAY OF
    GETTING THIS WRONG.

    ONE TABLE OF WHAT A LIST IS CALLED. `TITLE` and `BLURB` were two maps
    inside `CommonWords.tsx`, which was right while one screen printed them.
    Four do now: the dictionary's lists, the card on `/practice`, the round
    index and the round itself. A second copy is how "Describing words"
    becomes "Adjectives" on one screen out of four, which is the fault
    `lib/ux/modes.ts` and `lib/ux/nav.ts` each exist to prevent and which this
    app has fixed four times. Anchored on the label appearing exactly once in
    the tree, because a screen that imports the table and then writes its own
    heading beside it satisfies any check that only looks for the import.

    ONE ANSWER TO WHICH CARD OF A WORD TO ASK. `leastPractisedSlot` is the
    variety half of mastery: the slot the learner has been asked in least. Two
    routes render the Flash cards session now, the whole deck and one
    frequency list, and a second copy of that rule is two answers to "what
    should this word be asked as" that drift apart a tie break at a time.

    THE DEEPENING NAMES NO CARD TYPE. `deepenCommonWords` plans `CARD_TYPES`
    entire and lets `generateCards` decide what each word can build, so it
    cannot ask for a card its own words cannot make, which is the `objekt`
    fault. A hand-typed list here would be a fifth place the seven are written
    down, and would go stale the day an eighth arrives.

    AND IT IS BOUNDED. A hundred nouns built out into every case is well over
    a thousand cards for one press, which is the backlog first run already
    learned not to assemble by accident. `nextCommonBatch` is the bound.

    AND NO RENDER WRITES CARDS. This is the one that would be invisible.
    `PrefetchLink` fetches a whole page once a pointer has settled on a link
    for 90ms, so a round that topped the deck up while rendering would build
    somebody twenty words for hovering over the button, and the browser suites
    would never see it because they click. The add is a Server Action behind a
    press, and these two pages may not reach a deck write at all.
  */
  const label = "Describing words";
  // `code()`, not `read()`: this is the oldest recurring mistake in this
  // repository's own checks, and the comment in `CommonWords.tsx` explaining
  // why the label moved out of that file names the label to do it.
  const naming = [...APP, ...LIB, ...COMPONENTS].filter((f) => code(f).includes(label));
  assert.deepEqual(
    naming, ["lib/collections/commonGroups.ts"],
    `"${label}" is written down somewhere other than the one table of what a list is called`,
  );

  /*
    THE FREQUENCY ROUND ASKS ONE PLACE WHICH CARD OF A WORD TO PUT UP.

    This named the Flash cards page too, and it should not any more, which is a
    narrowing rather than a loss. That round stopped rendering `ReviewSession`
    and stopped picking a *card*: it picks a **slot** off `askableSlots`, which
    can be a form no card of this learner's carries, and then grades whichever
    card comes closest (ADR-016). Asking it to call a function that chooses
    among cards would be asking it to answer a question it no longer has.

    What the rule was protecting is the half that still holds and is asserted
    below: nobody grows a second copy of the picker. That reaches every file
    rather than the two that happened to render a session.
  */
  const rounds = ["app/(app)/review/common/[group]/page.tsx"];
  for (const file of rounds) {
    assert.match(
      code(file), /leastPractisedSlot\(/,
      `${file} no longer asks lib/srs/mastery.ts which card of a word to put up`,
    );
  }
  const copies = [...APP, ...LIB, ...COMPONENTS]
    .filter((f) => f !== "lib/srs/mastery.ts")
    .filter((f) => /function leastPractised/.test(code(f)));
  assert.deepEqual(
    copies, [],
    "a second copy of the slot rule, which is two answers to one question",
  );

  const deepen = /export async function deepenCommonWords\(([\s\S]*?)\n\}/
    .exec(code("app/actions.ts"))?.[1] ?? "";
  assert.ok(deepen, "deepenCommonWords has gone, or changed shape past recognition");
  assert.match(
    deepen, /FREQUENCY_GROUPS\.includes\(/,
    "deepenCommonWords no longer checks its argument against the closed list of groups",
  );
  assert.match(
    deepen, /CARD_TYPES\.map\(/,
    "deepenCommonWords names card types of its own rather than planning the one table of them",
  );
  assert.match(
    deepen, /nextCommonBatch\(/,
    "deepenCommonWords stopped bounding what one press builds",
  );

  for (const file of [...rounds, "app/(app)/review/common/page.tsx"]) {
    assert.doesNotMatch(
      code(file), /addPlanToDeck|deepenCommonWords|addCommonWords|card\.createMany/,
      `${file} writes to the deck while rendering, and a settled pointer is enough to fetch it`,
    );
  }
});

check("the word of the day reads the learner's level, and reads it in the right place", () => {
  /*
    A B1 account was taught `keskmine`, an A1 adjective meaning "average". That
    word matches no gloss the almanac can ask for, which names the path: the
    fallback filtered on nothing at all and its skip landed anywhere in six
    thousand entries.

    The asymmetry is the part worth asserting, because the obvious fix is
    symmetric and half of it is wrong. Measured over a year of the shipped
    dictionary at B1, banding the *themed* pick outright moved 37 days of 336
    onto a word whose gloss carries the day's meaning as a fourth sense, on 31
    days that had the primary one. The almanac asks for `snow`, `hand` and
    `week`, and there is no B1 word for snow. So the band ranks under the
    sense and never over it, and the fallback, which has no meaning to honour,
    filters.

    Anchored on the order of two keys in one array rather than on the words
    around them, and `lib/progress/wordOfDay.itest.ts` is the half that can
    fail on a word: it stars out everything the day could otherwise answer
    with and asks a real dictionary.
  */
  const source = code("lib/progress/wordOfDay.ts");
  assert.match(
    source,
    /cefr:\s*\{\s*in:\s*\[\.\.\.bandsAround\(level\)\]/,
    "the word of the day's fallback no longer bands its pool, so a skip lands anywhere in the dictionary",
  );
  assert.match(
    source,
    /senseIndex\(row\.translation, gloss\),\s*isAround\(row\.cefr, level\)/,
    "the band no longer sits under the sense in the themed ranking; there is no B1 word for snow",
  );
});

check("late is decided in one place, against the learner's own day", () => {
  /*
    A due date is typed into `<input type="date">`, so it is stored at midnight
    UTC of that day. `TaskRow` compared it against `new Date()` and therefore
    marked everything due today as overdue from midnight onwards, and from
    three in the morning for a learner in Tallinn. The heading above the row
    now comes from `bucketFor`, so a row and its heading disagreeing is the
    failure this is watching for.

    Anything comparing a due date against the clock is doing the arithmetic a
    second time, and getting it wrong is the default.
  */
  const agenda = read("lib/ux/agenda.ts");
  assert.match(agenda, /daysBetween\(/, "the agenda stopped counting in whole days");

  for (const file of ALL) {
    if (file === "lib/ux/agenda.ts") continue;
    assert.doesNotMatch(
      code(file),
      /due(At|Date)?\s*<\s*new Date\(\)|new Date\(\)\s*>\s*due(At|Date)?\b/,
      `${file} decides for itself whether something is late, against the clock rather than the day`,
    );
  }
});


check("a confidence figure carries its evidence, on every screen that prints one", () => {
  /*
    ADR-022's headline rule: a percentage whose basis is not stated is the one
    thing this feature must not ship. "72 percent likely to pass B2" after nine
    reviews is an invented number and a learner has no way of telling it apart
    from one that means something.

    It held while the examination hub was the only screen printing the figure,
    and it stopped being a property the moment Today printed the same number.
    The hub kept its own object literal of what each tier means, so two screens
    would have had two accounts of what one number was worth, and nothing in the
    app would have said which was right. The words live beside the tier now, and
    what this asserts is that every screen printing a confidence reads them from
    there rather than phrasing its own.
  */
  const readiness = read("lib/exam/readiness.ts");
  assert.match(readiness, /export const EVIDENCE_NOTE/, "the tier's own copy has left the module that owns the tier");
  assert.match(readiness, /export const EVIDENCE_LABEL/, "the short form a card prints beside a number is gone");

  /*
    The screens that actually read the number, which is what obliges them to say
    what it is worth. Two conditions, and both were arrived at by getting it
    wrong: grepping for the word alone reached `Assessment.confidence`, a stored
    string like "indicative" and a different fact altogether, and dropping the
    property access caught Today, which loads the countdown and hands it
    straight to a card without printing a digit of it.
  */
  const screens = [...APP, ...COMPONENTS].filter((file) => {
    const source = read(file);
    return /from "@\/lib\/exam\/readiness"|from "@\/lib\/progress\/countdown"/.test(source)
      && /\.confidence\b/.test(code(file));
  });
  assert.ok(
    screens.length >= 2,
    `only ${screens.length} screens read the readiness modules; this check has stopped finding them`,
  );

  for (const file of screens) {
    const source = code(file);
    /*
      A member access, not the word. Written the loose way first, and the word
      "evidence" sitting in a sentence of copy on the card was enough to satisfy
      it after the tier label had been deleted: prose about a rule is not
      compliance with it, which is the same trap `code()` exists for one layer
      up.
    */
    assert.match(
      source,
      /EVIDENCE_(NOTE|LABEL)|\.measured\b|\.evidence\b/,
      `${file} prints a confidence figure with no account of what it rests on`,
    );
    // And it may not write its own words for a tier.
    assert.doesNotMatch(
      source,
      /thin:\s*["'`]/,
      `${file} phrases its own evidence tiers instead of reading the one table`,
    );
  }
});

check("a workplace group is a narrower query, never a hidden column", () => {
  /*
    A class and a sponsored group of colleagues are the same rows underneath,
    and the seats reading them are not the same seat. `classRoster` shows a
    teacher which case one named student keeps missing, widened to that
    deliberately on a pedagogical argument: the aggregate said the class was
    weak on the partitive and nothing about who to sit next to. That argument
    does not survive the move into a workplace. An employer has no lesson to
    plan, and "Kadri keeps getting the partitive wrong" follows somebody into a
    review they never see.

    The obvious way to build the narrower screen is the wider query with fields
    left unrendered, and it is one careless render away from being the wider
    screen. So the boundary is which query runs: `workplaceRoster` never selects
    a case, its summary type has nowhere to put one, and the page picks between
    the two before either has read anything.
  */
  const roster = code("lib/classroom/roster.ts");
  const workplace = between(roster, "export async function workplaceRoster");
  assert.ok(workplace.length > 0, "workplaceRoster is gone; the sponsor's screen has no narrower read");

  for (const leak of ["targetCase", "caseAccuracy", "xpFromRatingCounts"]) {
    assert.ok(
      !workplace.includes(leak),
      `workplaceRoster reads ${leak}; a sponsor's query has started collecting what a teacher's does`,
    );
  }
  // And the teacher's still does, or the two have quietly become one query and
  // this check is passing by measuring nothing.
  assert.match(
    between(roster, "export async function classRoster"),
    /targetCase/,
    "classRoster no longer reads a case, so the two seats are no longer different",
  );

  /*
    The shape, which is the half that outlives whoever wrote the view. A field
    that never reaches the type cannot be printed by a screen written next year
    by somebody who has not read any of this.
  */
  const cohort = code("lib/classroom/cohort.ts");
  const member = between(cohort, "export interface CohortMember");
  assert.ok(member.length > 0, "CohortMember is gone");
  for (const field of ["confidence", "weakestCase", "weeklyXp", "grammCase"]) {
    assert.ok(
      !member.includes(field),
      `CohortMember carries ${field}, which a sponsor has no reason to see`,
    );
  }

  /*
    A band is a claim about somebody's chances, so it obeys the rule above it:
    nothing prints one without saying what it rests on. Anchored on the member
    access rather than the word, for the reason the confidence check gives.
  */
  const screens = [...APP, ...COMPONENTS].filter((file) => /BAND_LABEL/.test(code(file)));
  assert.ok(screens.length >= 1, "nothing prints a band; this check has stopped finding its screens");
  for (const file of screens) {
    const source = code(file);
    assert.match(
      source,
      /EVIDENCE_(NOTE|LABEL)|\.evidence\b/,
      `${file} prints a readiness band with no account of what it rests on`,
    );
    for (const leak of [".weakestCase", ".weeklyXp"]) {
      assert.ok(
        !source.includes(leak),
        `${file} prints ${leak} beside a colleague's name`,
      );
    }
  }

  // The page chooses between the two reads rather than fetching both.
  const page = code("app/(app)/class/[classroomId]/page.tsx");
  assert.match(page, /cohortKind\(/, "the class page no longer asks which kind of group it is showing");
  assert.match(page, /workplaceRoster\(/, "the class page never runs the narrower read");
});

check("what the learner has kept is counted, never stored", () => {
  /*
    ADR-014 over the newest number on Today. The word of the day panel says how
    many words the learner has taken from it, and the obvious way to do that is
    a counter that goes up on a click. A stored count drifts, survives a card
    being deleted, and can be awarded for something that did not happen.

    So a card added from the panel carries its own `source` and the count is a
    query over `createdAt`, which is what every other figure in this app does.
    `computeStreak` is the run-of-days function the review streak already uses,
    so a run counted here and a run counted there break at the same midnight.
  */
  const resolver = code("lib/progress/wordOfDay.ts");
  assert.match(resolver, /export const ALMANAC_SOURCE/, "the panel's cards no longer say where they came from");
  assert.match(resolver, /computeStreak\(/, "the collection counts a run of days with a function of its own");

  // The button that adds one and the query that counts them read one constant.
  const card = code("components/WordOfDay.tsx");
  assert.match(card, /ALMANAC_SOURCE/, "the card labels its cards with a literal rather than the shared constant");

  // And nothing was added to the schema to hold the total.
  assert.doesNotMatch(
    SCHEMA,
    /^\s*(kept|collected|wordOfDay\w*)\s+Int/im,
    "the schema stores what the panel has kept, which the cards already answer",
  );
});


check("a hue's fill is never used as its ink", () => {
  /*
    `docs/14-design-system.md`: every hue reads as colour at full strength and
    lands around 2.5:1 as *text on its own tint*, so each one has an ink walked
    down until it clears 4.5:1. The fill paints a bar, a ring, a dot or a
    button; the ink writes a word. They are two tokens and they are one
    character apart, which is why this kept happening.

    Six places had it wrong and the browser suite had seen none of them,
    because a contrast pass can only measure a state it can reach: the two on
    `/week` and `/tasks` only render once a learner has set a class week, and
    the fixture never set one. A rule that is only enforced where a fixture
    happens to walk is a rule that holds on about half the app.

    A `tone` prop is included because `Stat` takes a colour rather than a tone
    name, which is exactly how `/tasks` came to draw its "Known" figure in mint
    at 2.52:1 while `/week` drew the same figure correctly in the ink beside it.
    `Diagnosis` passes both, a fill for its bar and an ink for its label, which
    is the pairing this is protecting rather than a violation of it.
  */
  const fillAsInk = /(?:color:\s*|(?<!ink=)\btone=)"var\(--(mint|peach|butter|sky|blush|good|hard|again|easy)\)"/;
  const offenders: string[] = [];
  for (const file of [...APP, ...COMPONENTS]) {
    for (const line of read(file).split("\n")) {
      // A bar and its label side by side: the fill is the bar's, the ink is the
      // label's, and naming both on one line is the correct shape.
      if (/\bink=/.test(line)) continue;
      if (fillAsInk.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], "a hue's fill is being used to write words, where its ink belongs");
});

check("a badge is written idempotently, not just described as idempotent", () => {
  /*
    `awardBadges` reads what a learner already holds, filters, and inserts the
    rest. That is check-then-act, and it runs on every render of Today, so two
    requests inside the gap both see a badge as unearned and both insert it.
    `Achievement` is keyed `@@id([ownerId, key])`, so the second insert
    violates the primary key and the render throws, at the exact moment
    somebody earned something.

    `app/(app)/BadgeCheck.tsx` since moved that check behind a `Suspense`, so
    what a throw takes out is the badge toast rather than the whole of Today.
    That lowers the blast radius and does not touch the cause, and it makes
    this check matter more rather than less: that component's own header says
    Today checks on every load and "that is right and it is idempotent". This
    is what makes the second half of that sentence true in the code.

    It is not hypothetical. It is in this repository's own CI logs, twice, as
    `duplicate key value violates unique constraint "Achievement_pkey"` on
    `(local-single-user, deck_50)`, and nothing failed, because no suite
    asserts that Today renders while a badge is being earned.

    THIS IS AN INVARIANT RATHER THAN AN INTEGRATION TEST, and the reason is
    worth writing down. The obvious test fires N concurrent awards and expects
    none to reject, and it passes with the fix and *also* without it: measured
    at 8 and at 40 concurrent against a real Postgres with a pool wide enough
    for all of them, and the race never lost locally, because the first insert
    commits before the later reads are served and they take the early return.
    A check that cannot be made to fail reports nothing, which this repository
    says about its own suites in several places. So the property is asserted
    where it can fail: delete the flag and this breaks.

    The function's doc comment has always claimed idempotence. This is the
    claim being kept in the code.
  */
  const source = code("lib/progress/achievements.ts");
  const at = source.indexOf("achievement.createMany");
  assert.notEqual(at, -1, "awardBadges no longer writes badges with createMany, so this check is stale");
  /*
    A window rather than a balanced match: the call's own argument contains
    `({ ownerId, key })`, so the obvious non-greedy `\{...\}\)` stops inside it
    and reads the flag as missing however the code is written. Asked the wrong
    way, this check failed on the fixed source.
  */
  const write = source.slice(at, at + 300);
  assert.match(
    write,
    /skipDuplicates:\s*true/,
    "the badge write can throw on a duplicate, which is a 500 on Today when two renders race",
  );
});

check("every link into this app fetches the page on intent, not just its skeleton", () => {
  /*
    Every route here is `force-dynamic`, correctly: a deck, a streak and a due
    count are facts about the person reading. What that costs is what
    `components/PrefetchLink.tsx` exists for. Next prefetches a link that is on
    screen, but for a dynamic route it stops at the nearest `loading.tsx`,
    which measured against this app is 150 bytes, seven milliseconds and no
    query at all. So the skeleton arrived early and the page still started
    being built at the moment of the click, which is what "the navigation feels
    slow" turned out to be: 458ms from pressing Progress in the rail to reading
    it, against 64ms once the pointer had rested there first.

    `PrefetchLink` is a `next/link` that upgrades to a full prefetch when a
    pointer settles or a link takes focus, and it is imported as `Link`
    everywhere, so a screen reads exactly as it did. This is the half that
    keeps it true: a new screen written with `import Link from "next/link"`
    would be the one place in the app that waits, and nothing would say so.

    The one file allowed to reach for the real thing is `PrefetchLink` itself,
    which wraps it.
  */
  const HOME = "components/PrefetchLink.tsx";
  assert.ok(existsSync(HOME), `the one link component has gone from ${HOME}`);

  const offenders = [...APP, ...COMPONENTS]
    .filter((file) => file !== HOME && /from ["']next\/link["']/.test(code(file)));

  assert.deepEqual(
    offenders, [],
    `these import next/link directly. Import { PrefetchLink as Link } from `
    + `"@/components/PrefetchLink" instead: a plain Link prefetches only the `
    + `loading skeleton of a dynamic route, and every route here is dynamic.`,
  );
});

check("a setting written outside the store tells the store it changed", () => {
  /*
    `lib/settings/store.ts` holds one read of a learner's settings for the
    length of a request, because eight helpers wanted them and each was making
    its own round trip. `writeSetting` corrects what it holds. Three paths do
    not go through `writeSetting` and cannot: clearing the course week is a
    delete rather than a value, and restoring a backup and erasing an account
    replace or remove the lot inside a transaction.

    Each of those has to say so, or a request that writes and then reads is
    answered with what was there before it wrote. That is not hypothetical on
    the page this was measured on: `resolveStreakFor` banks a shield and
    `awardBadges` reads the count back, in one render of Today.
  */
  const writesSettings = /(?:prisma|tx)\.setting\.(?:upsert|create|createMany|update|updateMany|delete|deleteMany)\b/;
  const offenders: string[] = [];
  for (const file of [...APP, ...LIB]) {
    if (file === "lib/settings/store.ts" || file.endsWith(".itest.ts")) continue;
    const src = code(file);
    if (!writesSettings.test(src)) continue;
    if (!/forgetSettings\s*\(/.test(src)) offenders.push(file);
  }
  assert.deepEqual(
    offenders, [],
    "these write to Setting without going through writeSetting() and without calling "
    + "forgetSettings(). A request holds one read of a learner's settings, so a write it "
    + "is not told about is a value the rest of that request cannot see.",
  );
});

check("a finished sitting is bounded by the paper, not by a number typed twice", () => {
  /*
    THE CHECK WAS SAT, THE LEVEL WAS SHOWN, AND NOTHING WAS EVER STORED.

    `recordAssessment` validates a posted sitting with Zod, and a bound on the
    array is right: every export in that file is a public endpoint, so without
    one a caller posts a million responses. What was wrong is that the bound
    was the number 60, written when the paper was nineteen questions, and the
    blueprint later went to eighty. Every finished sitting then failed
    `safeParse` and came back "That result could not be read".

    It is the worst shape a failure can have here. The runner computes the
    level in the browser, so the learner sees their result, presses on, and
    only later finds the hub saying nothing has ever been measured. Two numbers
    for one fact, and the wrong one was the one nobody looks at.

    So the bound is `PAPER_SIZE`, which is the blueprint added up, and this
    fails on a literal coming back.
  */
  const actions = code("app/actions.ts");
  const schema = actions.slice(actions.indexOf("const ASSESSMENT = z.object({"));
  const body = schema.slice(0, schema.indexOf("\n});"));
  assert.ok(body.length > 0, "the schema recordAssessment validates against has moved or gone");

  const caps = [...body.matchAll(/\.max\(([^)]+)\)/g)]
    .map((m) => m[1]!.trim())
    .filter((arg) => !/^\d+$/.test(arg) || Number(arg) > 120);
  assert.ok(
    caps.includes("PAPER_SIZE"),
    "the posted paper is not bounded by PAPER_SIZE",
  );
  for (const array of ["items:", "responses:"]) {
    const at = body.indexOf(array);
    assert.ok(at >= 0, `the sitting schema no longer names ${array}`);
    const rest = body.slice(at);
    const end = rest.indexOf("\n  responses:") > 0 && array === "items:" ? rest.indexOf("\n  responses:") : rest.length;
    assert.match(
      rest.slice(0, end),
      /\.max\(PAPER_SIZE\)/,
      `${array} in the sitting schema is capped at a literal rather than at the paper's own size, `
      + "so a paper that outgrows it is rejected after the learner has already sat it",
    );
  }

  assert.match(
    code("lib/assessment/items.ts"),
    /export const PAPER_SIZE = Object\.values\(BLUEPRINT\)/,
    "PAPER_SIZE stopped being derived from the blueprint, so it is a second number to keep in step",
  );
});

check("a stored level carries the time it was stated", () => {
  /*
    THE PICKER IN SETTINGS DOES NOTHING WITHOUT THIS, AND SAYS NOTHING ABOUT IT.

    There are two answers to what level a learner is at, the check at `/assess`
    and whatever they told Settings, and `courseLevelFor` picks between them by
    date: whichever was stated later is the one the app holds. So a write of
    `cefrPlacement` with no `cefrPlacementAt` beside it is read as older than
    every measurement, for ever. That is the right reading of a row written
    before the picker existed and the wrong reading of one written this
    morning, and the failure is silent in the worst way: nothing throws, the
    setting is stored correctly, and the button simply has no effect on any
    screen.

    `recordCourseLevel` writes both, which is why it exists rather than the two
    `writeSetting` calls being inlined. One writer is exempt by name and the
    exemption is the point of it: `completeOnboarding` stores a level ticked in
    ninety seconds by somebody who has not answered a question yet, and it must
    never outrank the check on the next screen of the same wizard, so it writes
    the stamp blank on purpose.
  */
  const stamped = ["lib/progress/level.ts", "app/actions.ts"];
  const offenders: string[] = [];
  for (const file of [...APP, ...LIB, ...COMPONENTS]) {
    const src = code(file);
    if (!/SETTING_KEYS\.cefrPlacement\b/.test(src)) continue;
    if (!/writeSetting\([^)]*SETTING_KEYS\.cefrPlacement\b/.test(src)) continue;
    if (!stamped.includes(file)) offenders.push(file);
  }
  assert.deepEqual(
    offenders, [],
    "these write the learner's level without the timestamp that decides whether it is still "
    + "the current answer. Call recordCourseLevel() in lib/progress/level.ts.",
  );

  const actions = code("app/actions.ts");
  const onboarding = actions.slice(actions.indexOf("export async function completeOnboarding"));
  assert.match(
    onboarding.slice(0, 4000),
    /writeSetting\(ownerId, SETTING_KEYS\.cefrPlacementAt, ""\)/,
    "first run stores a self-declared level without blanking its timestamp, so a guess ticked "
    + "before any question was answered can outrank the check on the next screen",
  );

  /*
    And the one function the exemption above exists for really does write both.
    Written the loose way first, as "this file mentions the timestamp key
    somewhere", and deleting the write from `recordCourseLevel` left the check
    passing on the strength of `courseLevelFor` reading it four lines up. A
    check that reads a file rather than the function in it is the oldest
    recurring mistake in this suite.
  */
  const level = code("lib/progress/level.ts");
  const writer = between(level, "export async function recordCourseLevel");
  for (const key of ["cefrPlacement", "cefrPlacementAt"] as const) {
    assert.match(
      writer,
      new RegExp(`writeSetting\\([^)]*SETTING_KEYS\\.${key}\\b`),
      `recordCourseLevel does not write ${key}, so a level stored through it is read as older `
      + "than every measurement and the picker in Settings has no effect",
    );
  }

  /*
    Matched on the read itself rather than on the key appearing anywhere in the
    function, for the reason above one more time: dropping the key from the
    `readSettings` list while leaving the `Date.parse` that consumes it is the
    shape this breaks in, and it leaves every comparison reading `undefined`
    without a line of it looking wrong.
  */
  assert.match(
    between(level, "export async function currentLevelAnswer"),
    /readSettings\([^)]*SETTING_KEYS\.cefrPlacementAt/,
    "currentLevelAnswer stopped asking the store when the declared level was stated, so the picker "
    + "in Settings is outranked by any level check however old",
  );
});

check("a word chosen for a learner is banded by one table", () => {
  /*
    "Around your level" was a `Record<Level, readonly string[]>` inside
    `lib/dict/suggest.ts`, where exactly one of the three things that choose
    words for somebody could see it. The other two did not band at all and it
    did not look like an omission, because both had an `ORDER BY cefr ASC` in
    front of a `take` that reads as deliberate and is the bottom of the
    dictionary: the minimal pairs round drew two thousand rows starting at A1,
    so a C1 speaker got beginner contrasts on their first visit and on their
    four hundredth, and the government drill took the easiest two hundred of
    268 governed verbs, so the C1 ones were the verbs nobody was ever shown.

    One table in `lib/collections/levels.ts` now, and the check is that there
    is not a second one anywhere. A copy is how the two drift, and a window
    that disagrees with itself between the dictionary row and the round the
    learner opens from it is worse than either answer alone.
  */
  const table = /\bA1:\s*\[\s*["']A1["']/;
  const copies: string[] = [];
  for (const file of [...APP, ...LIB, ...COMPONENTS]) {
    if (file === "lib/collections/levels.ts") continue;
    if (file.endsWith(".test.ts") || file.endsWith(".itest.ts")) continue;
    if (table.test(code(file))) copies.push(file);
  }
  assert.deepEqual(
    copies, [],
    "these keep their own table of which CEFR bands to show at a level. There is one, in "
    + "lib/collections/levels.ts, and two of them drift.",
  );

  /*
    And the readers really do read it. Asserted against the call rather than
    the import, because a file can import the window and go on filtering by
    something of its own, which is exactly what the two drills were doing with
    a cefr key that ordered rather than selected.
  */
  const readers = [
    "lib/dict/suggest.ts",
    "app/(app)/review/pairs/page.tsx",
    "app/(app)/review/government/page.tsx",
    "app/(app)/review/page.tsx",
  ];
  for (const file of readers) {
    assert.match(
      code(file),
      /\b(bandsAround|isAround|aroundFirst)\s*\(/,
      `${file} chooses words for a learner without asking which bands are around their level`,
    );
  }
});

check("nothing caches a learner's own rows in the dictionary's cache", () => {
  /*
    `lib/dict/facts.ts` holds answers across requests and across learners,
    which is exactly right for the shared dictionary (ADR-012) and exactly
    wrong for anything else: a value keyed on an `ownerId` and held in a
    module-level map is one person's deck handed to the next person who asks.

    So the whole module may not mention an owner. That is bluntly stated on
    purpose: there is no version of "cache this per learner" that belongs here,
    and `cache()` from React, which is scoped to the one request, is where a
    per-learner memo goes instead (see `latestFor` and the settings store).
  */
  const src = code("lib/dict/facts.ts");
  assert.ok(
    !/ownerId/.test(src),
    "lib/dict/facts.ts names an ownerId. It caches across requests and across "
    + "learners, so anything scoped to a person served from here is served to "
    + "everybody. Use cache() from react, which is scoped to one request.",
  );
});

/**
 * A LETTER MOVES THE WAY ONE TABLE SAYS, AND THE CSS BEHIND IT EXISTS.
 *
 * `lib/ux/letterMotion.ts` names a set of keyframes per character and
 * `app/globals.css` declares them, which is two files that have to agree about
 * four strings. Getting that wrong is the quietest possible failure: an
 * `animation-name` naming keyframes nobody wrote is not an error, it is an
 * animation that does nothing, so the letter sits perfectly still and looks
 * exactly like a letter that was meant to. Nothing on a screen says which.
 *
 * Both directions, because both are real. A character pointing at keyframes
 * that were renamed is the one above. A keyframe set nobody points at is the
 * other half of a rename, left behind, and the next person reads it as live.
 */
check("every way a letter moves is declared in both the table and the stylesheet", () => {
  const css = code(join("app", "globals.css"));
  const declared = new Set(
    [...css.matchAll(/@keyframes\s+(letter-[\w-]+)/g)].map((m) => m[1]!),
  );
  // The shake a key does under a pointer belongs to the control rather than to
  // a character, so it is declared and deliberately unnamed by the table.
  declared.delete("letter-wiggle");

  const asked = new Set(LETTER_CHARACTERS.map((c) => c.keyframes));
  const missing = [...asked].filter((k) => !declared.has(k));
  const orphaned = [...declared].filter((k) => !asked.has(k));

  assert.deepEqual(
    missing, [],
    "a letter character names keyframes app/globals.css does not declare. The "
    + "animation silently does nothing and the letter is simply still.",
  );
  assert.deepEqual(
    orphaned, [],
    "app/globals.css declares letter keyframes no character asks for, which is "
    + "half of a rename left behind for somebody to read as live.",
  );

  /*
    And every one of them spends the budget it was handed rather than a number
    somebody typed. A keyframe with a literal pixel in its `translate` is a
    letter that ignores the room its caller measured, which is how one ends up
    on a word at the one width nobody screenshotted.
  */
  for (const name of asked) {
    const at = css.indexOf(`@keyframes ${name}`);
    const body = css.slice(at, css.indexOf("\n}", at));
    assert.ok(
      !/translate:[^;]*\b\d+px/.test(body.replace(/var\(--drift-[\w-]+,\s*0px\)/g, "")),
      `@keyframes ${name} moves a letter by a typed distance rather than by the `
      + "travel its caller measured. See lib/ux/letterMotion.ts.",
    );
  }
});

/**
 * A LETTER LYING ON A PAGE IS A DECORATION, EVERYWHERE IT IS DRAWN.
 *
 * Three properties, and each one has a screen behind it. `aria-hidden`,
 * because a reader hearing "õ ä ö ü" read out in the middle of a sentence
 * about the partitive has been handed noise. `pointer-events-none`, because
 * these hang over the one interactive thing on the landing page and an
 * ornament that eats a tap is a decoration doing something no decoration
 * should. And both elements position themselves, which is what every suite
 * that measures whether something is inside its box reads before deciding the
 * thing was put where it is on purpose.
 *
 * Asserted on the component rather than on the pages, because there is one
 * component now: the second half of this is that no page draws its own.
 */
check("a decorative letter is hidden, untouchable and placed", () => {
  const tile = code("components/LetterTile.tsx");
  for (const [what, pattern] of [
    ["aria-hidden", /aria-hidden/],
    ["pointer-events-none", /pointer-events-none/],
    ["a placed wrapper", /className=\{`letter-lean pointer-events-none absolute/],
    ["a placed tile", /className="drift absolute inset-0/],
  ] as const) {
    assert.match(tile, pattern, `components/LetterTile.tsx no longer carries ${what}`);
  }

  const strays = [...APP, ...COMPONENTS]
    .filter((f) => f !== "components/LetterTile.tsx")
    .filter((f) => /className="[^"]*\bdrift\b/.test(code(f)));
  assert.deepEqual(
    strays, [],
    "a screen draws its own drifting letter instead of using components/LetterTile.tsx, "
    + "which is where the three properties above and the pointer listener live",
  );
});

/**
 * WHAT THE LANDING PAGE PROMISES ABOUT FIVE WORDS IS WHAT THE DICTIONARY SAYS.
 *
 * The case explorer is the one screen in this app that shows Estonian to
 * somebody who has not signed in, and it is the page's whole argument: learn
 * these forms, and the rest are regular endings. So it is the worst place for
 * a wrong form, and it has two ways to get one.
 *
 * The first is the fallback. `lib/collections/demoWords.ts` carries five stems
 * per word, copied out of the seed for the case where the database behind the
 * page is unreachable, which is the state a fresh deployment builds in. A copy
 * is a thing that goes stale, and this one goes stale silently: the live path
 * and the fallback would then show two different words for one lemma and only
 * the deployment that could not reach its database would ever see it. So the
 * copy is checked against the built dictionary, character for character.
 *
 * The second is the derivation. Every case in the right-hand column is the
 * genitive stem plus an ending, and the seed carries Ekilex's own recorded
 * forms for the course words, so the two can be compared. All 22 of `tuba`'s
 * agree, which is the check working rather than the check being vacuous, and
 * the one form that does not fall out of the rule is exactly the one this
 * exists to protect: `toa` + `sse` is `toasse`, a real word and not the one
 * anybody says, and `tuppa` is stored because no rule reaches it.
 */
check("the landing page's five words say what the dictionary says", () => {
  const expanded = JSON.parse(read(join("prisma", "data", "expanded.json"))) as {
    lemma: string; pos: string; forms: { formType: string; value: string }[];
  }[];

  const missing: string[] = [];
  const wrong: string[] = [];

  for (const stems of DEMO_STEMS) {
    const entry = expanded.find((e) => e.lemma === stems.lemma && e.pos === "NOUN");
    if (!entry) {
      missing.push(stems.lemma);
      continue;
    }
    const held = (type: string) => entry.forms.filter((f) => f.formType === type).map((f) => f.value);
    // PART_PL is the one that can legitimately hold two (`tube` and `tubasid`),
    // so the check is membership rather than equality on that one alone.
    for (const [type, value] of [
      ["NOM_SG", stems.nomSg], ["GEN_SG", stems.genSg], ["PART_SG", stems.partSg],
      ["GEN_PL", stems.genPl],
    ] as const) {
      const seen = held(type);
      if (seen[0] !== value) wrong.push(`${stems.lemma} ${type}: page says ${value}, the seed says ${seen.join(" or ") || "nothing"}`);
    }
    if (!held("PART_PL").includes(stems.partPl)) {
      wrong.push(`${stems.lemma} PART_PL: page says ${stems.partPl}, the seed says ${held("PART_PL").join(" or ") || "nothing"}`);
    }
    // `null` rather than `undefined`, because `NounStems.illSgShort` is a
    // required field: "the dictionary was asked and holds none" is a value
    // somebody wrote down, not a property somebody forgot.
    const short = held("ILL_SG_SHORT")[0] ?? null;
    if (short !== stems.illSgShort) {
      wrong.push(`${stems.lemma} ILL_SG_SHORT: page says ${stems.illSgShort ?? "none"}, the seed says ${short ?? "none"}`);
    }
    // Same rule, same reason. The nominative plural stopped being an ending on
    // the genitive stem when the audit put that ending to Ekilex.
    const plural = held("NOM_PL")[0] ?? null;
    if (plural !== stems.nomPl) {
      wrong.push(`${stems.lemma} NOM_PL: page says ${stems.nomPl ?? "none"}, the seed says ${plural ?? "none"}`);
    }
  }

  assert.deepEqual(missing, [], "the landing page asks the dictionary for a noun it does not hold");
  assert.deepEqual(wrong, [], "a stem on the landing page's fallback has drifted from the seed it was copied from");

  /*
    THE ENDINGS THEMSELVES ARE CHECKED AGAINST EKILEX, AND NOT HERE, BECAUSE
    THE SEED DOES NOT CARRY THEM.

    `harvested.ts` stores principal parts only, which is the point of it: the
    other eleven are a rule over the genitive stem and storing them would be
    the second source of truth this app refuses to keep (ADR-009). So the
    comparison that matters, every case the page works out against the form
    Ekilex records for it, needs a live key and is `npm run audit:cases`.

    It used to have been run by hand for these five words, which is 55 singular
    forms, and the note here said so. It now runs over every nominal in the
    dictionary, 5,143 of them, in both columns: the ten singular obliques agree
    for all but one word, and so do the eleven plural obliques built on the
    genitive plural. What it found is that the twelfth was not a rule at all,
    and `lib/estonian/derive.ts` no longer derives it. What differs and is
    fine is the parallel short plural Estonian genuinely has (`raamatuis`
    beside `raamatutes`), which this card does not show.

    What is left here is the half that can go stale on its own, which is the
    copy above, and `lib/estonian/derive.test.ts` holds the rule that decides
    the one case with two answers.
  */
});

/*
  A VERB FORM IS DERIVED IN ONE PLACE, AND THAT PLACE WAS CHECKED AGAINST
  EKILEX BEFORE IT WAS ALLOWED TO PUT A WORD ON A SCREEN.

  `lib/estonian/conjugate.ts` builds the present tense, the negative, the
  conditional and the singular imperative from the stored first person, which
  is the same licence `derive.ts` takes over the genitive (ADR-005 amendment
  1). It is the only module allowed to, for the reason the case suffixes have
  one home: it is the one that also holds the exceptions, `olema` in the
  present and `minema` in the imperative, and a second copy of the endings is
  a second copy that does not know about them. `scripts/audit-verbs.ts` is
  what made the rule shippable, 797 verbs against Ekilex's own paradigms with
  no disagreement, and it has to keep importing the rule it audits rather
  than a copy of it.
*/
check("nothing builds a verb form out of a stem and a person ending outside lib/estonian/conjugate.ts", () => {
  const endings = "(?:d|b|me|te|vad|ksin|ksid|ks|ksime|ksite)";
  const joins = [
    new RegExp(`\\b(?:stem|pres1sg|present)\\w*\\s*\\+\\s*["'\`]${endings}["'\`]`),
    new RegExp(`\\$\\{\\s*(?:stem|pres1sg)\\w*\\s*\\}${endings}[\`"']`),
  ];
  const offenders = ["app", "lib", "components", "scripts"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => file !== "lib/estonian/conjugate.ts" && !/\.i?test\.tsx?$/.test(file))
    .filter((file) => joins.some((join) => join.test(code(file))));
  assert.deepEqual(offenders, [], "a person ending is being joined to a verb stem outside lib/estonian/conjugate.ts");

  const conjugate = code("lib/estonian/conjugate.ts");
  assert.match(conjugate, /IRREGULAR_PRESENT[^;]*"olema"/, "conjugate.ts no longer declines to derive olema's present, whose third person is `on`");
  assert.match(conjugate, /IRREGULAR_IMPERATIVE[^;]*"minema"/, "conjugate.ts no longer declines to derive minema's imperative");

  const audit = code("scripts/audit-verbs.ts");
  assert.match(audit, /derivedVerbForms/, "scripts/audit-verbs.ts stopped auditing the rule the app ships");
  assert.match(audit, /morphCode === d\.morphCode/, "scripts/audit-verbs.ts stopped comparing against Ekilex's own slot");
});

/*
  A CARD IS GRADED IN ONE PLACE.

  `Review` is append-only, so a row written wrongly is permanent, and the row
  was being written in two places: `gradeCard` for a learner who is online and
  `applyGradeBatch` for a device coming back. Both created the row and then
  updated the card's scheduling, and the two had drifted on the one thing that
  is genuinely hard here, which moment the grade is recorded at.

  `gradeCard` floored it at the card's own creation, and said why in a comment:
  a review dated before its card existed is a review of something that was not
  there, and the streak, the heatmap and every "reviews this week" figure read
  that column with no way to tell a replayed grade from a forged one. The
  replay path had no such floor, and it is the door a device's own timestamps
  actually come through, so the fix had been written on the one nobody was
  using.

  `lib/srs/grade.ts` is the one writer now. A third caller inherits the floor
  by reaching for the function, which is the only way this stays true.
*/
check("nothing grades a card outside lib/srs/grade.ts", () => {
  const offenders = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => !["lib/srs/grade.ts", "app/actions.ts"].includes(file))
    .filter((file) => !/\.i?test\.tsx?$/.test(file))
    .filter((file) => /\breview\.create(?:Many)?\s*\(/.test(code(file)));
  assert.deepEqual(offenders, [], "a Review row is being written outside lib/srs/grade.ts");

  /*
    `restoreBackup` is the one exemption and it is exempt by name rather than
    wholesale, because `app/actions.ts` is also where `gradeCard` lives and
    excusing the file would excuse that too. Restoring is not grading: it puts
    a learner's own rows back exactly as the file holds them, inside the
    transaction, and never touches a card's scheduling. Flooring those dates
    would buy nothing anyway, since the card's own creation comes out of the
    same file.
  */
  const writes = [...code("app/actions.ts").matchAll(/(\w+)\.review\.create(?:Many)?\s*\(/g)]
    .map((m) => m[1]);
  assert.deepEqual(writes, ["tx"], "app/actions.ts writes a Review row outside the restore transaction");

  const writer = code("lib/srs/grade.ts");
  assert.match(
    writer,
    /at < createdAt \? createdAt : at/,
    "lib/srs/grade.ts stopped flooring a grade at the moment its card was created",
  );
  for (const caller of ["app/actions.ts", "lib/srs/replay.ts"]) {
    assert.match(code(caller), /\bwriteGrade\(/, `${caller} stopped writing its grade through lib/srs/grade.ts`);
  }
});

/*
  WHICH FORMS CAN BE HIDDEN IN A SENTENCE IS ONE ANSWER.

  `buildCloze` hides a word it is told to look for, so what it can hide is
  whatever list the caller hands it, and there were five such lists. Two added
  the ten regular cases and were the same twenty lines twice; three did not,
  and the printable worksheet's own comment said "a sentence about `tuba`
  usually contains `toas`, not `tuba`, and hiding the inflected form is the
  more useful exercise" over a list that could not hide `toas`. None of the
  five knew a verb person, so `Kontsert algab kell 18.` could not be gapped for
  `algama`. Measured over the graded half of the dictionary, 2,201 words could
  carry a gap and 2,758 can now.

  `lib/exam/paper.ts` and `lib/assessment/items.ts` are the two exceptions and
  are exempt by name. Both build a marked instrument out of a pool and a seed,
  the exam rebuilds its paper server-side to mark it, and both surround the
  answer with distractors drawn from the same list, so widening what can be
  gapped changes which questions a candidate is asked and what is offered
  against them. That is a change to a measurement rather than to an exercise
  and it is not made in passing.
*/
/*
  THE CARD TYPES ARE NAMED IN THREE PLACES AND TWO OF THEM HAD DRIFTED.

  `CARD_TYPES` in `lib/srs/cards.ts` is the one that decides. The schema's own
  comment beside `cardType String` listed five of the seven, missing the
  gap-fill and the conjugation card, which are two of the three a default deck
  is mostly made of. `docs/04-data-model.md` printed an enum of seven that was
  the wrong seven: it had `LISTENING` and `OBJECT_CASE`, which have never
  existed in the code, and lacked the same two.

  Neither is load-bearing at runtime, which is exactly why nobody noticed. They
  are what a contributor reads first, and a schema comment that names five card
  types is a schema comment that tells them the app has five.
*/
check("the card types are the same seven wherever they are written down", () => {
  const declared = [...code("lib/srs/cards.ts").matchAll(/\{\s*type:\s*"(\w+)"/g)].map((m) => m[1]!);
  assert.ok(declared.length >= 7, "lib/srs/cards.ts no longer declares its card types as a table");

  const schema = read(join("prisma", "schema.prisma"));
  const comment = /cardType\s+String\s*\/\/\s*([A-Z_ ]+)/.exec(schema)?.[1]?.trim().split(/\s+/) ?? [];
  assert.deepEqual(
    [...comment].sort(),
    [...declared].sort(),
    "prisma/schema.prisma names a different set of card types from lib/srs/cards.ts",
  );

  const doc = read(join("docs", "04-data-model.md"));
  const line = /^CardType\s+(.+)$/m.exec(doc)?.[1]?.trim().split(/\s+/) ?? [];
  assert.deepEqual(
    [...line].sort(),
    [...declared].sort(),
    "docs/04-data-model.md names a different set of card types from lib/srs/cards.ts",
  );
});

/*
  AND THE PAGE A NEW CONTRIBUTOR READS ABOUT THE SCHEMA NAMES THE SCHEMA'S OWN
  MODELS.

  `docs/04-data-model.md` used to carry 272 lines of Prisma, and the copy went
  stale exactly as a second source of truth does: ten models that no longer
  exist, none of the nine that had arrived since, and `provider = "sqlite"` at
  the top of a Postgres app. `CLAUDE.md` sends a new contributor to that page
  third, so more than half of what they read about the schema was wrong.

  The fields live in the schema file, which comments every model that needs
  one. What the page keeps is the map and the reasoning, and a map is exactly
  the shape a check can hold to the thing it maps.
*/
/*
  THE SIZE OF THE DICTIONARY IS ONE NUMBER, AND THE README HAD LAST YEAR'S.

  `SEED_SET_SIZE` is counted from the two files the seed loads and its own test
  proves it. The landing page reads it. The README typed it, and the dictionary
  grew: 5,960 in the README against 6,050 in the seed, which is the first
  figure anybody reads about this project.
*/
/*
  A COMMAND THE DOCUMENTATION TELLS SOMEBODY TO RUN IS A COMMAND THAT EXISTS.

  Four `npm run` names between the README and this file are the first thing a
  new contributor types, and a renamed script leaves a page telling them to run
  something that answers "Missing script". The check is one-directional on
  purpose: plenty of scripts are internal (`predev`, `build:ci`) or are audits
  somebody runs once against a live key, and a rule that every script must be
  documented would be a rule to write filler.
*/
check("every command the README and CLAUDE.md name is a script that exists", () => {
  const scripts = new Set(
    Object.keys(JSON.parse(read("package.json")).scripts as Record<string, string>),
  );
  const named = new Set(
    ["README.md", "CLAUDE.md"]
      .flatMap((file) => [...read(file).matchAll(/npm run ([\w:-]+)/g)])
      .map((m) => m[1]!),
  );
  assert.ok(named.size > 10, "the documentation stopped naming its commands the usual way");

  const missing = [...named].filter((name) => !scripts.has(name)).sort();
  assert.deepEqual(missing, [], "the documentation names an npm script package.json does not have");
});

check("the README's dictionary size is the seed's own count", () => {
  const size = /words:\s*([\d_]+)/.exec(read(join("lib", "collections", "seedSize.ts")))?.[1];
  assert.ok(size, "lib/collections/seedSize.ts no longer states the word count the usual way");
  const words = Number(size.replaceAll("_", ""));
  const printed = words.toLocaleString("en-GB");

  const readme = read("README.md");
  assert.ok(
    readme.includes(`${printed} words`),
    `README.md does not say "${printed} words", which is what the seed loads`,
  );
});

/*
  THE OTHER TWO NUMBERS THE README LEADS WITH, WHICH HAD BOTH GONE STALE.

  The dictionary size above was already held to the seed, and the two counts
  beside it were not, so both drifted the moment a unit or a round was added.
  The course bullet said seventy-nine units against 82 in `lib/collections/
  syllabus/`, and the practice bullet said seven modes against 18 in
  `lib/ux/modes.ts`, which is the whole of the games this app grew and did not
  mention: the crossword, the picture board, the word a day, flash cards and
  Target. The flashcard line said five card types against seven, having missed
  gradation and government, which are the two nothing else drills. The course
  page's own header had a fourth answer, eighty-three, and counted six CEFR
  levels after C2 was cut.

  This is the first page anybody reads about the project and the one a funder
  or a teacher reads before installing anything, so an undercount is not a
  typo: it is the app selling itself short on the two things it is largest at.

  Digits rather than words, because a count nothing can read is a count nothing
  checks, and the README already writes "6,101 words" and "44 notes" that way.
*/
/*
  A SCREEN THAT NEEDS ROWS CARRYING A PROPERTY ASKS FOR THEM, RATHER THAN
  READING A WINDOW AND SIFTING IT.

  The picture board needs six nouns that have a picture. It read the first 480
  graded nouns in the band, every form on each, and dropped the ones with no
  picture. That is 480 rows fetched to use six, and the cost that matters is
  not the fetching: the order is the band and then the alphabet, so the window
  is always the same words. At B1, 47 of the 173 pictured nouns in the band
  were the whole game and the other 126 could not come up, on the one round
  whose promise is that it is worth playing again. `lib/dict/suggest.ts` had
  this exact shape and it is why `aberratsioon` is the standing joke in here.

  Which words have a picture is a static table of 313 lemmas, so it belongs in
  the `where` rather than in a `.filter` after the fact, and once it is there
  the query needs no cap at all.
*/
check("the picture board asks the dictionary for the words that have a picture", () => {
  const src = code(join("app", "(app)", "review", "emoji", "page.tsx"));
  const asked = /EMOJI_LEMMAS\s*\.\s*filter\(/.exec(src);
  assert.ok(
    asked,
    "the picture board no longer narrows EMOJI_LEMMAS for its query, so it is sifting a window again",
  );
  assert.match(
    src.slice(asked.index),
    /lemma:\s*\{\s*in:/,
    "the picture board narrows the picture table and then does not select on it",
  );
  assert.ok(
    !/take:\s*POOL\s*\*/.test(src),
    "the picture board has gone back to reading a multiple of its deck window out of the dictionary",
  );
});

/*
  A PAGE ADDRESSED BY A ROW ID PROVES THE ROW IS THE LEARNER'S.

  Three routes name a row somebody owns: `/exam/result/[id]` is a sat paper
  with the composition in it, `/scan/[scanId]` is the words read off a
  photograph of somebody's homework, and `/class/[classroomId]` is a roster.
  All three scope the read by the owner and answer `notFound()`, which is the
  right shape and was true of every one of them when this was written. The
  check is here so it stays true of the fourth.

  What it reads is narrow on purpose: a `where` in a `[param]` page that names
  the route's own parameter is a row being addressed by something a stranger
  can type, and it has to name `ownerId` too. A page whose parameter is a key
  rather than a row, which is the level, the case, the grammar topic and the
  unit, never reaches this, because their parameters do not appear in a `where`
  at all. That is the difference between an id somebody owns and an id that
  names a page.
*/
/*
  THE PUBLIC PAGE THAT SAYS WHAT THIS COSTS READS THE SEED'S OWN COUNT.

  `/funding` is measured on a stated day and prints the command that gets the
  same number again, which is the whole reason a reader is asked to believe it.
  The dictionary line was typed, and it was stale on the day it was written: it
  said 6,050 entries and 34,554 forms while the seed it described held 6,102 and
  38,577, the nominative plural having become a stored principal part in
  between. Re-measured at 20 MB against a freshly dropped and seeded database,
  and the two counts now come from `SEED_SET_SIZE`, which its own test proves
  against the files the seed loads.

  `DICTIONARY_MB` feeds the storage line of the cost model as well as that
  sentence, so a stale figure was not only a wrong number on a page: it made
  the projected bill lower than the truth, which is the direction this page
  exists not to be wrong in.
*/
check("the funding page's dictionary size is the seed's own count", () => {
  const src = code(join("lib", "funding", "facts.ts"));
  assert.match(
    src,
    /SEED_SET_SIZE\.words[\s\S]{0,200}SEED_SET_SIZE\.forms/,
    "lib/funding/facts.ts no longer reads the seed's own counts, so its measurement can go stale again",
  );
  assert.match(
    src,
    /\$\{DICTIONARY_MB\} MB/,
    "the measured dictionary line no longer reads DICTIONARY_MB, so the sentence and the cost model can disagree",
  );

  /*
    AND NO THIRD COPY, which is the fault this file's own header records about
    itself: the cost model started as three lists and nothing failed when a
    line went missing from a total. Fixing the measured line left the same
    stale pair in `services.ts`, where Ekilex's entry says what the Institute
    gives, so the page understated the gift by 52 entries and 4,023 forms. A
    typed count next to the word "entries" or "forms" anywhere under
    `lib/funding/` is a fourth copy waiting to go stale.
  */
  const typed = sourceFiles(join("lib", "funding"))
    .filter((file) => !file.endsWith(".test.ts"))
    .flatMap((file) =>
      [...code(file).matchAll(/\d[\d,_]*\s+(?:entries|forms)\b/g)].map((m) => `${file}: ${m[0]}`));
  assert.deepEqual(
    typed,
    [],
    "the funding page counts the dictionary with a typed number instead of reading SEED_SET_SIZE",
  );
});

check("a page addressed by a row id proves the row is the learner's", () => {
  const pages = APP.filter((file) => file.endsWith("page.tsx") && /\[[^\]]+\]/.test(file));
  assert.ok(pages.length >= 8, "app/ no longer holds the parameterised routes the usual way");

  const offenders: string[] = [];
  for (const file of pages) {
    const src = code(file);
    const params = [...file.matchAll(/\[(\w+)\]/g)].map((m) => m[1]!);
    for (const call of src.matchAll(/prisma\.(\w+)\.(findFirst|findUnique|findMany)\(\{([\s\S]{0,500}?)\n\s*\}\)/g)) {
      const [, model, , body] = call;
      if (!params.some((name) => new RegExp(`\\b${name}\\b`).test(body!))) continue;
      if (!/ownerId/.test(body!)) offenders.push(`${file}: ${model} is read by the route's own id without an ownerId`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a page reads a row by the id in its own URL without proving it belongs to the learner asking",
  );
});

check("the README's course and practice counts are the code's own", () => {
  const readme = read("README.md");
  assert.ok(SYLLABUS.length > 50, "the syllabus no longer collects its units the usual way");
  assert.ok(PRACTICE_MODES.length > 10, "lib/ux/modes.ts no longer lists the modes the usual way");
  assert.ok(CARD_TYPES.length > 3, "lib/srs/cards.ts no longer lists the card types the usual way");

  for (const [count, what] of [
    [SYLLABUS.length, "units"],
    [PRACTICE_MODES.length, "ways to practise"],
    [CARD_TYPES.length, "card types"],
  ] as const) {
    assert.ok(
      readme.includes(`${count} ${what}`),
      `README.md does not say "${count} ${what}", which is what the code has`,
    );
  }
});

check("the data model page names every model the schema has, and no others", () => {
  const schema = read(join("prisma", "schema.prisma"));
  const models = [...schema.matchAll(/^model (\w+)/gm)].map((m) => m[1]!);
  assert.ok(models.length > 10, "prisma/schema.prisma no longer declares models the usual way");

  const doc = read(join("docs", "04-data-model.md"));
  const named = new Set([...doc.matchAll(/`(\w+)`/g)].map((m) => m[1]!));

  const missing = models.filter((model) => !named.has(model));
  assert.deepEqual(missing, [], "docs/04-data-model.md does not name every model in the schema");

  /*
    And the other direction, over the models it once described and no longer
    should. A name may still appear in the paragraph explaining that it went,
    which is why this reads the map's own table rather than the whole page.
  */
  const table = [...doc.matchAll(/^\| `([^`]+)`[^|]*\|/gm)]
    .flatMap((m) => m[1]!.split(/`,\s*`/));
  const invented = table.filter((model) => !models.includes(model));
  assert.deepEqual(invented, [], "docs/04-data-model.md maps a model the schema does not have");
});

check("nothing decides what a gap can hide outside lib/estonian/gapForms.ts", () => {
  const allowed = new Set([
    // Where `buildCloze` is written, and where `gapForms` is.
    "lib/estonian/cloze.ts",
    "lib/estonian/gapForms.ts",
    "lib/exam/paper.ts",
    "lib/assessment/items.ts",
  ]);
  const offenders = ["app", "lib", "components"]
    .flatMap((dir) => sourceFiles(dir))
    .filter((file) => !allowed.has(file) && !/\.i?test\.tsx?$/.test(file))
    .filter((file) => /\bbuildCloze\s*\(/.test(code(file)))
    .filter((file) => !/\bgapForms(?:FromParts)?\s*\(/.test(code(file)));
  assert.deepEqual(offenders, [], "a caller of buildCloze builds its own list of forms to hide");

  const forms = code("lib/estonian/gapForms.ts");
  assert.match(forms, /derivedVerbForms\(/, "gapForms stopped offering a verb's persons");
  assert.match(forms, /caseAnswer\(/, "gapForms stopped offering the cases built on the stem");
});

check("a screen that prints a derived verb form says it was derived", () => {
  // Each of the readers prints provenance: the entry's table says which form is
  // stored, the reference's chip names the origin, and the drill says whether
  // the table was Ekilex's or the rule's before the learner moves on.
  for (const file of [
    "app/(app)/dictionary/Forms.tsx",
    "app/(app)/grammar/topic/[id]/VerbTable.tsx",
    "app/(app)/review/conjugation/ConjugationSession.tsx",
  ]) {
    assert.match(code(file), /\.origin\b/, `${file} prints a verb form without reading where it came from`);
  }
});

/**
 * The anonymous research export publishes nothing that could be one person.
 *
 * `/api/research` is the only thing in this app whose output is meant to leave
 * the deployment and be handed to somebody outside it. What makes that safe is
 * a gate in `lib/research/corpus.ts`, and a gate is exactly the kind of thing
 * that gets loosened by somebody in a hurry to make a thin deployment produce a
 * fuller file. These four are the floors under it.
 *
 * Floors rather than equalities, deliberately: raising a threshold is always
 * allowed and lowering one is the change worth stopping. Asserting today's
 * numbers would fail on the safe direction and teach whoever hit it to edit the
 * check.
 */
check("the research export's disclosure thresholds are never loosened", () => {
  assert.ok(
    MIN_LEARNERS >= 10,
    `the research export would publish a figure from ${MIN_LEARNERS} people. Ten is the floor.`,
  );
  assert.ok(
    MIN_REVIEWS >= 50,
    `the research export would publish a figure resting on ${MIN_REVIEWS} answers.`,
  );
  assert.ok(
    MAX_LEARNER_SHARE <= 0.5,
    "one person may now be more than half of a published figure, which is the rule a head count alone misses",
  );
  assert.ok(
    COUNT_ROUNDING >= 10,
    "published counts are exact again, so two vintages of the file can be differenced",
  );
  assert.ok(
    LEARNER_BANDS.every((band) => band.from >= MIN_LEARNERS) &&
      LEARNER_BANDS[LEARNER_BANDS.length - 1]!.from === MIN_LEARNERS,
    "the learner bands no longer start at the threshold, so a published cell could report a band below it",
  );
});

/**
 * And there is one way to make a published figure, not two.
 *
 * `gate` is where all three rules live, so a second place that builds an
 * accuracy figure is a second place that has to remember them. The check reads
 * for the construction rather than for the word: the type is written out in
 * several places and only one of them fills it in.
 */
check("every figure the research export publishes was made by the gate", () => {
  const corpus = code("lib/research/corpus.ts");
  const built = corpus.match(/accuracyPct:\s*Math/g) ?? [];
  assert.equal(
    built.length,
    1,
    `an accuracy figure is constructed in ${built.length} places in lib/research/corpus.ts, and gate() is meant to be the only one`,
  );
  assert.match(
    corpus,
    /const all = gate\(/,
    "buildSection stopped putting its cells through the gate",
  );
  assert.match(
    corpus,
    /const mature = gate\(cell\.mature\)/,
    "the mature column is no longer gated on its own, so a cell can publish a rate resting on one person's answers",
  );

  const route = code("app/api/research/route.ts");
  assert.equal(
    /accuracyPct/.test(route),
    false,
    "the research route computes an accuracy of its own instead of asking the gate for one",
  );
});

/**
 * The export is reachable only by whoever holds the deployment's own secret.
 *
 * Three separate things have to hold and each is easy to lose on its own: the
 * middleware has to let it past the learner gate, since there is no learner to
 * resolve; the route has to then authenticate itself; and with no token
 * configured it has to be absent rather than merely refused, because a 401
 * advertises that a deployment has a corpus worth asking for.
 */
check("the research export authenticates itself and hides when unconfigured", () => {
  const middleware = code("middleware.ts");
  assert.match(
    middleware,
    /path\.startsWith\("\/api\/research"\)/,
    "the research route is no longer past the sign-in gate, so it answers a caller with no session rather than checking its own token",
  );

  const route = code("app/api/research/route.ts");
  assert.match(route, /process\.env\.RESEARCH_TOKEN/, "the research route stopped reading its token");
  assert.match(
    route,
    /timingSafeEqual\(/,
    "the research token is compared in a way that leaks how much of it was right",
  );
  assert.match(
    route,
    /!process\.env\.RESEARCH_TOKEN[\s\S]{0,120}status:\s*404/,
    "an unconfigured deployment now advertises the research endpoint instead of 404ing",
  );
});

/**
 * Somebody who asked to be left out is left out of the query, not the answer.
 *
 * The difference is the whole of what the setting promises. Filtering after the
 * fact would mean their rows were read, counted and then subtracted, which is
 * not what /privacy says and is not what anybody ticking it means.
 *
 * The privacy page and the Settings row are checked together with it, because
 * three things drift apart in the same direction: a page describing a control
 * that was renamed, a control for a promise that was deleted, and a promise for
 * a control nobody wired up.
 */
check("the research opt-out is applied in the query, and is where the page says", () => {
  const route = code("app/api/research/route.ts");
  assert.match(
    route,
    /SETTING_KEYS\.researchOptOut/,
    "the research export stopped reading who asked to be left out",
  );
  /*
    Both queries, named separately, because the first version of this asked
    the file for the clause once and the file has two of them: deleting the one
    that matters left the other one satisfying the check. The same trap `code()`
    exists for, arriving through a different door.
  */
  assert.match(
    route,
    /conditions\.push\(\s*Prisma\.sql`r\."ownerId" NOT IN/,
    "the tallies no longer exclude anybody, so an excluded learner's answers are counted into the published cells",
  );
  assert.match(
    route,
    /const not = [\s\S]{0,60}Prisma\.sql`WHERE r\."ownerId" NOT IN/,
    "the corpus totals no longer exclude anybody, so the file reports a size that counts people who asked to be left out",
  );

  const label = "Anonymous statistics";
  for (const file of ["app/privacy/page.tsx", "app/(app)/settings/page.tsx"]) {
    assert.ok(
      read(file).includes(label),
      `${file} no longer names the "${label}" row, so the promise and the control have come apart`,
    );
  }
  assert.match(
    read("app/(app)/settings/PreferencesPanel.tsx"),
    /setResearchParticipation\(/,
    "the Settings row for the research opt-out no longer writes anything",
  );
});

/**
 * What the export counts as a right answer is the app's own cut, not a second
 * one.
 *
 * `lib/stats/history.ts` decides everywhere else in this app that Good and Easy
 * are recalled and Hard is not, and the export restates the number rather than
 * importing it, so that `lib/research/` stays about the export. Restating it is
 * only safe while something notices the day the two disagree, which is what
 * this is. The same for the FSRS state that means a card was learned.
 */
check("the research export counts a right answer the way the rest of the app does", () => {
  assert.equal(
    CORRECT_FROM_RATING,
    3,
    "the research export and lib/stats/history.ts no longer agree on what counts as recalled",
  );
  assert.equal(
    MATURE_STATE,
    REVIEW_STATE,
    "the research export's mature column and retentionReading no longer mean the same thing",
  );
});

/**
 * Every secret the app reads is marked in the build CI greps.
 *
 * The second of two checks on that list, and the pair is deliberate rather
 * than duplicated. The provider one above reads `PROVIDER_KEY_ENV`, which is
 * the only way to see a key the chain reaches through `process.env[keyEnv]`
 * with a variable rather than a literal. This one reads the source for a
 * *shape*, which is the only way to see a secret no chain declares at all:
 * `METRICS_TOKEN` gates a route and `RESEARCH_TOKEN` gates the research
 * export, and neither is in anybody's provider list. Delete either and a real
 * class of variable stops being covered.
 *
 * A shape rather than an inventory is what stops it going stale: a variable
 * whose name ends in KEY, TOKEN, SECRET or PASSWORD, read anywhere Next
 * builds, has to be in the canary environment. `NEXT_PUBLIC_` is the one
 * exclusion and it excludes itself, since a variable with that prefix is
 * public by design and is *supposed* to be in the bundle. What it cannot see
 * is a secret named some other way, which is why `ERROR_WEBHOOK_URL` is on
 * the list by somebody's judgement and not by this.
 *
 * Scoped to `app/`, `lib/` and the middleware because those are what Next
 * builds. A variable only a script reads cannot reach a browser, so requiring
 * it here would be a check firing on something that cannot happen, which is
 * the kind people learn to waive.
 */
check("every secret-shaped variable the app reads is marked in the CI canary build", () => {
  const CANARY = ".github/workflows/ci.yml";
  const workflow = read(CANARY);
  const canaryEnv = between(workflow, "Build with marked secrets").split("run: npx next build")[0] ?? "";
  assert.match(
    canaryEnv,
    /canary-[A-Z_]+-must-not-ship/,
    `the marked build in ${CANARY} has been renamed, so this check is reading nothing`,
  );

  const secretish = /^[A-Z0-9_]+_(KEY|TOKEN|SECRET|PASSWORD)$/;
  const found = new Set<string>();
  for (const file of [...APP, ...LIB, "middleware.ts"]) {
    for (const match of read(file).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = match[1]!;
      if (name.startsWith("NEXT_PUBLIC_")) continue;
      if (secretish.test(name)) found.add(name);
    }
  }

  assert.ok(
    found.size >= 8,
    `only ${found.size} secret-shaped variables found, so this check stopped looking`,
  );

  const missing = [...found].filter((name) => !canaryEnv.includes(`${name}:`)).sort();
  assert.deepEqual(
    missing,
    [],
    `${missing.join(", ")} would leak into the client bundle without CI noticing: add each to the marked build in ${CANARY}`,
  );
});

/**
 * A CASE IS NAMED ONLY WHERE EXACTLY ONE CASE IS SPELLED THAT WAY.
 *
 * `lib/estonian/whichCase.ts` is what lets "Say what you see" tell a learner
 * which ending they reached for instead of the one asked for, which is the
 * whole reason that mode is worth having: every other screen can only say the
 * form was not the one wanted.
 *
 * The naive version is the natural thing to write and is wrong in a way nobody
 * would notice from the screen. `tuba` is its own nimetav and its own osastav,
 * and 1,937 of the 2,700 short illatives in the shipped dictionary are spelled
 * like a principal part, so a rule that took the first match would announce
 * `aadressi` as an illative and call a partitive object a subject, which is
 * the fault the level check shipped with once already.
 *
 * Two halves, and both were made to fail before being kept. The verdict has to
 * have a "shared" branch keyed on more than one claim, and the three principal
 * parts have to be in the index: they are there in order to *collide*, and
 * leaving them out is what makes a short illative look unambiguous.
 */
/**
 * WHAT AN ANSWER WAS ABOUT IS RECORDED, AND ONLY EVER FROM A CLOSED LIST.
 *
 * `Review.slot` is what the flash round exists on top of: it asks a word for a
 * form no card of the learner's carries, grades the nearest card they do have
 * (ADR-016), and without the column that answer goes down as being about
 * whatever the card happened to be. `lib/srs/slots.ts` is the one table of
 * what may go in it, and the value arrives through a `"use server"` export, so
 * it is checked rather than trusted: this is the one table that is never
 * updated and never deleted, and a forged slot would not break a count, it
 * would tell somebody they had mastered a word in a form nobody ever asked
 * them for. `CARD_SOURCES` makes the same argument about a column that only
 * breaks a count.
 *
 * And `targetCase` stays what it is. It feeds `caseAccuracy`, which tallies
 * whatever string it finds and hands it to a panel that prints the key in
 * lower case where it recognises nothing, so a morph code written there puts
 * `indprsg3` on the Progress page beside `osastav`. Two questions, two
 * columns, and neither bent to be the other.
 */
check("an answer records which form it was about, from a list nothing can widen", () => {
  const grade = code("lib/srs/grade.ts");
  assert.match(
    grade,
    /slot:\s*slotFor\(/,
    "writeGrade no longer records the slot, so the flash round's answers stop " +
    "counting towards the variety half of mastery",
  );
  assert.match(
    grade,
    /isKnownSlot\(practised\)/,
    "writeGrade no longer checks the slot against lib/srs/slots.ts. It arrives " +
    "from a browser through a public endpoint, into the one table that is never repaired.",
  );
  assert.match(
    grade,
    /targetCase:\s*card\.targetCase/,
    "writeGrade stopped recording the card's own case. That column is what the " +
    "case charts read and it is not the slot's to take over.",
  );

  // And nothing writes a conjugation code into the column the charts read.
  const slots = code("lib/srs/slots.ts");
  assert.match(
    slots,
    /export function slotOfCard/,
    "lib/srs/slots.ts no longer says what an ordinary review's slot is",
  );
  const writers = sourceFiles("lib").concat(sourceFiles("app"))
    .filter((file) => !/\.i?test\.tsx?$/.test(file))
    .filter((file) => /targetCase:\s*(?:slot|CONJUGATION_SLOTS|verb)/.test(code(file)));
  assert.deepEqual(writers, [], "a conjugation slot is being written into targetCase");
});

/**
 * The round grades through the log like every other mode, and marks against
 * the dictionary rather than a model.
 *
 * ADR-016 and ADR-005 together, on a mode that is new enough for both to be
 * easy to lose: the marking is a string comparison in a pure module, and the
 * answer reaches `gradeCard` with the slot it was about. A provider anywhere
 * on this path would be a model deciding whether a morpheme is correct.
 */
check("the flash round grades what it asked, and no model marks it", () => {
  assert.match(
    code("app/(app)/review/flashcards/FlashSession.tsx"),
    /gradeCard\([\s\S]{0,120}task\.slot\)/,
    "the flash round no longer tells the log which form it asked",
  );
  for (const file of sourceFiles("lib/games").concat(["app/(app)/review/flashcards/page.tsx"])) {
    if (!/flash/i.test(file)) continue;
    assert.doesNotMatch(
      code(file),
      /resolveProviders?\(|openWithFallback|\bask\(/,
      `${file} reaches a provider. Whether a form is right is the dictionary's answer.`,
    );
  }
});

check("a case is named only when one case claims the spelling", () => {
  const src = code("lib/estonian/whichCase.ts");
  assert.match(
    src,
    /keys\.length === 1[\s\S]{0,200}kind:\s*"shared"/,
    "readCase no longer refuses to name a spelling that more than one case shares. " +
    "Naming the first match calls a partitive object a subject.",
  );
  for (const part of ["NOMINATIVE", "GENITIVE", "PARTITIVE"]) {
    assert.match(
      src,
      new RegExp(`claim\\([^)]*,\\s*"${part}"\\)`),
      `caseIndex no longer claims the ${part}. The three principal parts are in the ` +
      "index so that a derived form spelled like one of them reads as shared.",
    );
  }
});

/**
 * The scene mode marks against the dictionary before it asks a model anything.
 *
 * The ordering is the whole design of `/api/write` and this inherited it: the
 * case is checked by string comparison first, so a learner who used the right
 * ending is told so with the AI off, a model that hallucinates cannot mark a
 * right form wrong, and an answer that is not a sentence never costs a call.
 * Moving `resolveProvider` above `markDescription` would keep every test
 * passing and quietly hand the verdict to the model.
 *
 * And nothing about the learner is taken from the request. `/api/tutor` posted
 * `level: "B1"` for everybody because a client said so; the level here is read
 * off the learner's own log, and the marking is over a task rebuilt from the
 * dictionary rather than over anything the browser sent (ADR-022).
 */
/**
 * NO MODEL DECIDES WHETHER A LEARNER WAS UNDERSTOOD.
 *
 * `docs/19-situations.md` §18 names the first way this module could fail: a
 * chatbot in a costume. The guard is a type rather than a rule anybody has to
 * remember. `readTurn` is the only producer of `Evidence` and `advance` is its
 * only consumer, so a caller holding a model's opinion about a turn cannot
 * satisfy the signature and cannot move a scene on by mistake. That is
 * `buildOptions` taking a parsed `Government` rather than a case key, and
 * `NounStems.illSgShort` being required rather than optional: both were prose
 * that the code disagreed with until the type carried it.
 *
 * The other half is that the pure-layer check one screen up already covers
 * `lib/scenes/`, so nothing in there can reach a database or a provider at
 * all. What is asserted here is the shape those two functions have, because a
 * later `advance(state, verdict: string)` would pass every other check in this
 * file.
 */
/**
 * THE RATE §29 PUBLISHES IS MEASURED ON THE CODE THAT SHIPS.
 *
 * `npm run eval:scene` exists to answer whether composition is safe, and the
 * first version of it implemented the four checks inside the script. That is a
 * number measured on code nobody was going to run: the script could drift from
 * the module by one condition and the published rejection rate would go on
 * describing the script. It is the fault `PROVIDER_KEY_ENV` was moved for, and
 * the fault the unit suite had when it kept its own list of provider keys.
 *
 * So `lib/scenes/gate.ts` is the one copy and the script builds its context.
 * Checked by reading the import rather than by counting conditions, because a
 * fifth check added to the module is a fifth check the script should inherit
 * without anybody remembering.
 *
 * The second half is ADR-025's: a line reaching a screen carries where it came
 * from. `sceneLine` returns a provenance rather than a string, so a caller
 * holding only the text cannot print the chip, and a composed line cannot be
 * read as a lexicographer's by a screen that forgot to ask.
 */
/**
 * A CLASS SEES EFFORT, NEVER A TRANSCRIPT.
 *
 * ADR-019 stands unchanged and `docs/19-situations.md` §18 names the way this
 * module would break it: a roster row may say how many conversations somebody
 * finished, and the class panel may say which objective the group most often
 * misses, and a transcript belongs to one person. A `SceneRun` holds every turn
 * a learner typed, so a teacher reading one would be reading their practice
 * attempts, which is the thing the classroom boundary exists to prevent.
 *
 * Asserted as an absence, which is the only way to check a rule about what a
 * query must not select. `lib/classroom/` is where a group is rolled up, and
 * nothing in it may name the table at all: a count is a `count`, and a count
 * cannot leak a sentence.
 */
check("a class cannot read a conversation", () => {
  for (const file of LIB.filter((f) => f.startsWith("lib/classroom/") && !f.includes(".test."))) {
    const src = code(file);
    assert.doesNotMatch(
      src,
      /prisma\.sceneRun\.(findMany|findFirst|findUnique)/,
      `${file} reads a scene transcript. A class sees effort and aggregate, never ` +
      "one learner's turns (ADR-019, docs/19-situations.md §18).",
    );
    assert.doesNotMatch(
      src,
      /transcript/,
      `${file} mentions a transcript. Nothing in a class roll-up may.`,
    );
  }
});

check("the scene gate has one implementation, and a line says where it came from", () => {
  const evalScript = code("scripts/eval-scene.ts");
  assert.match(
    evalScript,
    /from "\.\.\/lib\/scenes\/gate"/,
    "scripts/eval-scene.ts no longer reads lib/scenes/gate.ts. A rejection rate measured " +
    "against a copy of the checks is a rate for the copy.",
  );
  assert.doesNotMatch(
    evalScript,
    /function runGate\(/,
    "scripts/eval-scene.ts has its own gate again. There is one, in lib/scenes/gate.ts.",
  );

  const line = code("lib/scenes/line.ts");
  assert.match(
    line,
    /provenance: "attested"/,
    "lib/scenes/line.ts stopped saying an attested line was attested.",
  );
  assert.match(
    line,
    /provenance: "composed"/,
    "lib/scenes/line.ts stopped marking a composed line as composed (ADR-025).",
  );
  /*
    Withheld whole, never caveated. A caveat still puts a wrong form in front of
    somebody trying to learn one, which is the rule `lib/tutor/verify.ts`
    follows about a grader's note.
  */
  assert.match(
    line,
    /if \(first && firstVerdict && passes\(firstVerdict\)\)/,
    "lib/scenes/line.ts no longer requires a composed line to pass the gate before showing it.",
  );
});

/**
 * "I DID NOT UNDERSTAND YOU" IS A CLAIM ABOUT THE LEARNER, SO IT NEEDS ONE.
 *
 * The ladder's way out is `Ma ei saa aru`, and `sceneLine` reaches it in two
 * situations that have nothing to do with each other: the turn was not
 * understood, and the turn was understood perfectly but nothing could be built
 * for the *next* move. A learner reported the second from the first two turns
 * of a scene, where they were greeted, told to greet back, wrote `Tere`,
 * watched the objective tick, and were answered with "I do not understand".
 *
 * Measured over the catalogue at the time: six of the eight `ask` beats have
 * no recorded question anywhere in their topic words, because a lexicographer
 * writes a usage to illustrate a word rather than to ask about one. So on a
 * keyless deployment, or one whose allowance has gone, more than half of every
 * conversation was that sentence, and none of those turns had been misread.
 *
 * `wayOut` is the one function that decides between the repair move and a line
 * of English about what the other side did, and it takes the reading rather
 * than a boolean so the decision cannot be made without having marked the
 * turn. Anchored on the route *passing the reading in*, not on the call alone:
 * a route that called `wayOut` with a constant would satisfy the weaker
 * version and be exactly the bug again.
 */
check("the repair move is only used on a turn nobody understood", () => {
  const line = code("lib/scenes/line.ts");
  assert.match(
    line, /export function wayOut\(/,
    "lib/scenes/line.ts lost wayOut, so the repair phrase is the only way out again",
  );
  assert.match(
    line, /reading === "unrecognised"/,
    "wayOut no longer decides on how the turn was read",
  );

  const route = code("app/api/scene/route.ts");
  assert.match(
    route, /wayOut\(\{[^}]*reading: progress\.reading/,
    "the scene route no longer hands wayOut the reading it marked, so the repair " +
    "move can be printed at somebody who was understood",
  );

  /*
    And the screen may not describe the fourth rung as the third. An English
    line about what the other side did, chipped "They did not catch that", is
    the same lie one layer up.
  */
  const session = code("components/scene/SceneSession.tsx");
  assert.match(
    session, /unspoken:/,
    "components/scene/SceneSession.tsx has no chip for a turn nothing could be said for",
  );
  assert.doesNotMatch(
    session, /unspoken: "They did not catch/,
    "an unspoken turn is chipped as a turn nobody understood, which is the bug this fixed",
  );
});

check("a scene is marked by the server, and its grades go to the shared log", () => {
  /*
    `submitExam`'s shape and `recordSonad`'s, a third time, and for the reason
    both give: a result anybody can type is not a measurement, and here it is
    worse than that, because a conversation writes into the review log and a
    forged one would schedule words nobody said.

    The client sends which run it was and what it typed. `finishRun` reads the
    row, replays every turn through the same `readTurn` the learner saw, and
    hands what it found to `gradeCard`, which is the door ADR-016 names. Two
    markers would be two answers to "were you understood", and the one nobody
    watches is the one that drifts, so there is one `replay` and both ends call
    it.
  */
  /*
    `between` rather than a lazy match to the first line-starting brace, which
    was the first version of this and was wrong twice in one check: both of
    these take a destructured object type, so the parameter list itself closes
    on a `}` in column nought, and the match read the signature and called it
    the body. It found nothing and reported that the action no longer marks,
    which is a check reporting its own regex. The helper was already here.
  */
  const actions = code("app/actions.ts");
  const action = between(actions, "export async function finishScene(");
  assert.ok(action, "finishScene has gone, or changed shape past recognition");
  assert.match(action, /finishRun\(/, "finishScene no longer re-marks on the server");
  assert.match(action, /gradeCard\(/, "a scene no longer grades through gradeCard (ADR-016)");

  /*
    The signature rather than the body, which is the lesson `recordSonad`'s own
    check learned the hard way: a pattern for the word `rating` matches the
    perfectly correct `gradeCard(card.id, grade.rating, 0)` inside, and a check
    that fires on honest code is a check people waive.
  */
  const signature = /export async function finishScene\(([\s\S]*?)\)\s*\{/
    .exec(actions)?.[1] ?? "";
  assert.doesNotMatch(
    signature, /rating|score|grade|objectives|outcome/i,
    "finishScene takes a mark from its caller, which is a result anybody can type",
  );

  // And one replay, reached from both ends, rather than a marker per door.
  const server = code("lib/progress/scene.ts");
  assert.match(server, /export function replay\(/, "the shared replay has gone");
  assert.match(
    between(server, "export async function finishRun("),
    /replay\(/,
    "finishRun marks a run some other way than the replay the learner saw",
  );
  assert.match(
    code("app/api/scene/route.ts"), /replay\(/,
    "the route reads a turn some other way than the replay that writes the record",
  );
});

check("a scene's debrief points at a drill that exists", () => {
  /*
    `lib/scenes/drills.ts` reads the drill off what the beat needed rather than
    linking the same one whatever happened, which means it holds hrefs, and an
    href in a pure module is a string nothing checks. `DrillLink` returns null
    on one it cannot resolve rather than throwing, deliberately, so a retired
    drill would leave the debrief silently missing its one piece of advice on a
    screen somebody reached by failing.

    `lib/ux/modes.ts` is what a mode is, and this is the same pairing every
    other reader of that table is held to.
  */
  const table = code("lib/scenes/drills.ts");
  const hrefs = [...table.matchAll(/"(\/review\/[a-z-]+)"/g)].map((m) => m[1]!);
  assert.ok(hrefs.length >= 2, `drills.ts names ${hrefs.length} drills, which is not a table`);

  const modes = code("lib/ux/modes.ts");
  for (const href of hrefs) {
    assert.match(
      modes, new RegExp(`href:\\s*"${href}"`),
      `the scene debrief links ${href}, which lib/ux/modes.ts does not have`,
    );
  }
});

check("nothing but the dictionary can advance a scene", () => {
  const turn = code("lib/scenes/turn.ts");
  const state = code("lib/scenes/state.ts");

  assert.match(
    turn,
    /export function readTurn\(/,
    "lib/scenes/turn.ts no longer exports readTurn, which is the only producer of Evidence.",
  );
  assert.match(
    state,
    /export function advance\(\s*scene: SceneSpec,\s*state: SceneState,\s*evidence: Evidence,/,
    "advance no longer takes Evidence. A caller holding a model's opinion must not be able " +
    "to satisfy it: that is the whole guard on this module (docs/19-situations.md §8).",
  );

  /*
    One producer, asserted by counting. A second function returning Evidence is
    the door a model's verdict walks through, and it would look entirely
    reasonable in review.
  */
  const producers = [...turn.matchAll(/\): Evidence \{/g)].length;
  assert.equal(
    producers, 1,
    `lib/scenes/turn.ts has ${producers} functions returning Evidence. There is exactly one.`,
  );
  assert.doesNotMatch(
    state,
    /\): Evidence\b/,
    "lib/scenes/state.ts builds Evidence. Only readTurn may, or the consumer becomes its own producer.",
  );
});

check("the scene route marks mechanically before it reaches a provider", () => {
  const src = code("app/api/describe/route.ts");
  const marked = src.indexOf("markDescription(");
  const provider = src.indexOf("resolveProvider(");
  assert.ok(marked > 0 && provider > 0, "the describe route no longer does both of these");
  assert.ok(
    marked < provider,
    "app/api/describe/route.ts asks a provider before it marks. The dictionary's " +
    "verdict has to be computed first, so it stands when the model is off or wrong.",
  );
  assert.doesNotMatch(
    src,
    /body\.(level|mark|rating|rightCase)/,
    "the describe route reads a mark or a level off the request. Both are the " +
    "server's to decide (ADR-022); the level comes from courseLevelFor.",
  );
  assert.match(
    src,
    /verifyComment\(/,
    "the describe route no longer verifies what the model wrote (ADR-005).",
  );
});

/**
 * A contributed sentence passes the same gate a photographed page does.
 *
 * `lib/collections/sceneAnswers.ts` is the one place a person's own Estonian
 * prose reaches a learner as a model answer, and being written by a native
 * speaker buys it no exception: a typo, a dropped diacritic or a word the
 * dictionary has never heard of is exactly what the scanner's gate catches,
 * and a model answer made of words a learner cannot look up is worse than
 * none. `matchEstonianForm` at the vouched score is that gate (ADR-021), and
 * this is the fourth door onto it after the scanner, the headlines and the
 * frequency count.
 *
 * The data file itself has to stay data. It is generated, so an import in it
 * is either a model reaching the file or a hand edit that the next run of the
 * importer will silently throw away.
 */
check("a contributed scene sentence is gated by the dictionary", () => {
  const importer = code("scripts/import-scene-answers.ts");
  assert.match(
    importer,
    /matchEstonianForm\(/,
    "scripts/import-scene-answers.ts no longer puts every word through " +
    "matchEstonianForm. A native speaker's typo would ship as a model answer.",
  );
  assert.match(
    importer,
    /rejected\.push/,
    "the importer no longer refuses a sentence it could not vouch for.",
  );

  const data = code("lib/collections/sceneAnswers.ts");
  assert.doesNotMatch(
    data,
    /^\s*import\s/m,
    "lib/collections/sceneAnswers.ts imports something. It is generated data: " +
    "anything computed in it is thrown away by the next import.",
  );
});


// ── The Learn ladder (new words) ─────────────────────────────────────────────

check("the ladder a new word climbs is the scheduler's own steps", () => {
  /*
    Learn walks a word up three rungs: meet it, pick what it means, put it back
    in the sentence. FSRS already keeps a card in Learning across two steps
    before it graduates and already sends a missed card back to the first one,
    so a ladder of our own beside that would be two answers to when a word is
    known, drifting apart a grade at a time. The rung is *read off* `state` and
    `learningSteps`, which `Card` has carried since the scheduler was written.

    Two shapes fail here. A rung stored anywhere, which is the same argument
    ADR-014 makes about progress: a second source of truth drifts, and it can be
    awarded for something that never happened. And a second reader working a
    rung out for itself, which is how the ladder and the scheduler come to
    disagree about whether a word graduated.
  */
  const ladder = code("lib/learn/ladder.ts");
  assert.match(ladder, /state === NEW/, "the ladder no longer reads the scheduler's state");
  assert.match(ladder, /learningSteps/, "the ladder no longer reads the scheduler's own step");

  const schema = read("prisma/schema.prisma");
  for (const column of ["rung", "learnStage", "ladderStep"]) {
    assert.doesNotMatch(
      schema, new RegExp(`\\b${column}\\b`),
      `${column} is a stored rung. The ladder is derived from state and learningSteps.`,
    );
  }

  const readers = ALL
    .filter((f) => !/\.(test|itest)\.tsx?$/.test(f))
    .filter((f) => /\blearningSteps\b/.test(code(f)));
  const allowed = new Set([
    /*
      The scheduler owns the field. `grade` applies it, `backfill` and `deck`
      write it on a new card, and the three that carry a card across the wire
      round-trip it, which the schema says in as many words: dropping it pins a
      card in Learning for ever.
    */
    "lib/srs/scheduler.ts", "lib/srs/grade.ts", "lib/srs/backfill.ts", "lib/srs/deck.ts",
    "app/actions.ts", "app/(app)/review/cards.ts",
    // The ladder reads it, and the two files that put a rung on a screen.
    "lib/learn/ladder.ts", "lib/progress/learn.ts",
    "app/(app)/learn/new/LearnSession.tsx",
  ]);
  assert.deepEqual(
    readers.filter((f) => !allowed.has(f)), [],
    "a new file reads the FSRS learning step. If it is working out a rung, "
    + "call rungOf in lib/learn/ladder.ts rather than reading the number.",
  );

  // And the mapping itself, because the three rungs are the whole feature.
  assert.equal(rungOf(0, 0), "meet");
  assert.equal(rungOf(1, 0), "choice");
  assert.equal(rungOf(1, 1), "gap");
  assert.equal(rungOf(2, 0), "kept");
});

check("learn teaches a word and practice drills it, never both at once", () => {
  /*
    The daily row used to be Review and it did two jobs: the cards that were
    due, and a trickle of words the learner had never seen, taught in among
    them. Learn owns the second one now, and the line between the two screens
    has to be drawn in the queries or a word being learned this evening turns up
    on both, asked cold on the screen that does not teach.

    Two clauses, and they are different shapes on purpose. The due read excludes
    the ladder's own card while it is still in learning, which is a plain
    predicate on the row because that is the hottest read in the app. The unseen
    read excludes every card of a word the ladder still has hold of, which needs
    the word rather than the row and so is a `none` on the entry's own cards.
  */
  const review = code("app/(app)/review/page.tsx");
  assert.match(
    review, /NOT:\s*\{\s*cardType:\s*LADDER_CARD_TYPE/,
    "the review queue serves a card the Learn ladder is still walking",
  );
  assert.match(
    review, /pastTheLadder\(ownerId\)/,
    "the review queue introduces unseen cards of a word Learn has not finished with",
  );
  assert.match(
    review, /state:\s*\{\s*in:\s*\[\.\.\.LADDER_STATES\]/,
    "the review queue names the ladder's states itself rather than reading the table",
  );

  /*
    And Today counts what Practice will actually serve. A number on the home
    page that the review queue then refuses to fill reads as a counting fault
    rather than as a rule, which is worse than either.
  */
  const summary = code("lib/progress/summary.ts");
  assert.match(summary, /LADDER_CARD_TYPE/, "the deck snapshot draws its own line under the ladder");
  assert.match(summary, /isLearningWord\(/, "the deck snapshot no longer asks which words are Learn's");

  // The card the ladder is kept on is one fact, named once.
  const typed = ALL.filter((f) => f.startsWith("lib/learn/") || f === "lib/progress/learn.ts")
    .filter((f) => /"RECOGNITION"/.test(code(f)));
  assert.deepEqual(
    typed.filter((f) => f !== "lib/learn/ladder.ts"), [],
    "the ladder's card type is typed out again. It is LADDER_CARD_TYPE in lib/learn/ladder.ts.",
  );
});

check("a word is introduced by one drawing", () => {
  /*
    A first meeting shows the word, what it means, and an attested sentence with
    the form marked in it, and it says where the sentence came from. Review had
    that drawing and Learn needs the same one: two copies would be two answers
    to how a word is introduced, and the one nobody was looking at would be the
    one that stopped naming its source.
  */
  assert.ok(existsSync("components/WordIntro.tsx"), "the shared first meeting is gone");
  for (const file of ["app/(app)/review/ReviewSession.tsx", "app/(app)/learn/new/LearnSession.tsx"]) {
    assert.match(code(file), /<WordIntro\b/, `${file} draws a first meeting of its own again`);
  }
  const provenance = ALL.filter((f) => /A real sentence, from Ekilex/.test(read(f)));
  assert.deepEqual(
    provenance, ["components/WordIntro.tsx"],
    "more than one screen says where a teaching sentence came from",
  );
});

check("no rung of the ladder prints the answer it is asking for", () => {
  /*
    The rung before the gap asked what the word means, so the gap is about the
    form and needs to say which word it wants. That cue is the review card's own
    fallback and for its reason: the lemma and the meaning, then the meaning
    alone, then nothing, because wherever the gap wants the dictionary form the
    lemma would be the answer printed a line under the question. The sentence's
    English translation is held to the same test, since thirty entries in the
    dictionary are spelled the same in both languages.
  */
  const learn = code("lib/progress/learn.ts");
  assert.match(learn, /mentions\(example\.en, cloze\.answer\)/,
    "the gap prints an English translation without checking it is not the answer");
  assert.match(learn, /find\(\(line\) => !mentions\(line, cloze\.answer\)\)/,
    "the gap's cue no longer falls back where it would hand the answer over");

  /*
    And the rung above it. Thirty entries in the dictionary are spelled the same
    in both languages, so "what does `film` mean" prints its own answer at the
    top of the screen, which is the fault the audit found on four other screens
    in the pass before this one. Such a word is asked at the gap instead, where
    there is a real question about it.
  */
  assert.match(
    code("app/(app)/learn/new/LearnSession.tsx"),
    /sameSpelling\(word\.lemma, word\.gloss\)/,
    "the ladder asks what a word means when the word and the meaning are the same string",
  );
});

check("a destination reached from another one really is linked from there", () => {
  /*
    `within` in lib/ux/nav.ts keeps a row out of the rail on the promise that
    the screen it belongs to offers it. A `within` nobody wired up is worse than
    the menu it left: the screen is then reachable only through the command
    palette. `lib/ux/nav.test.ts` asserts this for the practice modes and the
    nav table went unchecked, which is how the deck and the mock paper came to
    claim they were on Progress while neither was linked from it.

    Asserted against the route's whole directory rather than one file, because a
    page splits into a client component as often as not.
  */
  const inside = DESTINATIONS.filter((d) => d.within?.startsWith("/"));
  assert.ok(inside.length >= 4, `only ${inside.length} destinations live inside another one`);

  for (const item of inside) {
    const segment = item.within!.split("/").filter(Boolean)[0]!;
    const dir = join("app", "(app)", segment);
    assert.ok(existsSync(dir), `${item.href} says it is reached from ${item.within}, which is not a route`);
    const linked = ALL
      .filter((f) => f.startsWith(dir.replace(/\\/g, "/")) || f.startsWith(`${dir}/`))
      .some((f) => code(f).includes(`"${item.href}"`) || code(f).includes(`\`${item.href}`));
    assert.ok(
      linked,
      `${item.href} is kept out of the rail because it is reached from ${item.within}, `
      + `and nothing under ${dir} links to it. That leaves it reachable only from the palette.`,
    );
  }
});

/*
  READINESS FOR A SITUATION IS READ ON THREE RUNGS, AND THE FIRST IS THE ONLY
  ONE A WORD COUNT REACHES.

  "You would understand 81 percent of everyday situations" is what a vocabulary
  app computes and it answers the least useful question: knowing the words is
  what lets you follow the receptionist, not what lets you answer her.
  `lib/readiness/rungs.ts` reads the course's own can-do claims as follow, take
  part and lead, and its one promise is that recognition on its own never
  clears the second rung. Driven here rather than read out of the source,
  because the rule is about what the function returns and a regex over the
  arithmetic would pass on a rewrite that changed the answer.
*/
check("recognising a word on cards never clears the second rung of a situation", () => {
  const recognised: WordEvidence = {
    recognise: { asked: 200, right: 200, medianMs: 800, lastRight: true },
    produce: { asked: 0, right: 0, medianMs: null, lastRight: null },
    formsRight: 0,
    daysSince: 0,
  };
  assert.equal(wordStanding(recognised), "follow", "two hundred perfect recognitions read as more than following");

  const doctor = SITUATIONS.find((s) => s.id === "keha-ja-tervis")!;
  const evidence = new Map<string, WordEvidence>();
  const lemmas = [...doctor.lemmas, ...doctor.machineryUnits.flatMap((id) => SITUATIONS.find((s) => s.id === id)?.lemmas ?? [])];
  for (const lemma of lemmas) evidence.set(lemma, recognised);
  const reading = readSituation(doctor, {
    evidence,
    available: new Set(lemmas),
    cases: new Map(doctor.cases.map((c) => [c, { pct: 100, reviews: 50 }])),
    listening: { placed: "C1", sittings: 3 },
  });
  assert.equal(reading.uncapped, "follow", `every word recognised perfectly read as "${reading.uncapped}"`);
  assert.equal(reading.tryThis, null, "a situation only ever followed was offered as something to try");
});

/*
  AND EVERY DOOR A STRUGGLE OFFERS OPENS. A struggle carries an href, and a
  struggle whose href is a typo is a dead end on the one screen whose whole
  job is a way out. The readings are driven across the contexts that produce
  every kind of struggle and each destination is checked against `app/`.
*/
check("every drill a readiness struggle points at is a route the app has", () => {
  const routes = new Set(
    APP.filter((f) => f.endsWith("page.tsx"))
      .map((f) => "/" + f.replace(/^app\//, "").replace(/\([^)]+\)\//g, "").replace(/\/?page\.tsx$/, "")),
  );
  const exists = (href: string) => {
    const path = href.split("?")[0]!;
    if (routes.has(path) || routes.has(path.replace(/^\//, ""))) return true;
    // A dynamic segment: /grammar/adessive is app/(app)/grammar/[caseKey].
    return [...routes].some((r) => {
      const pattern = "^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$";
      return new RegExp(pattern).test(path) || new RegExp(pattern).test(path.replace(/^\//, ""));
    });
  };

  const word = (over: Partial<{ rec: number; prod: number; ms: number | null; lastRight: boolean; days: number }>): WordEvidence => ({
    recognise: { asked: over.rec ?? 0, right: over.rec ?? 0, medianMs: 1_000, lastRight: over.rec ? true : null },
    produce: {
      asked: over.prod ?? 0, right: over.prod ?? 0,
      medianMs: over.ms === undefined ? 2_000 : over.ms, lastRight: over.prod ? (over.lastRight ?? true) : null,
    },
    formsRight: (over.prod ?? 0) >= 3 ? 2 : 0,
    daysSince: over.days ?? 1,
  });
  const contexts = [
    word({ rec: 3 }),
    word({ rec: 3, prod: 3, lastRight: false }),
    word({ rec: 3, prod: 3, days: 60 }),
    word({ rec: 3, prod: 6, ms: 12_000 }),
    word({ rec: 3, prod: 6, ms: null }),
    word({ rec: 3, prod: 6 }),
  ];
  const hrefs = new Set<string>();
  for (const situation of SITUATIONS) {
    for (const e of contexts) {
      const evidence = new Map<string, WordEvidence>();
      for (const lemma of situation.lemmas) evidence.set(lemma, e);
      for (const listening of [{ placed: null, sittings: 0 }, { placed: "A1", sittings: 0 }]) {
        const reading = readSituation(situation, {
          evidence, available: new Set(situation.lemmas), cases: new Map(), listening,
        });
        for (const s of reading.struggles) if (s.href) hrefs.add(s.href);
      }
    }
  }
  assert.ok(hrefs.size >= 8, `the readings only ever pointed at ${hrefs.size} places, which is fewer than the struggles there are`);
  const dead = [...hrefs].filter((h) => !exists(h));
  assert.deepEqual(dead, [], `a readiness struggle points at a route that does not exist: ${dead.join(", ")}`);
});

/*
  A RUNG IS PRINTED WITH THE EVIDENCE BEHIND IT, EVERYWHERE IT IS PRINTED.

  The exam hub's rule (`EVIDENCE_LABEL` beside every `.confidence`), applied to
  the rung: "take part" on eleven answers and on two hundred are two different
  sentences, and a chip on its own is the number this screen exists to
  replace. Anchored on the chip component, because a file that draws the chip
  is a file printing a verdict, whatever it calls the variable.
*/
check("a screen that prints a situation's rung prints the evidence tier beside it", () => {
  const screens = [...APP, ...COMPONENTS].filter((f) => /<RungChip\b/.test(code(f)));
  assert.ok(screens.length >= 3, `only ${screens.length} screens draw a rung chip`);
  for (const file of screens) {
    const src = code(file);
    assert.ok(
      /EVIDENCE_LABEL|EVIDENCE_NOTE|standingLine/.test(src),
      `${file} prints a rung and not what the evidence behind it is worth`,
    );
  }
});

/**
 * LIGHT IS THE DEFAULT AND DARK IS A CHOICE.
 *
 * The palette used to follow the system: a `prefers-color-scheme: dark` block
 * painted the dark tokens for anybody whose phone or laptop was set that way
 * and who had never touched the toggle, which is most phones after dark. So
 * the landing page, the one screen a stranger decides on, opened in a palette
 * nobody here had chosen for it and that it had been designed against only
 * second. Now bare `:root` is light for everybody and the dark palette lives
 * under `[data-theme="dark"]` alone, written by the toggle and read back
 * before first paint by the inline script in app/layout.tsx.
 *
 * Three things have to agree for that to be true, and each is read with its
 * comments stripped, because the note explaining why the block went names the
 * block: the stylesheet holds no system-preference palette, nothing in the
 * app asks `matchMedia` which way the system leans, and the suites that
 * measure the dark theme choose it the way a reader does rather than emulate
 * a preference the palette no longer reads, since that would sweep the light
 * theme twice and report the dark one clean.
 */
check("the dark palette is a choice, never the system's", () => {
  const stripped = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const css = stripped("app/globals.css");
  assert.equal(
    /prefers-color-scheme/.test(css), false,
    "app/globals.css reads the system's colour scheme again, so the default theme depends on the device",
  );
  assert.match(css, /:root\[data-theme="dark"\]\s*\{/, "app/globals.css has lost the chosen dark palette");
  for (const file of [...APP, ...COMPONENTS]) {
    assert.equal(
      /prefers-color-scheme/.test(code(file)), false,
      `${file} asks which way the system leans, and the theme is light until somebody chooses`,
    );
  }
  for (const file of ["scripts/a11y-check.mjs", "scripts/test-containment.mjs"]) {
    const src = stripped(file);
    assert.equal(
      /colorScheme:\s*["']dark["']/.test(src), false,
      `${file} emulates a system preference the palette no longer reads, so its dark pass measures the light theme`,
    );
    assert.match(
      src, /localStorage\.setItem\("theme", "dark"\)/,
      `${file} no longer chooses the dark theme the way the toggle does, so nothing sweeps it`,
    );
  }
});

/*
  NOTHING ABOUT READINESS IS STORED. It is derived from the append-only log on
  every request (ADR-014), and the one module that reads the database for it
  may only read.
*/
check("readiness is derived on every request and never written down", () => {
  const src = code(join("lib", "progress", "readiness.ts"));
  assert.doesNotMatch(
    src,
    /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/,
    "lib/progress/readiness.ts writes to the database, and a stored readiness is a second source of truth that drifts",
  );
  assert.doesNotMatch(SCHEMA, /readiness|\brung\b/i, "the schema grew a readiness column; it is derived, never stored");
});

/**
 * A TEXT FIELD KEEPS THE RING EVERY OTHER CONTROL GETS.
 *
 * `:focus-visible` in app/globals.css draws the accent ring on everything
 * that can take focus, and `outline-none` on a field is a Tailwind utility
 * that beats it. Twenty text fields carried it, from the wizard's name field
 * (the first thing anybody types into here) to sign-in, every typed answer
 * in review, the import box and the crossword's cells, and the design suite
 * never met one because it tabs four routes and none of them has a text
 * field on arrival. Some of the twenty swapped in a `focus:` shadow, which is
 * a ring of a kind; most swapped in nothing, so a keyboard user typing their
 * own name could not see where the caret was going.
 *
 * The rule is the one rule: no field switches the outline off. A field that
 * wants a softer ring can add to it, never take it away.
 */
check("no text field switches its focus ring off", () => {
  /*
    A tag is read to its own close, `/>`, rather than to the first `>`: an
    `onChange={(e) => ...}` sits inside every one of these tags and its arrow
    is a `>`. The first version of this stopped there, never reached the
    className, and passed with `outline-none` put back on the wizard's name
    field, which is the fault it was written for.
  */
  const offenders: string[] = [];
  for (const file of [...APP, ...COMPONENTS]) {
    const source = code(file);
    for (const m of source.matchAll(/<(input|textarea)\b([\s\S]*?)\/>/g)) {
      if (/\b(?:focus:|focus-visible:)?outline-none\b/.test(m[2] ?? "")) {
        offenders.push(`${file}: <${m[1]}> with outline-none`);
      }
    }
    if (/outline(?:Style)?:\s*["']none["']/.test(source)) offenders.push(`${file}: outline: none in a style`);
  }
  assert.deepEqual(offenders, [], "a text field takes the focus ring away, and a keyboard user cannot see where they are typing");
});

console.log(
  failures === 0
    ? `\nAll ${checks} invariants hold.`
    : `\n${failures} of ${checks} invariants broken.`,
);

process.exit(failures === 0 ? 0 : 1);
