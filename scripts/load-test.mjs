#!/usr/bin/env node
/**
 * What the app costs once somebody has actually used it.
 *
 * Progress here is derived on every request rather than stored (ADR-014),
 * which is the right call for correctness and the obvious thing to get wrong
 * for performance: a counter column cannot drift, but a query over the whole
 * review log gets slower every day somebody studies. Nothing had ever measured
 * that. The demo deck is 417 reviews, which is two weeks of one person, and at
 * that size Postgres will beat any index by simply reading the table.
 *
 * Two halves, because they fail differently:
 *
 *   QUERIES  the derived-progress functions, called directly against a heavy
 *            learner. This is where an O(reviews) mistake shows up, and it
 *            shows up as a number that grows when the deck does.
 *   ROUTES   real HTTP against the built app, concurrently. This is where a
 *            per-request cost that only appears under load shows up.
 *
 * Budgets are asserted, not printed. A benchmark nobody fails is a benchmark
 * nobody reads, and this one is meant to run in CI.
 *
 *   npx tsx scripts/load-fixture.ts --learners 40 --reviews 5000
 *   node scripts/load-test.mjs
 *   node scripts/load-test.mjs --budget-only     # CI: assert, do not explore
 */
import { performance } from "node:perf_hooks";
import { suite } from "./lib/checks.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

/*
  What a page is allowed to cost, in milliseconds, at the p95.

  These are budgets rather than records: they are set well above what the
  machine does today so that ordinary variance does not fail a build, and far
  enough below "a person notices" that a real regression cannot hide under
  them. Assert the budget, not today's number.
*/
const BUDGETS = {
  query: { p95: 400 },
  // Nobody is waiting on a page for this one, so it is allowed to be slower.
  metrics: { p95: 3000 },
  route: { p95: 1500 },
};

/*
  Floor: ten, which is the five queries plus the five routes. On the shared
  harness for the same reason every other suite here is: this job is a CI gate
  now, and a benchmark that measures nothing exits zero and prints an
  encouraging line. Both ways that happens are real. `measureRoutes` returns
  early when there is no server, which is five checks gone with a `console.log`
  in their place, and `--budget-only` skips them on purpose. Neither is a
  failure, so both say how many they cost by name.
*/
const { check, absent, done } = suite("The derived queries", { floor: 10 });

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

const fmt = (s) =>
  `p50 ${s.p50.toFixed(0)}ms · p95 ${s.p95.toFixed(0)}ms · p99 ${s.p99.toFixed(0)}ms`;

async function time(fn, runs) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    await fn();
    samples.push(performance.now() - started);
  }
  return stats(samples);
}

// ── Half one: the derived-progress queries, against a heavy learner ──────────

async function measureQueries() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const owners = await prisma.review.groupBy({
    by: ["ownerId"],
    where: { ownerId: { startsWith: "loadtest-" } },
    _count: { _all: true },
    orderBy: { _count: { ownerId: "desc" } },
    take: 1,
  });
  const heavy = owners[0];
  if (!heavy) {
    console.log("No load fixture found. Run scripts/load-fixture.ts first.\n");
    await prisma.$disconnect();
    return;
  }

  const ownerId = heavy.ownerId;
  const reviews = heavy._count._all;
  const total = await prisma.review.count();
  console.log(
    `Heaviest learner: ${reviews.toLocaleString()} reviews, ` +
    `in a table of ${total.toLocaleString()}.\n`,
  );

  const { deckSnapshot, dailySummary, resolveStreakFor } = await import("../lib/progress/summary.ts");

  const cases = [
    ["deckSnapshot", () => deckSnapshot(ownerId)],
    // `dailySummary` used to take the page's own snapshot, because the quests
    // read the due count off it. The quests are gone and it reads nothing but
    // its own four counts, so there is no snapshot to pass and nothing here is
    // measuring `deckSnapshot` twice.
    ["dailySummary", () => dailySummary(ownerId)],
    ["resolveStreakFor", () => resolveStreakFor(ownerId)],
    [
      /*
        The metrics endpoint, which is the only query here that reads every
        learner rather than one. It is also the only one nobody waits for: it
        is polled by whoever runs the deployment, not rendered into a page, so
        it gets a wider budget on purpose.
      */
      "the whole-population scan behind /api/metrics",
      () =>
        prisma.$queryRaw`
          SELECT DISTINCT "ownerId",
                 TO_CHAR("reviewedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
          FROM "Review"
          WHERE "reviewedAt" >= ${new Date(Date.now() - 400 * 86_400_000)}
          ORDER BY "ownerId", day
        `,
    ],
    [
      "the whole review log for the charts",
      () =>
        prisma.review.findMany({
          where: { ownerId },
          select: { rating: true, reviewedAt: true, targetCase: true, stateBefore: true },
          orderBy: { reviewedAt: "desc" },
          take: 5000,
        }),
    ],
  ];

  for (const [label, fn] of cases) {
    // One warm call first: the first query of a process pays for the pool and
    // the plan, and reporting that as the app's latency would be a lie.
    await fn();
    const s = await time(fn, 12);
    const budget = label.includes("/api/metrics") ? BUDGETS.metrics.p95 : BUDGETS.query.p95;
    check(`${label} stays inside its budget`, s.p95 <= budget, `${fmt(s)}, budget ${budget}ms`);
  }

  await prisma.$disconnect();
  console.log();
}

// ── Half two: the routes, concurrently ──────────────────────────────────────

async function hammer(path, { concurrency, requests }) {
  const samples = [];
  let index = 0;
  let bad = 0;

  async function worker() {
    for (;;) {
      if (index++ >= requests) return;
      const started = performance.now();
      try {
        const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": "kodukeel-load" } });
        await res.arrayBuffer();
        if (!res.ok) bad++;
      } catch {
        bad++;
      }
      samples.push(performance.now() - started);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ...stats(samples), bad };
}

async function measureRoutes() {
  try {
    const probe = await fetch(`${BASE}/`);
    if (!probe.ok) throw new Error(String(probe.status));
  } catch {
    console.log(`No server at ${BASE}. Start one to measure the routes.\n`);
    absent(5, "a server to measure the routes against");
    return;
  }

  const paths = ["/", "/progress", "/words", "/review", "/dictionary?q=tuba"];
  for (const path of paths) {
    await fetch(`${BASE}${path}`);
    const s = await hammer(path, { concurrency: 8, requests: 40 });
    check(`${path} under 8 concurrent readers`, s.p95 <= BUDGETS.route.p95 && s.bad === 0,
      `${fmt(s)}${s.bad ? `, ${s.bad} failed` : ""}`);
  }
  console.log();
}

console.log("Measuring the queries that run on every page load.\n");
await measureQueries();
if (process.argv.includes("--budget-only")) {
  absent(5, "the routes, which --budget-only asks it to skip");
} else {
  await measureRoutes();
}

done();
