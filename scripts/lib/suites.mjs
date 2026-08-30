/*
  Which browser suites CI is expected to run, and why the exceptions are not.

  CI's own comment names this fault and then had it: "This list is written out
  rather than deferring to `npm run test:browser`, so a suite added to that
  script alone is a suite CI never runs: `test-exam.mjs` sat here unrun for its
  first two builds, floor and all." The same drift had happened in the other
  direction and nobody had counted. `npm run test:e2e` and `npm run test:browser`
  between them name seventeen suites; the workflow ran eleven. The five below
  were green when somebody finally ran them, which is the least useful moment to
  find out, because a suite nobody runs reports on the code it was written
  against.

  Among the unrun five was `test-restore.mjs`, the wipe-and-restore round trip.
  A backup that cannot be restored is the one failure in this app that cannot be
  recovered from, and it was the check with nothing watching it.

  So the source of truth is the filesystem: every `scripts/*.mjs` that declares
  a suite is a suite CI runs, and anything else has to be named here with a
  reason. `scripts/test-invariants.ts` asserts it, on the shape of
  `lib/legal/exportCoverage.ts`: an exemption that carries no written reason is
  not an exemption, so appending a filename is no longer a way to make the check
  pass.
*/

/** Suites CI cannot run, each with the reason it cannot. */
export const NOT_IN_CI = {
  "test-ekilex.mjs":
    "Deletes a dictionary entry and asserts it is re-fetched live from Ekilex, " +
    "which needs EKILEX_API_KEY and the network. CI carries no keys on purpose " +
    "(see the workflow's env block), and every one of its ten checks is that " +
    "fetch, so there is nothing left to run rather than a block to waive. " +
    "Stubbing it was considered and rejected, and the reason is the better half " +
    "of this entry: the thing under test is that what Ekilex returns is mapped " +
    "and *stored*, so a stub would push hand-written Estonian morphology " +
    "through the ingestion path and into Lexeme and Form. That is precisely " +
    "what ADR-005 exists to prevent, and a fixture doing it in CI is a template " +
    "for somebody doing it against a real database later. The seams either side " +
    "are covered without inventing a single form: lib/ekilex/mapper.test.ts on " +
    "real response shapes, lib/dict/lookupCache.itest.ts on the caching and the " +
    "miss marker against a real Postgres, and test-teaching.mjs on the keyless " +
    "path a default deployment actually takes.",
  "test-anu.mjs":
    "Asks a real model a real grammar question and reads the streamed answer. " +
    "It needs a provider key, it costs a call, and its answer is the model's " +
    "rather than this app's, so a failure here would be a fact about a " +
    "provider on the day rather than about this commit. Stubbing it would " +
    "leave the plumbing under test and the answer, which is the only thing " +
    "this suite asserts, replaced by something we wrote. `npm run eval:anu` is " +
    "the version meant to be run deliberately and read by a person, and " +
    "lib/tutor/verify.ts is where a model's Estonian is checked mechanically " +
    "rather than by a test.",
  "load-test.mjs":
    "Run by the separate `load` job, through `npm run test:load -- " +
    "--budget-only`, because it needs a fixture of forty learners and a year " +
    "of history rather than the demo deck the browser job builds.",
};

/** A suite file is one that declares a `suite(...)` from checks.mjs. */
export const DECLARES_SUITE = /\bsuite\(\s*["'`]/;
