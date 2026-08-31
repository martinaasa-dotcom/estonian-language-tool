import { prisma } from "@/lib/db";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { gradedLemmas, lemmaCountsByLevel } from "@/lib/dict/facts";
import { caseByKey } from "@/lib/estonian/cases";
import { caseAccuracy } from "@/lib/stats/history";
import { buildPaper, type PoolWord, type Paper } from "@/lib/exam/paper";
import type { ExamResult } from "@/lib/exam/score";
import type { ExamLevel } from "@/lib/exam/spec";
import type { PastAttempt, ReadinessSignals, SkillEvidence } from "@/lib/exam/readiness";
import { SKILLS, type SkillKey } from "@/lib/exam/types";
import { latestFor } from "./assessment";
import { deckSnapshot, type DeckSnapshot } from "./summary";

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
 * Words at or below the level, preferring the ones that carry an attested
 * sentence, because three of the tasks cannot exist without one. Entries with
 * no CEFR tag are admitted from B1 upwards, which is where the untagged part of
 * the dictionary mostly sits.
 */
export async function examPool(ownerId: string, level: ExamLevel): Promise<PoolWord[]> {
  const ceiling = RANK[level] ?? 2;
  const levels = Object.entries(RANK)
    .filter(([, rank]) => rank <= ceiling)
    .map(([name]) => name);

  const lexemes = await prisma.lexeme.findMany({
    where: ceiling >= RANK.B1!
      ? { OR: [{ cefr: { in: levels } }, { cefr: null }] }
      : { cefr: { in: levels } },
    include: { forms: { orderBy: { orderIndex: "asc" } } },
    /*
      Words the dictionary knows most about first: an entry with retrieved
      forms can carry a case question, one with usages can carry a sentence.

      AND THEN ON THE PRIMARY KEY, WHICH IS THE ONLY TOTAL ORDER HERE.

      `@@unique` is on `(lemma, pos)`, so one lemma can hold two entries, and
      on a freshly seeded deployment every one of them has `fetchedAt` null.
      Two rows for `hall` therefore tied on both keys and Postgres chose
      between them. That is usually stable and it is not a promise, and this
      is the one query in the app where a promise is being made: `submitExam`
      rebuilds the paper from (level, seed, pool) to mark it, so a pool that
      comes back in a different order is a learner marked on questions they
      were never asked. `take` makes it worse, since a tie straddling the five
      hundredth row decides which of the pair is in the paper at all.

      Free, because the sort was happening anyway, and the answer stops
      depending on the plan. The same reasoning as `bySubstance` ending on
      `id` in lib/dict/search.ts.
    */
    orderBy: [{ fetchedAt: { sort: "desc", nulls: "last" } }, { lemma: "asc" }, { id: "asc" }],
    take: POOL_SIZE,
  });

  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { in: lexemes.map((l) => l.id) } },
    select: { id: true, lexemeId: true },
  });
  const cardFor = new Map<string, string>();
  for (const card of cards) if (card.lexemeId) cardFor.set(card.lexemeId, card.id);

  return lexemes.map((lexeme) => ({
    lexemeId: lexeme.id,
    lemma: lexeme.lemma,
    translation: lexeme.translation,
    pos: lexeme.pos,
    cefr: lexeme.cefr,
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
  return buildPaper(level, await examPool(ownerId, level), seed);
}

// ── The signals behind the confidence figure ─────────────────────────────────

/** Cards past the learning phase, whose recall is worth reading anything into. */
const MATURE_STATE = 2;

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
      prisma.review.findMany({
        where: { ownerId, targetCase: { not: null } },
        select: { targetCase: true, rating: true },
        orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
        take: 20_000,
      }),
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
 * that rather than claiming the learner has never practised.
 */
async function skillEvidence(
  ownerId: string,
  cards: { id: string; cardType: string }[],
  attempts: PastAttempt[],
): Promise<Record<SkillKey, SkillEvidence>> {
  const readingCards = new Set(cards.filter((c) => c.cardType === "RECOGNITION").map((c) => c.id));
  const writingCards = new Set(
    cards.filter((c) => ["PRODUCTION", "CASE_FORM", "GOVERNMENT", "GRADATION"].includes(c.cardType))
      .map((c) => c.id),
  );

  // The most recent twenty thousand, for the reason given where the other two
  // caps are ordered: past the cap an unordered slice makes the per-skill
  // percentages move on their own.
  const reviews = await prisma.review.findMany({
    where: { ownerId, cardId: { in: [...readingCards, ...writingCards] } },
    select: { cardId: true, rating: true },
    orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
    take: 20_000,
  });

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

/** How many past papers the readiness model looks at. */
const ATTEMPT_WINDOW = 12;

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
function partPercentages(json: string): Partial<Record<SkillKey, number>> {
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
