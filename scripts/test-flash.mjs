#!/usr/bin/env node
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

/**
 * THE FLASH ROUND, DRIVEN, AND THE LISTS IT MOVES.
 *
 * Everything about the round that can be decided without a browser is decided
 * in `lib/games/flash.test.ts`: which slots a word can be asked, which shapes
 * each slot can carry, and what every kind of answer is worth. What none of
 * that can see is the half a learner touches, and it is the half where this
 * feature has already been wrong twice in one afternoon of driving it. The
 * first real round asked for the sisseütlev seven times out of ten, because
 * the page took the first open case and the traditional order starts there;
 * the second asked `Venemaa → milles? kus?`, which is the fault
 * `lib/estonian/place.ts` exists to prevent, arriving through a new door.
 * Neither was visible to a unit test, because neither is about one word.
 *
 * So this drives the round the way somebody would:
 *
 *   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm start
 *   node scripts/test-flash.mjs
 *
 * It walks a whole round answering wrongly, which is what makes the correct
 * answer available: the marking prints the form the dictionary holds. Then it
 * reloads and answers with what it was told, and asserts the thing this whole
 * change is about, that the log records *which form* the answer was about.
 * Before `Review.slot`, every one of those rows would have gone down as an
 * answer about whatever the card happened to be.
 *
 * It writes reviews, which is what a learner does, and it deletes the ones it
 * wrote. `requireLocalDatabase` guards that like every other script here that
 * removes a row.
 */
const B = baseUrl();
const OWNER = "local-single-user";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("write and delete the reviews this round grades"),
});

const { check, absent, done } = suite("The flash round", { floor: 18 });

/** Every slot the app may write, which is `lib/srs/slots.ts` read from outside. */
const CASES = [
  "NOMINATIVE", "GENITIVE", "PARTITIVE", "ILLATIVE", "INESSIVE", "ELATIVE", "ALLATIVE",
  "ADESSIVE", "ABLATIVE", "TRANSLATIVE", "TERMINATIVE", "ESSIVE", "ABESSIVE", "COMITATIVE",
];
const VERB_SLOTS = [
  "IndPrSg1", "IndPrSg3", "IndPrPl1", "IndPrPs_", "IndIpfSg1", "IndIpfSg3", "KndPrSg1",
  "ImpPrSg2", "ImpPrPl2",
];
const MEANING_SLOTS = [
  "RECOGNITION", "PRODUCTION", "CLOZE", "GOVERNMENT", "CONJUGATION", "GRADATION", "CASE_FORM",
];
const KNOWN_SLOTS = new Set([...CASES, ...VERB_SLOTS, ...MEANING_SLOTS]);

/** The five ways this round can ask, as the chip above the question spells them. */
const ASK_LINES = [
  /say it in estonian/i, /change the form/i, /fill the gap/i,
  /type the form you hear/i, /write a sentence/i,
];

/*
  THE ROWS THIS RUN WROTE, WHICH IS NOT THE SAME AS THE ROWS SINCE IT STARTED.

  That was the first version and it was wrong twice over. `demo-data.ts` lays
  down two months of history at times of day of its own, so a fixture built
  minutes ago holds rows dated later this evening than this suite started: they
  came back as answers this round had supposedly given, they carry no slot
  because nothing asked them for one, and the check reported 24 rows missing
  one. Worse, the tidy-up at the end deletes what this query returns, so a run
  straight after `npm run demo` would have deleted a slice of the fixture it was
  measuring.

  So it is the ids rather than the clock: everything already there is
  remembered, and what is left over afterwards is what this run did.
*/
const before = new Date();
const alreadyThere = new Set(
  (await prisma.review.findMany({ where: { ownerId: OWNER }, select: { id: true } }))
    .map((r) => r.id),
);

const browser = await launchChromium();
const page = await browser.newPage();

/**
 * The text of `main`, once the page rather than its skeleton is in it.
 *
 * A route group's `loading.tsx` renders a `main` too, so waiting for the
 * element is waiting for the skeleton: the first version of this suite read
 * four screens of grey rectangles and reported four real failures. Best
 * effort, with a budget: a page that genuinely renders nothing runs the clock
 * out and reaches the check, which then says what it found rather than
 * "Timeout".
 */
async function mainText(wanted, budgetMs = 8000) {
  const until = Date.now() + budgetMs;
  let text = "";
  do {
    text = await page.locator("main").innerText().catch(() => "");
    if (wanted.test(text)) return text;
    await page.waitForTimeout(150);
  } while (Date.now() < until);
  return text;
}

/**
 * The question on screen: the chip, the lines under it, and whether there is a
 * box.
 *
 * Waits for the question rather than for `main`, because a route group's
 * `loading.tsx` renders a `main` too and this suite is the first thing to
 * touch a freshly started server. Reading the skeleton once was enough to
 * waive two checks with a reason that named the round rather than the wait,
 * which is the shape of waiver this repository has learned to distrust.
 */
async function question() {
  const text = await mainText(/^your (answer|sentence)$/im);
  return { text, hasBox: (await page.locator("#answer").count()) > 0 };
}

/**
 * Which word the question is about.
 *
 * Read off the standing line at the foot of the card rather than the question,
 * because the question does not always name it: a gap prints the sentence and
 * the meaning, and the point of that shape is that the lemma is not on screen.
 */
function wordOf(text) {
  return text.match(/^(.+?): right \d+/m)?.[1]?.trim() ?? "";
}

/** Whether the question on screen wants a sentence rather than a form. */
function marksSentence(text) {
  return /write a sentence/i.test(text);
}

/** Answers whatever is on screen and returns what the marking said. */
async function answer(typed) {
  await page.fill("#answer", typed);
  await page.getByRole("button", { name: /Check it/ }).click();
  // Three verdicts now rather than two: the panel says "Nearly" for the right
  // word in the wrong ending, which is a near miss and not a blank.
  await page.waitForSelector("main >> text=/That is it|Nearly|Not this time/", { timeout: 10_000 });
  const text = await page.locator("main").innerText();
  /*
    The form the panel prints and the slot it names, read off the two marked
    elements rather than parsed out of a `slot label: form` line. It is how
    this suite learns an answer it could not otherwise know without copying
    the app's own derivation into the test, which would be a second rule to
    keep in step with the first. The panel used to print that line and the
    suite split it on the colon; the answer sits on a card of its own now,
    with the name under it, so the pairing is carried by two attributes and
    joined here into the shape the rest of this file already reads.
  */
  const form = (await page.locator("[data-flash-answer]").first().innerText().catch(() => "")).trim();
  const slot = (await page.locator("[data-flash-slot]").first().innerText().catch(() => "")).trim();
  return {
    right: /That is it/.test(text),
    told: form && slot ? `${slot}: ${form}` : "",
    text,
  };
}

await page.goto(`${B}/review/flashcards`, { waitUntil: "domcontentloaded" });
const opening = await question();

check("the round opens with something to answer", opening.hasBox, opening.text.slice(0, 60));
if (!opening.hasBox) {
  absent(16, "a deck with words already met: npm run db:seed && npm run demo");
  await browser.close();
  await prisma.$disconnect();
  done();
}

check(
  "it says how it is asking",
  ASK_LINES.some((line) => line.test(opening.text)),
  opening.text.split("\n").slice(0, 4).join(" · "),
);
check(
  "it says how far the word is from being done",
  /of the \d+ forms? it needs/.test(opening.text),
);

/*
  ONE QUESTION, ANSWERED TWICE.

  The marking is what tells this suite the answer: it prints the form the
  dictionary holds, which is the only way to type a correct one without
  copying the app's own derivation into the test and having two rules to keep
  in step. A wrong answer changes nothing the round's ordering reads, so the
  reload comes back to the same word and the same slot, and that is a property
  worth asserting on its own: a learner who refreshes has not lost their place.
*/
const first = await answer("zzz zzz zzz");
const [firstLabel, firstForm] = first.told.split(/:\s+/);
const firstWord = wordOf(first.text);

check("a wrong answer is told what the form is", Boolean(firstLabel && firstForm), first.told);

await page.goto(`${B}/review/flashcards`, { waitUntil: "domcontentloaded" });
const again = await question();
/*
  The word, and the form where the screen names one.

  A `heard` question deliberately does not print the slot: listening for the
  ending is the exercise, and naming it would hand the answer over. It also
  falls back to the plain ask when the clip cannot be fetched, which is what a
  machine with no route to the speech service does, so the same task can read
  as two shapes a second apart. Comparing the label unconditionally made this
  suite fail on a round that was behaving exactly as designed.

  The word is the part that has to hold: the slot is a function of its own
  unchanged history, so the same word first means the same slot asked.
*/
const named = again.text.includes(firstLabel ?? "\u0000");
const heard = /type the form you hear/i.test(again.text);
const sameQuestion = wordOf(again.text) === firstWord && (named || heard);
check("a reload comes back to the same question", sameQuestion,
  `${firstWord} ${firstLabel} -> ${wordOf(again.text)}`);

let rights = 0;
let slipped = false;
if (sameQuestion) {
  // Where a case genuinely has two right answers the panel prints the pair,
  // and either counts: `tuppa / toasse` is one answer to one question.
  const typed = firstForm.split(" / ")[0];
  const marked = await answer(marksSentence(again.text) ? `Ma armastan ${typed} praegu.` : typed);
  if (marked.right) rights += 1;
  slipped = /slip|typo/i.test(marked.text);
  check("the form the dictionary holds is marked right", marked.right, marked.told);
  check("and a wrong ending is never reported as a slip of the finger", !slipped);
} else {
  absent(2, "the round to come back to the same question, which it did not");
}

await page.goto(`${B}/review/flashcards`, { waitUntil: "domcontentloaded" });

/*
  Then a whole round, answered wrongly, for the two things one question cannot
  show: which shapes it reaches for, and whether ten words in a row get asked
  the same case, which is what the first round anybody drove actually did.
*/
const learned = new Map();
const shapes = new Set();
const slotsAsked = new Set();
let asked = 0;

for (let i = 0; i < 12; i++) {
  const state = await question();
  if (!state.hasBox) break;
  asked += 1;
  for (const line of ASK_LINES) if (line.test(state.text)) shapes.add(line.source);

  const marked = await answer("zzz zzz zzz");
  const [label] = marked.told.split(/:\s+/);
  if (label) slotsAsked.add(label.trim());
  learned.set(`${wordOf(state.text)}|${label}`, marked.told);

  const next = page.getByRole("button", { name: /^Next/ });
  if (!(await next.count())) break;
  await next.click();
  await page.waitForTimeout(250);
}

check("it asks a full round rather than one question", asked >= 5, `${asked} asked`);
check(
  "one round is not one case ten times over",
  slotsAsked.size >= 4,
  [...slotsAsked].join(", "),
);

/*
  WHAT THE LOG RECORDS, which is the whole of why this round can exist. Before
  `Review.slot` an answer about the kaasaütlev on a recognition card went down
  as an answer about a meaning, and the variety half of mastery could never
  move for a verb at all.
*/
const written = (await prisma.review.findMany({
  where: { ownerId: OWNER, reviewedAt: { gte: before } },
  select: { id: true, slot: true, rating: true, targetCase: true },
})).filter((row) => !alreadyThere.has(row.id));

check("every answer reached the review log", written.length >= asked, `${written.length} rows`);
check(
  "every row says which form it was about",
  written.every((r) => r.slot !== null),
  written.filter((r) => r.slot === null).length + " without one",
);
check(
  "and none of them says something the app does not write",
  written.every((r) => r.slot === null || KNOWN_SLOTS.has(r.slot)),
  [...new Set(written.map((r) => r.slot))].join(", "),
);
check(
  "a verb form is recorded as itself, which no case column could hold",
  written.some((r) => VERB_SLOTS.includes(r.slot ?? "")) || slotsAsked.size < 4,
);
check("a right answer is graded as one", written.some((r) => r.rating >= 3) || rights === 0);

/*
  THE LISTS THE ROUND MOVES, which the learner asked for twice and could not
  find the first time. A page of its own, reachable from the deck it counts and
  from the screen the round is on.
*/
await page.goto(`${B}/words/mastery`, { waitUntil: "domcontentloaded" });
const board = await mainText(/mastered/i);

/*
  Case-insensitively, because `innerText` is what is *rendered* and several of
  these labels are set in small caps by the stylesheet. A suite comparing the
  source spelling against the rendered one fails on a screen that is perfectly
  correct, which is the kind of failure that gets a check waived.
*/
const has = (text, phrase) => text.toLowerCase().includes(phrase.toLowerCase());
check("the mastery page names all four tiers", ["Mastered", "Almost there", "Needs work", "Still learning"]
  .every((tier) => has(board, tier)), board.slice(0, 40));
check("it says what mastered means rather than only asserting it", /right 5 times/i.test(board), board.slice(0, 60));
check("it counts a word's answers and the forms they span", /in \d+ of \d+ (different )?forms?/i.test(board), board.slice(0, 60));
check("it is one h1 and one main", await page.locator("h1").count() === 1);

await page.goto(`${B}/practice`, { waitUntil: "domcontentloaded" });
const practice = await mainText(/flash cards/i);
check(
  "practice offers the lists beside the round that moves them",
  await page.locator('a[href="/words/mastery"]').count() > 0,
  practice.slice(0, 40),
);
check("and says what is still to work on", /to work on|all mastered|nothing met yet/i.test(practice), practice.slice(0, 60));

await page.goto(`${B}/words`, { waitUntil: "domcontentloaded" });
check(
  "and so does the deck it counts",
  await page.locator('a[href="/words/mastery"]').count() > 0,
);

/*
  Put the log back. A suite that grades is ordinary here, and one that leaves
  its grades behind changes what every suite after it reads.
*/
await prisma.review.deleteMany({ where: { id: { in: written.map((r) => r.id) } } });

await browser.close();
await prisma.$disconnect();
done();
