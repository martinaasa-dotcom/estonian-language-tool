# What the app costs once somebody has actually used it

Progress here is derived on every request rather than stored (ADR-014). That is
the right call for correctness, a stored counter drifts and can be awarded for
something that never happened, and it is the obvious thing to get wrong for
performance: a query over the whole review log gets slower every day somebody
studies.

Nothing had ever measured it. Every number this repository could have quoted
came from the demo deck, which is 417 reviews, or two weeks of one person. At
that size the measurement is meaningless: Postgres reads a table that small
faster than it can consult an index, so a query with no usable index at all
looks fast.

## How to reproduce this

```
npx tsx scripts/load-fixture.ts --learners 40 --reviews 5000
npm run test:load
```

`npm run test:load` rather than `node scripts/load-test.mjs`, which this file
used to say and which cannot work: the script imports `lib/progress/summary.ts`
through the `@/` alias, and plain `node` has no idea what that is. It fails
before its first check, which is the shape of failure the whole checks harness
exists to make impossible, so it is worth stating the working command rather
than a plausible one.

`load-fixture.ts` writes synthetic learners under owner ids beginning
`loadtest-`, which is the whole cleanup story: `--clean` removes exactly what it
wrote and nothing a person owns. It refuses to run against anything but a local
database, by the same guard as every other destructive script here.

## The numbers, at 50,000 reviews for one learner

Roughly fifteen years of daily study for the heaviest learner, in a table of
245,000 reviews across 40 of them. Local Postgres 16, warm cache, twelve runs
after a discarded warm-up call.

| What runs on a page load | p50 | p95 | Budget |
|---|---|---|---|
| `deckSnapshot` | 5ms | 8ms | 400ms |
| `dailySummary` | 32ms | 37ms | 400ms |
| `resolveStreakFor` | 28ms | 30ms | 400ms |
| the review log behind the charts | 38ms | 63ms | 400ms |
| the population scan behind `/api/metrics` | 184ms | 234ms | 3000ms |

Routes, eight concurrent readers against the production build:

| Route | p50 | p95 |
|---|---|---|
| `/` | 354ms | 615ms |
| `/progress` | 457ms | 696ms |
| `/words` | 405ms | 542ms |
| `/review` | 171ms | 313ms |
| `/dictionary?q=tuba` | 263ms | 306ms |

Between 5,000 and 50,000 reviews for one learner, `dailySummary` went from 7ms
to 32ms and `resolveStreakFor` from 4ms to 28ms. Both scale with that learner's
own log, which is what deriving progress means, and both have three orders of
magnitude of headroom before anybody notices.

## The plans, so the next person does not have to guess

Every query that matters uses an index on `ownerId`:

- **A learner's rating history** is a bitmap index scan on
  `Review_ownerId_targetCase_idx`, then a hash aggregate. 1,069 buffers for
  50,000 rows.
- **Distinct active days for the streak** is an index-only scan on
  `Review_ownerId_reviewedAt_idx`, bounded to 400 days by the query itself
  rather than by hope.
- **The population scan behind `/api/metrics`** is a sequential scan, and that
  is correct: it reads 93% of the table by design, so an index would be slower.
  It is also the one query nobody waits for, which is why its budget is wider.

## The budgets are asserted, not printed

`scripts/load-test.mjs` fails when a p95 goes over budget, and CI runs it. A
benchmark nobody can fail is a benchmark nobody reads.

The budgets are set well above what the machine does today, so ordinary
variance does not fail a build, and far enough below "a person notices" that a
real regression cannot hide underneath them. **Assert the budget, not today's
number.** If a change makes `dailySummary` five times slower it should fail
here, and moving the budget to match the new number is not the fix.

## The cost that was not a query at all

Everything above measures Postgres. The most expensive thing on a dictionary
page was not in it.

`enrichFromEkilex` upgrades a locally held word to Ekilex's forms, and it
recorded nothing when Ekilex had nothing to say. There was no column for that
and no marker anywhere, so the word stayed in exactly the state that had
prompted the question. Every subsequent render of that page asked again: a
search and a details call, two round trips to a free academic service, on every
view, for ever, for an answer that was never going to change that day. The
deadline that stops a slow upgrade holding the render is 2,500ms, so the
visible cost was up to two and a half seconds of a page load spent confirming
something already known.

It is the same fault the seed had on its first run, where a source that would
not answer was never written down as a miss and four fifths of the dictionary
went missing behind a clean-looking result. Here it was invisible because the
symptom is a cost rather than an absence.

`Lexeme.lookupMissAt` is the marker, deliberately not `fetchedAt`. The exam
pool orders by `fetchedAt` to mean "the words the dictionary knows most about",
so folding a miss into it would have sorted the least known words to the front
of a mock paper: a silent quality regression paying for a performance fix.
A miss is re-asked after a day, because Ekilex is a living database and a word
added to it tomorrow has to be findable tomorrow.

Alongside it, `lib/cache/singleFlight.ts` gives the dictionary the same
one-request-per-thing deduplication the speech route had worked out for itself.
Two renders of one entry arriving together used to make two full upgrades:
four Ekilex requests, and two `deleteMany`/`createMany` pairs racing over one
word's forms.

`lib/dict/lookupCache.itest.ts` holds all of it. Reverting the miss marker
fails three of its five checks and reverting the deduplication as well fails
four, which is how the numbers above are known to be about the code rather
than about the machine.

## And one that was not a cost, but a promise

`smoke-offline.mjs` was failing one check, and had been before any of this.
Reloading `/review` with the network gone showed the offline screen instead of
the session.

The page cache fills as a side effect of a navigation the worker intercepts,
and the worker never serves the navigation that installed it: the page is
fetched, the worker installs behind it, and `clients.claim()` takes over a
client whose own page was never seen. So the first journey failed and the
second worked, which is the worst possible shape for a bug to have.

Measured rather than argued: after one visit the page cache held nothing, after
two it held `/review`, and the same offline reload that had shown the fallback
showed the session.

**Two sessions found this in the same week and the fix here is the other one's**
(`warmOpenPages`, on activate). It caches whatever window is actually open
rather than a list of routes written down in advance, which is the better rule:
"the page you were last on opens again", not "one route is special". The
version written on this branch warmed `/` and `/review` at install and was
deleted outright rather than left beside it, because two mechanisms filling one
cache is how you end up with two of everything.

One clause of it survived, because it was about something the other fix had no
reason to look at: the shell is warmed one URL at a time rather than through
`addAll`, which is atomic. A single URL that will not fetch throws away the
whole batch, and `/offline` is in that batch, which is the one thing in the
worker with no fallback of its own.

The invariant is what the surviving fix did not come with, and is the reason
for writing one rather than simply deleting: it asserts that the warm-up runs
on takeover, that it reaches the client that installed it
(`includeUncontrolled`), and that the shell is never cached atomically. All
three were made to fail before being trusted.

## What this does not measure

This runs one Postgres on the same machine as the app. It measures the shape of
the queries, which is where an accidental scan over every review would show up,
and it does not measure a connection pooler under real concurrency, network
latency to a hosted database, or a cold serverless start. Those need a staging
deployment, and nothing here should be read as evidence about them.
