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
 * Returns the shape it recognized (`"flip"`, `"choice"`, `"typed"`) or null if
 * there was no card to answer, so a caller can say which of those it got
 * rather than only that something happened.
 */
export async function revealAnswer(page, { timeout = 1400 } = {}) {
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
    /*
      A right pick now grades itself after `VERDICT_PAUSE_MS` (1100ms), which
      this helper promises not to do, so the wait here has to outlast it. One guess in four lands on the answer and there is no way to
      know which before picking, so when it does the grade is taken straight
      back through the app's own undo. Undo is disabled until something has
      been graded in this page's session, and a first meeting writes nothing,
      so an enabled button here means exactly one thing.
    */
    const undo = page.locator("main").getByRole("button", { name: /Undo/ });
    if ((await undo.count()) && (await undo.first().isEnabled())) {
      await undo.first().click();
      await page.waitForTimeout(300);
    }
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

/**
 * Types a miss again, which is what the card now asks for before it moves on.
 *
 * A typed card marked wrong keeps its screen and asks for the form once more,
 * against the answer printed above it, and only a correct retype lets the
 * card go: "Got it, next" is not offered until then. The answer is read off
 * the screen (`data-answer`), typed into the second box, and the card then
 * grades the miss it already had and moves on by itself after the verdict
 * pause. So this *does* let a grade happen, and is deliberately not called
 * by `revealAnswer`: a caller that wants the card graded calls it, and the
 * containment suite, which must leave the deck as it found it, never does.
 *
 * Returns false when no retype was being asked for.
 */
export async function retypeMiss(page, { settle = 1500 } = {}) {
  const box = page.locator("main").getByLabel(/Type the (answer|word) again/);
  if (!(await box.count())) return false;
  const answer = (await page.locator("main [data-answer]").first().textContent())?.trim();
  if (!answer) return false;
  await box.first().fill(answer);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(settle);
  return true;
}

/**
 * The buttons that write a grade, which only appear once an answer is showing.
 *
 * There used to be four of them, Again, Hard, Good and Easy, and this named
 * those. The screen stopped asking a question it had already answered: a card
 * the marker can mark grades itself on a clean hit and leaves "Got it, next"
 * on a miss, and only the flip, which has nothing to compare, still asks, in
 * two options rather than four. Nothing updated this, so it matched nothing,
 * and `a11y-check.mjs` waived four checks a run saying the deck had nothing
 * due while the deck had forty cards due. That is the false-reason waiver
 * CLAUDE.md warns about, made by the fix that removed the buttons.
 *
 * The anchors are exact, because "Got it, ask me later" is the first-meeting
 * button and writes nothing at all.
 */
export function gradeButtons(page) {
  /*
    Matched on the accessible name, which is not the words on the button.
    A self-grade carries `aria-label="Got it, next in 10 min"`, the
    acknowledgment a miss leaves behind reads "Got it, next Enter" because
    its key cap is inside it, and the first-meeting button, which writes
    nothing at all, is "Got it, ask me later Space". Anchoring on `$` matched
    none of the three and the suite waived four checks a run saying the deck
    had nothing due. The lookahead is what keeps the meeting out.
  */
  return page.locator("main").getByRole("button", { name: /^(Not yet|Got it)(?!, ask me later)/ });
}
