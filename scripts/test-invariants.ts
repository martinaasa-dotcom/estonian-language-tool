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
import { buildOptions, parseGovernment, type Government } from "../lib/estonian/government";
import { TOPIC_GROUPS } from "../lib/estonian/grammar";
import { NAV_MOTION } from "../lib/ux/navMotion";
import { LETTER_CHARACTERS } from "../lib/ux/letterMotion";
import { DEMO_STEMS } from "../lib/collections/demoWords";
import { grammarGroupTerm, grammarTerm } from "../lib/estonian/terms";
import { CLOSED_CLASS_EXAMPLES, WORKED_FORMS, buildSystemPrompt } from "../lib/tutor/prompt";
import { TELLS, VOICE_RULES, findTells } from "../lib/copy/voice";
import { allGlosses, occasionsFor } from "../lib/copy/almanac";
import { glossSenses } from "../lib/dict/gloss";
// @ts-expect-error - plain JS, shared with the .mjs browser suites it describes.
import { DECLARES_SUITE, NOT_IN_CI } from "./lib/suites.mjs";

let failures = 0;
let checks = 0;

function check(label: string, run: () => void) {
  checks += 1;
  try {
    run();
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
  for (const file of callers) {
    assert.match(
      code(file),
      /caseAnswer\(/,
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
  // It is the one table whose loss is unrecoverable, and it is the input to
  // FSRS parameter optimisation. An undo writes a compensating row.
  for (const file of ALL) {
    assert.equal(/review\.update/.test(read(file)), false, `${file} updates a review`);
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
  */
  const sessions = SESSION_FILES().filter((f) => !MEASURES_RATHER_THAN_PRACTISES.includes(f));
  assert.ok(sessions.length >= 6, `expected the practice sessions, found ${sessions.length}`);
  for (const file of sessions) {
    assert.match(
      code(file),
      /\b(gradeCards?|replayGrades|completeLesson|recordCheckpoint|submitExam)\b/,
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
      /\b(gradeCards?|replayGrades|completeLesson|recordCheckpoint|submitExam)\b/,
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
    if (!/\b(gradeCards?|replayGrades|completeLesson|recordCheckpoint|submitExam)\b/.test(source)) continue;
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
    assert.match(
      source,
      /useState\(\s*initial\w+\s*\)/,
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
  */
  const lockedPaths = [
    {
      what: "addCardsFor",
      body: /async function addCardsFor\(([\s\S]*?)\n\}/.exec(code("app/actions.ts"))?.[1] ?? "",
      read: "card.findMany",
      write: "card.createMany",
    },
    {
      what: "addUnitsToDeck",
      body: /export async function addUnitsToDeck\(([\s\S]*?)\n\}/.exec(code("lib/srs/deck.ts"))?.[1] ?? "",
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
      const window = src.slice(statement, at + 900);
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
  */
  const suggest = read("lib/dict/suggest.ts");
  assert.match(suggest, /const POS = \[/, "the suggestion row stopped naming which parts of speech it offers");

  for (const read_ of suggest.matchAll(/prisma\.lexeme\.\w+\(|FROM "Lexeme"/g)) {
    const window = suggest.slice(read_.index, read_.index + 400);
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
    "assessment", "collections", "copy", "estonian", "exam", "gamification", "offline",
    "random", "scan", "security", "stats", "time", "ux",
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
    that the bar is off by default and turned on only under a query naming both
    a width and a real pointer, that the answer is asked and stored, and that
    there is a way back.
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

  // Both halves of "a desktop". `min-width` alone hands the bar to a tablet in
  // landscape with nothing attached to it.
  const query = /@media\s*\(min-width:\s*768px\)\s*and\s*\(pointer:\s*fine\)\s*\{([\s\S]*?)\n  \}/
    .exec(css);
  assert.ok(query, "the letter bar is no longer drawn under a width-and-pointer query");
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
    const floor = /suite\([^)]*\{\s*floor:\s*(\d+)\s*\}/.exec(source);
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
    assert.match(source, /authoriseCall\(/, `${file} opens a provider without asking the ledger first`);
    assert.match(source, /recordUsage\(/, `${file} opens a provider and never files what it spent`);
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
check("first run is exercised, which means one suite runs before the fixture", () => {
  const workflow = read(join(".github", "workflows", "ci.yml"));
  const suite = workflow.indexOf("node scripts/test-assess.mjs");
  const fixture = workflow.indexOf("scripts/demo-data.ts");
  const server = workflow.indexOf("Start the server");

  assert.ok(suite > 0, "CI does not run scripts/test-assess.mjs at all");
  assert.ok(fixture > 0, "CI does not build the demo fixture");
  assert.ok(
    suite < fixture,
    "CI builds the demo deck before test-assess.mjs runs, so /start redirects and the " +
    "first-run walkthrough is waived rather than checked. It has to run against an empty deck.",
  );
  assert.ok(
    server < suite,
    "test-assess.mjs is a browser suite and CI runs it before the server is up",
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
  assert.doesNotMatch(
    helper,
    /\b(Again|Hard|Good|Easy)\b[\s\S]{0,120}?\.click\(/,
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
 * The layers that are pure are still pure, which nothing was checking.
 *
 * CLAUDE.md names thirteen directories that "stay free of React, Next.js and
 * Prisma: pure functions, unit tested", and that was prose alone. All thirteen
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
    "assessment", "estonian", "gamification", "stats", "collections", "time",
    "offline", "security", "scan", "questions", "ux", "random", "copy",
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
    reminder is one indexed read and some string building, so a ceiling there
             would be met by a person tapping twice and by nobody else, which
             is the same argument `lib/security/actionLimits.ts` makes about
             grading a card.
  */
  const exempt = new Set(["metrics", "reminder"]);

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
check("a date is written in the reader's own locale, not the server's", () => {
  for (const file of [...APP, ...COMPONENTS]) {
    const source = code(file);
    /*
      Only a call that leaves the locale to the runtime. A literal locale is a
      deliberate choice and is usually not about a date at all: the landing
      page writes a word count with `toLocaleString("en-GB")` so the thousands
      separator does not move about, which is the opposite of this fault.
    */
    const LEFT_TO_THE_RUNTIME = /toLocale(?:Date|Time)?String\(\s*(?:undefined|\))/;
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
    const call = /toLocale(?:Date|Time)?String\(\s*(?:undefined|\))/g;
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

  const centred = CSS.match(/:has\(>\s*svg:only-child\)[^{]*\{([^}]*)\}/);
  assert.ok(centred, "nothing in app/globals.css centres an icon-only control's content");
  for (const declaration of ["display: inline-flex", "align-items: center", "justify-content: center"]) {
    assert.ok(
      centred[1]!.includes(declaration),
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
  assert.match(
    suite, /colorScheme:\s*"dark"/,
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
  years out. Both now read FOUND_HOURS_PER_WEEK, so the band and the copy
  cannot drift apart again. Asserted on the constant reaching both, not on the
  number, which is the thing that is allowed to change.
*/
check("the verdict band and the found-hours sentence read one constant", () => {
  const plan = read("lib/assessment/plan.ts");
  assert.match(
    plan, /export const FOUND_HOURS_PER_WEEK/,
    "the found-hours figure has stopped being a named constant, so the copy can quote a different one",
  );
  const verdictLine = plan.slice(plan.indexOf("const verdict: Verdict"), plan.indexOf("const verdict: Verdict") + 240);
  assert.match(
    verdictLine, /FOUND_HOURS_PER_WEEK/,
    "the verdict band no longer reads the constant the plan's own copy quotes",
  );
  const panel = read("components/assessment/PlanPanel.tsx");
  assert.match(
    panel, /weeksNeeded\([^)]*FOUND_HOURS_PER_WEEK\s*\)/,
    "PlanPanel passes its own number to weeksNeeded rather than the constant the band is drawn at",
  );
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
  */
  const tagged = [...APP, ...COMPONENTS].filter((f) => read(f).includes("AI_TAG"));
  assert.ok(
    tagged.length >= 6,
    `only ${tagged.length} screens read AI_TAG; the tag is being written some other way`,
  );

  const retyped = [...APP, ...COMPONENTS].filter((f) => /AI\s*·\s*verify/.test(read(f)));
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
  const named = [...new Set([...yaml.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]!))];
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
    between(level, "export async function courseLevelFor"),
    /readSettings\([^)]*SETTING_KEYS\.cefrPlacementAt/,
    "courseLevelFor stopped asking the store when the declared level was stated, so the picker "
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
    Ekilex records for it, is a thing somebody runs against a live key rather
    than a check that can live in this file. It was run for all five of these
    words: 55 singular forms, all agreeing, and every long plural with them.
    What differs is the parallel short plural Estonian genuinely has
    (`raamatuis` beside `raamatutes`), which this card does not show.

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

console.log(
  failures === 0
    ? `\nAll ${checks} invariants hold.`
    : `\n${failures} of ${checks} invariants broken.`,
);

process.exit(failures === 0 ? 0 : 1);
