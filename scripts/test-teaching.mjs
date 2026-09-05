import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { retypeMiss, revealAnswer } from "./lib/review.mjs";

/**
 * The teaching layer: the grammar reference, dictation, the printable worksheet,
 * the retention reading and the shortcut sheet.
 *
 * These are the four things a learner reaches for when the flashcards are not
 * enough — an explanation, a harder exercise, something to hand out on paper,
 * and a straight answer about whether the schedule is working. Each one is
 * checked for the thing that would make it worse than useless: invented
 * Estonian, a dead end with no audio, a worksheet with no answer key, a
 * confident number computed from six reviews.
 */
const B = baseUrl();
// Floor: 55, measured in the state CI seeds. A thinner database reads as short.
const { check, absent, done } = suite("Teaching layer", { floor: 56 });

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
/*
  A failed response says which URL failed; the console message for it does not.

  "Failed to load resource: the server responded with a status of 500" is what
  the browser prints, and on its own it is unactionable: this suite drives eight
  screens and every one of them makes requests, so the next person reads that
  line and still has to guess. This failed once in CI and could not be
  reproduced against the same data, the same order and the same key, which is
  precisely the case where the only thing that helps is the URL.
*/
page.on("response", (r) => {
  if (r.status() >= 500) errors.push(`${r.status()} from ${r.request().method()} ${r.url()}`);
});

// ─── The grammar reference ────────────────────────────────────────────────────

await page.goto(`${B}/grammar`, { waitUntil: "networkidle" });
check("the reference lists all fourteen cases",
  (await page.locator('a[href^="/grammar/"]').count()) >= 14,
  `${await page.locator('a[href^="/grammar/"]').count()} links`);

/*
  WHAT LEADS IS THE ENDING AND WHAT IT MEANS.

  Nobody working out how to say "in the room" is looking for the inessive, or
  for the seesütlev either: they are looking for -s. The page used to head
  every card with a name and the ending was a chip in the corner, which asks a
  learner to decode a heading before they can read the line under it. Both
  names are still on the page, because a class says one and an English
  reference grammar says the other, and what is checked here is which one is
  the headline and which is the cross-reference.
*/
const indexBody = (await page.textContent("body")) ?? "";
// The last one, because the same href is also the weakest-case row above,
// which is a shortcut into this card rather than the card itself.
const inessiveCard = (await page.locator('a[href="/grammar/inessive"]').last().innerText()) ?? "";
check("a card leads with the ending and what it means",
  /^-s\b/.test(inessiveCard.trim()) && /\bin\b/.test(inessiveCard),
  inessiveCard.split("\n").slice(0, 2).join(" / ") || "no card");
check("it groups the endings by the job they do",
  /-sse/.test(indexBody) && /-le/.test(indexBody) && /On top/.test(indexBody),
  "the groups do not name their endings");
check("a case still carries the name a class uses and the question it answers",
  /seesütlev/.test(indexBody) && /milles\? kus\?/.test(indexBody), "no Estonian name or question");
check("it says the verb is four axes rather than a row of English tenses",
  /kõneviis/.test(indexBody) && /tegumood/.test(indexBody), "the verb axes are not named");

await page.goto(`${B}/grammar/topic/pluperfect`, { waitUntil: "networkidle" });
const topicHeading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
check("a tense page is headed by what the tense does, in plain English",
  topicHeading === "Done before something else", topicHeading || "no heading");
check("and names both the course's term and the one an English grammar uses",
  (await page.getByText("enneminevik").count()) > 0
  && (await page.getByText(/the pluperfect/i).count()) > 0);

await page.goto(`${B}/grammar/inessive`, { waitUntil: "networkidle" });
const caseHeading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
check("an ending's page is headed by what the ending means",
  caseHeading === "In", caseHeading || "no heading");
check("and the ending itself is printed as written, never uppercased into something else",
  (await page.locator("main").getByText("-s", { exact: true }).count()) > 0, "no ending on the page");
check("a case page explains what the case is for in English",
  (await page.getByText(/Being inside something/i).count()) > 0);
check("it names the case in Estonian too", (await page.getByText("seesütlev").count()) > 0);
check("it keeps the Latin name as a labelled cross-reference",
  (await page.getByText(/the inessive, in an English grammar/i).count()) > 0,
  "the Latin name is not labelled as one");
check("it gives the question the case answers",
  (await page.getByText("kelles? milles? kus?").count()) > 0);
check("it warns about the mistake English speakers make",
  (await page.getByText(/Watch out/i).count()) > 0);

// Every Estonian word on the page is read from the dictionary, and each row says
// which — an authoritative retrieved form, a stored principal part, or the
// regular ending on a stored stem. A row with no provenance would be a form the
// app had quietly invented.
const rows = page.locator("tbody tr");
const rowCount = await rows.count();
check("it shows the case on real words", rowCount > 0, `${rowCount} words`);
let labelled = 0;
for (let i = 0; i < rowCount; i++) {
  const text = await rows.nth(i).innerText();
  if (/Ekilex|principal part|from the genitive/i.test(text)) labelled++;
}
check("every form on it says where it came from", labelled === rowCount, `${labelled}/${rowCount}`);

check("the drill for this case is one click away",
  (await page.locator('a[href="/review?case=INESSIVE"]').count()) > 0);

// The dictionary's case table is the other way in.
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
check("a case in the dictionary links to its explanation",
  (await page.locator('a[href^="/grammar/"]').count()) > 0);

// ─── Where the pattern stops ──────────────────────────────────────────────────

/*
  The reference teaches "three memorized, eleven worked out", and the thing it
  did not say is where that stops holding. `caseAnswer` prefers an attested form
  over the rule, so the same page that taught the ending `sse` printed `tuppa`,
  and a learner was left to work out which of the two to reach for tomorrow.

  What is checked is the chain rather than any one screen: the reference points
  at the area, the area is built out of the dictionary rather than a list, one
  word's own entry says where that word departs, and the round refuses to ask
  for a form that is spelled like the word in the question.
*/
await page.goto(`${B}/grammar`, { waitUntil: "networkidle" });
check("the reference says where the endings stop",
  (await page.locator('a[href="/grammar/exceptions"]').count()) > 0);

await page.goto(`${B}/grammar/exceptions`, { waitUntil: "networkidle" });
const areaBody = (await page.textContent("body")) ?? "";
check("the area counts the words rather than claiming a number",
  /\d[\d,]* graded words in this dictionary break a pattern/.test(areaBody), areaBody.slice(0, 0));
check("it groups them by what breaks",
  (await page.locator('a[href^="/grammar/exceptions/"]').count()) >= 3,
  `${await page.locator('a[href^="/grammar/exceptions/"]').count()} kinds`);

const stemCard = await page.locator('a[href="/grammar/exceptions/stem"]').first().innerText();
// The count is a chip, and a chip is set in `label-xs`, which uppercases.
check("a kind names the words under its own count", /\d+ near you/i.test(stemCard), stemCard.split("\n")[0]);

await page.goto(`${B}/grammar/exceptions/stem`, { waitUntil: "networkidle" });
const stemBody = (await page.textContent("body")) ?? "";
check("a kind's page lists real entries from the dictionary",
  (await page.locator('a[href^="/dictionary?q="]').count()) > 0,
  `${await page.locator('a[href^="/dictionary?q="]').count()} words`);
/*
  A word with several exceptions says so. `aeg` breaks four patterns, and a page
  about one of them that mentions none of the others sends somebody away with a
  quarter of the word.
*/
check("a word that breaks more than one pattern says which",
  /This word also breaks/.test(stemBody));

// The entry for one word, which is where a learner meets this without looking
// for it: the same explanation, beside the table it is about.
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
const entryBody = (await page.textContent("body")) ?? "";
check("the entry says where that word breaks the pattern",
  /Where this word breaks the pattern/.test(entryBody));
/*
  And it names which of the two is which, which the first version did not.
  It printed the pair under a sentence about half the dictionary having a
  short form and labelled neither, and somebody using it reported that as
  being told a shorter form exists and never being told what it is. So the
  check is on the labelling rather than on the pair being there: an entry
  that prints both spellings and says nothing about them passes anything
  looser and is the state this was written for.
*/
check("and prints the other form only because it is also right, saying which is which",
  /is the short one, and .* is the long one the ending gives you/.test(entryBody));

await page.goto(`${B}/review/exceptions`, { waitUntil: "networkidle" });
const roundBody = (await page.textContent("body")) ?? "";
const met = await page.locator("h1.sr-only, h1").first().innerText();
check("the round has a heading of its own", met.trim().length > 0, met.trim());
/*
  The first rung teaches and grades nothing, which is the rule the review card
  learned the expensive way: a form somebody has just been shown cannot be
  recalled, only met.
*/
check("the round opens by showing the form rather than asking for it",
  /This one is not what the ending would give you/.test(roundBody)
  && (await page.locator("#answer").count()) === 0);

// ─── Dictation ────────────────────────────────────────────────────────────────

await page.goto(`${B}/review/dictation`, { waitUntil: "networkidle" });
const hasRound = (await page.getByLabel("What you heard").count()) > 0;

// Dictation is built from Ekilex usages, which the seeded dictionary does not
// carry until words have been looked up (13-mvp-status.md §7). A database
// without them is a documented state, not a failure, so the check is on the
// app doing the right thing either way: a round when there are sentences, and
// an empty state that explains itself when there are none. Asserting the round
// unconditionally just fails on a fresh clone and teaches people to ignore it.
if (hasRound) {
  check("a dictation round is built from the deck's own sentences", true);
} else {
  const empty = await page.locator("main").innerText();
  check("with no sentences yet, dictation says so instead of showing an empty round",
    /No sentences/i.test(empty) && /Ekilex/i.test(empty));
  check("and points somewhere that would fill them in",
    (await page.locator('main a[href*="/dictionary"], main a[href*="/learn"]').count()) > 0);
  // The round itself is eight checks and this state reaches two of them. Said
  // out loud, with the number, so the floor still means what it says.
  absent(6, "sentences from Ekilex, which this database has none of");
}

if (hasRound) {
  // The header used to link the sentence's own lemma while the box was still
  // empty, which is a word of the answer printed above "Write what you hear".
  // Asserted from both sides: deleting the link outright would satisfy the
  // first of these on its own and cost the learner something worth keeping.
  const lemmaLink = 'a[href*="/dictionary?q="]';
  check("the sentence's own word is not given away while it is being typed",
    (await page.locator(lemmaLink).count()) === 0);

  // Deliberately wrong, and wrong in a specific way: the marking has to show
  // which words were missed rather than a single red cross.
  await page.getByLabel("What you heard").fill("see ei ole see lause");
  await page.getByRole("button", { name: /Check what I wrote/ }).click();
  await page.waitForTimeout(900);

  const marking = await page.locator("text=/of .* words exactly right/").first().innerText();
  check("the answer is marked word by word", /\d+ of \d+ words exactly right/.test(marking), marking);
  check("the sentence is shown back once it has been answered",
    (await page.locator('span[lang="et"]').count()) > 3);
  // Every mode grades through the same log (ADR-016), and the footer is where a
  // dictation round says what it just wrote there. It used to say it in XP,
  // which was withdrawn along with the badges; what it counts now is the
  // answers it has put through `gradeCard`, so the tally moving off nought is
  // the same claim.
  const footer = await page.locator("text=/word-perfect of/").first().innerText();
  check("the answer was graded, not just marked", /\d+ word-perfect of [1-9]/.test(footer), footer.trim());

  check("and it is offered once the answer is in, when looking it up is the point",
    (await page.locator(lemmaLink).count()) > 0);

  check("the round moves on",
    (await page.getByRole("button", { name: /Next sentence/ }).count()) > 0);
  await page.getByRole("button", { name: /Next sentence/ }).click();
  await page.waitForTimeout(700);
  // Either the next sentence, or the summary if that was the last one.
  const advanced =
    (await page.getByLabel("What you heard").count()) > 0 ||
    (await page.getByText("Dictation done").count()) > 0;
  check("and lands on the next sentence or the summary", advanced);
}

// ─── The printable worksheet ──────────────────────────────────────────────────

await page.goto(`${B}/learn/kodu/worksheet`, { waitUntil: "networkidle" });
check("a unit prints as a worksheet", (await page.getByText(/What does it mean/i).count()) > 0);
check("with an answer key", (await page.getByText("Answer key").count()) > 0);
check("built from principal parts the dictionary holds",
  (await page.getByText(/Complete the table/i).count()) > 0);
check("and it credits Ekilex, as CC BY requires",
  (await page.getByText(/Institute of the Estonian Language/).count()) > 0);

// Printed, the app's own furniture has to disappear: a worksheet with a
// navigation rail down the side is not a worksheet.
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(200);
check("the rail comes off the paper",
  !(await page.locator('nav[aria-label="Main"]').first().isVisible().catch(() => false)));
check("so does the print button",
  !(await page.getByRole("button", { name: /Print this worksheet/ }).isVisible().catch(() => false)));
check("the answer key still prints, on its own sheet",
  (await page.getByText("Answer key").count()) > 0);
await page.emulateMedia({ media: "screen" });

// ─── The retention reading ────────────────────────────────────────────────────

await page.goto(`${B}/progress`, { waitUntil: "networkidle" });
check("progress reports true retention, not just raw accuracy",
  (await page.getByText("True retention").count()) > 0);
const reading = await page.locator("text=/mature review/").first().innerText();
check("it counts only the cards the scheduler thought were known",
  /mature review/.test(reading), reading.trim().slice(0, 80));

// ─── "Why?", at the moment it is asked ────────────────────────────────────────

// A case drill, so the card carries a target case and can offer the page that
// explains it. A reference nobody can find from the exercise is a reference
// nobody reads.
await page.goto(`${B}/review?case=INESSIVE`, { waitUntil: "networkidle" });
/*
  Whichever shape the card came in. This knew the typed one and the flip and
  not multiple choice, and on a choice card neither branch fired: the `3` at
  the bottom of the loop then picked the third option rather than grading, and
  the loop worked by accident. `scripts/lib/review.mjs` knows all three.
*/
let revealed = false;
for (let i = 0; i < 6 && !revealed; i++) {
  await revealAnswer(page);
  await page.waitForTimeout(450);
  revealed = (await page.getByRole("link", { name: /Why the/ }).count()) > 0;
  if (!revealed) {
    // Enter carries on from a miss or a first meeting, 2 is "Got it" on a flip
    // card. It used to press 3, which was Good when every card had four grading
    // buttons under it; on a card that does not, that is a keystroke into the
    // void and the loop spun six times over the same card.
    if (await retypeMiss(page)) {
      // A miss typed again grades itself and moves on.
    } else if (await page.getByRole("button", { name: /Got it, next/ }).count()) {
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("2");
    }
    await page.waitForTimeout(650);
  }
}
/*
  AND A DECK WITH NO INESSIVE CARD IN IT SAYS SO, RATHER THAN TIMING OUT.

  Everything below reads the row of pills the card offers, so when the loop
  above found no card this failed and then spent thirty seconds waiting for a
  link that was never coming, threw, and took the eleven checks after it with
  it: one reported failure covering twelve unlooked things, naming a locator
  rather than the cause. `smoke-interact.mjs` met the same shape at
  `/review/government` and this is its answer.
*/
if (!revealed) {
  const state = (await page.locator("main").innerText()).slice(0, 90).replace(/\s+/g, " ");
  check("a revealed case card offers the rule behind it", false,
    `six cards at /review?case=INESSIVE offered nothing to reveal. Deck state: ${state}`);
  // Three rather than four: this branch still runs the check above, as a
  // failure. What it cannot run is the three that read the card's own pills.
  absent(3, "a deck with an inessive card in it: run `npm run demo`");
} else {
check("a revealed case card offers the rule behind it", revealed);
/*
  Scoped to the card rather than the page. The rail names every destination now
  and one of them is Anu, so an unscoped query for "Ask Anu" finds the rail
  link, passes this check for the wrong reason, and then reads a bare `/tutor`
  where the next check wants the question the card handed over.
*/
const anuOnCard = page.locator("main").getByRole("link", { name: /Ask Anu/ });
check("and offers Anu as well", (await anuOnCard.count()) > 0);

const anuHref = await anuOnCard.first().getAttribute("href");
await page.goto(B + anuHref, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const asked = decodeURIComponent(new URL(B + anuHref).searchParams.get("q") ?? "");
const box = page.getByLabel("Ask Anu a question");
if (await box.count()) {
  const prefilled = await box.inputValue();
  check("Anu opens with the question already written", prefilled.length > 20, prefilled.slice(0, 60));
  // Written, not sent: spending a model call the learner did not ask for would
  // be rude, and they may want to reword it first.
  check("but not sent on their behalf",
    (await page.locator("text=/keep getting this form wrong/").count()) <= 1);
} else {
  // No model key on this deployment, so there is no box. The question is the
  // one thing the learner arrived with, and an empty state that drops it makes
  // the key the price of even seeing what they were about to ask.
  const shown = await page.locator("main").innerText();
  check("with no key, Anu still shows the question that was handed over",
    asked.length > 20 && shown.includes(asked.slice(0, 40)), asked.slice(0, 60));
  absent(1, "a model key, so there is no box to prefill");
}
}

// ─── Sticking points ──────────────────────────────────────────────────────────

await page.goto(`${B}/progress`, { waitUntil: "networkidle" });
const hasSticking = (await page.getByText("Sticking points").count()) > 0;
check("the deck's sticking points are named", hasSticking);

if (hasSticking) {
  const row = page.locator("li", { hasText: /lapses|never really settled/ }).first();
  // Either rule may have flagged it, and each has to say which: a count of
  // times the card was learned and lost, or an accuracy that never settled.
  /*
    The count lives in the chip and the sentence says what the count means,
    which is the split that stopped the row saying one fact three times. So
    both halves are asked for: a number, and which of the two rules flagged
    the card. The pattern used to read `forgotten \d+ times`, which was the
    count in the sentence as well, and it went on passing while the row said
    everything twice.
  */
  const rowText = (await row.innerText()).replace(/\n/g, " · ");
  check("each one says what is wrong with it",
    /forgotten again|never really settled/i.test(rowText) && /\d+ (lapses|%)/i.test(rowText),
    rowText.slice(0, 90));
  // The argument this section makes is in the order of its actions: understand
  // it, look it up, and only then set it aside.
  check("and offers the explanation before the off switch",
    (await row.getByRole("link").count()) >= 1 &&
    (await row.getByRole("button", { name: /Set aside/ }).count()) === 1);

  await row.getByRole("button", { name: /Set aside/ }).click();
  await page.waitForTimeout(1200);
  check("setting one aside says so rather than making it vanish",
    (await page.getByText(/it will not come up until you put it back/i).count()) > 0);

  await page.getByRole("button", { name: /Put it back/ }).first().click();
  await page.waitForTimeout(1200);
  check("and it can be put straight back",
    (await page.getByText(/it will not come up until you put it back/i).count()) === 0);
} else {
  absent(5, "a card with enough lapses to flag, which this deck has none of");
}

// ─── The shortcut sheet ───────────────────────────────────────────────────────

await page.goto(`${B}/`, { waitUntil: "networkidle" });
await page.keyboard.press("?");
await page.waitForTimeout(300);
check("? opens the shortcut sheet",
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("escape closes it",
  (await page.getByRole("dialog", { name: "Keyboard shortcuts" }).count()) === 0);

// A question mark typed into a field belongs in the field.
await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
const search = page.locator("input").first();
await search.click();
await search.type("kes?");
await page.waitForTimeout(250);
check("and it stays out of the way while you are typing",
  (await page.getByRole("dialog", { name: "Keyboard shortcuts" }).count()) === 0 &&
  (await search.inputValue()) === "kes?",
  await search.inputValue());

console.log("");
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
done();
