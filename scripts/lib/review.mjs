/**
 * Getting a review card to show its answer, whichever shape it took.
 *
 * A card is asked in one of four ways — flip, multiple choice, typed, and the
 * intro a card gets the first time it is seen — decided per card and per
 * preference. So a suite that only knows about "Show answer" does not fail
 * when the default changes: it finds no button, takes whatever else the code
 * around it does, and quietly stops testing. `smoke-offline.mjs` learned that
 * the expensive way when the dictionary grew and a multiple choice card
 * started coming up first, and its own comment says so.
 *
 * `scripts/test-containment.mjs` then had the same bug with a worse symptom.
 * It waived ten checks with the reason "the deck had nothing due" while the
 * deck had forty cards due, because the one that came up was a choice card and
 * the only thing it knew how to press was the flip. A waiver that states a
 * false reason is worse than a failure: the output tells you to go and seed a
 * database that is already seeded.
 *
 * Hence one definition. It *reveals* and never grades, because those are two
 * different needs: the offline suite wants the whole round trip, and a suite
 * measuring the revealed layout must leave the deck exactly as it found it for
 * everything that runs after it.
 */

/**
 * Reveals the answer on whatever review card is on screen.
 *
 * Returns the shape it recognised (`"flip"`, `"choice"`, `"typed"`) or null if
 * there was no card to answer, so a caller can say which of those it got
 * rather than only that something happened.
 */
export async function revealAnswer(page, { timeout = 900 } = {}) {
  const app = page.locator("main");

  /*
    A word met for the first time is a teaching screen rather than a question:
    it writes nothing now and puts the card back a few places on, where it is
    asked in its ordinary shape. A driver that stopped here would report a
    card answered when none was, so it presses through and asks again.
  */
  const meet = app.getByRole("button", { name: /Got it, ask me later/ });
  if (await meet.count()) {
    await meet.first().click();
    await page.waitForTimeout(300);
    return revealAnswer(page, { timeout });
  }

  const show = app.getByRole("button", { name: /Show answer/ });
  if (await show.count()) {
    await show.first().click();
    await page.waitForTimeout(250);
    return "flip";
  }

  /*
    Multiple choice. The keyboard rather than a click on the option, because it
    is what the card itself advertises ("Pick the meaning · keys 1, 4") and
    what `test-modes.mjs` drives. Reading the option's own text instead is what
    broke this once: an option renders as "1", a newline, then the word, so a
    `/^[1-4]\S/` filter matched nothing and the answer silently did not happen.
  */
  if (await page.getByText(/Pick the meaning/).count()) {
    await page.keyboard.press("1");
    await page.waitForTimeout(timeout);
    return "choice";
  }

  // Typed. Something wrong is fine: a wrong answer reveals the right one.
  const input = page.locator("main input[type='text'], main input:not([type])").first();
  if (await input.count()) {
    await input.fill("zzz");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    return "typed";
  }

  return null;
}

/** The four rating buttons, which only appear once an answer is showing. */
export function ratingButtons(page) {
  return page.locator("main").getByRole("button", { name: /^(Again|Hard|Good|Easy)/ });
}
