import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

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
// Floor: 45, measured in the state CI seeds. A thinner database reads as short.
const { check, absent, done } = suite("Teaching layer", { floor: 45 });

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
check("it groups them the way they are taught",
  (await page.getByText("The three principal parts").count()) > 0);

/*
  Estonian is not taught anywhere by its Latin case names or by the English
  names of tenses it does not inflect for. Both names are on the page, because
  an English reference grammar has to stay usable, and what is checked here is
  which one leads: a card headed "Inessive" with the Estonian in small italics
  teaches a learner a word their own teacher will not say.
*/
const indexBody = (await page.textContent("body")) ?? "";
check("a case is named the way a class names it, and asked by its question",
  /seesütlev/.test(indexBody) && /milles\? kus\?/.test(indexBody), "no Estonian name or question");
check("the Latin name is kept as a cross-reference, not as the heading",
  /In English references: the inessive/i.test(indexBody), "the Latin name is not labelled as one");
check("it says the verb is four axes rather than a row of English tenses",
  /kõneviis/.test(indexBody) && /tegumood/.test(indexBody), "the verb axes are not named");

await page.goto(`${B}/grammar/topic/pluperfect`, { waitUntil: "networkidle" });
const topicHeading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
check("a tense page is headed by the name a course gives it",
  topicHeading === "enneminevik", topicHeading || "no heading");
check("and still names the English one for anyone reading an English grammar",
  (await page.getByText(/the pluperfect/i).count()) > 0);

await page.goto(`${B}/grammar/inessive`, { waitUntil: "networkidle" });
check("a case page explains what the case is for in English",
  (await page.getByText(/Being inside something/i).count()) > 0);
check("it names the case in Estonian too", (await page.getByText("seesütlev").count()) > 0);
check("it gives the question the case answers", (await page.getByText("milles? kus?").count()) > 0);
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
  // dictation round says what it just wrote there.
  const footer = await page.locator("text=/word-perfect of/").first().innerText();
  check("the answer was graded, not just marked", /\+\d+ XP/.test(footer), footer.trim());

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
let revealed = false;
for (let i = 0; i < 6 && !revealed; i++) {
  if (await page.getByLabel("Type your answer").count()) {
    await page.getByLabel("Type your answer").fill("vale");
    await page.getByRole("button", { name: /Check/ }).first().click();
  } else if (await page.getByRole("button", { name: /Show answer/ }).count()) {
    await page.getByRole("button", { name: /Show answer/ }).first().click();
  }
  await page.waitForTimeout(450);
  revealed = (await page.getByRole("link", { name: /Why the/ }).count()) > 0;
  if (!revealed) { await page.keyboard.press("3"); await page.waitForTimeout(650); }
}
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

// ─── Sticking points ──────────────────────────────────────────────────────────

await page.goto(`${B}/progress`, { waitUntil: "networkidle" });
const hasSticking = (await page.getByText("Sticking points").count()) > 0;
check("the deck's sticking points are named", hasSticking);

if (hasSticking) {
  const row = page.locator("li", { hasText: /lapses|never really settled/ }).first();
  // Either rule may have flagged it, and each has to say which: a count of
  // times the card was learned and lost, or an accuracy that never settled.
  check("each one says what is wrong with it",
    /forgotten \d+ times|never really settled/i.test(await row.innerText()),
    (await row.innerText()).replace(/\n/g, " · ").slice(0, 70));
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
