/**
 * What a month of this app costs, at whatever size somebody puts in.
 *
 * The point of writing this down as arithmetic rather than as a sentence is
 * that a sentence cannot be argued with. Every input is on the page, every
 * assumption is named, and a reader who thinks fifteen reviews a day is wrong
 * for their class can move it and watch the bill move. A funder reading "it
 * costs about forty dollars a month" has to trust us; a funder who can see
 * which line grows fastest and where the next cliff is does not have to.
 *
 * THREE KINDS OF NUMBER GO IN, AND THEY ARE NOT EQUALLY SOLID.
 *
 *   Measured      `facts.ts`, taken off this repository on a stated day.
 *   Published     `facts.ts`, off a vendor's own pricing page on a stated day.
 *   Assumed       `ASSUMPTIONS` below, and nothing else.
 *
 * Keeping the third list short and visible is most of the honesty here. It was
 * tempting to bury "how many pages somebody opens in a sitting" inside the
 * arithmetic, and that is exactly the number a reader would want to challenge.
 *
 * WHAT THIS DELIBERATELY DOES NOT MODEL. Anybody's time, which is the largest
 * real cost of this project and is not a hosting bill. Support, which is a
 * person. Whether a bigger database instance is needed for a reason other than
 * memory or connections, which it often is. A month with a launch in it. The
 * page says all of that out loud rather than letting a total imply it is
 * complete.
 *
 * Pure: no React, no Next, no Prisma. It reads the app's own spend cap and the
 * app's own token profile, so the tutor line here and the tutor line on a real
 * invoice are the same calculation rather than two guesses about one thing.
 */
import { type UsageKind, reserveMicros } from "@/lib/usage/pricing";
import { DEFAULT_LIMITS } from "@/lib/usage/quota";
import { COMPUTE, DOMAIN, OPENROUTER_FREE, SUPABASE, VERCEL, type PlanTier } from "./facts";

/** How the tutor is paid for, which is the choice with the widest consequences. */
export type TutorMode = "off" | "free" | "paid";

export interface Shape {
  /** Learners who open the app in a month. */
  learners: number;
  /** Sittings a week each. */
  sessionsPerWeek: number;
  /** Cards answered in a sitting. The default daily goal is fifteen. */
  reviewsPerSession: number;
  /** Whether cards read themselves aloud, which is on by default. */
  audio: boolean;
  tutor: TutorMode;
  /** How long the deployment has been collecting reviews. Storage never shrinks. */
  years: number;
  /**
   * Whether the deployment is a business or a school rather than one person.
   *
   * It is here because it changes the bill on its own, at any traffic: Vercel's
   * free plan forbids commercial use, so the honest floor for a school is
   * twenty dollars a month before a single learner arrives.
   */
  commercial: boolean;
}

export const DEFAULT_SHAPE: Shape = {
  learners: 100,
  sessionsPerWeek: 5,
  reviewsPerSession: 15,
  audio: true,
  tutor: "free",
  years: 1,
  commercial: false,
};

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
 * learner fetches and the CPU a request burns, and they are the two with the
 * least behind them, which is worth saying rather than hiding behind a
 * decimal place.
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
    id: "tutor",
    what: "Questions a learner asks Anu in a month",
    value: 4,
    unit: "questions",
    why: "The per-person cap is ten a day, so this is far under it. Most people never open her.",
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

const assumed = (id: string): number => {
  const found = ASSUMPTIONS.find((a) => a.id === id);
  if (!found) throw new Error(`No assumption called ${id}`);
  return found.value;
};

/* Measured in `facts.ts`, used as numbers here. Each one is quoted on the page. */
const REVIEW_BYTES = 300;
const CARD_BYTES = 352;
const CLIP_KB = 188;
const HTML_KB = 21;
const SHARED_JS_KB = 102;
const REQUESTS_PER_PAGE = 13;
const DICTIONARY_MB = 18;
const POSTGRES_ITSELF_MB = 8;
/** The deck first run builds, from `lib/collections/starter.ts`. */
const STARTER_CARDS = 400;
/** A card costs about ten reviews in its first year, so a goal of fifteen sustains one and a half. */
const REVIEWS_PER_NEW_CARD = 10;
/** Words and recorded sentences the dictionary could ever be asked to speak. */
const DISTINCT_PHRASES = 15_000;
/** How far a database may exceed the instance's memory before the instance is too small. */
const MEMORY_HEADROOM = 8;

const WEEKS_PER_MONTH = 4.345;
const DAYS_PER_MONTH = 30.44;

/** A meter, and how much of it the plan gives away before charging. */
export interface Meter {
  readonly label: string;
  readonly used: number;
  readonly included: number;
  /** How to say the number: a plain count, gigabytes, or hours. */
  readonly as: "count" | "gb" | "hours";
}

export interface Line {
  readonly id: string;
  readonly service: string;
  /** The tier this size lands on. */
  readonly plan: string;
  readonly usd: number;
  /** What moved it, in one line. */
  readonly why: string;
  readonly meters: readonly Meter[];
  /**
   * Which meters would not fit the free tier, by name.
   *
   * Without this the page can say a service costs money and cannot say why:
   * the moment a plan changes, every meter is measured against the new plan's
   * allowance and the one that actually caused the change looks comfortable.
   * It is the most useful column here for anybody deciding what to switch off.
   */
  readonly movedBy: readonly string[];
}

export interface Bill {
  readonly lines: readonly Line[];
  readonly totalUsd: number;
  /** The total divided by the learners, which is the figure a funder asks for. */
  readonly perLearnerUsd: number;
  /** Set when the app's own spend cap is what stopped the tutor line growing. */
  readonly tutorCapBinds: boolean;
  /**
   * Set when the free model allowance is already spent, so the tutor is off
   * for part of the month whatever the bill says. A limit, not a charge.
   */
  readonly freeTutorRunsOut: boolean;
  /** What the size works out to per month, for the page to quote back. */
  readonly volume: Volume;
}

export interface Volume {
  readonly sessions: number;
  readonly reviews: number;
  readonly pageViews: number;
  readonly clips: number;
  readonly tutorCalls: number;
  readonly databaseGb: number;
  readonly peakConcurrent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "a, b and c", because "a and b and c" reads as a list nobody proof-read. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
const gb = (kilobytes: number) => kilobytes / 1e6;

/** What a month at this size actually consists of, before anybody is billed for it. */
export function volumeOf(shape: Shape): Volume {
  const learners = Math.max(0, shape.learners);
  const sessions = learners * shape.sessionsPerWeek * WEEKS_PER_MONTH;
  const reviews = sessions * shape.reviewsPerSession;
  const pageViews = sessions * assumed("pages");
  const clips = shape.audio ? learners * assumed("clips") : 0;
  const tutorCalls = shape.tutor === "off" ? 0 : learners * assumed("tutor");

  const reviewsPerYear = shape.sessionsPerWeek * 52 * shape.reviewsPerSession;
  const newCardsPerMonth =
    Math.max(1, Math.round(shape.reviewsPerSession / REVIEWS_PER_NEW_CARD))
    * shape.sessionsPerWeek * WEEKS_PER_MONTH;
  const cards = STARTER_CARDS + newCardsPerMonth * 12 * shape.years;
  const learnerBytes = shape.years * reviewsPerYear * REVIEW_BYTES + cards * CARD_BYTES;

  const databaseGb =
    (POSTGRES_ITSELF_MB + DICTIONARY_MB) / 1000 + (learners * learnerBytes) / 1e9;

  return {
    sessions,
    reviews,
    pageViews,
    clips,
    tutorCalls,
    databaseGb,
    peakConcurrent: Math.ceil(learners * (assumed("peak") / 100)),
  };
}

/** What a set of meters costs above a tier, at a set of per-unit rates. */
function overageUsd(
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

function vercelLine(shape: Shape, v: Volume): Line {
  const invocations = v.pageViews + v.reviews + v.clips + v.tutorCalls;
  const edgeRequests = v.pageViews * REQUESTS_PER_PAGE + v.reviews + v.clips + v.tutorCalls;
  const transferGb = gb(
    v.pageViews * HTML_KB
    + v.clips * CLIP_KB
    + shape.learners * SHARED_JS_KB * assumed("builds"),
  );
  const cpuHours = (invocations * assumed("cpu")) / 3_600_000;

  const used = { invocations, cpuHours, edgeRequests, transferGb };
  const labels = {
    invocations: "requests answered",
    cpuHours: "processor time",
    edgeRequests: "files served",
    transferGb: "data out",
  };
  const movedBy = (Object.keys(used) as (keyof typeof used)[])
    .filter((k) => used[k] > (VERCEL.hobby.included[k] ?? 0))
    .map((k) => labels[k]);
  const fitsHobby = movedBy.length === 0;
  /*
    The commercial question comes first and is not about traffic at all. A
    school running this for its pupils is on Pro at one learner, because the
    free plan's terms say so, and a page that showed them nought would be
    describing a plan they are not allowed to be on.
  */
  const tier = shape.commercial || !fitsHobby ? VERCEL.pro : VERCEL.hobby;

  const usd = tier.baseUsd + overageUsd(used, tier, {
    invocations: VERCEL.overage.perMillionInvocations / 1e6,
    cpuHours: VERCEL.overage.perCpuHour,
    edgeRequests: VERCEL.overage.perMillionEdgeRequests / 1e6,
    transferGb: VERCEL.overage.perTransferGb,
  });

  const why = tier === VERCEL.hobby
    ? "Inside the free plan, which a person may use and a school may not."
    : shape.commercial && fitsHobby
      ? "The traffic would fit the free plan. A school or a company may not use it."
      : `Past the free plan on ${listOf(movedBy)}.`;

  return {
    id: "vercel",
    service: "Vercel",
    plan: tier.name,
    usd: round2(usd),
    why,
    meters: [
      { label: "Requests answered", used: invocations, included: tier.included.invocations ?? 0, as: "count" },
      { label: "Files served", used: edgeRequests, included: tier.included.edgeRequests ?? 0, as: "count" },
      { label: "Data out", used: transferGb, included: tier.included.transferGb ?? 0, as: "gb" },
      { label: "Processor time", used: cpuHours, included: tier.included.cpuHours ?? 0, as: "hours" },
    ],
    movedBy,
  };
}

/**
 * How many *different* clips a number of fetches works out to.
 *
 * A clip is stored by its content, so two learners on the same unit asking for
 * the same word are one file. Counting a fetch as a file would have said ten
 * learners need 1.3 GB of speech, when between them they are studying the same
 * few hundred words, and the whole point of content-addressing it was that they
 * are not each other's cost.
 *
 * Saturating rather than linear, and saturating at the number of things there
 * are to say: the dictionary is finite, so past a certain traffic every fetch
 * is a word somebody has already asked for and storage stops growing. The curve
 * is the standard one for drawing with replacement, which assumes every phrase
 * is equally likely and so is pessimistic here, since a course teaches its
 * first unit to everybody.
 */
export function distinctClips(fetches: number): number {
  return DISTINCT_PHRASES * (1 - Math.exp(-Math.max(0, fetches) / DISTINCT_PHRASES));
}

/** The smallest instance that answers both reasons for needing a bigger one. */
export function computeFor(databaseGb: number, peakConcurrent: number) {
  const sizes = COMPUTE.sizes;
  const forMemory = sizes.findIndex((s) => s.memoryGb * MEMORY_HEADROOM >= databaseGb);
  const forClients = sizes.findIndex((s) => s.poolerClients >= peakConcurrent);
  const at = Math.max(
    forMemory === -1 ? sizes.length - 1 : forMemory,
    forClients === -1 ? sizes.length - 1 : forClients,
  );
  return sizes[at]!;
}

function supabaseLine(shape: Shape, v: Volume): Line {
  const egressGb = gb(v.pageViews * assumed("dbread") + v.clips * CLIP_KB);
  const storageGb = gb(distinctClips(v.clips * 12 * shape.years) * CLIP_KB);
  const used = { dbGb: v.databaseGb, egressGb, storageGb, mau: shape.learners };
  const labels = {
    dbGb: "the database",
    egressGb: "data out",
    storageGb: "stored speech",
    mau: "sign-ins",
  };
  const movedBy = (Object.keys(used) as (keyof typeof used)[])
    .filter((k) => used[k] > (SUPABASE.free.included[k] ?? 0))
    .map((k) => labels[k]);
  const fitsFree = movedBy.length === 0;
  const tier = fitsFree ? SUPABASE.free : SUPABASE.pro;
  const compute = computeFor(v.databaseGb, v.peakConcurrent);

  /*
    Compute is charged against a credit rather than added to the base, so the
    smallest instance is already paid for by the Pro plan and only the step
    above it shows up as money. The free tier has no instance to choose.
  */
  const computeUsd = fitsFree ? 0 : Math.max(0, compute.usd - SUPABASE.computeCreditUsd);
  const usd = tier.baseUsd + computeUsd + overageUsd(used, tier, {
    dbGb: SUPABASE.overage.perDbGb,
    egressGb: SUPABASE.overage.perEgressGb,
    storageGb: SUPABASE.overage.perStorageGb,
    mau: SUPABASE.overage.perMau,
  });

  const why = fitsFree
    ? `Inside the free tier, which pauses after ${SUPABASE.freePausesAfter}.`
    : computeUsd > 0
      ? `A ${compute.name} instance, which is what ${v.peakConcurrent.toLocaleString("en-GB")} people at once and ${v.databaseGb.toFixed(1)} GB need.`
      : `Past the free tier on ${listOf(movedBy)}, on the smallest instance.`;

  return {
    id: "supabase",
    service: "Supabase",
    plan: fitsFree ? SUPABASE.free.name : `${SUPABASE.pro.name}, ${compute.name}`,
    usd: round2(usd),
    why,
    meters: [
      { label: "Database", used: v.databaseGb, included: tier.included.dbGb ?? 0, as: "gb" },
      { label: "Data out", used: egressGb, included: tier.included.egressGb ?? 0, as: "gb" },
      { label: "Speech stored", used: storageGb, included: tier.included.storageGb ?? 0, as: "gb" },
      { label: "People signing in", used: shape.learners, included: tier.included.mau ?? 0, as: "count" },
    ],
    movedBy,
  };
}

/** What the app's own ledger would let the tutor spend in a month. */
export const TUTOR_CAP_USD = (DEFAULT_LIMITS.dailyMicrosGlobal / 1e6) * DAYS_PER_MONTH;

function tutorLine(shape: Shape, v: Volume): Line & { capped: boolean; ranOut: boolean } {
  const kind: UsageKind = "TUTOR";
  const perCallUsd = shape.tutor === "paid" ? reserveMicros(kind) / 1e6 : 0;
  const wanted = v.tutorCalls * perCallUsd;
  const capped = wanted > TUTOR_CAP_USD;
  const usd = Math.min(wanted, TUTOR_CAP_USD);

  const callsPerDay = v.tutorCalls / DAYS_PER_MONTH;
  const ranOut = shape.tutor === "free" && callsPerDay > OPENROUTER_FREE.requestsPerDayWithCredit;

  const why = shape.tutor === "off"
    ? "Nobody has set a key, so Anu is not there. Everything else works."
    : shape.tutor === "free"
      ? ranOut
        ? `Free models, and past their ${OPENROUTER_FREE.requestsPerDayWithCredit.toLocaleString("en-GB")} requests a day. Anu goes quiet, she does not get expensive.`
        : "Free models, which is what a fresh install uses."
      : capped
        ? "The app's own daily cap is what is holding this down, not the traffic."
        : "A paid model, priced the way the ledger prices one before it makes the call.";

  return {
    id: "tutor",
    service: "The tutor",
    plan: shape.tutor === "paid" ? "A paid model" : shape.tutor === "free" ? "Free models" : "Off",
    usd: round2(usd),
    why,
    meters: [
      { label: "Questions asked", used: v.tutorCalls, included: 0, as: "count" },
    ],
    movedBy: [],
    capped,
    ranOut,
  };
}

export function billFor(shape: Shape): Bill {
  const v = volumeOf(shape);
  const tutor = tutorLine(shape, v);

  const lines: Line[] = [
    vercelLine(shape, v),
    supabaseLine(shape, v),
    tutor,
    {
      id: "domain",
      service: "The domain",
      plan: "One a year",
      usd: round2(DOMAIN.usdPerYear / 12),
      why: DOMAIN.note,
      meters: [],
      movedBy: [],
    },
    {
      id: "public",
      service: "Ekilex, Wiktionary and TartuNLP",
      plan: "No charge",
      usd: 0,
      why: "Every Estonian form, every English meaning and every spoken word. None of them bill anybody.",
      meters: [
        { label: "Words asked for", used: v.clips, included: 0, as: "count" },
      ],
      movedBy: [],
    },
  ];

  const totalUsd = round2(lines.reduce((sum, l) => sum + l.usd, 0));

  return {
    lines,
    totalUsd,
    perLearnerUsd: shape.learners > 0 ? totalUsd / shape.learners : 0,
    tutorCapBinds: tutor.capped,
    freeTutorRunsOut: tutor.ranOut,
    volume: v,
  };
}

/**
 * The sizes the page plots, from one person to a country's worth of them.
 *
 * A logarithmic ladder rather than an even one, because the interesting thing
 * about this bill is where it steps rather than how it slopes, and the steps
 * are decades apart. Estonia has about 1.3 million people, of whom something
 * like 200,000 are learning the language at any time, so the top of this
 * ladder is deliberately past anything plausible: a reader should be able to
 * see the shape carry on rather than stop where we got comfortable.
 */
export const SCALE_LADDER: readonly number[] = [1, 10, 100, 1_000, 10_000, 100_000];

/** The same bill at every rung, for the chart and the table under it. */
export function ladderFor(shape: Shape): readonly { learners: number; bill: Bill }[] {
  return SCALE_LADDER.map((learners) => ({ learners, bill: billFor({ ...shape, learners }) }));
}
