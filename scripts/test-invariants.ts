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

import { extractEstonianSenses } from "../lib/dict/wiktionary";
import { wordNote } from "../lib/estonian/dictation";
import { ACTION_LIMITS } from "../lib/security/actionLimits";
import { NOT_EXPORTED } from "../lib/legal/exportCoverage";
import { CATEGORY_KEYS } from "../lib/suggestions/model";
import { CASES } from "../lib/estonian/cases";
import { TOPIC_GROUPS } from "../lib/estonian/grammar";
import { grammarGroupTerm, grammarTerm } from "../lib/estonian/terms";
import { CLOSED_CLASS_EXAMPLES, WORKED_FORMS } from "../lib/tutor/prompt";

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
  read(file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * One exported function's body, from its signature to the next export.
 *
 * Coarse on purpose. A check that parses TypeScript is a check that breaks on
 * a syntax nobody thought about; this only needs to know which half of a file
 * a call site is in.
 */
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
    paradigm for at all, so they cannot be checked the same way and stay
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
const MEASURES_RATHER_THAN_PRACTISES = [
  "app/(app)/placement/PlacementSession.tsx",
];


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

check("the pure modules stay free of React, Next and Prisma", () => {
  /*
    These are the ones with unit tests around them, and a test is only cheap
    while the module under it can be imported without a framework.
  */
  const pure = [
    "assessment", "collections", "copy", "estonian", "exam", "gamification", "offline",
    "scan", "security", "stats", "time", "ux",
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

check("an Estonian text input gets the diacritic bar", () => {
  /*
    õ ä ö ü š ž are not on a UK or US keyboard, and a learner typing an answer
    should not have to know an alt code to be marked right.
  */
  // The characters, not the component that draws them: `EstonianInput` builds
  // its own row and `DiacriticBar` is the free-standing one, and either is a
  // fine way to keep the promise.
  for (const file of ["components/EstonianInput.tsx", "components/DiacriticBar.tsx"]) {
    const source = read(file);
    for (const letter of ["õ", "ä", "ö", "ü", "š", "ž"]) {
      assert.ok(source.includes(letter), `${file} no longer offers ${letter}`);
    }
  }
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
    times it rewrote them into `", "`: a bare comma sitting in a paradigm cell
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
    const source = read(file);
    if (!/newPage|goto\(/.test(source)) continue;
    assert.match(source, /baseUrl\(\)/, `${file} does not read BASE_URL`);
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
    const source = read(file);
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
    const source = read(file);
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
  // The one thing off the scale on purpose, as §3 says in as many words: a
  // numeral set large enough to read as a shape behind a card, aria-hidden,
  // ornament rather than type. Listed rather than pattern-matched, and the
  // check below fails if it stops being there, so it cannot quietly become a
  // place to park a size somebody could not be bothered to fit.
  const ORNAMENT = { file: "app/(chromeless)/welcome/page.tsx", size: "92px" };
  const STEPS = new Set([
    "11.5px", "12.5px", "13.5px", "15px", "17px", "19px",
    "22px", "27px", "32px", "40px", "52px", "68px",
  ]);

  const offScale: string[] = [];
  let ornamentSeen = false;
  for (const file of [...sourceFiles("app", /\.tsx$/), ...sourceFiles("components", /\.tsx$/)]) {
    const source = read(file);
    for (const found of source.matchAll(/text-\[([0-9.]+px)\]/g)) {
      const size = found[1] ?? "";
      if (STEPS.has(size)) continue;
      if (file === ORNAMENT.file && size === ORNAMENT.size) { ornamentSeen = true; continue; }
      offScale.push(`${file} ${size}`);
    }
  }
  assert.deepEqual(offScale, [], "type sizes that are not a step on the scale");
  assert.ok(
    ornamentSeen,
    `${ORNAMENT.file} no longer carries the ${ORNAMENT.size} ornament, so the exception for it is dead and should go`,
  );
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
    Ekilex paradigm may not. That is stated here as well as in the module,
    because it is one `if` between a correction and a learner's paradigm being
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


console.log(
  failures === 0
    ? `\nAll ${checks} invariants hold.`
    : `\n${failures} of ${checks} invariants broken.`,
);

process.exit(failures === 0 ? 0 : 1);
