/*
  A browser suite that counts what it ran, not only what it failed.

  Every suite here counted failures and nothing else, and that leaves two
  things invisible. Both happened.

  A SUITE THAT RAN NOTHING LOOKS EXACTLY LIKE ONE THAT PASSED.
  `test-design.mjs` hardcoded `localhost:3000`, so pointed at any other port it
  threw on the first `page.goto`, before check one. Node exits non-zero on an
  uncaught error, so CI would have caught it, but the *output* carried no FAIL
  line and no count, and that is what a person reads. Running four suites and
  counting FAIL lines, it read as a clean pass. It was not; it had verified
  nothing at all.

  AND CHECKS BEHIND A FAILED GATE ARE NEVER RUN, so the tally understates how
  much went unlooked-at. `test-teaching.mjs` gates five checks on
  `if (hasSticking)`. The demo fixture produced no card with enough lapses, so
  the panel was empty: the gate check failed, honestly and visibly, and the
  five behind it were skipped in silence. One reported failure, six things
  wrong. The same shape guards undo and typed answers in `test-modes.mjs`.

  So a suite prints how many checks it reached and declares the number it
  should not fall below. `floor`, not an exact count: adding checks is
  ordinary and should never need a second edit, while losing them is what went
  wrong twice.

  THE FLOOR IS THE COUNT IN THE STATE CI RUNS IN, not the minimum across every
  state a database could be in. The first version took the minimum, on the
  reasoning that a floor should never cry wolf on a sparse local database, and
  it was tested by deleting the whole sticking-points block: the suite dropped
  from 38 checks to 34, cleared a floor of 30, and reported success. A floor
  low enough never to complain is a floor low enough to miss the thing it was
  built for.

  CI is deterministic: the build seeds the dictionary and `demo-data` lays down
  the deck, so the count there is a fact rather than an estimate. Every floor
  here was set from a real run.

  AND A STATE THAT GENUINELY CANNOT REACH A BLOCK SAYS SO, IN CHECKS.
  That floor is only honest while the count is a property of the code rather
  than of the machine it ran on. It was not: `test-teaching.mjs` was measured
  against a database with an Ekilex key behind it, so dictation built a real
  round and Anu had a text box, and its floor of 38 counted both. CI has
  neither, so the same correct code ran 34 checks and the floor read that as a
  block having stopped running. The fix cannot be a lower floor, because the
  number that would have let CI through is also the number that lets a deleted
  block through, which is the fault this whole file exists for.

  So `absent(n, why)` is the third outcome, beside pass and fail: this state
  cannot reach n checks, and here is the reason. It lowers the target by
  exactly n and prints the reason, so the arithmetic is on screen and a run
  that verified less than usual says which part and why. A block that stops
  running still trips the floor, because nothing waived it. Waiving more than
  half a suite fails outright whatever the reasons say: a suite that reached a
  minority of its checks has not verified the thing it is named after, and an
  escape hatch with no ceiling is the parking space the floor was built to
  prevent.
*/
/*
  A suite that dies before its first check prints nothing at all, and nothing
  is what a pass looks like to anyone reading the output or counting FAIL
  lines. `test-design.mjs` did exactly that for as long as it existed, pointed
  anywhere but port 3000: Node's exit code was right and the report was
  unreadable.

  AT IMPORT, NOT INSIDE `suite()`, and that distinction is the whole point.
  The first version installed these where the counter is created, which in
  `test-design.mjs` is after the page loop that was doing the dying, so the
  handler was never reached and the crash printed the same raw stack as
  before. Importing this module is the earliest moment a suite can be said to
  have started, so it is where the net goes.
*/
let live = null;

const died = (what) => (error) => {
  const ran = live ? live.ran() : 0;
  const target = live ? ` of at least ${live.target()}` : "";
  console.log(`\nFAIL  this suite ${what} after ${ran}${target} checks.`);
  console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
};
process.on("uncaughtException", died("threw"));
process.on("unhandledRejection", died("rejected"));

/**
 * @param {string} name    What this suite verifies, for its closing line.
 * @param {{ floor: number }} options
 */
export function suite(name, { floor }) {
  let ran = 0;
  let failed = 0;
  let waived = 0;
  const reasons = [];
  live = { floor, ran: () => ran, target: () => floor - waived };

  const check = (label, ok, extra = "") => {
    ran += 1;
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  };

  /**
   * Checks this run cannot reach, and why. The reason is a fact about the
   * machine or the database, never about the code: "no Ekilex key here" is
   * one, "this is flaky" is not.
   *
   * @param {number} count How many checks the full state would have run here.
   * @param {string} why   What this state is missing, in a learner's words.
   */
  const absent = (count, why) => {
    waived += count;
    reasons.push(`${count}: ${why}`);
    console.log(`SKIP  ${count} check${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} ${why}`);
  };

  /** Print the tally and exit. Never returns. */
  const done = () => {
    const target = floor - waived;
    const short = ran < target;
    // Half is the ceiling on waiving, and it is not negotiable by argument:
    // every reason can be a good one and the suite still not have looked at
    // most of what it is named after.
    const hollow = waived * 2 > floor;
    console.log(`\n${ran} check${ran === 1 ? "" : "s"}, ${failed} failed.`);
    if (waived > 0) {
      console.log(`      ${waived} not available here (${reasons.join(" · ")}), so the floor is ${target} rather than ${floor}.`);
    }
    if (hollow) {
      console.log(
        `FAIL  this suite waived ${waived} of its ${floor} checks, which is more\n` +
        `      than half of it. Every reason above may be true and this run\n` +
        `      still has not verified ${name.toLowerCase()}. Seed the database\n` +
        `      or configure the key, rather than reading this as a pass.`,
      );
    } else if (short) {
      console.log(
        `FAIL  this suite ran ${ran} checks and should reach at least ${target}.\n` +
        `      Either a block stopped running, which is the one outcome that\n` +
        `      used to look exactly like a pass, or this database is missing\n` +
        `      the fixture: npm run db:seed && npm run demo.`,
      );
    } else if (failed === 0) {
      console.log(`${name} verified.`);
    }
    process.exit(failed > 0 || short || hollow ? 1 : 0);
  };

  return { check, absent, done };
}

/**
 * The server to point at.
 *
 * Every suite reads this, so none of them can be the one that hardcodes a
 * port and dies on a connection error somewhere else. `test-design.mjs` was
 * that one.
 */
export function baseUrl() {
  return process.env.BASE_URL ?? "http://localhost:3000";
}
