/**
 * THE LEARNER'S OWN ESTONIAN WEEK, DRIVEN.
 *
 * A calendar is almost entirely arithmetic about days, and `lib/ux/schedule.ts`
 * is unit tested for that. What a unit test cannot see is the half this suite
 * is for: that a repeating class lands in the right *columns* on the rendered
 * page, that a reminder written here shows up beside the homework a teacher
 * assigned rather than in a list of its own, and that both can be taken away
 * again.
 *
 * It also leaves the database as it found it, which matters because every suite
 * after this one shares it: what it adds, it removes.
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

const B = baseUrl();
const browser = await launchChromium();
const { check, done } = suite("The calendar", { floor: 13 });

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

/**
 * The text of one day column, found by its weekday.
 *
 * `data-day` carries the day key, so this asks for "the Monday of the week on
 * screen" rather than for the third div in a grid, which is a fact about
 * today's markup on a page with several grids on it. The first version did ask
 * that, found nothing, and reported four passes for the wrong reason: an empty
 * string does not contain the word it is being checked for.
 */
const column = (page, weekday) => page.evaluate((want) => {
  const cells = [...document.querySelectorAll("main [data-day]")];
  const found = cells.find((c) => {
    const [y, m, d] = (c.getAttribute("data-day") ?? "").split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === want;
  });
  return found?.innerText ?? "";
}, weekday);

const MON = 1, TUE = 2, WED = 3;

/**
 * Waits for a word to appear in (or leave) the week, rather than sleeping.
 *
 * These actions revalidate `/` as well as `/calendar`, and Today grew a card
 * since this was written, so a fixed 1200ms passed twice and then failed on a
 * run where the revalidate happened to take longer. A sleep long enough to be
 * safe is a sleep that makes the suite slow on every run; waiting for the thing
 * itself is neither.
 */
async function until(page, text, present = true) {
  await page.waitForFunction(
    ({ text, present }) => {
      const seen = (document.querySelector("main")?.innerText ?? "").includes(text);
      return seen === present;
    },
    { text, present },
    { timeout: 10_000 },
  ).catch(() => {});
}

/**
 * Removes anything an earlier run of this suite left behind.
 *
 * `scripts/lib/prefs.mjs` makes the argument at length and it applies here: a
 * suite states its preconditions, it does not inherit them. This one adds rows
 * and removes them, so a run interrupted between the two leaves a class or a
 * reminder in the database, and the next run then works on two of everything.
 * That was the whole of an intermittent failure that looked like a race and was
 * residue.
 *
 * Swept before the first check rather than only after the last, because
 * cleaning up after yourself only works while every run finishes.
 */
async function sweep(page) {
  for (const label of [/Remove Eesti keel B1/, /Remove A test reminder/]) {
    await removeAll(page, label, label.source.replace("Remove ", ""));
  }
}

/**
 * Clicks a remove button until there are none left.
 *
 * The click is guarded because each removal re-renders the week, and a button
 * found by `count()` can be detached by the time the click lands. Playwright
 * throws on that, which took a suite whose subject was fine down at check 11.
 * The loop re-resolves the locator every pass, so a lost click costs one more
 * pass and nothing else.
 *
 * Bounded rather than `while`: a button that will not go away is a real
 * failure, and the checks after this say so, where an infinite loop would just
 * hang.
 */
async function removeAll(page, label, text) {
  for (let i = 0; i < 24; i++) {
    const remove = page.getByRole("button", { name: label });
    if (await remove.count() === 0) break;
    await remove.first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  /*
    And then wait for the *page* to agree, not just for the buttons to run out.
    Each removal re-renders the week, so the last one leaves a window where the
    row is gone from the database and still drawn. The check after this reads
    the rendered column, and that window is the whole of a failure that looked
    like a removal not working and was a render arriving a beat late: the
    database showed nought rows every time it was inspected afterwards.
  */
  if (text) await until(page, text, false);
}

await page.goto(`${B}/calendar`, { waitUntil: "networkidle" });
await sweep(page);
/*
  Reloaded before the check rather than trusting the client refresh. Every
  removal re-renders the week, and the last one leaves a window where the row is
  gone from the database and still drawn; a full navigation closes it. That
  window was the whole of an intermittent failure whose database showed nought
  rows every time it was inspected afterwards.
*/
await page.reload({ waitUntil: "networkidle" });

check(
  "the week starts clean, with nothing an earlier run left in it",
  !/Eesti keel B1|A test reminder/.test(
    await page.evaluate(() => document.querySelector("main")?.innerText ?? ""),
  ),
);

check("the calendar draws a week of seven days", await page.evaluate(
  () => document.querySelectorAll("main [data-day]").length === 7,
));

check("and says which week it is showing", await page.getByText(/this week/).count() > 0);

// 1 — A class every Monday and Wednesday.
{
  await page.getByRole("button", { name: /Add to this week/ }).click();
  await page.getByPlaceholder("Eesti keel B1").fill("Eesti keel B1");
  await page.getByRole("button", { name: "Mon", exact: true }).click();
  await page.getByRole("button", { name: "Wed", exact: true }).click();

  check(
    "the form says in words which days it will repeat on",
    await page.getByText(/Every Monday and Wednesday/).count() > 0,
  );

  await page.getByRole("button", { name: /Add it/ }).click();
  await until(page, "Eesti keel B1");

  const mon = await column(page, MON);
  const tue = await column(page, TUE);
  const wed = await column(page, WED);

  check("a repeating class lands on Monday", /Eesti keel B1/.test(mon), mon.slice(0, 60));
  check("and on Wednesday", /Eesti keel B1/.test(wed), wed.slice(0, 60));
  check("and not on the days between", !/Eesti keel B1/.test(tue), tue.slice(0, 60));
  check("with its time on a 24 hour clock", /18:00 to 19:30/.test(mon), mon.slice(0, 80));
  check("and never am or pm", !/\b(am|pm|AM|PM)\b/.test(mon), mon.slice(0, 80));
}

// 2 — A reminder, which is a Task and lands where Today already draws them.
{
  await page.getByRole("button", { name: /Add to this week/ }).click();
  await page.getByRole("radio", { name: /Reminder/ }).click();
  await page.getByPlaceholder("Hand in the essay").fill("A test reminder");

  /*
    The date is set from the page's own Monday rather than left on the field's
    default. The default is that Monday, so this changes nothing on a good run
    and removes the reason the bad ones were bad: the panel is remounted between
    the two additions, and a check that assumes where an uncontrolled default
    landed is a check that fails when a render arrives a beat late.
  */
  const monday = await page.evaluate(() => {
    const days = [...document.querySelectorAll("main [data-day]")]
      .map((el) => el.getAttribute("data-day"))
      .filter(Boolean)
      .sort();
    return days[0];
  });
  await page.locator('input[type="date"]').fill(monday);

  await page.getByRole("button", { name: /Add it/ }).click();
  await until(page, "A test reminder");

  const mon = await column(page, MON);
  check("a reminder written here appears on its day", /A test reminder/.test(mon), mon.slice(0, 120));
  check("and says whether it is done", /to do/i.test(mon), mon.slice(0, 120));
}

// 3 — Both come off again, which is what leaves the database as it was found.
{
  // Looped for the reason the class below is: an interrupted earlier run leaves
  // a row behind, and a suite that only removes one of them fails on a database
  // that is fine.
  await removeAll(page, /Remove A test reminder/, "A test reminder");
  await page.reload({ waitUntil: "networkidle" });
  check(
    "a reminder can be taken off again",
    !/A test reminder/.test(await column(page, MON)),
  );

  /*
    Every one of them, not the first. A repeating class draws a row per day it
    falls on and they are one row in the database, so removing "the first" and
    checking Monday is clear would pass while Wednesday still showed it. The
    loop also clears anything an interrupted earlier run left behind, which is
    what makes this suite runnable twice.
  */
  await removeAll(page, /Remove Eesti keel B1/, "Eesti keel B1");
  await page.reload({ waitUntil: "networkidle" });
  const mon = await column(page, MON);
  const wed = await column(page, WED);
  check("and removing a repeating class removes every one of its days",
    !/Eesti keel B1/.test(mon) && !/Eesti keel B1/.test(wed),
    JSON.stringify({ mon: mon.slice(0, 60), wed: wed.slice(0, 60) }));
}

// 4 — Stepping a week, which is what a query string decides.
{
  await page.goto(`${B}/calendar?w=1`, { waitUntil: "networkidle" });
  check("next week is a different week", await page.getByText(/1 ahead/).count() > 0);

  // A number nobody meant must not render a page nobody asked for.
  await page.goto(`${B}/calendar?w=99999`, { waitUntil: "networkidle" });
  check("and a silly week number is clamped rather than obeyed",
    await page.getByText(/52 ahead/).count() > 0);
}

await ctx.close();
await browser.close();
done();
