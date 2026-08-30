/**
 * Preferences a browser suite depends on, set before it depends on them.
 *
 * A stored preference is shared state between suites, and this app has one that
 * decides whether a control is drawn at all. `letterBar` is per learner and
 * defaults to on; first run asks the question and Settings changes the answer.
 * So a database where any earlier suite walked through first run and chose "I
 * have them already" draws no letter bar, and every later suite that types
 * Estonian through it waits thirty seconds for a button that is correctly
 * hidden, then reports a timeout that names the button and not the reason.
 *
 * That is exactly what happened: `e2e.mjs` failed on a machine where
 * `test-assess.mjs` had run first, on an app with nothing wrong with it. CI
 * escapes it only because it seeds a fresh database for every run, which means
 * the one place this can bite is a person's own machine, running the suites in
 * their own order, with the least context for reading the failure.
 *
 * `test-mobile.mjs` had already worked this out and solved it for itself, in a
 * comment saying "started from a known answer, not from whatever the last run
 * left". This is that helper, hoisted, because two of anything is how they
 * drift, and because the rule it embodies belongs to every suite rather than
 * one: a suite that needs a preference sets it, rather than hoping the last
 * suite left it alone. Cleaning up after yourself is the weaker version of the
 * same idea, since it only works while every suite remembers, and it cannot
 * help the first run on a machine somebody has been clicking around on.
 *
 * Driven through the app rather than written into the database, so these stay
 * plain `.mjs` with no Prisma import and no second definition of what the
 * setting means.
 */

/** The desktop control that offers the choice is `display: none` below this. */
const DESKTOP = { width: 1280, height: 900 };

/**
 * Leaves the learner's letter-bar answer set to `want`, and says whether it
 * had to change anything.
 *
 * Safe to call when it is already right: it reads the radio first, so the
 * common case costs one page load and no write.
 */
export async function ensureLetterBar(browser, base, want = "on") {
  const label = want === "on" ? /Show the letters/ : /I have them already/;
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
    const choice = page.getByRole("radio", { name: label }).first();
    if ((await choice.count()) === 0) {
      throw new Error(
        `Settings offers no letter-bar choice, so ${want} could not be set. ` +
        "Either the control moved or this context is not a desktop one.",
      );
    }
    if ((await choice.getAttribute("aria-checked")) === "true") return false;
    await choice.click();
    // The write is a server action and a router refresh, so the next context
    // must not open until the setting has actually landed.
    await page.waitForTimeout(1500);
    return true;
  } finally {
    await ctx.close();
  }
}

/**
 * Fails now, and in words, rather than in thirty seconds and in Playwright's.
 *
 * The letter bar being absent is a preference, not a bug, so a suite that finds
 * it missing has been set up wrong rather than caught something. Say which.
 */
export async function requireLetterBar(page) {
  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll(".letter-bar")].filter((b) => b.getClientRects().length > 0).length);
  if (drawn > 0) return;
  throw new Error(
    "No letter bar is drawn on this page. It is a stored preference (letterBar) " +
    "and it is off, or this viewport is not a desktop one. Call ensureLetterBar " +
    "before the checks that type through it. See scripts/lib/prefs.mjs.",
  );
}
