#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { eventually, launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { requireLocalDatabase } from "./lib/local-db.mjs";

/**
 * A whole conversation, played through, in a browser.
 *
 * The pieces have tests of their own and none of them can see this. `turn.ts`
 * marks a turn, `state.ts` advances a scene, `grades.ts` decides what reaches
 * the review log, `line.ts` walks the ladder, `catalogue.test.ts` holds the
 * scenes to what their units teach, and `scene.itest.ts` asks a real dictionary
 * whether a scene can be built at all. What none of them can answer is whether
 * the loop closes, and the loop here is six processes: a page, a server action
 * that draws and writes a run, a route that marks every turn and walks the
 * ladder, a client that never decides anything, a second marking of the same
 * transcript when it ends, and a debrief built out of that.
 *
 *   npm run dev
 *   node scripts/test-scene.mjs
 *
 * Written after four faults that only this could have found, which is the
 * argument for it rather than a note about its history. Three of the four
 * looked exactly like an app with nothing in it: the route returned a line
 * without saying which beat it was on, so "Say it" was disabled for the whole
 * run; the rate limiter's verdict was returned as though it were a `Response`,
 * so every turn was a 500; and the role card told a learner to read a word off
 * a place on the card where nothing was printed.
 *
 * IT RUNS IN WHATEVER STATE THE SERVER IS IN, and reports which. A composed
 * line needs a provider key and CI has none, so a suite that required one would
 * be a suite CI could not run and a suite that assumed none would fail on
 * anybody's own machine. `e2e.mjs` already answers this by asking the page what
 * it is showing rather than telling it, and the ladder is the same shape: what
 * every state shares is that a line arrives, it says where it came from, and
 * the scene can be finished.
 */
const B = baseUrl();
const OWNER = "local-single-user";
const SCENE = "arsti-aeg";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("play a scene through and read its debrief"),
});

const { check, absent, done } = suite("A conversation, end to end", {
  /*
    THE COUNT IN THE FULL STATE, which is a key configured, the allowance
    unspent and the bank holding a row for a beat the run reaches: 37.
    Keyless, the composed check is waived and the target drops by one; with
    an empty bank the scripted check is waived and it drops by one more. Each
    state differs by exactly as many checks as waivers, which is the
    arithmetic `absent` exists to keep honest and which the first version of
    this got wrong in both directions at once.
  */
  floor: 37,
});

/*
  Its own runs and nothing else. `SceneRun` is a learner's own table and a broad
  delete would be fine on a scratch database and would quietly throw away
  somebody's transcripts on their own machine, which is the rule
  `test-suggestions.mjs` states about the report queue.
*/
async function runIds() {
  const rows = await prisma.sceneRun.findMany({
    where: { ownerId: OWNER, sceneId: SCENE }, select: { id: true }, orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}

/*
  Gaps first and by run id, because `SceneGap` has no foreign key to `SceneRun`:
  it carries the id as a plain column, which is `Review`'s own shape and for the
  same reason, so deleting a run cannot cascade a learner's record away.
*/
async function cleanUp() {
  const ids = await runIds();
  if (ids.length > 0) await prisma.sceneGap.deleteMany({ where: { runId: { in: ids } } });
  await prisma.sceneRun.deleteMany({ where: { ownerId: OWNER, sceneId: SCENE } });
}
await cleanUp();

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

/*
  A composed turn can take twenty seconds on a provider having a bad minute,
  which is an ordinary Tuesday rather than a fault: the chain walks past it and
  the ladder has a rung below. So the waits here are generous and the failure
  says how long it waited, because a page that answered slowly and a page that
  never answered read identically without it.
*/
const TURN_MS = 30_000;
/** `MAX_WORDS` in `lib/scenes/retrieval.ts`, which is what the gate enforces. */
const MAX_SPOKEN_WORDS = 14;

// ── The chooser ─────────────────────────────────────────────────────────────
await page.goto(`${B}/situations`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("main h1", { timeout: 20_000 });
const chooser = await page.locator("main").innerText();
check("the chooser says what a conversation is", /somebody who wants something from you/i.test(chooser));
check("and says nothing you type is about you", /Nothing you write is about you/i.test(chooser));
check("a scene says how long it takes", /about \d+ min/.test(chooser));
check("and how much there is to get done", /\d+ things to get done/.test(chooser));

// ── The briefing ────────────────────────────────────────────────────────────
await page.goto(`${B}/situations/${SCENE}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("main h1", { timeout: 20_000 });
check("a scene names itself in the tab", (await page.title()).includes("Booking a doctor"));
const briefing = await page.locator("main").innerText();
check("the briefing says who you are today", /You are a patient/i.test(briefing));
check("the difficulty dial is on the scene", (await page.getByRole("button", { name: /Ordinary day/i }).count()) > 0);

/*
  Textbook, because this suite is about whether the loop closes rather than
  about how hard a day is: a curveball is a beat that changes shape mid-run and
  the four difficulties are covered in `curveballs.test.ts`, deterministically,
  which is where a thing decided by a seeded draw belongs.
*/
/*
  PRESSED UNTIL IT LANDS, WHICH IS NOT THE SAME AS WAITING LONGER.

  Every control here is in a client component, and a button rendered on the
  server is clickable and completely inert: Playwright's actionability check is
  satisfied long before React has attached a handler, so a single click can be
  swallowed with nothing to show for it. The first version pressed once, waited
  twenty seconds for `aria-pressed` to move, and failed reporting a dial that
  works perfectly. Waiting longer would not have helped, because the click that
  was going to be lost had already happened.

  The dial's own `aria-pressed` is the signal that hydration has happened, and
  the same discipline covers Start below: a press is retried until the page
  shows it landed, and the failure then means the button really is dead.
*/
const textbook = page.getByRole("button", { name: /^Textbook/i });
const chose = await eventually(async () => {
  await textbook.click();
  return (await textbook.getAttribute("aria-pressed")) === "true";
}, { timeoutMs: 20_000, everyMs: 250 });
check("the dial answers a press", chose);
await page.getByRole("button", { name: /Start the conversation/i }).click();
await page.waitForSelector('[role="log"] p', { timeout: TURN_MS });

// ── The card, which is the thing a learner answers from ─────────────────────
const card = await page.locator("details").innerText();
check("the card says what you were given", /The time you were given: \d\d:\d\d/.test(card));
/*
  THE CARD SHOWS WHAT IT POINTS AT. Six props across three scenes told a learner
  to read a word off the card and printed nothing, so two of this scene's three
  were unanswerable. In English, because saying it in Estonian is the exercise.
*/
check("and what is wrong with you, in English", /What is wrong/i.test(card)
  && /\n[a-z][a-z ,'-]{2,}\n/.test(card));
check("the objectives are on screen from the start", (await page.getByText("Greet them back.").count()) > 0);

// ── The first line, and where it came from ──────────────────────────────────
const first = await page.locator('[role="log"] p').first().innerText();
check("they say something before you do", first.trim().length > 0, first);
const chips = await page.getByRole("log").innerText();
/*
  Case-insensitive, because `Chip` uppercases through CSS and `innerText`
  reports what is painted rather than what the component wrote. Matching the
  source spelling failed on a chip that was there and correct, which is a check
  reporting its own regex.
*/
const provenance = /Recorded sentence|Written for this turn|They did not catch that/i.test(chips);
/*
  EVERY STATE, because the ladder's claim is that whichever rung answered says
  so: the dictionary's own sentence, one written for this turn, or somebody who
  did not catch what was said. A keyless run is not a broken one, and this is
  the check that says so.
*/
check("and the line says which rung it came from (ADR-025)", provenance,
  chips.split("\n").filter(Boolean).slice(0, 2).join(" | "));
check("with a way to report it", (await page.getByRole("button", { name: /Report this line/i }).count()) > 0);

/*
  Every line the desk said, with the rung it came from, over the whole
  conversation. Read at each turn rather than at the end, because the composed
  check below needs to find a composed line wherever one happened: the greeting
  is a phrase and the dictionary answers it, so a suite that only looked at the
  first line would waive the composer's own check on every run in every state,
  which is a hole wearing a waiver's clothes.
*/
const heard = [];
async function listen() {
  heard.length = 0;
  for (const turn of await page.getByRole("log").locator("> div").all()) {
    const text = await turn.locator("p").innerText().catch(() => "");
    const chip = await turn.locator("[class*=chip], span, div").allInnerTexts().catch(() => []);
    heard.push({ text, chip: chip.join(" ") });
  }
}

/** Says one thing and waits for the desk to answer. */
async function say(text) {
  const before = await page.locator('[role="log"] p').count();
  await page.getByLabel("What you say").fill(text);
  await page.getByRole("button", { name: /Say it/i }).click();
  const began = Date.now();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[role="log"] p').length > n + 1,
    before, { timeout: TURN_MS },
  ).catch(() => {});
  await listen();
  return Date.now() - began;
}

// ── A turn that lands ───────────────────────────────────────────────────────
const waited = await say("Tere!");
check("a greeting is read as a greeting", (await page.getByText("Greet them back.").count()) > 0
  && (await page.locator("main").innerText()).includes("done"), `${waited}ms`);

// ── The help button, which is the one that was wrong ────────────────────────
/*
  It recorded the *beat id* as the word needed, so a debrief listed `reason`
  under "words this conversation needed" with no way to keep it, on the one
  screen whose whole job is turning a gap into a card.
*/
await page.getByRole("button", { name: /I need a word/i }).click();
await page.waitForTimeout(2_000);
const lent = await page.locator("main").innerText();
check("asking for a word gives you a word, with its meaning", / · /.test(lent)
  && !/\bgreet\b|\breason\b/.test(lent.split("\n").slice(-8).join(" ")));

// ── A turn that repairs ─────────────────────────────────────────────────────
await say("Mul on valu.");
const afterTwo = await page.locator("main").innerText();
check("a second objective can be met", (afterTwo.match(/\ndone\n/g) ?? []).length >= 2);
check("no meter, no timer, no score anywhere on the screen (§7)",
  !/\d+\s*%/.test(afterTwo) && !/\bscore\b/i.test(afterTwo) && !/\bpoints?\b/i.test(afterTwo));

// ── Walking out, which is a real option ─────────────────────────────────────
await page.getByRole("button", { name: /^Leave/i }).click();
await page.waitForSelector("text=/What you got done/i", { timeout: TURN_MS });

const debrief = await page.locator("main").innerText();
check("leaving ends in a debrief rather than a reproach", /What you got done/i.test(debrief));
check("which says what happened, in one line", /You left the desk|came back|That is a thing people do/i.test(debrief));
check("counts what you got done rather than scoring it", /\d+ of \d+ things you came in to get done/.test(debrief));
check("and prints no percentage anywhere", !/\d+\s*%/.test(debrief));
check("shows what you actually said", /What you said/i.test(debrief) && debrief.includes("Tere!"));
check("names the words the conversation needed", /Words this conversation needed/i.test(debrief));
check("and offers to keep one", (await page.getByRole("button", { name: /Add it to my deck/i }).count()) > 0);
/*
  A stalled beat used to hand over its whole vocabulary, eleven body parts with
  eleven buttons, under a heading saying the conversation had needed them.
*/
const offered = await page.getByRole("button", { name: /Add it to my deck/i }).count();
check("a few of them rather than the unit", offered <= 8, `${offered} offered`);
/*
  A DRILL, NOT A NAMED ONE. This asserted "Writing" and failed the moment the
  debrief started reading the drill off what the beat needed rather than linking
  the same one whatever happened, which is the suite catching a real change and
  the check being wrong about the claim: what §12 promises is a link into a
  drill that already exists rather than advice this screen invented, and which
  drill is the data's answer.
*/
const drill = page.locator('main a[href^="/review/"]').first();
check("points at a drill rather than writing its own advice",
  (await drill.count()) > 0, await drill.getAttribute("href").catch(() => "none"));
check("and offers the same conversation again", (await page.getByRole("button", { name: /Have it again/i }).count()) > 0);

// ── What was written down ───────────────────────────────────────────────────
const runs = await prisma.sceneRun.findMany({
  where: { ownerId: OWNER, sceneId: SCENE }, orderBy: { startedAt: "desc" },
});
check("the run is on the server, not in the browser", runs.length === 1, `${runs.length} rows`);
const run = runs[0];
check("and it is closed", Boolean(run?.endedAt));
/*
  ADR-022: the client sends what it typed and the server reads it again. What
  is stored is the server's own reading, so a transcript holds the turns and
  the outcome holds what they were worth.
*/
const outcome = JSON.parse(run?.outcome ?? "{}");
check("the outcome is the server's own reading", Array.isArray(outcome.met) && Array.isArray(outcome.missed));
check("and the greeting is in it", (outcome.met ?? []).includes("greet"), (outcome.met ?? []).join(","));
const transcript = JSON.parse(run?.transcript ?? "{}");
check("the transcript holds the turns and the card it was played with",
  Array.isArray(transcript.turns) && Boolean(transcript.card));

const gaps = await prisma.sceneGap.count({ where: { runId: { in: await runIds() } } });
check("the words it needed are written down", gaps > 0, `${gaps} rows`);

// ── A composed line, where there is a key for one ───────────────────────────
/*
  ONE CHECK EITHER WAY, AND THE WAIVER IS FOR EXACTLY THE ONE NOT RUN.

  The first version ran one check in one branch and two in the other while
  waiving two, so the floor could not be set to a number that was right in both
  states: keyed it overshot, keyless it undershot, and the arithmetic the whole
  helper exists to keep honest quietly stopped adding up. Every state runs the
  same shared checks above; this is the single question only a key can answer.

  The gate is what makes composition safe, and its whole claim is that a line
  reaching outside the scene's word list never reaches the learner. The unit
  tests own that. What only a real model can show is that the line it composed
  is one short sentence rather than an essay or a refusal.
*/
const composed = heard.find((line) => /Written for this turn/i.test(line.chip));
if (composed) {
  check("a composed line is one short sentence",
    composed.text.length < 120 && composed.text.split(/\s+/).length <= MAX_SPOKEN_WORDS,
    composed.text);
} else {
  /*
    Says which state lifts it, which the house rule asks of every waiver: a key
    configured *and* a beat retrieval could not fill. A keyless run never
    reaches the composer at all, and a keyed run reaches it only where the
    dictionary had nothing, which is most beats and not the greeting.
  */
  absent(1, "no line was composed here: that needs a provider key and a beat the dictionary could not fill");
}

// ── A scripted line, where the bank holds one for a beat this run reached ───
/*
  The fourth rung (ADR-025 amendment 1): a line drafted before the run, gated
  then, and read in the diff. What only a browser can show is that the screen
  says which rung answered, since the chip is text and the unit tests cannot
  see a render. Same shape as the composed check above: one check, or one
  waiver naming the state that would lift it.
*/
const scripted = heard.find((line) => /Written for this scene/i.test(line.chip));
if (scripted) {
  check("a scripted line is one short sentence and says it was scripted",
    scripted.text.length < 120 && scripted.text.split(/\s+/).length <= MAX_SPOKEN_WORDS,
    scripted.text);
} else {
  absent(1, "no scripted line was said here: that needs lib/scenes/bank.ts to hold a row for a beat this run reached and retrieval did not fill");
}

check("nothing threw in the browser", errors.length === 0, errors.join(" · "));

await browser.close();
await cleanUp();
await prisma.$disconnect();
done();
