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
node scripts/load-test.mjs
```

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

## What this does not measure

This runs one Postgres on the same machine as the app. It measures the shape of
the queries, which is where an accidental scan over every review would show up,
and it does not measure a connection pooler under real concurrency, network
latency to a hosted database, or a cold serverless start. Those need a staging
deployment, and nothing here should be read as evidence about them.
