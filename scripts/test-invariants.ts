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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

check("every practice mode writes to the same review log", () => {
  /*
    Sprint, Listening, Match, Dictation and Sentences are not side games with
    scores of their own. They grade through the same action, so the scheduler
    sees what was actually practised.
  */
  const sessions = COMPONENTS.concat(APP).filter((f) => /\/(review)\/.*Session\.tsx$/.test(f));
  assert.ok(sessions.length >= 5, `expected the review sessions, found ${sessions.length}`);
  for (const file of sessions) {
    assert.match(read(file), /gradeCards?\b/, `${file} does not grade through gradeCard`);
  }
});

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
  assert.match(
    action,
    /paperFor\(\s*ownerId/,
    "submitExam no longer rebuilds the paper from its seed before marking",
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
  const sessions = COMPONENTS.concat(APP).filter((f) => /\/(review|exam)\/.*Session\.tsx$/.test(f));
  assert.ok(sessions.length >= 6, `expected the review and exam sessions, found ${sessions.length}`);
  for (const file of sessions) {
    const source = read(file);
    // The exam session hands its answers to a Server Action rather than grading
    // per card, and Next refreshes the route after that call just the same, so
    // the freeze matters here too.
    if (!/gradeCards?\b|submitExam\b/.test(source)) continue;
    // Only the ones actually handed a list by the page can be caught out.
    const props = source.match(/export function \w+\(\{([^}]*)\}/)?.[1] ?? "";
    const listProp = props.match(/\b(\w+)\s*:\s*initial\w+/) ?? props.match(/\b(cards|prompts|questions|items|gaps|pairs|paper)\b/);
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
  const chat = read("app/(app)/tutor/TutorChat.tsx");
  assert.match(chat, /x-model-provider/, "the chat no longer reads it back");
});

check("Anu's prose is cleaned on its way to the learner", () => {
  assert.match(read("app/api/tutor/route.ts"), /ProseStream/, "the humanize pass is gone");
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

check("the pure modules stay free of React, Next and Prisma", () => {
  /*
    These are the ones with unit tests around them, and a test is only cheap
    while the module under it can be imported without a framework.
  */
  const pure = ["estonian", "gamification", "stats", "collections", "time", "offline", "security", "copy", "exam"];
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

console.log(
  failures === 0
    ? `\nAll ${checks} invariants hold.`
    : `\n${failures} of ${checks} invariants broken.`,
);
process.exit(failures === 0 ? 0 : 1);
