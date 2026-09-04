/**
 * What this app costs to run, and how anybody knows.
 *
 * Three kinds of number live here and they are kept apart on purpose.
 *
 * `MEASURED` is what a stopwatch, `pg_total_relation_size` and a browser said
 * about this repository on a stated day. Every entry carries the command that
 * produced it, so a reader who doubts one can re-run it rather than take our
 * word, and so the next person to change the schema or the bundle can see
 * which figure they have just invalidated.
 *
 * `VERCEL`, `SUPABASE`, `COMPUTE`, `SPEECH_MARKET` and `DOMAIN` are somebody
 * else's published prices, each with the page it came off and the day it was
 * read. They are not facts about this app at all and they date faster than
 * anything else here, which is why they are quoted with a date rather than
 * folded into the arithmetic.
 *
 * `ASSUMPTIONS` is everything left: what the projection needs and nothing
 * measured. It is deliberately short, and every entry is on the page in full
 * with the reason it is the number it is.
 *
 * WHAT IS GIVEN IS NOT PRICED HERE. Ekilex, Wiktionary and TartuNLP ask for
 * nothing and are credited in `services.ts` rather than billed. The one figure
 * kept for them is `SPEECH_MARKET`, and it is there to show the size of the
 * gift rather than to charge for it.
 *
 * NOTHING HERE HAS A FREE TIER. Earlier versions of this file carried one for
 * Vercel and one for Supabase and picked between them by traffic, which
 * described a deployment nobody actually runs: a free plan pauses when nobody
 * is on it, forbids commercial use, and is not what anybody hosting this for
 * other people is on. Modelling it made the page cheerful and wrong. The paid
 * plan is the only plan.
 *
 * Pure: no React, no Next, no Prisma.
 */
import { SEED_SET_SIZE } from "@/lib/collections/seedSize";
import type { PlanTier, PriceRef, Shape } from "./types";

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
/**
 * The dictionary in Postgres, with its indexes, in megabytes.
 *
 * Declared above `MEASURED` rather than below it, because both the sentence a
 * reader gets and the arithmetic the chart draws read this one number, and a
 * `const` referenced before its declaration throws at import time rather than
 * quietly reading zero.
 */
export const DICTIONARY_MB = 20;

export const MEASURED: readonly Measurement[] = [
  {
    what: "The dictionary, in Postgres",
    /*
      READ OFF THE SEED RATHER THAN TYPED, because the first version was typed
      and was stale the same day: it said 6,050 entries and 34,554 forms while
      the seed it described held 6,102 and 38,577, the nominative plural having
      become a stored principal part in between. A page whose whole design is
      "measured on a stated day, and here is the command that gets the same
      number" cannot carry a number the command no longer gives.
    */
    value: `${DICTIONARY_MB} MB for ${SEED_SET_SIZE.words.toLocaleString("en-GB")} entries and `
      + `${SEED_SET_SIZE.forms.toLocaleString("en-GB")} forms, indexes included`,
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
    what: "One spoken phrase, as stored",
    value: "51 KB for 1.15 seconds, which is 43 KB a second",
    how: "one request to TartuNLP for a three-word sentence, passed through prepareClip in lib/audio/wav.ts, read back off the WAV header",
  },
  {
    what: "What that speech actually is",
    value: "16-bit PCM, 22,050 Hz, one channel, no compression; the service sends 32-bit float with half a second of silence each end, 199 KB for the same sentence",
    how: "the fmt chunk of the same file, before and after",
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

/**
 * The euro, because two lines are priced in one and five are priced in dollars.
 *
 * The operator is in Estonia and the tooling and the domain are billed in
 * euros; Vercel, Supabase, Resend, Sentry and Amazon bill in dollars. There is
 * no arrangement in which every line is native to one currency, so the model
 * runs in dollars, the euro lines carry their euro figure, and the rate is the
 * European Central Bank's own reference rate with the day it was published.
 *
 * PRICES HERE ARE ALL NET OF VAT, which is how every vendor above quotes its
 * own. An operator adds whatever their country charges and reclaims it if they
 * are registered for it, so putting VAT on one line and not the others would
 * make the bill inconsistent rather than more complete.
 */
export const FX = {
  ref: {
    source: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  usdPerEur: 1.1578,
} as const;

/** A euro price in dollars, which is the currency the rest of the model runs in. */
export const usdFromEur = (eur: number) => eur * FX.usdPerEur;

/**
 * Vercel, which runs the app itself.
 *
 * One plan, because there is one plan anybody hosting this for other people
 * can be on. The free plan forbids commercial use outright, so a school or a
 * company is on Pro at one learner, and a private deployment that fits inside
 * the free allowances is still a deployment that pauses and has no support.
 */
export const VERCEL = {
  ref: {
    source: "https://vercel.com/pricing",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
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

/** Supabase, which holds the database, the sign-ins and the cached speech. */
export const SUPABASE = {
  ref: {
    source: "https://supabase.com/pricing",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
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
 * Two separate reasons push a deployment up it, and `computeFor` takes
 * whichever is higher. One is the working set: an instance whose memory is a
 * small fraction of the database reads from disk on every page, and this app
 * derives its progress from the whole review log on each request (ADR-014), so
 * that is the worst possible shape to be in. The other is concurrency, which
 * is the pooler column: a hundred learners in a computer room at the same time
 * is a hundred clients, and the instance either holds them or refuses them.
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
 * What speech synthesis costs when you buy it, which is how TartuNLP's is
 * priced here.
 *
 * TartuNLP sends no invoice. Pricing their work at nothing would say this app
 * runs on five paid services and a miracle, and it is the line that grows
 * fastest with use, so leaving it out understates the thing most worth
 * understanding. Amazon's neural rate is the closest published equivalent to
 * what the University of Tartu is giving away: a neural voice, per character,
 * at a rate anybody can check.
 *
 * It is marked `notInvoiced` where it is used, so the page can say which part
 * of the total somebody would actually be billed for.
 */
export const SPEECH_MARKET = {
  ref: {
    source: "https://aws.amazon.com/polly/pricing/",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  usdPerMillionCharacters: 16,
  equivalentOf: "Amazon Polly's neural voices",
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
  eurPerYear: 15,
  note: "A .ee domain. The registry charges 6 euros a year; a registrar asks about 15.",
} as const;

/**
 * The tooling that writes and maintains this, which is a real monthly bill and
 * was missing from the first version of this page.
 *
 * It is the one line here that is not runtime infrastructure, and leaving it
 * out was the same mistake as pricing TartuNLP at nothing: the page said what
 * the servers cost and quietly implied the software maintains itself. It does
 * not scale with learners, which is worth seeing rather than hiding, because
 * at a hundred users it is most of the bill and at a hundred thousand it is a
 * rounding error.
 *
 * Billed in euros and quoted net of VAT, like every other price here.
 */
export const DEVTOOLS = {
  ref: {
    source: "https://claude.com/pricing",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  plan: "Claude Max, 20x",
  eurPerMonth: 180,
} as const;

/**
 * Transactional email, which is how somebody signs in without a Google account.
 *
 * The README is blunt about this already: Supabase's built-in email service
 * sends from a shared address at a low rate and is for testing, so a
 * deployment that tells anybody about itself needs its own sender. That makes
 * it infrastructure rather than a nicety, and it was missing from this page.
 */
export const EMAIL = {
  ref: {
    source: "https://resend.com/pricing",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  pro: {
    name: "Pro",
    baseUsd: 20,
    included: { emails: 50_000 },
  } satisfies PlanTier,
  overage: { perThousandEmails: 0.9 },
} as const;

/**
 * Error reporting, which the app already has a variable for.
 *
 * `ERROR_WEBHOOK_URL` has been in this app since before the funding page
 * existed, and `/privacy` names whatever it points at as a recipient. The
 * endpoint on the other end is somebody's paid product, so it belongs here
 * with a price rather than as an env var nobody costed.
 */
export const ERRORS = {
  ref: {
    source: "https://sentry.io/pricing/",
    checked: PRICES_CHECKED,
  } satisfies PriceRef,
  team: {
    name: "Team",
    baseUsd: 26,
    included: { events: 50_000 },
  } satisfies PlanTier,
} as const;

/**
 * Which model the tutor runs on, offered as a choice because it is the one
 * decision on this page that funding actually changes.
 *
 * The ids are keys of the app's own price table in `lib/usage/pricing.ts`, and
 * the cost comes from `reserveMicros` against that table, so this page cannot
 * quote a rate the running app does not also charge. A free model is
 * deliberately not among the options: the point of funding this is that Anu
 * stops being the cheapest thing that answers.
 */
export const TUTOR_MODELS: readonly { readonly id: string; readonly name: string }[] = [
  { id: "claude-haiku-4-5", name: "Haiku" },
  { id: "claude-sonnet-5", name: "Sonnet" },
  { id: "claude-opus-5", name: "Opus" },
];

/** Every published price on this page, for the check that they all cite one. */
export const PRICE_REFS: readonly PriceRef[] = [
  VERCEL.ref, SUPABASE.ref, COMPUTE.ref, SPEECH_MARKET.ref, DOMAIN.ref,
  DEVTOOLS.ref, EMAIL.ref, ERRORS.ref, FX.ref,
];

/* ── What was measured, as numbers the arithmetic can use ─────────────────── */

export const REVIEW_BYTES = 300;
export const CARD_BYTES = 352;
export const CLIP_KB = 51;
export const HTML_KB = 21;
export const SHARED_JS_KB = 102;
export const REQUESTS_PER_PAGE = 13;
export const POSTGRES_ITSELF_MB = 8;
/** The deck first run builds, from `lib/collections/starter.ts`. */
export const STARTER_CARDS = 400;
/** A card costs about ten reviews in its first year, so a goal of fifteen sustains one and a half. */
export const REVIEWS_PER_NEW_CARD = 10;
/** Words and recorded sentences the dictionary could ever be asked to speak. */
export const DISTINCT_PHRASES = 15_000;
/** How far a database may exceed the instance's memory before the instance is too small. */
const MEMORY_HEADROOM = 8;

export const WEEKS_PER_MONTH = 4.345;
export const DAYS_PER_MONTH = 30.44;

export interface Assumption {
  readonly id: string;
  /** What the number is, in the reader's terms. */
  readonly what: string;
  readonly value: number;
  readonly unit: string;
  /** Why that number and not another. */
  readonly why: string;
}

/**
 * Everything the projection needs that nothing measured.
 *
 * Each one is a judgement, and each one is here so it can be disagreed with
 * rather than discovered. The two that move the total most are the clips a
 * learner fetches and the processor time a request burns, and they are the two
 * with the least behind them, which is worth saying rather than hiding behind
 * a decimal place.
 */
export const ASSUMPTIONS: readonly Assumption[] = [
  {
    id: "pages",
    what: "Pages opened in a sitting",
    value: 6,
    unit: "pages",
    why: "Today, review, and a few looks at the dictionary or a grammar page on the way past.",
  },
  {
    id: "clips",
    what: "New spoken clips a learner fetches in a month",
    value: 60,
    unit: "clips",
    why: "A phone keeps 400, so only new words cost anything. This is roughly the new cards a month at the default pace, plus their sentences.",
  },
  {
    id: "phrase",
    what: "Characters in a spoken phrase",
    value: 30,
    unit: "characters",
    why: "A word is about eight and a recorded sentence about forty. Speech is billed per character, so this is what decides that line.",
  },
  {
    id: "tutor",
    what: "Questions a learner asks Anu in a month",
    value: 4,
    unit: "questions",
    why: "The per-person cap is ten a day, so this is far under it. Most people never open her.",
  },
  {
    id: "grader",
    what: "Pieces of writing a learner has looked at in a month",
    value: 8,
    unit: "notes",
    why: "Cheaper per call than a question and asked more often, because the writing exercise offers one every time.",
  },
  {
    id: "emails",
    what: "Emails a learner is sent in a month",
    value: 3,
    unit: "emails",
    why: "A mailed sign-in link lasts a session, so this is a couple of sign-ins and the occasional reminder.",
  },
  {
    id: "cpu",
    what: "Processor time behind one request",
    value: 40,
    unit: "milliseconds",
    why: "A page is mostly waiting on the database, which is not charged. This is the part that is, and it is the softest number here.",
  },
  {
    id: "dbread",
    what: "What one page reads out of the database",
    value: 25,
    unit: "kilobytes",
    why: "Eight or so queries over a deck and a review log, none of which return much.",
  },
  {
    id: "peak",
    what: "Learners on the app at the same moment, at the busiest",
    value: 3,
    unit: "per cent of the month's learners",
    why: "A class arrives together, so this is higher than it looks. It decides the database instance and nothing else.",
  },
  {
    id: "builds",
    what: "Times the shared JavaScript is re-fetched by a device in a month",
    value: 4,
    unit: "times",
    why: "It is cached until a deploy changes its name, so this is really how often the app ships.",
  },
];

export function assumed(id: string): number {
  const found = ASSUMPTIONS.find((a) => a.id === id);
  if (!found) throw new Error(`No assumption called ${id}`);
  return found.value;
}

/* ── Small derivations over the tables above, shared by the services ─────── */

/** The smallest instance that answers both reasons for needing a bigger one. */
export function computeFor(databaseGb: number, peakConcurrent: number): ComputeSize {
  const sizes = COMPUTE.sizes;
  const forMemory = sizes.findIndex((s) => s.memoryGb * MEMORY_HEADROOM >= databaseGb);
  const forClients = sizes.findIndex((s) => s.poolerClients >= peakConcurrent);
  const at = Math.max(
    forMemory === -1 ? sizes.length - 1 : forMemory,
    forClients === -1 ? sizes.length - 1 : forClients,
  );
  return sizes[at]!;
}

/**
 * How many *different* clips a number of fetches works out to.
 *
 * A clip is stored by its content, so two learners on the same unit asking for
 * the same word are one file. Counting a fetch as a file would have said ten
 * learners need 1.3 GB of speech, when between them they are studying the same
 * few hundred words, and the whole point of content-addressing it was that
 * they are not each other's cost.
 *
 * Saturating rather than linear, and saturating at the number of things there
 * are to say: the dictionary is finite, so past a certain traffic every fetch
 * is a word somebody has already asked for and storage stops growing. The
 * curve is the standard one for drawing with replacement, which assumes every
 * phrase is equally likely and so is pessimistic here, since a course teaches
 * its first unit to everybody.
 */
export function distinctClips(fetches: number): number {
  return DISTINCT_PHRASES * (1 - Math.exp(-Math.max(0, fetches) / DISTINCT_PHRASES));
}

/** What a set of meters costs above a tier, at a set of per-unit rates. */
export function overageUsd(
  used: Readonly<Record<string, number>>,
  tier: PlanTier,
  rate: Readonly<Record<string, number>>,
): number {
  let total = 0;
  for (const [meter, amount] of Object.entries(used)) {
    const over = Math.max(0, amount - (tier.included[meter] ?? 0));
    total += over * (rate[meter] ?? 0);
  }
  return total;
}

/** "a, b and c", because "a and b and c" reads as a list nobody proof-read. */
export function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const gbOf = (kilobytes: number) => kilobytes / 1e6;

/** The shape the page starts on: a small real deployment, everything switched on. */
export const DEFAULT_SHAPE: Shape = {
  learners: 100,
  sessionsPerWeek: 5,
  reviewsPerSession: 15,
  audio: true,
  tutor: "paid",
  tutorModel: "claude-opus-5",
  years: 1,
};
