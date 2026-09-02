/**
 * What this app actually costs to run, and how anybody knows.
 *
 * Two kinds of number live here and they are kept apart on purpose.
 *
 * `MEASURED` is what a stopwatch, `pg_total_relation_size` and a browser said
 * about this repository on a stated day. Every entry carries the command that
 * produced it, so a reader who doubts one can re-run it rather than take our
 * word, and so the next person to change the schema or the bundle can see
 * which figure they have just invalidated.
 *
 * `VERCEL`, `SUPABASE` and `COMPUTE` are somebody else's published prices,
 * each with the page it came off and the day it was read. They are not facts
 * about this app at all and they date faster than anything else here, which is
 * why they are quoted with a date rather than folded into the arithmetic.
 *
 * Nothing in this file is a guess. What the projection needs and cannot
 * measure lives in `model.ts` under `ASSUMPTIONS`, where it is labelled as an
 * assumption and the reader can change it.
 *
 * Pure: no React, no Next, no Prisma. The funding page renders it, the tests
 * check it, and `scripts/test-invariants.ts` fails on an entry that has
 * stopped saying where it came from.
 */

/** The day the vendor pricing pages below were read. */
export const PRICES_CHECKED = "2 September 2026";

/** The day the measurements below were taken. */
export const MEASURED_ON = "2 September 2026";

export interface Measurement {
  /** What was measured, in the reader's terms. */
  readonly what: string;
  /** The figure, written the way it should be read. */
  readonly value: string;
  /** How to get the same number again. */
  readonly how: string;
}

/**
 * Measured on this repository, against Postgres 16 on the same machine and a
 * production build of the app served by `next start`.
 *
 * The database numbers are the ones worth trusting most: they come from
 * Postgres reporting on its own tables, indexes included, after the seed and
 * after 80,000 synthetic reviews were written by `scripts/load-fixture.ts`.
 * The browser numbers are the softest, because a page's weight depends on what
 * is on it, so the spread is given rather than an average pretending to be one
 * number.
 */
export const MEASURED: readonly Measurement[] = [
  {
    what: "The dictionary, in Postgres",
    value: "18 MB for 6,050 entries and 34,554 forms, indexes included",
    how: "npm run db:seed, then pg_total_relation_size over Lexeme and Form",
  },
  {
    what: "Postgres itself, before a single row",
    value: "about 8 MB",
    how: "pg_database_size on the empty schema, subtracted from the seeded one",
  },
  {
    what: "One review",
    value: "300 bytes, with the four indexes that make it readable",
    how: "80,000 rows written by scripts/load-fixture.ts, divided into the table size",
  },
  {
    what: "One card",
    value: "352 bytes, indexes included",
    how: "the same fixture, 2,000 cards",
  },
  {
    what: "A year of one learner, at fifteen reviews a day five days a week",
    value: "3,900 reviews and a starter deck of about 400 cards, so 1.3 MB",
    how: "the two rows above, times the default daily goal in lib/settings/store.ts",
  },
  {
    what: "One spoken phrase",
    value: "188 KB for 2.1 seconds, which is 88 KB a second",
    how: "one request to TartuNLP for a three-word sentence, read back off the WAV header",
  },
  {
    what: "What that speech actually is",
    value: "32-bit float, 22,050 Hz, one channel, no compression",
    how: "the fmt chunk of the same file",
  },
  {
    what: "A page, as HTML over the wire",
    value: "14 KB for the dictionary, 88 KB for the whole course page, 21 KB in the middle",
    how: "curl --compressed against the built app, seven routes",
  },
  {
    what: "The JavaScript every page shares",
    value: "102 KB, fetched once per build and then cached",
    how: "the First Load JS line of next build",
  },
  {
    what: "Requests behind one page view",
    value: "about 35, of which 11 to 15 reach the server once the browser cache is warm",
    how: "Chrome DevTools request counts over seven routes, twice each",
  },
  {
    what: "What a phone keeps, so it stops asking",
    value: "400 spoken clips, 220 build files and 60 pages",
    how: "LIMITS in public/sw.js",
  },
  {
    what: "Loading the whole dictionary into an empty deployment",
    value: "3.4 seconds",
    how: "time npx tsx prisma/seed.ts",
  },
];

export interface PriceRef {
  /** Where the numbers came from. */
  readonly source: string;
  /** The day that page was read. */
  readonly checked: string;
}

export interface PlanTier {
  readonly name: string;
  /** What the plan costs a month before any overage. */
  readonly baseUsd: number;
  /** What each meter gives you before it starts charging. */
  readonly included: Readonly<Record<string, number>>;
}

/**
 * Vercel, which runs the app itself.
 *
 * Four meters, and they are not equally interesting. Function invocations and
 * active CPU are what a rendered page costs; edge requests count every file a
 * browser asks for, including the ones it already had; transfer is bytes out.
 * The one that decides the plan is usually none of them, because Hobby forbids
 * commercial use, so a school or a company is on Pro at any traffic at all.
 */
export const VERCEL = {
  ref: {
    source: "https://vercel.com/pricing",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  hobby: {
    name: "Hobby",
    baseUsd: 0,
    included: { invocations: 1_000_000, cpuHours: 4, edgeRequests: 1_000_000, transferGb: 100 },
  } satisfies PlanTier,
  pro: {
    name: "Pro",
    baseUsd: 20,
    included: { invocations: 1_000_000, cpuHours: 4, edgeRequests: 10_000_000, transferGb: 1_000 },
  } satisfies PlanTier,
  /** What each meter costs once the plan's allowance is gone. */
  overage: {
    perMillionInvocations: 0.6,
    perCpuHour: 0.128,
    perMillionEdgeRequests: 2,
    perTransferGb: 0.15,
  },
} as const;

/**
 * Supabase, which holds the database, the sign-ins and the cached speech.
 *
 * The free tier pauses a project after a week with nobody on it, which is fine
 * for somebody trying this out and is the reason a class cannot live there:
 * the app would be asleep every Monday morning of the holidays.
 */
export const SUPABASE = {
  ref: {
    source: "https://supabase.com/pricing",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  free: {
    name: "Free",
    baseUsd: 0,
    included: { dbGb: 0.5, egressGb: 5, storageGb: 1, mau: 50_000 },
  } satisfies PlanTier,
  pro: {
    name: "Pro",
    baseUsd: 25,
    included: { dbGb: 8, egressGb: 250, storageGb: 100, mau: 100_000 },
  } satisfies PlanTier,
  overage: {
    perDbGb: 0.125,
    perEgressGb: 0.09,
    perStorageGb: 0.0213,
    perMau: 0.00325,
  },
  /** What the Pro plan's monthly compute credit covers. */
  computeCreditUsd: 10,
  /** How long a free project may sit idle before it is paused. */
  freePausesAfter: "a week with nobody on it",
} as const;

export interface ComputeSize {
  readonly name: string;
  readonly usd: number;
  readonly memoryGb: number;
  /** How many clients the connection pooler in front of it will hold. */
  readonly poolerClients: number;
}

/**
 * The database instance ladder, which is the steepest thing on this page.
 *
 * Two separate reasons push a deployment up it, and the model in `model.ts`
 * takes whichever is higher. One is the working set: an instance whose memory
 * is a small fraction of the database reads from disk on every page, and this
 * app derives its progress from the whole review log on each request
 * (ADR-014), so that is the worst possible shape to be in. The other is
 * concurrency, which is the pooler column: a hundred learners in a computer
 * room at the same time is a hundred clients, and the instance either holds
 * them or refuses them.
 */
export const COMPUTE = {
  ref: {
    source: "https://supabase.com/docs/guides/platform/compute-and-disk",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  sizes: [
    { name: "Micro", usd: 10, memoryGb: 1, poolerClients: 200 },
    { name: "Small", usd: 15, memoryGb: 2, poolerClients: 400 },
    { name: "Medium", usd: 60, memoryGb: 4, poolerClients: 600 },
    { name: "Large", usd: 110, memoryGb: 8, poolerClients: 800 },
    { name: "XL", usd: 210, memoryGb: 16, poolerClients: 1_000 },
    { name: "2XL", usd: 410, memoryGb: 32, poolerClients: 1_500 },
    { name: "4XL", usd: 960, memoryGb: 64, poolerClients: 3_000 },
    { name: "8XL", usd: 1_870, memoryGb: 128, poolerClients: 6_000 },
    { name: "12XL", usd: 2_800, memoryGb: 192, poolerClients: 9_000 },
    { name: "16XL", usd: 3_730, memoryGb: 256, poolerClients: 12_000 },
  ] as readonly ComputeSize[],
} as const;

/**
 * What a domain costs, which is the one line here billed in euros.
 *
 * The registry's own fee is the published one; what a registrant pays is
 * whatever their registrar charges on top, so this is the only figure on the
 * page that is a retail price rather than a rate card. It is also the smallest
 * by two orders of magnitude, which is the reason it is worth including: a
 * page about what something costs that quietly leaves out the cheap lines is
 * choosing what to show.
 */
export const DOMAIN = {
  ref: {
    source: "https://www.internet.ee/help-and-info/faq",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  usdPerYear: 16,
  note: "A .ee domain. The registry charges 6 euros a year; a registrar asks about 15.",
} as const;

/**
 * The free-model allowance, which is a rate limit rather than a price.
 *
 * The default chain is free models on OpenRouter, so the tutor costs nothing
 * and is capped by requests instead. Fifty a day across a whole deployment is
 * one shared allowance, not one each, which is the thing most likely to
 * surprise somebody who read "free" and planned a class around it.
 */
export const OPENROUTER_FREE = {
  ref: {
    source: "https://openrouter.ai/docs/api-reference/limits",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  requestsPerMinute: 20,
  requestsPerDay: 50,
  requestsPerDayWithCredit: 1_000,
  creditThresholdUsd: 10,
} as const;

/** Every published price on this page, for the check that they all cite one. */
export const PRICE_REFS: readonly PriceRef[] = [
  VERCEL.ref, SUPABASE.ref, COMPUTE.ref, DOMAIN.ref, OPENROUTER_FREE.ref,
];
