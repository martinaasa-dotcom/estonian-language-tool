import { cache } from "react";

import { prisma } from "@/lib/db";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { lemmaCountsByLevel } from "@/lib/dict/facts";
import { buildPaper, type Paper, type WordRow } from "@/lib/assessment/items";
import { normaliseGoals, type Goals } from "@/lib/assessment/goals";
import { BANDS, type Band, type Level, type Placement, type SkillResult } from "@/lib/assessment/types";
import { overallFrom, type Overall } from "@/lib/assessment/score";
import { GOAL_KEYS, numberSetting, readSettings, SETTING_KEYS, writeSetting } from "@/lib/settings/store";
import { DEFAULT_DAYS_PER_WEEK } from "@/lib/assessment/goals";

/**
 * The database half of the placement check.
 *
 * `lib/assessment/` is pure and knows nothing about Prisma; this reads the
 * dictionary, hands it over, and writes the result back. Same split as
 * `lib/estonian/` and `lib/progress/caseExamples.ts`.
 *
 * The one judgement call worth stating is which words the paper is built from:
 * **words the learner does not already have in their deck**, wherever there are
 * enough of them. A test made of cards somebody has been drilling for a month
 * measures their deck rather than their Estonian, and would hand back a level
 * that rises every time they revise and means nothing outside this app.
 */

/**
 * Words sampled per CEFR band before the paper is assembled from them.
 *
 * Raised with the blueprint, and it had to be. A band now wants twelve
 * questions across the four skills rather than six, every one of them about a
 * different word, and most of them need more of a word than its gloss: a gap
 * needs a recorded sentence short enough to read and at least three other
 * forms to offer, and a dictation needs one shorter still. Sixty words a band
 * was enough to fill six questions and would have left the harder sections
 * reporting themselves thin on a dictionary that is not.
 */
const PER_BAND = 100;
/**
 * Below this, a band falls back to including words already in the deck.
 *
 * Raised with `PER_BAND` for the same reason: a band with twenty unowned words
 * left in it has to build twelve questions out of them, so what it is choosing
 * between is nearly nothing, and a paper made of whatever survived is a worse
 * measurement than one that asks about a word the learner happens to own.
 */
const MIN_UNOWNED = 30;

function toRow(lexeme: {
  id: string; lemma: string; translation: string; pos: string; cefr: string | null;
  government: string | null; examples: string;
  forms: { formType: string; value: string; morphCode: string | null }[];
}): WordRow {
  return {
    id: lexeme.id,
    lemma: lexeme.lemma,
    translation: lexeme.translation,
    pos: lexeme.pos,
    cefr: lexeme.cefr,
    government: lexeme.government,
    forms: lexeme.forms,
    examples: usableExamples(parseExamples(lexeme.examples)).map((e) => ({ et: e.et, en: e.en ?? null })),
  };
}

/**
 * Builds a paper for this learner.
 *
 * The seed decides which questions come up, and it is the caller's: a page
 * passes a fresh one so two sittings differ, and a test passes a fixed one so
 * the paper does not.
 */
export async function paperFor(ownerId: string, seed: number): Promise<Paper> {
  // Ordered, because this function promises to be a function of its seed. Past
  // the cap, which cards counted as owned was the plan's choice, so the same
  // seed could build a different paper.
  const owned = await prisma.card.findMany({
    where: { ownerId, lexemeId: { not: null } },
    select: { lexemeId: true },
    distinct: ["lexemeId"],
    orderBy: [{ createdAt: "asc" }, { lexemeId: "asc" }, { id: "asc" }],
    take: 5000,
  });
  const ownedIds = new Set(owned.map((c) => c.lexemeId).filter((id): id is string => !!id));

  /*
    A window into each band, moved by the seed.

    Ordering by lemma and taking the first two hundred is stable, which a test
    wants, and on a dictionary of a few hundred words it is most of the band
    anyway. On a real one it is the same slice of the alphabet every
    sitting: every learner would meet the same words, and a retake would redraw
    the paper it had just been shown the answers to. So the window starts
    wherever the seed points, which costs one count per band.
  */
  // Six `count(*)`s over the shared dictionary, which is the same six answers
  // for everybody who sits this. One cached tally instead. lib/dict/facts.ts.
  const byLevel = await lemmaCountsByLevel();
  const totals = BANDS.map((band) => byLevel.get(band) ?? 0);
  const window = PER_BAND * 2;

  const perBand = await Promise.all(
    BANDS.map((band, i) => {
      const total = totals[i] ?? 0;
      return prisma.lexeme.findMany({
        where: { cefr: band },
        select: {
          id: true, lemma: true, translation: true, pos: true, cefr: true,
          government: true, examples: true,
          forms: { select: { formType: true, value: true, morphCode: true } },
        },
        orderBy: [{ lemma: "asc" }, { id: "asc" }],
        skip: total > window ? seed % (total - window) : 0,
        take: window,
      });
    }),
  );

  const words: WordRow[] = [];
  for (const band of perBand) {
    const rows = band.map(toRow);
    const fresh = rows.filter((r) => !ownedIds.has(r.id));
    words.push(...(fresh.length >= MIN_UNOWNED ? fresh : rows).slice(0, PER_BAND));
  }

  return buildPaper(words, seed);
}

/** A stored result, in the shape the result screen and the history read. */
export interface StoredAssessment {
  id: string;
  takenAt: Date;
  overall: string | null;
  ceiling: string | null;
  confidence: string;
  answered: number;
  reading: string | null;
  listening: string | null;
  writing: string | null;
  speakingSelf: number | null;
  /** The per band breakdown, or an empty list when an old row has none. */
  skills: SkillResult[];
  /** The band `overall` came close to, when it did. See `readOverall`. */
  nearly: Band | null;
}

/**
 * The overall level of a stored sitting, read by today's rule rather than the
 * one in force the day it was written.
 *
 * `Assessment` is append-only and every row carries its own `overall`, so the
 * obvious thing is to print what the row says. That is wrong here, and it is
 * wrong in a way worth spelling out, because "append-only" and "never
 * reinterpret" are different promises.
 *
 * What the sitting *measured* is the three per skill levels, and those are
 * stored in their own columns and never touched. `overall` is a derivation
 * from them: one line of arithmetic, chosen by whichever rule this app held at
 * the time. ADR-020 amendment 2 changed that rule from the weakest skill to the
 * average, so a row written before it holds a number today's app would not
 * produce from the same measurement. Printing it would put two rules on one
 * screen, and the history list is exactly where they would sit side by side.
 *
 * So the measurement is what is preserved and the reading is recomputed. That
 * is the same reasoning as "progress is derived, never stored", arriving one
 * table late: the column stays because it is what a row written today records,
 * and every reader goes through here.
 *
 * A row with no skill columns at all keeps its stored answer, because there is
 * nothing to recompute from and a blank is worse than an old rule's number.
 */
export function readOverall(row: {
  overall: string | null;
  reading: string | null;
  listening: string | null;
  writing: string | null;
}): Overall {
  const measured = [row.reading, row.listening, row.writing].filter(
    (level): level is Level => level !== null,
  );
  if (measured.length === 0) return { level: (row.overall ?? null) as Level | null, nearly: null };
  return overallFrom(measured);
}

/** A stored row, with its overall level read by the current rule. */
function withOverall<T extends {
  overall: string | null; reading: string | null; listening: string | null; writing: string | null;
}>(row: T): T & { overall: string | null; nearly: Band | null } {
  const { level, nearly } = readOverall(row);
  return { ...row, overall: level, nearly };
}

function parseDetail(json: string): SkillResult[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as SkillResult[]) : [];
  } catch {
    return [];
  }
}

const levelOf = (placement: Placement, skill: string): string | null =>
  placement.skills.find((s) => s.skill === skill)?.level ?? null;

/**
 * Writes the result. Never updates one: a later check is another row, so the
 * history is a history rather than a number that moved.
 */
export async function saveResult(ownerId: string, placement: Placement): Promise<StoredAssessment> {
  const speaking = placement.skills.find((s) => s.skill === "speaking");
  const row = await prisma.assessment.create({
    data: {
      ownerId,
      overall: placement.overall,
      ceiling: placement.ceiling,
      confidence: placement.confidence,
      answered: placement.itemsAnswered,
      reading: levelOf(placement, "reading"),
      listening: levelOf(placement, "listening"),
      writing: levelOf(placement, "writing"),
      speakingSelf: speaking?.selfRating ?? null,
      detail: JSON.stringify(placement.skills),
    },
  });
  return withOverall({ ...row, skills: placement.skills });
}

export async function historyFor(ownerId: string, take = 10): Promise<StoredAssessment[]> {
  const rows = await prisma.assessment.findMany({
    where: { ownerId },
    orderBy: [{ takenAt: "desc" }, { id: "asc" }],
    take,
  });
  return rows.map((row) => withOverall({ ...row, skills: parseDetail(row.detail) }));
}

/**
 * The most recent level check, asked once per request however many ask.
 *
 * Two things want it on Today and they want it for different reasons:
 * `courseLevelFor` to decide which unit the course opens at, and
 * `readinessSignals` because a measured level is the only source the exam hub
 * has for listening and speaking. Neither knows about the other, and the row
 * cannot change mid-render: `Assessment` is append-only and a sitting is
 * written when it ends.
 *
 * React's `cache` is request-scoped, so this is one read on a page and no read
 * held between two. Outside a request it does not memoize, which leaves a
 * script and a test exactly as they were.
 */
export const latestFor = cache(async (ownerId: string): Promise<StoredAssessment | null> => {
  const [first] = await historyFor(ownerId, 1);
  return first ?? null;
});

/** The goal answers, normalised, with the daily goal that goes with them. */
export async function goalsFor(ownerId: string): Promise<Goals & { dailyGoal: number }> {
  const settings = await readSettings(ownerId, [...GOAL_KEYS, SETTING_KEYS.dailyGoal]);
  const goals = normaliseGoals({
    reason: settings[SETTING_KEYS.goalReason] ?? null,
    target: (settings[SETTING_KEYS.goalTarget] ?? null) as Band | null,
    deadline: settings[SETTING_KEYS.goalDeadline] ?? null,
    daysPerWeek: numberSetting(settings[SETTING_KEYS.goalDays], DEFAULT_DAYS_PER_WEEK),
    note: settings[SETTING_KEYS.goalNote] ?? "",
  });
  return { ...goals, dailyGoal: numberSetting(settings[SETTING_KEYS.dailyGoal], 15) };
}

/** Stores the goal answers. The owner is resolved by the caller, never sent. */
export async function saveGoals(ownerId: string, goals: Goals): Promise<void> {
  await Promise.all([
    writeSetting(ownerId, SETTING_KEYS.goalReason, goals.reason ?? ""),
    writeSetting(ownerId, SETTING_KEYS.goalTarget, goals.target ?? ""),
    writeSetting(ownerId, SETTING_KEYS.goalDeadline, goals.deadline ?? ""),
    writeSetting(ownerId, SETTING_KEYS.goalDays, String(goals.daysPerWeek)),
    writeSetting(ownerId, SETTING_KEYS.goalNote, goals.note),
  ]);
}
