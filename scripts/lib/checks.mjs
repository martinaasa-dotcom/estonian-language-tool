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
  the deck, so the count there is a fact rather than an estimate. Against a
  thinner database a suite may now come in under its floor, and that is worth
  saying out loud rather than smoothing over, so the message names both causes:
  a block that stopped running, or a database missing the fixture. Every floor
  here was set from a real run.
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
  const target = live ? ` of at least ${live.floor}` : "";
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
  live = { floor, ran: () => ran };

  const check = (label, ok, extra = "") => {
    ran += 1;
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  };

  /** Print the tally and exit. Never returns. */
  const done = () => {
    const short = ran < floor;
    console.log(`\n${ran} checks, ${failed} failed.`);
    if (short) {
      console.log(
        `FAIL  this suite ran ${ran} checks and should reach at least ${floor}.\n` +
        `      Either a block stopped running, which is the one outcome that\n` +
        `      used to look exactly like a pass, or this database is missing\n` +
        `      the fixture: npm run db:seed && npm run demo.`,
      );
    } else if (failed === 0) {
      console.log(`${name} verified.`);
    }
    process.exit(failed > 0 || short ? 1 : 0);
  };

  return { check, done };
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
