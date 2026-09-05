import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
const B = baseUrl();
// Floor: the count CI reaches in the state it seeds. A thinner database reads
// as short, and the three about a second entry for one word waive by number.
const { check, absent, done } = suite("Polish", { floor: 16 });

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

// Estonian text carries lang="et" so a screen reader does not read it as English.
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
check("the headword is marked as Estonian",
  (await page.locator('h2[lang="et"]').innerText()) === "tuba");
// The forms render as a table when derived and as a list when retrieved from
// Ekilex; either way every Estonian form must carry lang="et".
const marked = await page.locator('[lang="et"]').count();
check("every form in the table is marked as Estonian", marked >= 14, `${marked} elements`);

// Searching an inflected form — what a learner actually meets in class.
for (const [query, lemma, why] of [
  // Estonian first, English in brackets after it (ADR-023). Both names, because
  // a learner reads this next to an English grammar and next to their homework.
  ["toas", "tuba", /seesütlev \(inessive\)/i],
  ["lugesin", "lugema", /lihtminevik ma/i],
  ["tubadega", "tuba", /mitmuse kaasaütlev/i],
]) {
  await page.goto(`${B}/dictionary?q=${encodeURIComponent(query)}`, { waitUntil: "networkidle" });
  const heading = await page.locator('h2[lang="et"]').innerText().catch(() => "");
  /*
    The note's own element, rather than a page-wide search for " is the ".

    That phrase is not an anchor: the entry grew a panel saying which patterns
    the word breaks, one line of which reads "this is the one to learn first",
    and two matches put Playwright's strict mode into a throw. The suite caught
    it as "no explanation shown", which is the failure naming the wrong cause.
  */
  const note = await page.locator("[data-matched-as]").innerText().catch(() => "");
  check(`"${query}" resolves to ${lemma} and says why`,
    heading === lemma && why.test(note), note || "no explanation shown");
}

/*
  The weak-case panel is an action, not a readout.

  It used to be drawn three ways on three pages, and My words drew its own with
  a second copy of the arithmetic behind it, so one learner could read two
  different numbers for one case. Progress owns it now and Practice draws the
  same component; My words keeps the deck and points at it. This drives the
  panel where it lives, and then checks that the page it left still says where
  it went, because a consolidation that drops the signpost is just a removal.
*/
await page.goto(`${B}/words`, { waitUntil: "networkidle" });
check("the deck page points at where the case analysis went",
  (await page.locator('a[href="/progress"]').count()) > 0);

await page.goto(`${B}/progress`, { waitUntil: "networkidle" });
const drillLink = page.locator('a[href^="/review?case="]').first();
check("weak cases link to a drill", (await drillLink.count()) > 0);
const href = await drillLink.getAttribute("href");
await drillLink.click();
await page.waitForURL(/\/review\?case=/, { timeout: 10000 });
await page.waitForSelector("text=Full entry", { timeout: 10000 });
check("the drill opens and says what it is",
  (await page.getByText(/drill/i).count()) > 0, href);
// Derived from the link rather than hard-coded: which case is weakest depends
// on the review history, so pinning one name here makes the test fail on data
// rather than on behaviour.
const drilledCase = new URL(href, B).searchParams.get("case")?.toLowerCase() ?? "";
// The drill's own heading names the case in both languages, so the English
// name read off the link is still the way to check the drill was filtered.
// What the *front* says has changed twice. ADR-023 made it the question a
// class asks (`tuba → milles?`) rather than the Latin name. Then a learner
// reported `ravim → millesse? kuhu?` as pointless, and they were right: a case
// is drilled in a sentence that uses it now, so the front is a lexicographer's
// sentence with the form taken out, and the case is named nowhere on it,
// because `sisseütlev` printed beside the word is the answer in two pieces.
const drillBody = (await page.textContent("body")) ?? "";
check("the drill only contains that case's cards",
  new RegExp(`\\b${drilledCase}\\b`, "i").test(drillBody), drilledCase);
const cardFront = (await page.locator("main").textContent()) ?? "";
check("and asks for it in a sentence with a gap, never by its Latin name",
  cardFront.includes("____") && !new RegExp(`→ ${drilledCase}`, "i").test(cardFront),
  cardFront.match(/[^\n]{0,30}____[^\n]{0,30}/)?.[0]?.trim() ?? "no gap found");

// A card you are struggling with should reach its full entry in one click.
check("a review card links to the full dictionary entry",
  (await page.getByRole("link", { name: /Full entry/ }).count()) > 0);
await page.getByRole("link", { name: /Full entry/ }).click();
await page.waitForURL(/\/dictionary\?q=/, { timeout: 10000 }).catch(() => {});
check("that link lands on the entry", page.url().includes("/dictionary?q="), page.url());

/*
  Two entries for one word, and both of them reachable.

  A lemma can hold more than one entry, because `@@unique` is on `(lemma, pos)`:
  `hall` is grey and also frost. The entry page shows one of them, listed the
  rest under "other matches", and navigated those chips to `?q=<lemma>` — which
  searched the same word, opened the same winner, and left the second entry
  unreachable from anywhere in the app. The chips also read lemma and gloss
  alone, so two of them said nearly the same thing twice and one looked like a
  rendering fault.

  Driven rather than reasoned about, because the whole bug was that the button
  looked right and did nothing.

  THE CHIP IS FOUND BY ITS LEMMA, EXACTLY, AND THE FIRST VERSION OF THIS WAS NOT.

  It asked for the first button whose text started with "vana", which in CI was
  `vanaadium`, vanadium: a different word that shares five letters. So the check
  about the label failed on a chip it was never about, and the one after it went
  green for opening an entry that was indeed a different entry. Prefix-matching
  the thing under test is the same fault as the bug this block exists for, one
  layer up, which is a good reason to say exactly what you mean.

  The precondition is stated rather than assumed, and it is the real one: not
  "are there other matches", since searching a short word finds longer ones
  whatever else is true, but "is one of them this same word". A database
  holding one entry cannot show any of this, and a suite that clicks a chip
  that is not there waits thirty seconds and then fails in Playwright's words
  rather than in ones that name the cause.

  AND IT NO LONGER NAMES THE WORD, BECAUSE THE WORD MOVED.

  This asked about `vana`, which shipped as a pair when it was written. Open
  question Q8 has since been answered: the builder reads a word's part of
  speech off the sense its gloss came from, 61 labels were corrected, and a
  fresh seed now holds two pairs rather than thirteen. `vana` is one entry, so
  this block waived its three checks and would have gone on waiving them for
  ever, which is a check that has quietly stopped looking.

  So it asks for what it is actually about: a lemma this dictionary holds
  twice. `hall` and `rõõmus` are what a fresh seed ships, and `tuba` is what
  `test-containment` makes by confirming a scanned word, which is the path that
  produces a pair for any word at all and the one no upstream correction
  reaches. The first that is really a pair is the one driven, and its name is
  printed so a reader knows which. Only when none of them is does it waive.
*/
const PAIR_CANDIDATES = ["hall", "rõõmus", "tuba", "vana"];
let pairLemma = null;
let otherChip = null;
for (const lemma of PAIR_CANDIDATES) {
  await page.goto(`${B}/dictionary?q=${encodeURIComponent(lemma)}`, { waitUntil: "networkidle" });
  const chips = page.locator('button:has(span[lang="et"])');
  for (let i = 0; i < (await chips.count()); i++) {
    const chip = chips.nth(i);
    const text = (await chip.locator('span[lang="et"]').first().innerText()).trim();
    if (text === lemma) { otherChip = chip; pairLemma = lemma; break; }
  }
  if (otherChip) break;
}

if (!otherChip) {
  absent(3, `this dictionary holds one entry for each of ${PAIR_CANDIDATES.join(", ")}, `
    + "so there is no pair to choose between");
} else {
  const chipText = (await otherChip.innerText()).replace(/\s+/g, " ").trim();
  const openedBefore = (await page.locator("main").innerText()).toLowerCase();

  check("a second entry for one word is offered, and it is the same word",
    (await page.getByText(/other match/).count()) > 0 && chipText.startsWith(`${pairLemma} `),
    `${pairLemma}: ${chipText}`);
  check("and the chip says which one it is, since the glosses barely differ",
    /adjective|noun|verb|other/i.test(chipText), chipText);

  await otherChip.click();
  await page.waitForURL(/entry=/, { timeout: 10000 }).catch(() => {});
  const openedAfter = (await page.locator("main").innerText()).toLowerCase();
  check("and clicking it actually opens the other one",
    page.url().includes(`q=${encodeURIComponent(pairLemma)}`) && page.url().includes("entry=")
      && openedAfter !== openedBefore,
    page.url().replace(B, ""));
}

// The answer must be announced, not silently inserted.
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
check("the card face is a live region", (await page.locator('[aria-live="polite"]').count()) > 0);

console.log(errors.length ? `\nerrors:\n  ${errors.join("\n  ")}` : "\nno console errors");
await browser.close();
done();
