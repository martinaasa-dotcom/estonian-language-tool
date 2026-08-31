import { prisma } from "@/lib/db";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { buildPaper, type Paper, type WordRow } from "@/lib/assessment/items";
import { normaliseGoals, type Goals } from "@/lib/assessment/goals";
import { BANDS, type Band, type Placement, type SkillResult } from "@/lib/assessment/types";
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

/** Words sampled per CEFR band before the paper is assembled from them. */
const PER_BAND = 60;
/** Below this, a band falls back to including words already in the deck. */
const MIN_UNOWNED = 10;

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

    Ordering by lemma and taking the first hundred and twenty is stable, which
    a test wants, and on a dictionary of a few hundred words it is most of the
    band anyway. On a real one it is the same slice of the alphabet every
    sitting: every learner would meet the same words, and a retake would redraw
    the paper it had just been shown the answers to. So the window starts
    wherever the seed points, which costs one count per band.
  */
  const totals = await Promise.all(BANDS.map((band) => prisma.lexeme.count({ where: { cefr: band } })));
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
  return { ...row, skills: placement.skills };
}

export async function historyFor(ownerId: string, take = 10): Promise<StoredAssessment[]> {
  const rows = await prisma.assessment.findMany({
    where: { ownerId },
    orderBy: [{ takenAt: "desc" }, { id: "asc" }],
    take,
  });
  return rows.map((row) => ({ ...row, skills: parseDetail(row.detail) }));
}

export async function latestFor(ownerId: string): Promise<StoredAssessment | null> {
  const [first] = await historyFor(ownerId, 1);
  return first ?? null;
}

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
