/**
 * The phone, measured rather than eyeballed.
 *
 * Every check here corresponds to a fault that costs somebody something real
 * on a device, and each was found the same way: by measuring, at the widths
 * people actually hold. They are borrowed from Upside Lab, which found them
 * first and paid for them once already.
 *
 * Needs the server running and a deck with something in it:
 *   npm run demo && npm run dev
 *   node scripts/test-mobile.mjs
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { ensureLetterBar } from "./lib/prefs.mjs";

const B = baseUrl();

/** The widths of phones people are actually holding, plus the two breakpoints. */
const PHONES = [360, 390, 430];
const WIDE = [768, 1280];

const browser = await launchChromium();

// Floor: 59, measured in the state CI seeds. A thinner database reads as short.
/*
  58 rather than 59: `/guide` was one of the routes in the overflow sweep and
  the page is gone. One check, off the route list.
*/
const { check, done } = suite("The phone", { floor: 58 });

async function open(width, height, path) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 768,
    isMobile: width < 768,
  });
  const page = await ctx.newPage();
  await page.goto(`${B}${path}`, { waitUntil: "networkidle" });
  return { ctx, page };
}

// 1 — The root declares no overflow, or every menu hung off the chrome opens
//     one scroll offset from where it belongs.
{
  const { ctx, page } = await open(390, 844, "/");
  const style = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).overflowX,
    body: getComputedStyle(document.body).overflowX,
    bounce: getComputedStyle(document.body).overscrollBehaviorY,
  }));
  check("no overflow on the root", style.root === "visible", `html overflow-x: ${style.root}`);
  check("the body still clips sideways", style.body === "clip", `body overflow-x: ${style.body}`);
  check("no rubber band on the document", style.bounce === "none", `overscroll-behavior-y: ${style.bounce}`);
  await ctx.close();
}

// 2 — Nothing can be dragged sideways, at any width.
for (const width of [...PHONES, ...WIDE]) {
  const { ctx, page } = await open(width, 844, "/review");
  const over = await page.evaluate(() => {
    window.scrollTo(400, 0);
    return { wider: document.documentElement.scrollWidth > window.innerWidth, x: window.scrollX };
  });
  check(`no horizontal overflow at ${width}`, !over.wider && over.x === 0, JSON.stringify(over));
  await ctx.close();
}

// 3 — The bar's clearance is measured, and it is only published while the bar
//     is drawn. A selector would answer "yes" for a `md:hidden` bar sitting in
//     the DOM drawing nothing, which is what put a notice up an empty page.
for (const width of PHONES) {
  const { ctx, page } = await open(width, 844, "/");
  const m = await page.evaluate(() => {
    const bar = document.querySelector("nav.fixed");
    const rect = bar?.getBoundingClientRect();
    const clearance = getComputedStyle(document.documentElement).getPropertyValue("--dock-clearance").trim();
    return {
      published: document.documentElement.hasAttribute("data-dock"),
      clearance: parseFloat(clearance),
      barHeight: rect ? Math.round(rect.height) : 0,
      gapBelowBar: rect ? Math.round(window.innerHeight - rect.bottom) : null,
      mainPad: parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom),
    };
  });
  check(`the bar publishes its own height at ${width}`, m.published && m.clearance >= m.barHeight, JSON.stringify(m));
  check(`the page clears the bar at ${width}`, m.mainPad > m.barHeight, `${m.mainPad}px of padding under a ${m.barHeight}px bar`);
  check(`the bar sits above the home indicator at ${width}`, m.gapBelowBar > 0, `${m.gapBelowBar}px`);
  await ctx.close();
}

for (const width of WIDE) {
  const { ctx, page } = await open(width, 900, "/");
  const published = await page.evaluate(() => document.documentElement.hasAttribute("data-dock"));
  check(`no clearance published at ${width}, where no bar is drawn`, !published);
  await ctx.close();
}

// 4 — A notice pinned to the bottom clears whatever is really down there,
//     rather than carrying its own guess at it.
{
  const { ctx, page } = await open(390, 844, "/");
  const m = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bottom-notice fixed left-1/2 z-50";
    probe.style.cssText = "width:120px;height:40px";
    document.body.appendChild(probe);
    const p = probe.getBoundingClientRect();
    const bar = document.querySelector("nav.fixed").getBoundingClientRect();
    probe.remove();
    return { clears: p.bottom <= bar.top, noticeBottom: Math.round(p.bottom), barTop: Math.round(bar.top) };
  });
  check("a bottom notice clears the bar", m.clears, JSON.stringify(m));
  await ctx.close();
}

// 5 — Nothing fixed over moving content carries a backdrop filter. That
//     pairing re-filters its backdrop every frame of every scroll, and the
//     bottom band of the window is exactly where new content arrives.
for (const width of PHONES) {
  const { ctx, page } = await open(width, 844, "/review");
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== "fixed") return false;
        const filter = s.backdropFilter || s.webkitBackdropFilter;
        return Boolean(filter) && filter !== "none";
      })
      .map((el) => el.tagName + "." + String(el.className).slice(0, 40)),
  );
  check(`nothing fixed carries a backdrop filter at ${width}`, offenders.length === 0, offenders.join(", "));
  await ctx.close();
}

// 6 — A thumb is not a mouse pointer.
//     The course screens are in this list because they are now the busiest ones
//     in the app, and because the first phone layout of /learn was wrong in a
//     way no overflow check catches: the ring and the button both held the row
//     and squeezed the text between them into a column four words wide. Nothing
//     scrolled sideways, so the only thing that would have caught it was a
//     person looking, or a check that ran here.
//     `/exam` is on it for main's own reason: it is the densest screen in the
//     app, six level cards each with four meters, a ring and a button.
// `/settings` and `/practice` are on it because that is where the app asks a
// question rather than answers one: a row of goal options and a row of case
// drills, both of which were rebuilt onto components/Choice.tsx and .tap-tint.
// Neither route was covered here before, which is why a whole screen of
// controls could be redrawn without this suite having an opinion.
for (const path of [
  "/", "/review", "/dictionary", "/scan", "/assess", "/exam",
  "/learn", "/learn/kodu", "/learn/kodu/lesson", "/placement", "/grammar",
  "/settings", "/practice",
]) {
  const { ctx, page } = await open(390, 844, path);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, [role=button], a[role=button]")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
      .map(({ el, r }) => `${(el.textContent || el.getAttribute("aria-label") || "?").trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  check(`every target on ${path} clears 44px`, small.length === 0, small.join(", "));
  await ctx.close();
}

// 6b — Nothing important is squeezed into a sliver.
//      A block of prose narrower than about fifteen characters is not a layout
//      choice, it is a flex row that should have wrapped and did not.
for (const path of ["/learn", "/learn/kodu", "/placement"]) {
  const { ctx, page } = await open(390, 844, path);
  const slivers = await page.evaluate(() =>
    [...document.querySelectorAll("main p, main h1, main h2")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && r.width < 120 && (el.textContent || "").trim().length > 40)
      .map(({ el, r }) => `${(el.textContent || "").trim().slice(0, 24)} ${Math.round(r.width)}px`),
  );
  check(`no text is squeezed into a sliver on ${path}`, slivers.length === 0, slivers.join(", "));
  await ctx.close();
}

// 6c — The examination paper, which is the densest screen the app has and the
//      one that caught this out. The diacritic bar's minimum width was one
//      pixel over what a 390px phone has inside a card, and a grid item's
//      `min-width: auto` passed that pixel to the document: 23px of sideways
//      scroll, and the phone bar sitting over the button that ends the part.
//      Measured with the clock running, because the briefing is a simple page
//      and the fault was two screens further in.
{
  const { ctx, page } = await open(390, 844, "/exam/A2?seed=phone");
  await page.getByRole("button", { name: "Start the clock" }).click();
  await page.waitForTimeout(600);

  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("the paper cannot be dragged sideways", over <= 0, `${over}px of overflow`);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, main [role=button], main label")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height < 44)
      .map(({ el, r }) => `${(el.textContent || el.getAttribute("aria-label") || "?").trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`));
  check("every target on the paper clears 44px", small.length === 0, small.slice(0, 4).join(", "));

  /*
    Scrolled to the natural end of the page, which is where somebody who has
    answered the last question ends up. `dock-pad` on `main` is what is supposed
    to keep the phone bar off the last thing on the screen; this is the check
    that it does, on the screen where being unable to press the button means
    being unable to finish the paper.

    Not `scrollIntoView({ block: "end" })`: that pins the button to the bottom
    edge on purpose, which is under the bar by construction and is a position no
    scroll can actually leave it in.
  */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const covered = await page.evaluate(() => {
    const button = [...document.querySelectorAll("main button")]
      .find((b) => /Next part|Hand in/.test(b.textContent || ""));
    if (!button) return "no button that ends the part";
    const r = button.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at && (at === button || button.contains(at))
      ? ""
      : `${at ? at.tagName + "." + String(at.className).slice(0, 30) : "nothing"} is on top of it`;
  });
  check("nothing is drawn over the button that ends the part", covered === "", covered);

  await ctx.close();
}

// 7 — The pull gesture, driven for real. This is the app's only reload:
//     installed to a home screen there is no address bar to offer one.
{
  const { ctx, page } = await open(390, 844, "/");
  const client = await ctx.newCDPSession(page);
  const touch = (type, y) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }],
    });
  const ring = () =>
    page.evaluate(() => {
      const el = document.querySelector(".ptr");
      const main = document.querySelector("main");
      return {
        opacity: Number(getComputedStyle(el).opacity),
        moved: Math.round(new DOMMatrix(getComputedStyle(main).transform).m42),
        working: document.querySelector(".ptr-ring")?.hasAttribute("data-working") ?? false,
        said: document.querySelector(".ptr [role=status]")?.textContent ?? "",
      };
    });

  check("the ring is invisible at rest", (await ring()).opacity === 0);

  await touch("touchStart", 120);
  for (const y of [126, 145, 175, 205, 235]) {
    await touch("touchMove", y);
    await page.waitForTimeout(30);
  }
  const pulling = await ring();
  check("the page follows the finger", pulling.moved > 0 && pulling.opacity > 0, JSON.stringify(pulling));
  check("and it follows it by less than the finger moved", pulling.moved < 235 - 120, `${pulling.moved}px of page for 115px of finger`);

  await touch("touchEnd", 235);
  await page.waitForTimeout(150);
  const working = await ring();
  check("releasing an armed pull starts the work", working.working, JSON.stringify(working));
  check("and says so out loud", working.said === "Refreshing", working.said);

  await page.waitForTimeout(1600);
  check("everything goes back to where it was found", (await ring()).moved === 0);

  // A twitch is not a pull, and an upward drag belongs to the page.
  await touch("touchStart", 120);
  await touch("touchMove", 127);
  await touch("touchEnd", 127);
  await page.waitForTimeout(120);
  check("a twitch does nothing", (await ring()).opacity === 0);

  await touch("touchStart", 400);
  for (const y of [380, 340, 300]) await touch("touchMove", y);
  const up = await ring();
  await touch("touchEnd", 300);
  check("an upward drag is a scroll, not a pull", up.opacity === 0 && up.moved === 0, JSON.stringify(up));

  await ctx.close();
}

// 9 — THE ESTONIAN LETTER BAR IS A DESKTOP THING, AND IT IS REVERSIBLE.
//
//     The row of õ ä ö ü š ž used to be drawn under every Estonian field on
//     every device for everybody. A phone keyboard already carries those
//     letters, on a long press or a keyboard switched to Estonian, so the row
//     bought a phone nothing and spent the one thing a phone has none of.
//
//     Measured rather than asserted in CSS, because "a desktop" is a width and
//     a pointer together and only a browser can answer both. `open()` above
//     sets `hasTouch` below 768, which is what makes the pointer half real
//     here rather than assumed.
//
//     COUNTED BEFORE IT IS JUDGED. `drawn === 0` is satisfied just as well by
//     a selector that matches nothing, which is how a check like this passes
//     for a year after the class is renamed. So each of these asserts the row
//     is in the page first.
//     STARTED FROM A KNOWN ANSWER, NOT FROM WHATEVER THE LAST RUN LEFT.
//     The round trip below turns the row off and back on, so a run that dies
//     between the two leaves the setting off in the database, and every width
//     check here then fails on the next run for a reason that has nothing to
//     do with the code. Setting it on first costs one page load and makes this
//     block say the same thing twice in a row.
//
//     `ensureLetterBar` lives in scripts/lib/prefs.mjs now rather than here.
//     The rule it embodies turned out to belong to every suite and not to this
//     one: e2e types through the same row and inherited whatever this or first
//     run had left, which cost a real thirty-second failure on an app with
//     nothing wrong with it.

const letterBar = (page) => page.evaluate(() => {
  const bars = [...document.querySelectorAll(".letter-bar")];
  return {
    found: bars.length,
    drawn: bars.filter((b) => b.getClientRects().length > 0).length,
  };
});

await ensureLetterBar(browser, B, "on");

for (const width of PHONES) {
  const { ctx, page } = await open(width, 844, "/dictionary");
  const bar = await letterBar(page);
  check(
    `no letter bar on a phone at ${width}`,
    bar.found > 0 && bar.drawn === 0,
    JSON.stringify(bar),
  );
  await ctx.close();
}

for (const width of WIDE) {
  const { ctx, page } = await open(width, 900, "/dictionary");
  const bar = await letterBar(page);
  check(
    `the letter bar is drawn at ${width}, where there are no keys for these letters`,
    bar.found > 0 && bar.drawn > 0,
    JSON.stringify(bar),
  );
  await ctx.close();
}

//     And the round trip, because "easily removable" is the whole reason the
//     row carries its own way out: take it from where it annoys you, and get
//     it back from the one screen that says what it was. Driven in this order
//     so the suite leaves the setting where it found it and can be run twice.
{
  const { ctx, page } = await open(1280, 900, "/dictionary");

  // Drawn first, then gone. Asserting only "gone" is satisfied by a renamed
  // class matching nothing, which is exactly how the version of this check
  // without `before` passed while the whole row had vanished from the page.
  const before = await letterBar(page);
  const hide = page.getByRole("button", { name: /Hide the Estonian letters/ }).first();
  await hide.click();
  await page.waitForFunction(
    () => [...document.querySelectorAll(".letter-bar")].every((b) => b.getClientRects().length === 0),
    null,
    { timeout: 8000 },
  ).catch(() => {});
  const after = await letterBar(page);
  check(
    "the way out is on the row itself",
    before.drawn > 0 && after.drawn === 0,
    JSON.stringify({ before, after }),
  );

  await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
  const back = page.getByRole("radio", { name: /Show the letters/ }).first();
  check("and Settings still offers it back", await back.isVisible());

  await back.click();
  await page.waitForFunction(
    () => [...document.querySelectorAll(".letter-bar")].some((b) => b.getClientRects().length > 0),
    null,
    { timeout: 8000 },
  ).catch(() => {});
  check("and taking it back brings the row with it", (await letterBar(page)).drawn > 0);

  await ctx.close();
}


await browser.close();

done();
