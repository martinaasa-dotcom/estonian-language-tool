import { prisma } from "@/lib/db";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { gradedLemmas, lemmaCountsByLevel } from "@/lib/dict/facts";
import { caseByKey } from "@/lib/estonian/cases";
import { caseAccuracy } from "@/lib/stats/history";
import { buildPaper, type PoolWord, type Paper } from "@/lib/exam/paper";
import { rng, seedFrom } from "@/lib/random/seeded";
import { shuffle } from "@/lib/random/shuffle";
import type { ExamResult } from "@/lib/exam/score";
import type { ExamLevel } from "@/lib/exam/spec";
import type { PastAttempt, ReadinessSignals, SkillEvidence } from "@/lib/exam/readiness";
import { SKILLS, type SkillKey } from "@/lib/exam/types";
import { latestFor } from "./assessment";
import { deckSnapshot, type DeckSnapshot } from "./summary";
import { caseReviewsFor } from "@/lib/progress/cases";

/**
 * The database half of the mock examination.
 *
 * `lib/exam/` is pure and stays that way: it assembles a paper out of material
 * it is handed, marks it, and works out how likely somebody is to pass. This is
 * the file that goes and gets the material, and it is the only one that knows
 * Prisma exists.
 */

const RANK: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

/** How many dictionary entries one paper is drawn from. */
const POOL_SIZE = 500;

/**
 * The dictionary material a paper at this level can be built out of.
 *
 * Words at or below the level. Entries with no CEFR tag are admitted from B1
 * upwards, which is where the untagged part of the dictionary mostly sits.
 *
 * THE POOL IS DRAWN WITH THE PAPER'S OWN SEED, WHICH IS WHAT MAKES A PAPER
 * REBUILDABLE.
 *
 * `submitExam` builds the paper again on the server to mark it, hours after it
 * was sat, and `buildPaper` is deterministic in (level, seed, pool). Two of
 * those three were promised and the third was not: this query used to take the
 * first five hundred rows of an order beginning `fetchedAt desc`, and
 * `fetchedAt` is rewritten by `runEnrich` and `runLookup` on *every* lookup of
 * a word, including one that changes nothing about it. So any learner opening
 * the dictionary during somebody's ninety-minute paper reordered the pool, the
 * cut at five hundred took a different set, and the item ids are positional:
 * the answers were marked against questions nobody had been asked. The comment
 * that used to sit here named that as the thing this file exists to prevent.
 *
 * It was also picking badly. Every entry the seed writes carries an
 * `ekilexWordId` and nearly every one carries a usage, so `fetchedAt` was the
 * only column separating them, and on a deployment where nobody has looked
 * anything up every value of it is null. The whole order then fell through to
 * `lemma asc`, so the pool at B1 was the first five hundred words of the
 * dictionary alphabetically: the `aberratsioon` fault the suggestion row was
 * fixed for, in the one place that decides what somebody is examined on.
 *
 * So the eligible set is read as ids in an order nothing can move, the seed
 * shuffles it, and the first `POOL_SIZE` are the pool. The paper is then a
 * function of (level, seed) and of which words the dictionary holds at all,
 * which changes when a word is added and not when one is read. It is also a
 * fair draw across the level rather than the head of the alphabet.
 *
 * The preference for entries carrying a sentence is not expressed here and was
 * not expressed by the ordering it replaces either: the sentence is what three
 * tasks need, and `buildPaper` already refuses a task it cannot fill and
 * reports the shortfall. Measured on the shipped dictionary, 95% of eligible
 * entries carry one, so a draw of five hundred brings about four hundred and
 * seventy-five of them.
 *
 * One deploy's worth of papers in flight are marked against a pool drawn the
 * new way, which is the cost of changing this at all and is smaller than the
 * fault: today a paper is mis-marked whenever anybody looks a word up.
 */
export async function examPool(ownerId: string, level: ExamLevel, seed: string): Promise<PoolWord[]> {
  const ceiling = RANK[level] ?? 2;
  const levels = Object.entries(RANK)
    .filter(([, rank]) => rank <= ceiling)
    .map(([name]) => name);

  const eligible = ceiling >= RANK.B1!
    ? { OR: [{ cefr: { in: levels } }, { cefr: null }] }
    : { cefr: { in: levels } };

  /*
    Ids only, on the primary key, which is the one ordering in this table that
    nothing can move: `@@unique` is on `(lemma, pos)` so a lemma can hold two
    entries, and every other column here is written by a lookup. One narrow
    read of a few thousand ids, twice per sitting.
  */
  const ids = (await prisma.lexeme.findMany({
    where: eligible,
    select: { id: true },
    orderBy: { id: "asc" },
  })).map((row) => row.id);

  /*
    The app's one shuffle, handed the paper's own seed. A seed of its own
    rather than the paper's exact string, so the draw of the pool and the draw
    of the questions inside it are not the same walk; `lib/exam/paper.ts` is
    the one module that keeps a private shuffle, and this is not it.
  */
  const drawn = shuffle(ids, rng(seedFrom(`pool:${level}:${seed}`))).slice(0, POOL_SIZE);

  const rows = await prisma.lexeme.findMany({
    where: { id: { in: drawn } },
    include: { forms: { orderBy: { orderIndex: "asc" } } },
  });
  // `IN (…)` comes back in whatever order the plan likes, so the draw is put
  // back by hand: the pool's order is part of what the seed decided.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const lexemes = drawn.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => !!row);

  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { in: lexemes.map((l) => l.id) } },
    select: { id: true, lexemeId: true },
    // Ordered for the same reason the pool above is. A word usually has two
    // cards in a deck, recognition and production, and answering in the exam
    // grades one of them (ADR-016). Which one was whichever Postgres returned
    // last, so the paper built to mark a sitting could name a different card
    // from the one the sitting was built with. The first by id, every time.
    orderBy: { id: "asc" },
  });
  const cardFor = new Map<string, string>();
  for (const card of cards) {
    if (card.lexemeId && !cardFor.has(card.lexemeId)) cardFor.set(card.lexemeId, card.id);
  }

  return lexemes.map((lexeme) => ({
    lexemeId: lexeme.id,
    lemma: lexeme.lemma,
    translation: lexeme.translation,
    pos: lexeme.pos,
    cefr: lexeme.cefr,
    semanticTypes: lexeme.semanticTypes,
    forms: lexeme.forms.map((f) => ({
      formType: f.formType,
      value: f.value,
      morphCode: f.morphCode,
      morphName: f.morphName,
    })),
    examples: usableExamples(parseExamples(lexeme.examples)).map((e) => ({ et: e.et, en: e.en })),
    government: lexeme.government,
    cardId: cardFor.get(lexeme.id) ?? null,
  }));
}

/** One paper, built for this learner. Deterministic in the seed. */
export async function paperFor(
  ownerId: string,
  level: ExamLevel,
  seed: string,
): Promise<Paper> {
  return buildPaper(level, await examPool(ownerId, level, seed), seed);
}

// ── The signals behind the confidence figure ─────────────────────────────────

/** Cards past the learning phase, whose recall is worth reading anything into. */
export const MATURE_STATE = 2;

/** Past papers one learner's readiness model looks at, however many they have sat. */
export const ATTEMPT_WINDOW = 12;

/**
 * Everything `lib/exam/readiness` needs, read off the review log and the deck.
 *
 * Nothing here is a stored counter. Every figure is recomputed from the
 * append-only log on each request, which is the rule (ADR-014) and is also what
 * makes the number trustworthy: there is no path by which a confidence
 * percentage can drift away from the reviews that justify it.
 */
/**
 * `known` is a fact about the deck, not about the hour, so a caller that has
 * already loaded one may hand it over. Today does: it needs a snapshot for the
 * due counts anyway, and asking for a second one on the render path of the page
 * somebody opens every morning is a query bought and thrown away.
 */
export async function readinessSignals(
  ownerId: string,
  known?: DeckSnapshot,
): Promise<ReadinessSignals> {
  const [snapshot, byLevel, knownRows, matureReviews, caseReviews, cardTypeRows, attempts, placed] =
    await Promise.all([
      known ?? deckSnapshot(ownerId),
      /*
        Both of these are facts about the shared dictionary rather than about
        the learner waiting for the page, and the second is every row in it.
        They are read once per instance per minute now instead of once per
        render: see lib/dict/facts.ts for what that trades.
      */
      lemmaCountsByLevel(),
      gradedLemmas(),
      /*
        The most recent twenty thousand, not an arbitrary twenty thousand.

        The cap is a bound on the work, and until it was ordered it was also a
        bound on the meaning: past it, which reviews the confidence figure was
        built from came out of the plan, so the number could move between two
        page loads with no new reviews behind it. This file's own header says
        there is no path by which a confidence percentage can drift away from
        the reviews that justify it, and that was the path.

        Recent rather than merely stable, because readiness is a claim about
        what somebody can do now and a year-old rating is weaker evidence for
        it. Under the cap nothing changes at all: the same rows, and the
        tallies below do not depend on their order. `(ownerId, reviewedAt)` is
        already indexed, which is what makes the ordering free.
      */
      prisma.review.findMany({
        where: { ownerId, stateBefore: { gte: MATURE_STATE } },
        select: { rating: true },
        orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
        take: 20_000,
      }),
      /*
        THE SHARED QUERY, BECAUSE THIS WAS THE FOURTH ANSWER.

        `lib/progress/cases.ts` exists because "your weakest cases" was drawn
        from three different reads behind one calculation, so a learner who got
        the partitive wrong three hundred times last year and right three
        hundred times this month read 100% on one screen and 50% on another on
        the same day. This was all-time where the others are a half-year, and
        the hub prints the same case, by name and by percentage, in the gap
        list beside the readiness figure. The invariant is scoped to `app/`, to
        excuse the class roster rolling a whole class up in one query, so it
        could not see a fourth reader here.
      */
      caseReviewsFor(ownerId),
      prisma.card.findMany({
        where: { ownerId },
        select: { id: true, cardType: true },
      }),
      recentAttempts(ownerId),
      latestFor(ownerId),
    ]);

  const vocabulary = emptyVocabulary();
  for (const [cefr, count] of byLevel) {
    if (!(cefr in vocabulary)) continue;
    vocabulary[cefr as ExamLevel].available = count;
  }
  for (const row of knownRows) {
    if (!row.cefr || !(row.cefr in vocabulary)) continue;
    if (snapshot.knownLemmas.has(row.lemma)) vocabulary[row.cefr as ExamLevel].known += 1;
  }

  const recalled = matureReviews.filter((r: { rating: number }) => r.rating >= 3).length;
  const accuracy = {
    pct: matureReviews.length === 0 ? 0 : Math.round((recalled / matureReviews.length) * 100),
    reviews: matureReviews.length,
  };

  const cases = caseAccuracy(caseReviews).map((row) => ({
    caseKey: row.grammCase,
    caseEn: caseByKey(row.grammCase)?.en ?? row.grammCase,
    caseEt: caseByKey(row.grammCase)?.et ?? row.grammCase,
    pct: row.accuracy,
    reviews: row.total,
  }));

  return {
    vocabulary,
    accuracy,
    cases,
    skills: await skillEvidence(ownerId, cardTypeRows, attempts),
    attempts,
    /*
      The placement check (ADR-020), which is the only thing in this app that
      measures listening and speaking apart from everything else: a `Review` row
      carries no note of which mode wrote it, so a dictation and a flip of the
      same card are indistinguishable in the log. Before it existed the exam hub
      could only say it had nothing on two of the four parts.
    */
    placement: placed
      ? {
          at: placed.takenAt.toISOString(),
          skills: {
            reading: placed.reading,
            listening: placed.listening,
            writing: placed.writing,
            // The speaking figure the check stores is the learner's own rating,
            // never a level of ours (ADR-018), so it is not read as one here.
            speaking: null,
          },
          answered: placed.answered,
        }
      : null,
    totalReviews: await prisma.review.count({ where: { ownerId } }),
  };
}

function emptyVocabulary(): ReadinessSignals["vocabulary"] {
  return {
    A1: { known: 0, available: 0 }, A2: { known: 0, available: 0 },
    B1: { known: 0, available: 0 }, B2: { known: 0, available: 0 },
    C1: { known: 0, available: 0 },
  };
}

/**
 * What the log can honestly say about each of the four skills.
 *
 * Two of them it can say something about. A recognition card is Estonian read
 * and understood, which is reading; a production, case or government card is
 * Estonian produced, which is what the written parts are marked for.
 *
 * TWO OF THEM IT CANNOT, AND THAT IS NOT A GAP TO PAPER OVER. A review row
 * carries no note of which mode wrote it, so a dictation and a flip of the same
 * card are the same row. Adding a mode column to `Review` to fix that would be
 * adding a field to the one append-only table in the schema for a reporting
 * convenience, which is a bad trade. So listening and speaking rest on the one
 * source that does separate them: the parts of the mock papers already sat. Until
 * a paper has been sat they read as no evidence, and the advice says exactly
 * that rather than claiming the learner has never practiced.
 */
async function skillEvidence(
  ownerId: string,
  cards: { id: string; cardType: string }[],
  attempts: PastAttempt[],
): Promise<Record<SkillKey, SkillEvidence>> {
  const { reading, writing } = skillCardSets(cards);

  // The most recent twenty thousand, for the reason given where the other two
  // caps are ordered: past the cap an unordered slice makes the per-skill
  // percentages move on their own.
  const reviews = await prisma.review.findMany({
    where: { ownerId, cardId: { in: [...reading, ...writing] } },
    select: { cardId: true, rating: true },
    orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
    take: 20_000,
  });

  return skillEvidenceFrom(cards, reviews, attempts);
}

/**
 * Which cards stand in for which skill.
 *
 * One reading of it, because the query above selects reviews by these sets and
 * the tally below counts them by the same sets. Two copies would mean a card
 * type added to one and not the other, and the symptom would be a percentage
 * that is quietly computed over the wrong denominator.
 */
export function skillCardSets(cards: { id: string; cardType: string }[]): {
  reading: Set<string>;
  writing: Set<string>;
} {
  return {
    reading: new Set(cards.filter((c) => c.cardType === "RECOGNITION").map((c) => c.id)),
    writing: new Set(
      cards.filter((c) => ["PRODUCTION", "CASE_FORM", "GOVERNMENT", "GRADATION"].includes(c.cardType))
        .map((c) => c.id),
    ),
  };
}

/**
 * The same tally, over reviews somebody else has already fetched.
 *
 * Split out for the cohort roster, which reads a whole group's reviews in one
 * query and cannot afford this function's own (lib/classroom/roster.ts). Pure,
 * so the two callers cannot drift into two answers about what a skill is worth:
 * a colleague's screen and the learner's own hub disagreeing about whether
 * their writing is at 60 percent would be worse than either number alone.
 */
export function skillEvidenceFrom(
  cards: { id: string; cardType: string }[],
  reviews: { cardId: string; rating: number }[],
  attempts: PastAttempt[],
): Record<SkillKey, SkillEvidence> {
  const { reading: readingCards, writing: writingCards } = skillCardSets(cards);

  const tally = (ids: Set<string>): SkillEvidence => {
    const rows = reviews.filter((r) => ids.has(r.cardId));
    const good = rows.filter((r) => r.rating >= 3).length;
    return { attempts: rows.length, pct: rows.length === 0 ? 0 : Math.round((good / rows.length) * 100) };
  };

  const out = {
    reading: tally(readingCards),
    writing: tally(writingCards),
    listening: { attempts: 0, pct: 0 },
    speaking: { attempts: 0, pct: 0 },
  } as Record<SkillKey, SkillEvidence>;

  /*
    A part of a paper actually sat is better evidence than any card-type proxy,
    and it is the only evidence at all for listening and speaking. It is folded
    in rather than swapped in, as a weighted mean over both sources.

    SWAPPING WAS THE FIRST VERSION AND IT LIED ON SCREEN. It kept the proxy's
    count and took the sitting's percentage, so a learner with 143 recognition
    reviews at 73 percent and one bad A2 paper was told "reading is at 11
    percent, across 143 goes". Neither half of that sentence was true of the
    other half. A count and a percentage have to come from the same reviews or
    the advice built on them is fiction.

    A sat part counts as twenty reviews' worth, which is what `expectedPart`
    treats as a full signal: a paper sat under a clock is not an anecdote, and
    it is also not a thousand flashcards.
  */
  const PER_SITTING = 20;
  const perSkill = new Map<SkillKey, number[]>();
  for (const attempt of attempts) {
    for (const skill of SKILLS) {
      const pct = attempt.parts?.[skill];
      if (typeof pct !== "number") continue;
      perSkill.set(skill, [...(perSkill.get(skill) ?? []), pct]);
    }
  }
  for (const [skill, values] of perSkill) {
    const satWeight = PER_SITTING * values.length;
    const satMean = values.reduce((a, b) => a + b, 0) / values.length;
    const proxy = out[skill];
    const total = proxy.attempts + satWeight;
    out[skill] = {
      attempts: total,
      pct: Math.round((proxy.pct * proxy.attempts + satMean * satWeight) / total),
    };
  }

  return out;
}

// ── Sittings ─────────────────────────────────────────────────────────────────

/** Past sittings, most recent first, with each part's percentage. */
export async function recentAttempts(ownerId: string): Promise<PastAttempt[]> {
  const rows = await prisma.examAttempt.findMany({
    where: { ownerId },
    orderBy: [{ finishedAt: "desc" }, { id: "asc" }],
    take: ATTEMPT_WINDOW,
    select: { level: true, pct: true, passed: true, finishedAt: true, result: true },
  });

  return rows.map((row) => ({
    level: row.level as ExamLevel,
    pct: row.pct,
    passed: row.passed,
    at: row.finishedAt.toISOString(),
    parts: partPercentages(row.result),
  }));
}

/**
 * The four percentages out of a stored result.
 *
 * Defensive, like `parseExamples`: the column is JSON written by a version of
 * `lib/exam/score.ts` that may not be this one, and a readiness figure is not
 * worth throwing a page for. A blob it cannot read contributes nothing rather
 * than crashing the hub.
 */
export function partPercentages(json: string): Partial<Record<SkillKey, number>> {
  try {
    const parsed: unknown = JSON.parse(json);
    const parts = (parsed as { parts?: unknown })?.parts;
    if (!Array.isArray(parts)) return {};
    const out: Partial<Record<SkillKey, number>> = {};
    for (const part of parts) {
      const skill = (part as { skill?: unknown }).skill;
      const pct = (part as { pct?: unknown }).pct;
      if (typeof skill === "string" && typeof pct === "number" &&
          (SKILLS as readonly string[]).includes(skill)) {
        out[skill as SkillKey] = pct;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The sitting before this one at the same level, for the result to compare with.
 *
 * A percentage on its own answers "did I pass" and nothing else. The question
 * somebody sitting their third A2 paper is actually asking is whether the work
 * in between moved anything, and that is one row away. Strictly earlier than the
 * paper being looked at, so opening an old result compares it with the one
 * before it rather than with a paper sat afterwards.
 *
 * Derived, not stored: no best-score column, no counter. (ADR-014.)
 */
export async function previousAttempt(
  ownerId: string,
  level: ExamLevel,
  before: Date,
): Promise<{ pct: number; passed: boolean; at: Date } | null> {
  const row = await prisma.examAttempt.findFirst({
    where: { ownerId, level, finishedAt: { lt: before } },
    orderBy: [{ finishedAt: "desc" }, { id: "asc" }],
    select: { pct: true, passed: true, finishedAt: true },
  });
  return row ? { pct: row.pct, passed: row.passed, at: row.finishedAt } : null;
}

/**
 * The best percentage this learner had scored at a level before a given moment.
 *
 * `before` rather than "ever", because the caller is a result page asking
 * whether the paper it is showing beat anything: including that paper's own row
 * makes "your best yet" true of every paper anybody ever sits. Derived, not
 * stored: no best-score column. (ADR-014.)
 */
export async function bestAt(
  ownerId: string,
  level: ExamLevel,
  before: Date,
): Promise<number | null> {
  const row = await prisma.examAttempt.findFirst({
    where: { ownerId, level, finishedAt: { lt: before } },
    orderBy: { pct: "desc" },
    select: { pct: true },
  });
  return row?.pct ?? null;
}

/** One stored sitting, marked paper and all. Null when it is not this learner's. */
export async function attemptById(ownerId: string, id: string) {
  const row = await prisma.examAttempt.findFirst({ where: { id, ownerId } });
  if (!row) return null;
  let result: ExamResult | null = null;
  try {
    result = JSON.parse(row.result) as ExamResult;
  } catch {
    result = null;
  }
  return { ...row, parsed: result };
}

/**
 * Writes a finished sitting.
 *
 * Only ever called after a paper is submitted. An abandoned paper leaves no
 * row, which is the same promise every other mode makes (ADR-016) and the
 * reason there is nothing written when one is started.
 */
export async function recordAttempt(input: {
  ownerId: string;
  level: ExamLevel;
  seed: string;
  startedAt: Date;
  result: ExamResult;
}): Promise<string> {
  const row = await prisma.examAttempt.create({
    data: {
      ownerId: input.ownerId,
      level: input.level,
      seed: input.seed,
      pct: input.result.pct,
      passed: input.result.passed,
      result: JSON.stringify(input.result),
      startedAt: input.startedAt,
      finishedAt: new Date(),
    },
    select: { id: true },
  });
  return row.id;
}
