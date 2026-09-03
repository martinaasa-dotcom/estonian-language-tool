#!/usr/bin/env node
/**
 * Text and icons stay inside the boxes they were drawn into, measured.
 *
 * Every other rule in this repository about the shape of a page is about the
 * page as a whole: the root declares no overflow, the document cannot be
 * dragged sideways, a target clears 44px. None of them can see the fault this
 * suite is named after, because it happens *inside* a card that is itself the
 * right size. A word runs over the border and onto the ground behind it; a
 * label meets an icon in a flex row and squeezes the icon into an oval; a
 * count reaches three digits and paints outside the circle it was centred in.
 * The page never scrolls sideways for any of that, so `test-mobile.mjs` reads
 * a clean pass and the screen looks broken.
 *
 * FOUR FAULTS, AND EACH IS A DIFFERENT MISTAKE.
 *
 *   1. Something is CUT OFF. It sits inside an ancestor that clips, and part
 *      of it is past the clip: the reader is missing text and has no way to
 *      reach it. A scroller is not this fault — being able to scroll to the
 *      rest is the way out, which is why an ancestor that scrolls on an axis
 *      ends the search on that axis rather than counting as a clip.
 *
 *   2. Something BLEEDS OVER a boundary that is drawn. The nearest ancestor
 *      that paints a border or a fill is the box a reader sees, and ink
 *      outside its padding box is ink on the wrong side of a line somebody
 *      drew. Nothing clips it, so nothing is lost; it just reads as broken.
 *
 *   3. An ICON IS DEFORMED. A lucide icon is a square with `width` and
 *      `height` attributes on it, and a flex row squeezes it whenever the
 *      text beside it is longer than the row. `svg.lucide { flex: none }` in
 *      app/globals.css is the one rule that stops that, and this is what says
 *      the rule is still doing its job on a real page.
 *
 *   4. Something is DRAWN INTO SOMETHING ELSE. Not out of a box: on top of
 *      one. This is the fault that survives all three above, because both
 *      elements are inside their card and neither is cut off; one of them
 *      just cannot be read. Asked by hit-testing the letters rather than by
 *      comparing rectangles, for reasons written out where it is done.
 *
 * AND THEN THE SAME FOUR WITH NOTHING TO BREAK ON, WHICH IS THE HALF THAT
 * MATTERS. A page that holds today's words is not a page that holds text: a
 * row fits because the gloss it happens to carry has three spaces in it, and
 * a browser will break a line at a space whether or not anybody thought about
 * it. So every run of text is swapped for a run of letters OF THE SAME LENGTH
 * with no space and no hyphen anywhere in it, and the same four questions are
 * asked again.
 *
 * SAME LENGTH IS THE WHOLE DISCIPLINE OF IT. A stress test that hands every
 * element a forty-character word is unfalsifiable: a ring whose middle says
 * "42%" will fail it, and there is no markup that would pass. Same length asks
 * the question the language actually poses. Estonian compounds: "raamatukogu",
 * "sünnipäevakingitus", a unit title that is one word where the English is
 * four. The gloss "gymnasium, secondary school" fits a card today because of
 * its commas, and the compound of the same width has to fit it too. Anything
 * that fails this is a box sized by the accident of where the spaces fell.
 *
 * Needs the server running and a deck with something in it:
 *   npm run demo && npm run dev
 *   node scripts/test-containment.mjs
 */
import { eventually, launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { revealAnswer } from "./lib/review.mjs";
import { ensureLetterBar } from "./lib/prefs.mjs";

const B = baseUrl();

/**
 * The narrowest phone anybody still holds, the breakpoint, and a desktop.
 *
 * Both ends first, because the two faults live at opposite ones: a word runs
 * out of a card when the card is narrow, and a fixed-width rail runs out of
 * room only when the window is wide enough for the rail to exist. 768 is here
 * because it is the width at which the layout actually changes its mind, and a
 * rule that holds either side of a breakpoint can still fail on it: the
 * comparison grid on the landing page is `md:block`, so at 1280 it is measured
 * and at 360 it does not exist, and 768 is the first width that has it in the
 * least room it will ever have.
 */
const WIDTHS = [360, 768, 1280];

/**
 * Dark is measured once, at the width where containment fails first.
 *
 * It is one sweep rather than a third of the suite, because containment is
 * layout and the two themes differ in colour. Not none, though: "bleeds over a
 * border" is answered by looking for the nearest ancestor that paints a border
 * or a fill, and whether a token paints anything is exactly the thing a theme
 * changes.
 */
const DARK_WIDTH = 360;

/**
 * Every route the app has, rather than a spread of the ones somebody thought
 * were likely.
 *
 * The first version of this list was twelve screens chosen for carrying text
 * from somewhere other than a designer, which is the right instinct and the
 * wrong list: two of the three faults this suite has found so far were on
 * screens that instinct would have picked, and the third was on a printable
 * worksheet nobody would have thought to check. A route is cheap here, about
 * two seconds, and a route that is not in this list is a screen where the
 * whole rule is unenforced.
 *
 * What is not here is the three routes that need a row in the database to
 * exist at all: a classroom, a sat paper and a scan. The paper is covered by
 * the block at the end, which sits one for real.
 */
const ROUTES = [
  // Today, and the daily path.
  "/",
  "/review",
  "/review/write",
  "/review/cloze",
  "/review/dictation",
  "/review/pairs",
  "/review/clinic",
  "/review/government",
  "/review/conjugation",
  "/review/listening",
  "/review/match",
  "/review/sentences",
  "/review/speaking",
  "/review/sprint",
  "/review/flashcards",
  /*
    The frequency rounds. The index is four cards each carrying a title, a
    count chip and two controls on one row, which is the shape that goes over
    at 768 where the rail appears and the column is at its narrowest; the round
    is a whole `ReviewSession`, and it is walked as one of the four because the
    group decides which words are asked and not how the screen is drawn.
  */
  "/review/common",
  "/review/common/noun",
  "/review/emoji",
  "/review/describe",
  "/review/target",
  "/practice",
  "/quest",
  "/sonad",
  "/crossword",
  "/calendar",

  // The dictionary, the deck and the reference, which is where the Estonian is.
  "/dictionary",
  "/dictionary/common",
  "/dictionary?q=tuba",
  "/words",
  "/grammar",
  "/grammar/partitive",
  "/grammar/topic/object",

  // The course.
  "/learn",
  "/learn/kodu",
  "/learn/kodu/lesson",
  "/learn/kodu/worksheet",
  "/learn/checkpoint/A1",

  // Measurement, and the things built on it.
  "/progress",
  "/exam",
  "/assess",

  // Everything else a signed-in learner can reach.
  "/settings",
  "/class",
  "/tutor",
  "/scan",
  "/suggestions",
  "/admin/suggestions",

  /*
    The conversations. The briefing at 360 is a role card, a four-cell dial of
    labelled buttons and a start button, and the scene behind it is a log of
    Estonian in a fixed-height scroller with a text field, a letter bar and four
    controls under it, which at 360 is the tightest row of buttons in the app
    after the rating keys. The talking screen itself is not reached from a URL,
    so it is one of the states the sweep opens by hand further down.
  */
  "/situations",
  "/situations/arsti-aeg",

  // The pages that own the whole screen, plus the two a regulator reads and
  // the one shown when the network is gone.
  "/welcome",
  "/sign-in",
  "/start",
  "/privacy",
  "/terms",
  "/funding",
  "/offline",
];

/**
 * The routes that genuinely are this small, and how small.
 *
 * Each pass asks whether the page had anything on it before believing four
 * clean answers about it, because a route that rendered its error boundary or
 * a 404 has a heading and a button and passes all four on the strength of
 * having almost nothing to look at. That is not hypothetical: this list
 * carried `/grammar/topic/rektsioon` for one run, which is not a topic id, and
 * the count is what said so rather than four green ticks on the 404 page.
 *
 * Twenty-five is the default and two pages are honestly under it, so they
 * declare their own rather than the default coming down for everybody.
 * Lowering it to let `/offline` through is lowering it to let a crashed
 * `/words` through, which is the whole reason the number is here.
 */
const SPARSE = new Map([
  ["/offline", 4],
  ["/sign-in", 12],
]);

/*
  Floor: 1020. Forty-eight routes (forty-five listed, three made) at three
  widths, plus the landing page with its disclosures open and the paper being
  sat at each of them, plus three asked-for states at the two ends, plus the
  whole list again in the dark at 360. Every pass reports five things: cut off,
  bled over a border, drawn into a neighbour, deformed, and then the same four
  again with every word turned into one with nothing to break on.

  Raise this when you add a route; never lower it to make a run go green. What
  a state that genuinely cannot be reached does instead is call `absent` with
  its count and its reason, which is how a machine with no provider key says
  it could not make a scanned page rather than quietly checking twenty fewer
  things.
*/
/*
  1000 rather than 1020, and the twenty are a route that no longer exists.
  `/guide` was a second description of the app offered to somebody already
  inside it, and this suite walks every route the app has at three widths in
  two themes, twice over, so deleting one screen takes a fixed block of checks
  with it. Lowering a floor is otherwise how a suite stops noticing: this one
  is arithmetic on the route list, not a run being waved through.

  And 920 rather than 1000 for the same reason, three routes at once: the
  placement ladder, the homework list and the class week were cut as not
  being learning, and the run after the cut counted 940 where the one before
  it counted 1020. The margin of twenty under the count is the one the floor
  has always kept.

  Then 940, and this one is a raise rather than a cut. `/class/[classroomId]`
  renders two different screens, a teacher's roster and a sponsor's view of a
  workplace group, and this suite walked whichever the index listed first. Both
  are made now, which is one more route's worth of checks: the run counts 960
  where it counted 940, and the floor keeps its twenty.
*/
// 1040 rather than 920: five routes joined the sweep (the Flash cards round,
// Picture match, Target, the daily quest and the calendar). Its own header is
// why they had to: "a route that is not in this list is a screen where the
// whole rule is unenforced", and the calendar was over its box at 768 on the
// first run.
//
// 1050 rather than 1040: the commonest words joined it, which is one route and
// twenty checks, and it is the densest page in the app by some way. Four
// hundred Estonian chips in four disclosures, and the longest of them
// (`sellepärast`, `suurepärane`) are exactly the shape the unbreakable pass
// asks about.
// 1070 rather than 1050: Sonad joined it, which is one route and twenty
// checks. It is the tightest board in the app at 360, six circles across with
// a 32-key alphabet under them, so it is exactly the route this suite exists
// for.
// 1090 rather than 1070: the crossword joined it. Nine columns of cells with
// a clue number in each corner at 360 is the densest arrangement of small
// boxes in the app, which is what this suite is for.
// And 940 rather than 920 came the other way, with the sponsor's workplace
// group, which this suite had never drawn: `/class/[classroomId]` renders two
// different screens and only one of them was ever walked. Merged rather than
// chosen, since both sides added coverage. Measured at 1120 against a database
// with the demo fixture in it, which is what CI seeds; without `npm run demo`
// the workplace group does not exist and the run comes in at 1100 and says so,
// which is the floor doing its job rather than a regression.
//
// And 1130 rather than 1110: `/funding` joined the sweep, which is one route
// and twenty checks. It is a page of numbers in a table beside a bar chart and
// a slider, which is the one arrangement in the app whose width is decided by
// how long a figure happens to be, so it is exactly the route this suite is
// for. Measured at 1140 with the demo fixture in place, which is the 1120 above
// plus that one route, and the floor keeps the same ten under it.
//
// And then two routes rather than one, from two branches at once: `/funding`
// from that one and `/review/describe` from this. Measured at 1160 on the
// merged tree rather than added from either side, which is the same rule one
// line up, and the floor keeps the same ten under it.
//
// And then four routes rather than two, from two branches at once: the
// frequency rounds from one, and the conversations plus a state no URL reaches
// from the other. Each side set its own floor from its own two, which is
// exactly the arithmetic the line above warns about, so this is measured on the
// merged tree rather than added. The briefing at 360 is a role card over a
// two-column dial of labelled buttons; the talking screen behind it is a log of
// Estonian in a fixed-height scroller with a text field, the letter bar and four
// controls under it, which is the tightest row of buttons in the app after the
// rating keys; and `/review/common/noun` is a whole round.
//
// A PRODUCTION BUILD RATHER THAN `next dev`, which is worth writing down
// because it cost an afternoon: the dev overlay mounts a `nextjs-portal`
// element over the page, and this suite correctly reports it as drawn into the
// phone bar on every route it walks. Measuring a floor off a dev server would
// have baked that in.
// Measured at 1231 on the merged tree against a production build with the demo
// fixture in place, and the floor keeps the same ten under it.
const { check, absent, done } = suite("Containment", { floor: 1220 });

const browser = await launchChromium();

/*
  THE ESTONIAN LETTER BAR IS ON BEFORE ANY OF THIS IS MEASURED.

  It is a stored preference, so it is shared state between suites, and a
  database where an earlier suite answered "I have them already" draws no bar
  at all. For a suite that types Estonian that shows up as a timeout naming a
  button. For this one it is quieter and worse: the row simply is not there,
  every check about it passes because there is nothing to check, and the
  screens that hold it are measured with less on them than a learner sees.

  That row is not an incidental thing to lose, either. It is six buttons wide
  under every Estonian field, and its own minimum width was once a single
  pixel more than a 390px phone has inside an exam card, which put 23px of the
  paper off the side of the screen. Losing it silently would lose the widest
  row this suite has to contain.
*/
await ensureLetterBar(browser, B, "on");

/**
 * The three screens that cannot be visited until something has made them.
 *
 * A classroom, a marked paper and a scanned page each need a row, so a route
 * list alone can never reach them and they were the one part of the app this
 * suite could not see. They are made once, here, and then measured at every
 * width like any other route.
 *
 * Reused rather than remade where the app lists them, so running this locally
 * a dozen times leaves a dozen of nothing. A sitting is the exception and is
 * meant to be: `Assessment` is append-only, and `scripts/test-exam.mjs` hands
 * one in on every run for the same reason.
 */
/**
 * The word the stubbed photograph is read as.
 *
 * IT MUST BE A WORD NO DICTIONARY HAS, and it must not look like one either.
 * `lexemeId: null` says the dictionary did not vouch for it, so ticking it
 * makes the learner their own `Lexeme` row, and `Lexeme` is unique on
 * `[lemma, pos]` rather than on the lemma alone. This fixture used to say
 * `tuba`, so it left a second `tuba` in the shared dictionary with no
 * paradigm behind it, sitting beside the seeded noun. `e2e.mjs` opens with
 * three checks on `/dictionary?q=tuba` and CI runs it two steps after this
 * suite, on the same database.
 *
 * `test-scan.mjs` and `test-suggestions.mjs` both worked this out already and
 * each carries an invented string of its own. This is the third, and it is
 * spelled so that nobody could mistake it for Estonian: the app writes none
 * (ADR-005) and neither do its fixtures.
 */
const UNVOUCHED = "kodukeelcontainmenttest";

async function screensToMake() {
  const made = [];
  const missing = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

  /*
    Each maker is given a budget and reports what it did, because this runs
    before the first check and a suite that dies before its first check prints
    nothing at all, which is what `scripts/lib/checks.mjs` exists to stop
    looking like a pass. A maker that overruns leaves its screen unmeasured and
    says so through `absent`, rather than taking the whole suite down with it.
  */
  const budgeted = async (what, ms, run) => {
    const started = Date.now();
    let timer;
    /*
      A page of its own for each, because they do not share a subject and were
      sharing state. The scan maker ran on the page the exam had just handed a
      paper in on, and its `getByLabel` found no camera on a deployment that
      has one, which reads exactly like "no provider key here" and is not that
      at all.
    */
    const own = await ctx.newPage();
    const result = await Promise.race([
      run(own).catch((e) => ({ failed: String(e).split("\n")[0] })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ failed: `gave up after ${ms}ms` }), ms); }),
    ]);
    clearTimeout(timer);
    await own.close().catch(() => {});
    const took = `${Math.round((Date.now() - started) / 100) / 10}s`;
    if (typeof result === "string") { console.log(`made  ${what}: ${result} (${took})`); return result; }
    // Deliberately not the word a waiver prints. `scripts/lib/checks.mjs` owns
    // that word and the number behind it, and an invariant fails on a suite
    // that prints it from anywhere else: it would say the same thing to a
    // person and nothing at all to the tally.
    console.log(`unmade  ${what}: ${result?.failed ?? "not reached"} (${took})`);
    return null;
  };

  /*
    Every group this account is in, not the first one.

    `/class/[classroomId]` renders two different screens off one route: a
    teacher's roster, and a sponsor's view of a workplace group, which shows
    strictly less and is a different component (`WorkplaceView`). Taking
    `.first()` measured whichever the index happened to list first and called
    the route covered, so adding the second kind to `scripts/demo-data.ts`
    would have *swapped* which of the two was ever drawn rather than adding to
    it. A route that renders two screens needs both of them walked.
  */
  const classrooms = await budgeted("the groups this account is in", 60_000, async (page) => {
    await page.goto(`${B}/class`, { waitUntil: "networkidle", timeout: 30_000 });
    const links = page.locator('a[href^="/class/"]');
    const found = [];
    for (let i = 0; i < await links.count(); i += 1) {
      const href = await links.nth(i).getAttribute("href");
      if (href && !found.includes(href)) found.push(href);
    }
    if (found.length > 0) return found.join(" ");
    await page.getByLabel("Class name").fill("Containment, teisipäev", { timeout: 10_000 });
    await page.getByRole("button", { name: /Create the class/ }).click({ timeout: 10_000 });
    await eventually(async () => /\/class\/[^/]+$/.test(page.url()), { timeoutMs: 20_000 });
    return /\/class\/[^/]+$/.test(page.url()) ? new URL(page.url()).pathname : null;
  });
  if (classrooms) made.push(...classrooms.split(" "));
  else missing.push("a classroom, which local mode cannot create by hand: run `npm run demo`");

  // A marked paper: sat, advanced part by part with the blanks left blank, and
  // handed in. The blanks are the point elsewhere and harmless here.
  const result = await budgeted("a marked paper", 120_000, async (page) => {
    await page.goto(`${B}/exam/A2?seed=containment-result`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.getByRole("button", { name: "Start the clock" }).click({ timeout: 10_000 });
    for (let part = 0; part < 8 && !/\/exam\/result\//.test(page.url()); part += 1) {
      for (const name of [/^Next part|^Hand in$/, /Leave them blank and move on|Hand in anyway/, /Start the spoken part/]) {
        const on = page.getByRole("button", { name }).first();
        if (await on.count()) {
          await on.click({ timeout: 8_000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    }
    await eventually(async () => /\/exam\/result\//.test(page.url()), { timeoutMs: 20_000 });
    return /\/exam\/result\//.test(page.url()) ? new URL(page.url()).pathname : null;
  });
  if (result) made.push(result); else missing.push("a marked paper could not be handed in");

  /*
    A scanned page. The model is the one thing stubbed, exactly as
    `scripts/test-scan.mjs` stubs it, because what is being measured is the
    confirmation screen rather than anybody's reading of a photograph. With no
    provider key on the server the page correctly offers no camera, and then
    this screen is genuinely unreachable rather than broken.
  */
  const scan = await budgeted("a scanned page", 90_000, async (page) => {
    await page.route("**/api/scan", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "x-model-provider": "Stub", "x-model-id": "test" },
      body: JSON.stringify({
        items: [{ et: UNVOUCHED, en: "a word off the page", lexemeId: null, lemma: null, translation: null, matchedAs: null, cefr: null }],
        summary: { total: 1, known: 0, unknown: 1, inflected: 0 },
      }),
    }));
    await page.goto(`${B}/scan`, { waitUntil: "networkidle", timeout: 30_000 });
    const link = page.locator('a[href^="/scan/"]').first();
    if (await link.count()) return link.getAttribute("href");
    /*
      Waited for rather than counted straight away. The capture control is
      rendered by a client component, so on a page object that has already been
      round several other screens `networkidle` can land a beat before it
      exists, and counting then reports "no camera on this deployment" about a
      deployment that has one.
    */
    const camera = page.getByLabel(/take a photo/i).first();
    await camera.waitFor({ state: "attached", timeout: 8_000 }).catch(() => {});
    if (!(await camera.count())) throw new Error("the page offers no camera, so this deployment has no provider key");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "page.png", mimeType: "image/png", buffer: await page.screenshot(),
    });
    await page.getByText(/word.* ticked/i).first().waitFor({ timeout: 20_000 }).catch(() => {});
    // "Make 1 flashcard", which is what the button says. Matched loosely on
    // the count, because it names how many words were ticked.
    const add = page.getByRole("button", { name: /Make \d+ flashcard/ }).first();
    if (await add.count()) {
      await add.click({ timeout: 8_000 }).catch(() => {});
      /*
        And then "Open the page", which is a document load rather than a
        `router.push` and is the tap that finishes the paper-to-deck path.
        `app/(app)/scan/ScanCapture.tsx` says why in as many words: the push
        silently did nothing three times in ten.
      */
      const open = page.getByRole("button", { name: /Open the page/ }).first();
      await open.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      if (await open.count()) await open.click({ timeout: 8_000 }).catch(() => {});
      await eventually(async () => /\/scan\/[^/]+$/.test(page.url()), { timeoutMs: 20_000 });
    }
    if (!/\/scan\/[^/]+$/.test(page.url())) {
      throw new Error(`the photo was taken but the deck never took it: still on ${new URL(page.url()).pathname}`);
    }
    return new URL(page.url()).pathname;
  });
  if (scan) made.push(scan);
  else missing.push("a scanned page, which needs a provider key on the server for the camera to be offered");

  await ctx.close();
  return { made, missing };
}

const { made, missing } = await screensToMake();
/*
  Twenty: five checks on each of the three widths, and five more in the dark.
  Written out rather than worked out, because a waiver whose number is an
  expression is a waiver nobody can check by reading it, and an invariant in
  `scripts/test-invariants.ts` says so.
*/
for (const why of missing) absent(20, why);
const ALL = [...ROUTES, ...made];

/**
 * Everything this measures, in one function, because it runs in the page.
 *
 * With `stress` set it first rewrites every run of text into one of the same
 * length that cannot break. All of them change together and the page is
 * measured once, rather than one element at a time, which would be a reflow
 * each on a page with several hundred of them. Every one is put back before
 * this returns, so the two passes over a page are independent.
 */
function survey({ stress }) {
  const EPS = 1.5;
  const originals = [];

  /*
    Whether this is actually painted, asked of the browser rather than worked
    out from three computed properties.

    The hand-rolled version checked `display`, `visibility` and `opacity`, and
    a closed `<details>` is none of those: Chromium skips its contents through
    `::details-content`, so the paragraphs inside still report full layout
    rects while nothing is drawn. That had this suite reporting the landing
    page's comparison panel as 79px of prose bleeding out of its own card, on
    a card that was shut. `checkVisibility` knows about skipped contents,
    `content-visibility`, `inert` and the rest, and it will keep knowing about
    whatever is added next.

    It throws rather than falling back, because a fallback that answers "not
    shown" for everything is a suite that measures nothing and prints a pass.
  */
  if (typeof document.body.checkVisibility !== "function") {
    throw new Error("this browser has no Element.checkVisibility, so nothing below can tell drawn from skipped");
  }

  const shown = (el) => {
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0.5 || r.height > 0.5;
  };

  const named = (el) => {
    const cls = String(el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const text = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };

  /*
    Elements carrying their own words, every lucide icon, and everything that
    arrives with a width of its own.

    That third group is here because it is the one thing neither of the CSS
    rules above can save: a replaced element is laid out from its own content
    and no wrapping rule reaches it. `<input type="file">` is the example that
    put it on this list, at 336px inside a 278px card.
  */
  const SIZED = "img, video, canvas, iframe, input, select, textarea";
  const textLeaves = [];
  const icons = [];
  const sized = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") continue;
    if (el instanceof SVGElement) {
      if (el.tagName === "svg" && el.classList.contains("lucide")) icons.push(el);
      continue;
    }
    if (el.matches(SIZED)) sized.push(el);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (own) textLeaves.push(el);
  }

  if (stress) {
    /*
      The same run of text, the same number of characters, and nothing in it a
      browser will break on by itself: no space, no hyphen, no soft hyphen.
      The letters cycle through the alphabet rather than repeating one, so the
      run is about as wide as ordinary prose of that length rather than a wall
      of the widest glyph in the font.

      The whitespace on each end is kept, because it is doing layout: the
      arrow between a word and its translation is a text node whose spaces are
      the gap either side of it.
    */
    const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
    const unbreakable = (run) =>
      [...run].map((_, i) => (i === 0 ? ALPHABET[0].toUpperCase() : ALPHABET[i % ALPHABET.length])).join("");

    for (const el of textLeaves) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        const [, before, run, after] = node.textContent.match(/^(\s*)([\s\S]*?)(\s*)$/);
        originals.push([node, node.textContent]);
        node.textContent = before + unbreakable(run) + after;
      }
    }
    // One forced layout, so everything below reads the stressed page.
    void document.documentElement.scrollWidth;
  }

  const overflowOn = (cs, axis) => (axis === "x" ? cs.overflowX : cs.overflowY);

  const hides = (cs, axis) => ["hidden", "clip"].includes(overflowOn(cs, axis));
  const scrolls = (cs, axis) => ["auto", "scroll"].includes(overflowOn(cs, axis));

  /**
   * The nearest ancestor that cuts this element off on an axis, or null.
   *
   * Three things end the search without being a fault, and each is a way out
   * rather than a loss. An ancestor that SCROLLS on the axis puts the rest of
   * the content one gesture away. An ancestor that ELIDES on the axis has said
   * in CSS that it is cutting the line short and drawing an ellipsis where it
   * did, which is a decision rather than an accident: `truncate` is how a deck
   * row keeps a long translation to one line. And `body` ends it because the
   * page's own sideways clip is what `test-mobile.mjs` measures, and reporting
   * the same pixel twice in different words helps nobody.
   */
  const clipperOf = (el, axis) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (scrolls(cs, axis)) return null;
      if (axis === "x" && cs.textOverflow.startsWith("ellipsis")) return null;
      if (hides(cs, axis)) return n;
    }
    return null;
  };

  /**
   * The nearest ancestor a reader can actually see the edge of: one that
   * paints a border or a fill. That is the box the ink belongs inside.
   *
   * Anything that clips or scrolls on the way up ends the search first,
   * because ink a clip has already taken away is not ink on the wrong side of
   * a line. Skipping that step is what had this suite reporting a translation
   * inside a `truncate` as 78px outside its own row, when what a reader saw
   * there was an ellipsis.
   */
  const boxOf = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (["x", "y"].some((a) => scrolls(cs, a) || hides(cs, a))) return null;
      const bordered = ["Top", "Right", "Bottom", "Left"].some(
        (s) => cs[`border${s}Style`] !== "none" && parseFloat(cs[`border${s}Width`]) > 0,
      );
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (bordered || filled) return n;
    }
    return null;
  };

  /** How far outside `box`'s padding box `el` reaches, in px, on the given axes. */
  const overshoot = (el, box, axes) => {
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const edge = {
      left: b.left + parseFloat(cs.borderLeftWidth),
      right: b.right - parseFloat(cs.borderRightWidth),
      top: b.top + parseFloat(cs.borderTopWidth),
      bottom: b.bottom - parseFloat(cs.borderBottomWidth),
    };
    let out = 0;
    if (axes.includes("x")) out = Math.max(out, edge.left - r.left, r.right - edge.right);
    if (axes.includes("y")) out = Math.max(out, edge.top - r.top, r.bottom - edge.bottom);
    return out;
  };

  const cut = [];
  const bled = [];
  const deformed = [];
  const collided = [];

  /*
    An absolutely positioned element was put where it is on purpose — a corner
    badge, a floating action, a decorative wash — so its own placement is not
    this suite's business. Its descendants still are, and they are reached
    anyway, because skipping an element is not skipping the walk.
  */
  const placed = (el) => ["absolute", "fixed"].includes(getComputedStyle(el).position);

  for (const el of [...textLeaves, ...icons, ...sized]) {
    if (!shown(el) || placed(el)) continue;

    for (const axis of ["x", "y"]) {
      const clip = clipperOf(el, axis);
      if (!clip) continue;
      const over = overshoot(el, clip, [axis]);
      if (over > EPS) cut.push(`${named(el)} ${Math.round(over)}px past ${named(clip)}`);
    }

    const box = boxOf(el);
    if (box) {
      const over = overshoot(el, box, ["x", "y"]);
      if (over > EPS) bled.push(`${named(el)} ${Math.round(over)}px outside ${named(box)}`);
    }
  }

  /*
    AND NOTHING IS DRAWN ON TOP OF ANYTHING ELSE.

    Not out of a box: into one. Something laid over text that is otherwise
    perfectly inside its card, which every check above passes happily because
    both elements are where they belong and one of them simply cannot be read.

    ASKED BY HIT-TESTING RATHER THAN BY COMPARING RECTANGLES, and that was
    arrived at the hard way. Comparing sibling rectangles reported three
    things and none of them was this fault. An inline element that wraps has
    one bounding rectangle spanning every line it touches, so a span before it
    on line one and a span after it on line two overlap on paper with no ink
    in common at all. `getClientRects` fixes that and uncovers the next one: an
    inline whose text changes font mid-run, which here is any Estonian prompt
    with an arrow in it, reports a fragment rectangle per run plus one
    covering the lot, and those overlap each other by a pixel or ten. Excluding
    inline-level elements clears both and leaves the check blind, because the
    painted text in this app is nearly all inline: a 30px negative margin
    forced into a deck row went unreported.

    `elementFromPoint` asks the browser what is actually on top at a point,
    which is the question all along. It ignores anything `pointer-events:
    none`, so the three pastel washes behind every page are not a finding, and
    a hit on the element itself or on something it is inside is the ordinary
    answer.

    The point has to be somewhere the element is ACTUALLY PAINTED, which is
    not the same as somewhere it is laid out, and two things stood between
    those. A deck row keeps its translation to one line with `truncate`, and
    the part past the ellipsis still has a rectangle: hit-testing that
    reported the row's level chip as drawn over a translation it merely sits
    beside, so the rectangle is intersected with every ancestor that clips.
    And an inline element's own rectangle is its inline box, which for a run
    that changes font mid-way (any Estonian prompt with an arrow in it) is
    reported in fragments that reach past where the text ends. A Range over
    the text node is where the letters are, which is what this is asking
    about.

    Text inside an ELLIPSIS is left out of this one, for the same reason it is
    left out of "cut off" above: the box has said in CSS that it is stopping
    the line short, and right at that boundary the browser's own geometry for
    the runs either side of it stops agreeing with itself. A deck row's word
    and its translation are reported as occupying the same eleven pixels
    there, which is not something any markup could fix and not something a
    reader can see.

    The page is walked a screenful at a time, because a point below the fold
    cannot be hit-tested at all, and the scroll is put back afterwards so both
    passes over a page start where the last one did.

    Made to fail once, which is the only way anybody knows what a quiet check
    is saying: an absolutely positioned block was appended over one deck row
    in the browser, and this reported six things covered by it and nothing
    anywhere else on the page.
  */
  /**
   * Whether this is chrome: something the page is meant to scroll underneath.
   *
   * `fixed` is the phone bar and the desktop rail. `sticky` is the
   * examination paper's own header, which holds the clock and the part number
   * and is pinned there precisely so that the paper passes under it. Neither
   * is a fault. What keeps the *end* of a page clear of the bar is
   * `.dock-pad`, which `scripts/test-mobile.mjs` measures.
   */
  const chrome = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      if (position === "fixed" || position === "sticky") return true;
    }
    return false;
  };

  /** Whether anything above this has declared it is cutting the line short. */
  const elided = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).textOverflow.startsWith("ellipsis")) return true;
    }
    return false;
  };

  /** The first rectangle of the letters themselves, or of an icon's own box. */
  const inkOf = (el) => {
    const text = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!text) return [...el.getClientRects()][0] ?? null;
    const range = document.createRange();
    range.selectNodeContents(text);
    return [...range.getClientRects()][0] ?? null;
  };

  /**
   * What is left of `rect` once everything that clips it has had its say.
   *
   * Starting at the element rather than its parent, because the commonest
   * thing here that clips is `sr-only`: a one-pixel box with `overflow:
   * hidden` holding a whole sentence, which a Range reports at its full
   * unclipped width. The skip link at the top of every signed-in page is one,
   * and it was being reported as covered by the page it is hidden behind.
   */
  const painted = (el, rect) => {
    let box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!["x", "y"].some((a) => hides(cs, a) || scrolls(cs, a))) continue;
      const r = n.getBoundingClientRect();
      box = {
        left: Math.max(box.left, r.left),
        right: Math.min(box.right, r.right),
        top: Math.max(box.top, r.top),
        bottom: Math.min(box.bottom, r.bottom),
      };
    }
    return box;
  };

  const startedAt = window.scrollY;
  const step = Math.max(200, window.innerHeight - 80);

  /*
    Each candidate is sorted into the one screenful that will hold it, so the
    whole list is walked once rather than once per screenful. The first
    version scrolled and then re-read every element on the page at every stop,
    which on `/learn` is 498 candidates times a dozen screenfuls of
    `getComputedStyle`: the same 470 checks took nine minutes that way and
    take 106 seconds this way, which is the difference between a suite CI runs
    and one somebody eventually takes out of CI.

    `placed` is here for the reason it is used above: something positioned
    absolutely was put where it is on purpose, and that includes being put
    behind something. The landing page's step numerals are the case that made
    this explicit, a 92px figure sitting behind each card as ornament, which
    `scripts/test-invariants.ts` names as the one thing deliberately off the
    type scale.
  */
  const screenfuls = new Map();
  for (const el of [...textLeaves, ...icons]) {
    if (!shown(el) || placed(el) || elided(el)) continue;
    const first = inkOf(el);
    if (!first) continue;
    const at = Math.max(0, Math.floor((first.top + window.scrollY) / step) * step);
    if (!screenfuls.has(at)) screenfuls.set(at, []);
    screenfuls.get(at).push(el);
  }

  for (const [at, group] of [...screenfuls].sort((a, b) => a[0] - b[0])) {
    window.scrollTo(0, at);
    for (const el of group) {
      const first = inkOf(el);
      if (!first) continue;
      const rect = painted(el, first);
      const w = rect.right - rect.left, h = rect.bottom - rect.top;
      if (w < 2 || h < 2) continue;
      const x = rect.left + Math.min(6, w / 2);
      const y = rect.top + h / 2;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;

      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      /*
        The phone bar and the desktop rail are drawn over the page on purpose
        and the page scrolls under them, so a point beneath one of them is
        layering rather than a fault. What keeps the *end* of a page clear of
        the bar is `.dock-pad`, which `scripts/test-mobile.mjs` measures.
      */
      if (chrome(hit)) continue;
      collided.push(`${named(hit)} is drawn over ${named(el)}`);
    }
  }
  window.scrollTo(0, startedAt);


  for (const svg of icons) {
    if (!shown(svg)) continue;
    const want = { w: parseFloat(svg.getAttribute("width")), h: parseFloat(svg.getAttribute("height")) };
    if (!Number.isFinite(want.w) || !Number.isFinite(want.h)) continue;
    const r = svg.getBoundingClientRect();
    if (Math.abs(r.width - want.w) > 1 || Math.abs(r.height - want.h) > 1) {
      deformed.push(`${named(svg)} drawn ${Math.round(r.width)}x${Math.round(r.height)}, declared ${want.w}x${want.h}`);
    }
  }

  const doc = document.documentElement;
  const sideways = Math.round(doc.scrollWidth - doc.clientWidth);

  for (const [node, text] of originals) node.textContent = text;

  // Deduplicated: one broken row in a list of forty is one fault, not forty.
  const first = (list) => [...new Set(list)].slice(0, 3).join(" · ");
  return {
    cut: [...new Set(cut)].length,
    bled: [...new Set(bled)].length,
    deformed: [...new Set(deformed)].length,
    collided: [...new Set(collided)].length,
    sideways,
    say: { cut: first(cut), bled: first(bled), deformed: first(deformed), collided: first(collided) },
    counted: textLeaves.length + icons.length + sized.length,
  };
}

/**
 * One pass over whatever a page is showing: the four questions, then the same
 * four with every run of text swapped for one of the same length that cannot
 * break.
 *
 * `atLeast` rides along on the first check rather than getting one of its own.
 * A route that rendered an error boundary has a heading and a button on it and
 * passes all four on the strength of having almost nothing to look at, which
 * is the failure `scripts/lib/checks.mjs` exists for arriving one level
 * further in: the block ran, it just ran over an empty page.
 */
async function measure(page, label, atLeast = 25) {
  const rest = await page.evaluate(survey, { stress: false });
  check(
    `nothing is cut off on ${label}`,
    rest.cut === 0 && rest.counted >= atLeast,
    rest.cut > 0 ? rest.say.cut
      : rest.counted < atLeast ? `only ${rest.counted} things on the page, expected ${atLeast}` : "",
  );
  check(`nothing bleeds over a border on ${label}`, rest.bled === 0, rest.say.bled);
  check(`nothing is drawn into its neighbour on ${label}`, rest.collided === 0, rest.say.collided);
  check(`no icon is deformed on ${label}`, rest.deformed === 0, rest.say.deformed);

  const hard = await page.evaluate(survey, { stress: true });
  check(
    `the same words with nothing to break on stay in their boxes on ${label}`,
    hard.cut === 0 && hard.bled === 0 && hard.collided === 0 && hard.deformed === 0 && hard.sideways <= 0,
    [hard.say.cut, hard.say.bled, hard.say.collided, hard.say.deformed,
     hard.sideways > 0 ? `${hard.sideways}px sideways` : ""].filter(Boolean).join(" · "),
  );
}

/** Every route, in one context, at whatever width and theme it was opened at. */
async function sweep(ctx, at) {
  const page = await ctx.newPage();
  for (const route of ALL) {
    await page.goto(`${B}${route}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(250);
    await measure(page, `${route} ${at}`, SPARSE.get(route) ?? 25);
  }
  await page.close();
}

/*
  THE LANDING PAGE WITH EVERY DISCLOSURE OPEN, which is a third of that page
  and had never been looked at.

  A closed `<details>` is skipped contents: `checkVisibility` says so, which is
  what stopped this suite reporting the comparison panel as bleeding when it
  was shut. The other half of that fact is that the panel's whole argument, its
  eight-claim grid and its four credit cards, is unmeasured until somebody
  opens it, and this page is the first thing anybody sees.
*/
async function openedWelcome(ctx, at) {
  const page = await ctx.newPage();
  await page.goto(`${B}/welcome`, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true;
  });
  await page.waitForTimeout(400);
  await measure(page, `/welcome with every disclosure open ${at}`);
  await page.close();
}

/*
  THE EXAMINATION PAPER, BEING SAT. Not in the route list because it takes a
  click to reach and is worth the extra load anyway: it is the densest screen
  in the app and the one that has already produced this fault twice, once as a
  diacritic bar a pixel wider than a phone has room for, and once as a chip
  carrying a dictionary gloss ("gymnasium, secondary school, high school") that
  would not wrap, at 404px of unbreakable line inside a 350px card. Both were
  found on a device rather than by a check, which is the argument for the check.
*/
async function paperBeingSat(ctx, at) {
  const page = await ctx.newPage();
  await page.goto(`${B}/exam/A2?seed=containment`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "Start the clock" }).click();
  await page.waitForTimeout(700);
  await measure(page, `the A2 paper ${at}`);
  await page.close();
}

/*
  THE STATES A ROUTE DOES NOT ARRIVE IN.

  Everything above measures a page as it loads, and three of the boxes in this
  app only exist once somebody asks for them. The command palette and Anu's
  panel are drawn over the page from anywhere in it, and a review card spends
  half its life with the answer hidden and the other half with it shown, which
  is a different amount of text in the same card.

  A modal covering the page is not reported as drawing into it: the hit test
  skips anything under something `fixed`, deliberately, because that is
  layering rather than a fault. What is being asked here is whether the modal
  contains its own contents.
*/
async function askedForStates(ctx, at) {
  const page = await ctx.newPage();
  await page.goto(`${B}/`, { waitUntil: "networkidle", timeout: 60000 });

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await measure(page, `the command palette ${at}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  const anu = page.getByRole("button", { name: "Ask Anu" }).first();
  if (await anu.count()) {
    await anu.click();
    await page.waitForTimeout(500);
    await measure(page, `Anu's panel ${at}`);
  } else {
    absent(5, `Anu's panel ${at}, which needs the tutor to be reachable`);
  }

  /*
    A REVEALED CARD, WHICHEVER OF THE THREE SHAPES IT CAME IN.

    This pressed "Show answer" and waived when there was none, on the reason
    that the deck had nothing due. The deck had forty cards due. Review asks a
    card as a flip, as multiple choice or as typing, decided per card, and the
    one that comes up on the demo fixture is a choice card, which has no flip
    button at all. So these ten checks, five at each width, had never once run,
    and the line saying why told anybody reading it to go and seed a database
    that was already seeded.

    The revealed layout is the same whichever way the question was asked, and
    it is the one with the most in it: the answer, the note about why this
    card, and four rating buttons across a 360px phone.

    It reveals and never grades. This suite runs third and everything after it
    reads the same deck.
  */
  await page.goto(`${B}/review`, { waitUntil: "networkidle", timeout: 60000 });
  const shape = await revealAnswer(page);
  if (shape) {
    await page.waitForTimeout(450);
    await measure(page, `a review card with its answer shown ${at}, asked as ${shape}`);
  } else {
    absent(5, `a revealed review card ${at}: /review offered no card of any shape, ` +
      "so this deck genuinely has nothing due. Run `npm run demo`");
  }

  /*
    A CONVERSATION IN PROGRESS, which no URL reaches.

    `/situations/[id]` loads on the briefing and the talking screen replaces it
    in place, so the sweep above measures the card and the dial and never the
    thing they lead to: a log of Estonian in a fixed-height scroller, a text
    field, the letter bar, and four controls in a row, which at 360 is the
    tightest row of buttons in the app after the rating keys.

    Pressed until it lands rather than waited on, for the reason
    `test-scene.mjs` gives at length: a button rendered on the server is
    clickable and inert, so a single click into a hydrating page is swallowed
    and waiting longer cannot recover it.
  */
  await page.goto(`${B}/situations/arsti-aeg`, { waitUntil: "networkidle", timeout: 60000 });
  const start = page.getByRole("button", { name: /Start the conversation/i });
  let talking = false;
  for (let tries = 0; tries < 20 && !talking; tries += 1) {
    if (await start.count()) await start.click().catch(() => {});
    talking = (await page.getByRole("log").count()) > 0
      && (await page.locator('[role="log"] p').count()) > 0;
    if (!talking) await page.waitForTimeout(700);
  }
  if (talking) {
    await measure(page, `a conversation in progress ${at}`);
  } else {
    absent(5, `a conversation in progress ${at}: the scene could not be opened, which ` +
      "needs the dictionary seeded. Run `npm run db:seed`");
  }

  await page.close();
}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width < 768,
    isMobile: width < 768,
    // The animations are what would otherwise be measured: `pop-in` scales a
    // card past its own box for 450ms, and a suite that races that reports a
    // different answer every run.
    reducedMotion: "reduce",
  });

  await sweep(ctx, `at ${width}`);
  await openedWelcome(ctx, `at ${width}`);
  await paperBeingSat(ctx, `at ${width}`);
  if (width !== 768) await askedForStates(ctx, `at ${width}`);

  await ctx.close();
}

/*
  AND THE WHOLE APP IN THE DARK, once, at the width where containment fails
  first. `colorScheme` sets `prefers-color-scheme`, which is what the palette
  in app/globals.css reads when nobody has picked a theme by hand.
*/
{
  const ctx = await browser.newContext({
    viewport: { width: DARK_WIDTH, height: 900 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await sweep(ctx, `at ${DARK_WIDTH} in the dark`);
  await ctx.close();
}

await browser.close();

done();
