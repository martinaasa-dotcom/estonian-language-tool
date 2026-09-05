import { timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  BELOW_BAND,
  COUNT_ROUNDING,
  MAX_LEARNER_SHARE,
  MIN_LEARNERS,
  MIN_REVIEWS,
  bandLearners,
  buildSection,
  roundCount,
  type Contribution,
  type Section,
} from "@/lib/research/corpus";
import { toCsv } from "@/lib/research/csv";
import { CAVEATS, CORRECT_FROM_RATING, MATURE_STATE, SECTIONS } from "@/lib/research/sections";
import { isConversation, OUTCOMES } from "@/lib/collections/errands";
import { SETTING_KEYS } from "@/lib/settings/store";

/**
 * Where a lot of people learning Estonian go wrong, as a file somebody can be
 * sent.
 *
 * The whole of what makes this publishable is in `lib/research/corpus.ts`, and
 * the whole of what makes it about Estonian is in `lib/research/sections.ts`.
 * What is here is the database work: nine aggregations, the context a reader
 * needs to weigh them, and two ways of writing the answer out.
 *
 * A route rather than a page, exactly as `/api/metrics` is, and for the same
 * three reasons. None of it can be pulled into a client bundle. It is behind a
 * token, so a deployment is not publishing its learners' difficulty profile to
 * anybody who guesses a URL. And with no token configured it does not exist at
 * all, a 404 rather than a 401, because an unconfigured deployment should not
 * advertise the endpoint.
 *
 * Its own token rather than `METRICS_TOKEN`. The two endpoints have different
 * readers: the metrics one is the operator's own monitoring, polled on a
 * schedule, and this one is pulled by hand perhaps twice a year to send to
 * somebody. Sharing a secret between them would mean anything holding the
 * monitoring credential could also pull the whole corpus.
 *
 * GROUPED IN POSTGRES, NEVER IN NODE. `Review` is the largest table here and
 * the app's own rule is that anything deployment-wide counts in the database.
 * Each query returns one row per (cell, person) rather than per review, which
 * is proportional to the number of distinct combinations rather than to the
 * size of the log, and is also the finest thing the dominance rule can be
 * answered from. No individual review is ever materialized in this process.
 */
export const dynamic = "force-dynamic";

/*
  Nine aggregations over the biggest table in the schema, run by hand and
  rarely. It is not a page and nobody is waiting on it behind a spinner, so the
  budget is the platform's ceiling rather than a page's.
*/
export const maxDuration = 120;

function authorised(request: NextRequest): boolean {
  const expected = process.env.RESEARCH_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!offered) return false;

  // Same length before comparing, because timingSafeEqual throws on a mismatch
  // and the throw itself would leak the length.
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The column aliases a grouped row comes back under.
 *
 * Fixed constants rather than built from a loop index, so that nothing
 * resembling an identifier is ever assembled from a value at runtime. The key
 * expressions below are the same: every one of them is written out in this
 * file, and no part of any query is derived from the request.
 */
const ALIASES = [Prisma.raw('"k1"'), Prisma.raw('"k2"'), Prisma.raw('"k3"')] as const;

/** A review that asked for a case, which is the three card shapes that set one. */
const HAS_CASE = Prisma.sql`r."targetCase" IS NOT NULL`;

/** The dictionary entry behind the answer. Inner, so a review with none drops out. */
const WITH_LEXEME = Prisma.sql`JOIN "Lexeme" l ON l.id = r."lexemeId"`;

/*
  The card the answer was given on.

  `Review` deliberately has no foreign key to `Card`, so that deleting a card or
  restoring a backup cannot cascade the history away, and the consequence is
  that a review can outlive the card it was about. This join is therefore
  allowed to fail, and what to do about the ones that fail took a measurement to
  settle.

  Grouping them as an `unknown` card shape was tried first, on the argument this
  project makes everywhere else, that a source which will not answer is written
  down as a miss rather than dropped. It is the wrong argument here twice over.
  A deleted card is not a shape of question, so a row reading "learners answer
  78% of unknown correctly" is not a finding about Estonian, and the honest home
  for it is the coverage figure the corpus block already carries. And the bucket
  is small by nature, so it fails the threshold rule in nearly every group it
  appears in, which fires complementary suppression on that group and takes the
  real category down with it: measured on a fixture of 55,000 answers, the
  case-by-shape table came back with two rows out of sixteen, none of them for
  a reason a reader could have guessed.

  So it is an inner join, the two tables that use it say so, and how much of the
  corpus it leaves out is reported as `cardsResolvedPct` rather than as a row.
*/
const WITH_CARD = Prisma.sql`JOIN "Card" c ON c.id = r."cardId"`;

const KEY = {
  case: Prisma.sql`r."targetCase"`,
  task: Prisma.sql`c."cardType"`,
  cefr: Prisma.sql`COALESCE(l."cefr", 'unknown')`,
  gradation: Prisma.sql`l."gradation"`,
  pattern: Prisma.sql`l."gradationNote"`,
  pos: Prisma.sql`l."pos"`,
  lemma: Prisma.sql`l."lemma"`,
} as const;

/** What each section selects, joins and filters on. Keys are in dimension order. */
const QUERIES: Record<string, { keys: Prisma.Sql[]; joins: Prisma.Sql[]; where: Prisma.Sql[] }> = {
  case: { keys: [KEY.case], joins: [], where: [HAS_CASE] },
  case_by_task: { keys: [KEY.case, KEY.task], joins: [WITH_CARD], where: [HAS_CASE] },
  case_by_level: { keys: [KEY.case, KEY.cefr], joins: [WITH_LEXEME], where: [HAS_CASE] },
  case_by_gradation: { keys: [KEY.case, KEY.gradation], joins: [WITH_LEXEME], where: [HAS_CASE] },
  gradation_pattern: {
    keys: [KEY.pattern],
    joins: [WITH_LEXEME],
    where: [Prisma.sql`l."gradation" <> 'NONE'`, Prisma.sql`l."gradationNote" IS NOT NULL`],
  },
  task: { keys: [KEY.task], joins: [WITH_CARD], where: [] },
  level: { keys: [KEY.cefr], joins: [WITH_LEXEME], where: [] },
  pos: { keys: [KEY.pos], joins: [WITH_LEXEME], where: [] },
  word: { keys: [KEY.lemma, KEY.pos, KEY.cefr], joins: [WITH_LEXEME], where: [] },
};

interface GroupedRow {
  k1: string | null;
  k2: string | null;
  k3: string | null;
  learner: string;
  reviews: number;
  correct: number;
  matureReviews: number;
  matureCorrect: number;
}

/**
 * One section's tallies, one row per cell per person.
 *
 * `excluded` is the opt-out list. It is spliced in as a NOT IN rather than
 * filtered afterwards, because filtering afterwards means a person who asked to
 * be left out was still read into this process, and the point of the setting is
 * that they were not.
 */
/**
 * The one section not drawn from Review: a learner's own report of a
 * conversation outside the app, under the same gate as everything else.
 * Reads Encounter rather than Review, honors the same opt-out, and hands
 * `buildSection` the same shape, so the thresholds and the rounding apply.
 *
 * GROUPED BY THE MONTH OF THE REPORT, AND NEVER BY A UNIT. It used to be
 * grouped by the unit an errand drew its words from, on the argument that a
 * table of conversations ought to say what they were about. Today asks
 * whether any Estonian was spoken yesterday and files the answer under no
 * errand, since a conversation with a neighbor is not this app's to put a
 * unit's name on, so that table was empty by construction and always would
 * be. What a pilot is measured on (`docs/22-real-life.md` §6) is the number
 * of conversations reported and the share in which the other person switched
 * to English, at the start of a term against the end, and the month is the
 * dimension that reads. "correct" is understood; a day answered "not
 * yesterday" is not a conversation and is not a row (`isConversation`).
 *
 * The month is read in UTC rather than in each learner's zone, because a
 * deployment-wide bucket has no one zone to read, and a report made in the
 * first hours of the first of the month landing in the month before is a
 * fact about the bucket's edge rather than about anybody.
 */
async function tallyEncounters(excluded: readonly string[]): Promise<Contribution[]> {
  const not = excluded.length > 0 ? Prisma.sql`AND e."ownerId" NOT IN (${Prisma.join([...excluded])})` : Prisma.empty;
  const conversations = Prisma.join(OUTCOMES.filter(isConversation));
  const rows = await prisma.$queryRaw<{ month: string; learner: string; reviews: number; correct: number }[]>`
    SELECT TO_CHAR(e."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS "month",
           e."ownerId" AS "learner",
           COUNT(*)::int AS "reviews",
           COUNT(*) FILTER (WHERE e."outcome" = 'UNDERSTOOD')::int AS "correct"
    FROM "Encounter" e
    WHERE e."outcome" IN (${conversations})
    ${not}
    GROUP BY 1, e."ownerId"
  `;
  return rows.map((row) => ({
    keys: [row.month], learner: row.learner, reviews: row.reviews, correct: row.correct, matureReviews: 0, matureCorrect: 0,
  }));
}

async function tally(
  section: string,
  excluded: readonly string[],
): Promise<Contribution[]> {
  const spec = QUERIES[section];
  if (!spec) return [];

  const selected = Prisma.join(
    spec.keys.map((key, i) => Prisma.sql`${key} AS ${ALIASES[i]!}`),
    ", ",
  );
  const grouped = Prisma.join(spec.keys, ", ");
  const joins = spec.joins.length > 0 ? Prisma.join(spec.joins, " ") : Prisma.empty;

  const conditions = [...spec.where];
  if (excluded.length > 0) {
    conditions.push(Prisma.sql`r."ownerId" NOT IN (${Prisma.join([...excluded])})`);
  }
  const where =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<GroupedRow[]>`
    SELECT ${selected},
           r."ownerId" AS "learner",
           COUNT(*)::int AS "reviews",
           COUNT(*) FILTER (WHERE r."rating" >= ${CORRECT_FROM_RATING})::int AS "correct",
           COUNT(*) FILTER (WHERE r."stateBefore" = ${MATURE_STATE})::int AS "matureReviews",
           COUNT(*) FILTER (
             WHERE r."stateBefore" = ${MATURE_STATE} AND r."rating" >= ${CORRECT_FROM_RATING}
           )::int AS "matureCorrect"
    FROM "Review" r
    ${joins}
    ${where}
    GROUP BY ${grouped}, r."ownerId"
  `;

  const out: Contribution[] = [];
  for (const row of rows) {
    const keys = [row.k1, row.k2, row.k3].slice(0, spec.keys.length);
    // A grouping key that came back null is a row the filters should have
    // dropped. Counting it under an empty string would invent a category.
    if (keys.some((k) => k === null)) continue;
    out.push({
      keys: keys as string[],
      learner: row.learner,
      reviews: row.reviews,
      correct: row.correct,
      matureReviews: row.matureReviews,
      matureCorrect: row.matureCorrect,
    });
  }
  return out;
}

interface Corpus {
  reviews: number;
  learners: string;
  firstReview: string | null;
  lastReview: string | null;
  optedOut: string;
  answersTypedByDefault: string;
  answersSelfGraded: string;
  cardsResolvedPct: number | null;
  dictionaryWords: number;
}

/**
 * The size and shape of what the tables were drawn from.
 *
 * Rounded and banded like everything else, because a corpus total is the figure
 * a reader would difference two vintages of this file against. It is here so
 * that no number below has to be taken on trust about how much is behind it,
 * and so that a deployment too small to publish anything says so in its first
 * three lines rather than by handing over an empty file.
 */
async function corpusContext(excluded: readonly string[]): Promise<Corpus> {
  const not = excluded.length > 0 ? Prisma.sql`WHERE r."ownerId" NOT IN (${Prisma.join([...excluded])})` : Prisma.empty;

  /*
    One scan for all five figures, and `COUNT(DISTINCT)` rather than Prisma's
    `distinct`. That option deduplicates in the client, which means the query
    it emits has no DISTINCT and no LIMIT in it: counting the learners that way
    would read every row of the largest table in the schema into this process,
    in the one route whose own header promises it never does that. The same
    trap CLAUDE.md records about a `take` sitting beside a `distinct`.

    `COUNT(c.id)` against `COUNT(*)` over a LEFT JOIN is how much of the corpus
    can still be traced to the card it was answered on, which is what the two
    tables built on an inner join to `Card` are missing.
  */
  const [totals, selfGraded, words] = await Promise.all([
    prisma.$queryRaw<
      { reviews: bigint; learners: number; resolved: bigint; first: Date | null; last: Date | null }[]
    >`
      SELECT COUNT(*)::bigint AS "reviews",
             COUNT(DISTINCT r."ownerId")::int AS "learners",
             COUNT(c.id)::bigint AS "resolved",
             MIN(r."reviewedAt") AS "first",
             MAX(r."reviewedAt") AS "last"
      FROM "Review" r
      LEFT JOIN "Card" c ON c.id = r."cardId"
      ${not}
    `,
    prisma.setting.count({
      where: {
        key: SETTING_KEYS.reviewMode,
        value: "flip",
        ...(excluded.length > 0 ? { ownerId: { notIn: [...excluded] } } : {}),
      },
    }),
    prisma.lexeme.count(),
  ]);

  const row = totals[0];
  const reviews = Number(row?.reviews ?? 0);
  const learners = row?.learners ?? 0;
  const day = (at: Date | null | undefined) => (at ? at.toISOString().slice(0, 10) : null);

  return {
    reviews: roundCount(reviews),
    learners: bandLearners(learners),
    firstReview: day(row?.first),
    lastReview: day(row?.last),
    optedOut: bandLearners(excluded.length),
    // The complement rather than a second query: everybody who has not asked
    // for the other one has the default, which is typing the answer.
    answersTypedByDefault: bandLearners(Math.max(0, learners - selfGraded)),
    answersSelfGraded: bandLearners(selfGraded),
    cardsResolvedPct: reviews > 0 ? Math.round((Number(row?.resolved ?? 0) / reviews) * 100) : null,
    dictionaryWords: words,
  };
}

/** What every reader is told before any number, in both output formats. */
function method(): Record<string, unknown> {
  return {
    what:
      "Accuracy on Estonian exercises, aggregated across everybody using this installation " +
      "of Kodukeel. Derived from the app's own review log, which is kept to schedule " +
      "revision. Nothing was collected to produce this and no new question was put to " +
      "anybody.",
    disclosureControl: {
      summary:
        `Every published figure rests on at least ${MIN_LEARNERS} different people and at ` +
        `least ${MIN_REVIEWS} answers, and no one person supplied more than ` +
        `${Math.round(MAX_LEARNER_SHARE * 100)}% of any of them. Anything below that is ` +
        "absent, not zero.",
      minimumLearners: MIN_LEARNERS,
      minimumReviews: MIN_REVIEWS,
      maximumSingleLearnerShare: MAX_LEARNER_SHARE,
      countsRoundedTo: COUNT_ROUNDING,
      learnerCounts:
        "Reported as a band rather than a number, so that two vintages of this file cannot " +
        "be differenced to recover what happened in between.",
      complementarySuppression:
        "A group of cells that withheld exactly one of them withholds a second, because a " +
        "single gap in a group whose total is reachable is not a gap. No table publishes a " +
        "total of its own for the same reason.",
      optOut:
        "Anyone using the app can exclude their own reviews from this in Settings, and " +
        "those reviews are left out of the queries rather than filtered from the results.",
    },
    accuracy:
      "The share of answers graded Good or Easy. The app's four grades are Again, Hard, " +
      "Good and Easy.",
    caveats: CAVEATS,
    reuse:
      "These are counts, not personal data. Attribute them to the Kodukeel installation " +
      "they came from and to the date they were generated, since a later file will not " +
      "reproduce them. The Estonian words they are grouped by come from Ekilex, at the " +
      "Institute of the Estonian Language, under CC BY 4.0.",
  };
}

/** The preamble the CSV carries above its header row. */
function preamble(corpus: Corpus, generatedAt: string, sections: readonly Section[]): string[] {
  const lines: string[] = [
    "Kodukeel: where learners of Estonian go wrong, aggregated.",
    `Generated ${generatedAt}.`,
    "",
    `Answers: about ${corpus.reviews.toLocaleString("en-GB")}. ` +
      `People: ${corpus.learners}. ` +
      `Covering ${corpus.firstReview ?? "no reviews"} to ${corpus.lastReview ?? "no reviews"}.`,
    "",
    "Every row rests on at least " +
      `${MIN_LEARNERS} different people and at least ${MIN_REVIEWS} answers, with no one ` +
      `person supplying more than ${Math.round(MAX_LEARNER_SHARE * 100)}% of a row. Rows ` +
      "below that are absent rather than zero, so a missing category means too little data " +
      "and never no errors.",
    `Answer counts are rounded to the nearest ${COUNT_ROUNDING}. Learner counts are bands.`,
    "",
    "accuracy_pct is the share of answers graded Good or Easy, out of Again, Hard, Good " +
      "and Easy. mature_reviews and mature_accuracy_pct count only answers to cards the " +
      "scheduler had stopped treating as new, which is the narrower and better question. " +
      "An empty mature column means that subset did not clear the same threshold.",
    "",
  ];

  for (const caveat of CAVEATS) lines.push(`Caveat: ${caveat}`);
  lines.push("");

  for (const section of sections) {
    lines.push(
      `${section.id}: ${section.title}. ${section.note}` +
        (section.suppressed > 0
          ? ` ${section.suppressed} ${section.suppressed === 1 ? "category was" : "categories were"} withheld by the rules above.`
          : ""),
    );
  }
  return lines;
}

export async function GET(request: NextRequest) {
  if (!process.env.RESEARCH_TOKEN || !authorised(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  /*
    Who asked to be left out. Read first and threaded into every query below,
    so that "excluded" means their rows were never read rather than that their
    contribution was subtracted afterwards.
  */
  const optedOut = await prisma.setting.findMany({
    where: { key: SETTING_KEYS.researchOptOut, value: "1" },
    select: { ownerId: true },
  });
  const excluded = optedOut.map((row) => row.ownerId);

  const generatedAt = new Date().toISOString();
  const corpus = await corpusContext(excluded);

  const sections: Section[] = [];
  for (const spec of SECTIONS) {
    // In series rather than at once. Each is a grouped scan of the largest
    // table in the schema, and nine of those in parallel is nine times the
    // working memory for no wall-clock gain on a database this shape.
    sections.push(buildSection(spec, spec.id === "encounters" ? await tallyEncounters(excluded) : await tally(spec.id, excluded)));
  }

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(sections, { preamble: preamble(corpus, generatedAt, sections) }), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="kodukeel-learner-errors-${generatedAt.slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      generatedAt,
      corpus: {
        ...corpus,
        note:
          `Answers are rounded to the nearest ${COUNT_ROUNDING} and people are counted in ` +
          `bands. "${BELOW_BAND}" is as precise as a small figure gets.`,
      },
      method: method(),
      sections,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
