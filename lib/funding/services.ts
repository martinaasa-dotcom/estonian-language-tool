/**
 * EVERY THING THIS APP RUNS ON, DECLARED ONCE, WITH ITS PRICE.
 *
 * There used to be three lists. A catalogue said what the app depends on, a
 * set of hand-written functions in the cost model said what each one costs,
 * and the page rendered whichever of them it had been told about. Adding a
 * service meant remembering all three, and the one certain to go stale is the
 * bill: nothing fails when a line is missing from a total, it just comes out
 * lower than the truth, which is the single worst way for a page like this to
 * be wrong.
 *
 * So this is the list. A service carries what it is, who runs it, what a
 * learner loses without it, the variable that switches it on, where its price
 * came from, and a function that says what it costs at a given size. Adding a
 * new tool is one entry here and nothing else: the bill, the totals, the
 * chart, the ladder and the page's own description all read this array, and
 * `scripts/test-invariants.ts` fails if any of them stops.
 *
 * NO SERVICE ANYBODY BILLS US FOR IS MODELLED AS FREE. A free tier is a plan
 * that pauses when nobody is on it, forbids commercial use, or hands out an
 * allowance the day somebody launches, and modelling one made this page
 * cheerful and wrong. Every vendor here is on the plan a real deployment is on.
 *
 * WHAT IS GIVEN IS CREDITED, NOT PRICED. Ekilex, Wiktionary and TartuNLP are
 * public institutions that have decided this work should be available. They
 * ask for nothing. An earlier version put a shadow price on them and added it
 * to the total, which turns a thing to be grateful for into a line on an
 * invoice nobody sent. They are `given` instead: named, with what each one
 * provides and the licence it comes under, and kept out of every total. Where
 * there is a commercial equivalent, the page says what buying the same thing
 * would come to, so the size of the gift is visible without being charged for.
 *
 * Pure: no React, no Next, no Prisma, and no environment. Which of these a
 * particular deployment has switched on is read by the page.
 */
import { SEED_SET_SIZE } from "@/lib/collections/seedSize";
import { reserveMicros } from "@/lib/usage/pricing";
import { DEFAULT_LIMITS } from "@/lib/usage/quota";
import {
  ASSUMPTIONS, CLIP_KB, DAYS_PER_MONTH, DEVTOOLS, DOMAIN, EMAIL, ERRORS,
  HTML_KB, REQUESTS_PER_PAGE, SHARED_JS_KB, SPEECH_MARKET, SUPABASE,
  TUTOR_MODELS, VERCEL,
  assumed, computeFor, distinctClips, gbOf, listOf, overageUsd, round2, usdFromEur,
} from "./facts";
import type { Service, ServiceCost, Shape, Volume } from "./types";

/** What the app's own ledger would let every model call together spend in a month. */
export const MODEL_CAP_USD = (DEFAULT_LIMITS.dailyMicrosGlobal / 1e6) * DAYS_PER_MONTH;

/**
 * Which meters are over the plan's allowance, in the reader's words.
 *
 * The page can say a service costs money and, without this, cannot say which
 * part of it is the base fee and which part is use. It is also the most useful
 * thing on the page for somebody deciding what to switch off.
 */
function over(
  used: Readonly<Record<string, number>>,
  included: Readonly<Record<string, number>>,
  labels: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(used)
    .filter((k) => (used[k] ?? 0) > (included[k] ?? 0))
    .map((k) => labels[k] ?? k);
}

export const SERVICES: readonly Service[] = [
  {
    id: "hosting",
    name: "Vercel",
    who: "Vercel, in the same region as the database",
    does: "Runs the app: every page rendered, every action answered, the speech proxy and the tutor route.",
    whenItIsGone: "The pages a phone has already seen still open, and nothing new loads.",
    ref: VERCEL.ref,
    bill(v: Volume, shape: Shape): ServiceCost {
      const invocations = v.pageViews + v.reviews + v.clips + v.tutorCalls + v.graderCalls;
      const edgeRequests = v.pageViews * REQUESTS_PER_PAGE
        + v.reviews + v.clips + v.tutorCalls + v.graderCalls;
      const transferGb = gbOf(
        v.pageViews * HTML_KB
        + v.clips * CLIP_KB
        + shape.learners * SHARED_JS_KB * assumed("builds"),
      );
      const cpuHours = (invocations * assumed("cpu")) / 3_600_000;

      const used = { invocations, cpuHours, edgeRequests, transferGb };
      const tier = VERCEL.pro;
      const usd = tier.baseUsd + overageUsd(used, tier, {
        invocations: VERCEL.overage.perMillionInvocations / 1e6,
        cpuHours: VERCEL.overage.perCpuHour,
        edgeRequests: VERCEL.overage.perMillionEdgeRequests / 1e6,
        transferGb: VERCEL.overage.perTransferGb,
      });

      const past = over(used, tier.included, {
        invocations: "requests answered",
        cpuHours: "processor time",
        edgeRequests: "files served",
        transferGb: "data out",
      });

      return {
        kind: "charged",
        plan: tier.name,
        usd: round2(usd),
        why: past.length === 0
          ? `The ${tier.name} plan's own fee. Nothing here is over its allowance yet.`
          : `The ${tier.name} plan, plus use over its allowance on ${listOf(past)}.`,
        meters: [
          { label: "Requests answered", used: invocations, included: tier.included.invocations ?? 0, as: "count" },
          { label: "Files served", used: edgeRequests, included: tier.included.edgeRequests ?? 0, as: "count" },
          { label: "Data out", used: transferGb, included: tier.included.transferGb ?? 0, as: "gb" },
          { label: "Processor time", used: cpuHours, included: tier.included.cpuHours ?? 0, as: "hours" },
        ],
      };
    },
  },

  {
    id: "database",
    name: "Supabase",
    who: "Supabase, holding the database, the sign-ins and the cached speech",
    does: "Every deck, every review, the dictionary, who is signed in, and the speech files keyed by their content.",
    whenItIsGone: "Nothing works, and the landing page falls back to a dictionary of five words.",
    setBy: "DATABASE_URL",
    ref: SUPABASE.ref,
    bill(v: Volume, shape: Shape): ServiceCost {
      const egressGb = gbOf(v.pageViews * assumed("dbread") + v.clips * CLIP_KB);
      const storageGb = gbOf(distinctClips(v.clips * 12 * shape.years) * CLIP_KB);
      const used = { dbGb: v.databaseGb, egressGb, storageGb, mau: shape.learners };
      const tier = SUPABASE.pro;
      const compute = computeFor(v.databaseGb, v.peakConcurrent);

      /*
        Compute is charged against a credit rather than added to the base, so
        the smallest instance is already paid for by the plan and only the step
        above it shows up as money.
      */
      const computeUsd = Math.max(0, compute.usd - SUPABASE.computeCreditUsd);
      const usd = tier.baseUsd + computeUsd + overageUsd(used, tier, {
        dbGb: SUPABASE.overage.perDbGb,
        egressGb: SUPABASE.overage.perEgressGb,
        storageGb: SUPABASE.overage.perStorageGb,
        mau: SUPABASE.overage.perMau,
      });

      const past = over(used, tier.included, {
        dbGb: "the database",
        egressGb: "data out",
        storageGb: "stored speech",
        mau: "sign-ins",
      });

      return {
        kind: "charged",
        plan: `${tier.name}, ${compute.name}`,
        usd: round2(usd),
        why: computeUsd > 0
          ? `A ${compute.name} instance, which is what ${Math.round(v.peakConcurrent).toLocaleString("en-GB")} people at once and ${v.databaseGb.toFixed(1)} GB need.`
          : past.length === 0
            ? `The ${tier.name} plan's own fee, with the smallest instance inside its compute credit.`
            : `The ${tier.name} plan, plus use over its allowance on ${listOf(past)}.`,
        meters: [
          { label: "Database", used: v.databaseGb, included: tier.included.dbGb ?? 0, as: "gb" },
          { label: "Data out", used: egressGb, included: tier.included.egressGb ?? 0, as: "gb" },
          { label: "Speech stored", used: storageGb, included: tier.included.storageGb ?? 0, as: "gb" },
          { label: "People signing in", used: shape.learners, included: tier.included.mau ?? 0, as: "count" },
        ],
      };
    },
  },

  {
    id: "model",
    name: "The language model",
    who: "OpenRouter, Anthropic, OpenAI, Groq or Google, whichever has a key",
    does: "Anu, the note on a piece of writing, and reading a photographed page. Never a single Estonian form.",
    whenItIsGone: "Anu says she cannot reach anybody. Review, the dictionary and every drill are untouched.",
    setBy: "OPENROUTER_API_KEY",
    ref: {
      source: "https://openrouter.ai/models",
      checked: SPEECH_MARKET.ref.checked,
    },
    bill(v: Volume, shape: Shape): ServiceCost {
      if (shape.tutor === "off") {
        return {
          kind: "charged",
          plan: "No key set",
          usd: 0,
          why: "Nobody has set a key, so Anu is not here. Everything else in the app works.",
        };
      }

      /*
        Priced by the app's own ledger rather than by a rate typed in here.
        `reserveMicros` is what `authoriseCall` books a call at before it makes
        one, so the projection and the running app are the same arithmetic.
      */
      const model = shape.tutorModel;
      const perTutor = reserveMicros("TUTOR", model) / 1e6;
      const perGrader = reserveMicros("GRADER", model) / 1e6;
      const wanted = v.tutorCalls * perTutor + v.graderCalls * perGrader;
      const capped = wanted > MODEL_CAP_USD;
      const named = TUTOR_MODELS.find((m) => m.id === model)?.name ?? model;

      return {
        kind: "charged",
        plan: named,
        usd: round2(Math.min(wanted, MODEL_CAP_USD)),
        cappedByUs: capped,
        why: capped
          ? "The app's own daily cap is what is holding this down, not the traffic."
          : `A question and a writing note on ${named}, priced the way the ledger prices one before it makes the call.`,
        meters: [
          { label: "Questions asked", used: v.tutorCalls, included: 0, as: "count" },
          { label: "Writing looked at", used: v.graderCalls, included: 0, as: "count" },
        ],
      };
    },
  },

  {
    id: "speech",
    name: "Estonian speech",
    who: "TartuNLP, at the University of Tartu",
    does: "Reads a word or a sentence aloud in any of twelve voices. Every clip is cached and asked for once.",
    whenItIsGone: "Cards are silent, and the listening part of the mock exam says so rather than failing.",
    ref: SPEECH_MARKET.ref,
    bill(v: Volume, shape: Shape): ServiceCost {
      return {
        kind: "given",
        gives: shape.audio
          ? `${Math.round(v.spokenCharacters).toLocaleString("en-GB")} characters read aloud a month, in a real Estonian voice`
          : "Speech in twelve Estonian voices, switched off on this deployment",
        why: "A public research group at the University of Tartu, which asks for nothing and sends no invoice.",
        wouldCostUsd: shape.audio
          ? round2((v.spokenCharacters / 1e6) * SPEECH_MARKET.usdPerMillionCharacters)
          : 0,
      };
    },
  },

  {
    id: "dictionary",
    name: "Ekilex and Wiktionary",
    who: "The Institute of the Estonian Language, and the Wikimedia Foundation",
    does: "Every Estonian form and example sentence, and the English meaning of most of the dictionary.",
    whenItIsGone: "Live lookups stop. The seeded dictionary carries on, and a word it lacks is simply missing.",
    setBy: "EKILEX_API_KEY",
    ref: {
      source: "https://ekilex.ee",
      checked: SPEECH_MARKET.ref.checked,
    },
    bill(): ServiceCost {
      return {
        kind: "given",
        /*
          The seed's own count, for the reason the measured line in `facts.ts`
          reads it: this said 6,050 entries and 34,554 forms while the seed it
          describes held 6,102 and 38,577, and a page whose subject is what
          somebody gives this project should not understate the gift.
        */
        gives: `${SEED_SET_SIZE.words.toLocaleString("en-GB")} checked entries with `
          + `${SEED_SET_SIZE.forms.toLocaleString("en-GB")} forms, and the attested sentences `
          + "every exercise is built from",
        licence: "Ekilex under CC BY 4.0, Wiktionary under CC BY-SA 4.0",
        why: "Neither asks for anything, and neither has a price to quote: nothing else holds a checked Estonian case table with attested sentences, so there is nothing to compare it against.",
      };
    },
  },

  {
    id: "email",
    name: "Resend",
    who: "Resend, sending the mailed sign-in links",
    does: "Sends a sign-in link to anybody without a Google account, and the occasional reminder.",
    whenItIsGone: "Google sign-in still works. Everybody else is locked out.",
    ref: EMAIL.ref,
    bill(v: Volume): ServiceCost {
      const tier = EMAIL.pro;
      const over = Math.max(0, v.emails - (tier.included.emails ?? 0));
      const usd = tier.baseUsd + (over / 1000) * EMAIL.overage.perThousandEmails;
      return {
        kind: "charged",
        plan: tier.name,
        usd: round2(usd),
        why: over > 0
          ? `The ${tier.name} plan, plus ${Math.round(over).toLocaleString("en-GB")} emails over its allowance.`
          : `The ${tier.name} plan. The free tier sends a hundred a day from a shared address, which is for testing.`,
        meters: [
          { label: "Emails sent", used: v.emails, included: tier.included.emails ?? 0, as: "count" },
        ],
      };
    },
  },

  {
    id: "errors",
    name: "Error reporting",
    who: "Sentry, or whatever the deployment points its webhook at",
    does: "Catches anything that breaks, redacted, with a user id and never an email address.",
    whenItIsGone: "Errors are in the server log and nowhere else, which is where they were before.",
    setBy: "ERROR_WEBHOOK_URL",
    ref: ERRORS.ref,
    bill(): ServiceCost {
      return {
        kind: "charged",
        plan: ERRORS.team.name,
        usd: ERRORS.team.baseUsd,
        why: "A flat plan. It bills by volume of errors rather than by learners, and a well-behaved month is nowhere near the allowance.",
      };
    },
  },

  {
    id: "devtools",
    name: "Claude Max",
    who: "Anthropic, as the tooling that writes and maintains this",
    does: "Writes the code, the tests and the invariants, and keeps them honest against each other.",
    whenItIsGone: "The app carries on running and stops being worked on.",
    ref: DEVTOOLS.ref,
    bill(): ServiceCost {
      return {
        kind: "charged",
        plan: DEVTOOLS.plan,
        usd: round2(usdFromEur(DEVTOOLS.eurPerMonth)),
        why: "The only line here that is not runtime. It does not move with the number of learners, so it is most of the bill at a hundred and a rounding error at a hundred thousand.",
      };
    },
  },

  {
    id: "domain",
    name: "The domain",
    who: "A registrar, under the Estonian Internet Foundation",
    does: "The address people type. The cheapest line here by a long way.",
    whenItIsGone: "The app is still there under whatever address the host gave it.",
    ref: DOMAIN.ref,
    bill(): ServiceCost {
      return {
        kind: "charged",
        plan: "One a year",
        usd: round2(usdFromEur(DOMAIN.eurPerYear) / 12),
        why: DOMAIN.note,
      };
    },
  },

  {
    id: "news",
    name: "An Estonian news feed",
    who: "Whichever public feed the deployment points at",
    does: "Suggests words off today's front page, and prints a few headlines the dictionary can open.",
    whenItIsGone: "The suggestion row draws from the season or at random instead, and says which.",
    setBy: "NEWS_FEED_URL",
    ref: VERCEL.ref,
    bill(): ServiceCost {
      return {
        kind: "partOf",
        line: "hosting",
        why: "One request an hour from a function we already pay for, cached and shared by everybody.",
      };
    },
  },

  {
    id: "device",
    name: "The learner's own phone",
    who: "Them",
    does: "Keeps 400 clips, 60 pages and every grade that could not be sent, so review works on a train.",
    whenItIsGone: "There is no app. This is the one piece of the infrastructure nobody here can pay for.",
    ref: {
      source: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API",
      checked: SPEECH_MARKET.ref.checked,
    },
    bill(): ServiceCost {
      return {
        kind: "notOurs",
        who: "the learner",
        why: "Their hardware, their battery and their data. Every clip and page it keeps is one this deployment does not serve again.",
      };
    },
  },
];

/** Every assumption a service reads, for the check that the page prints them all. */
export const ASSUMPTIONS_USED = ASSUMPTIONS;
