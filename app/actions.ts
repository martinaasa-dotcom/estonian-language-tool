"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { throttleAction } from "@/lib/security/actionLimits";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { formName } from "@/lib/estonian/morph";
import {
  LEVELS, checkpointFor, levelIndex, unitById, wordsAtLevel,
} from "@/lib/collections/syllabus";
import { checkpointPassed } from "@/lib/collections/checkpoint";
import { placementResult } from "@/lib/collections/placement";
import { generateCode, isValidCode, normaliseCode } from "@/lib/classroom/code";
import { loadRecentMessages } from "@/lib/tutor/history";
import { mergeExamples, parseExamples, serialiseExamples } from "@/lib/dict/examples";
import { lookupAndStore } from "@/lib/dict/lookup";
import { upsertLexemeWithForms } from "@/lib/dict/upsert";
import { requireAdminId } from "@/lib/auth/admin";
import { applyPatch } from "@/lib/suggestions/apply";
import {
  SUGGESTION_LIMITS, acknowledgement, groupKeyFor, isCategory, parsePatch, parsePatchValue,
  patchFitsCategory,
} from "@/lib/suggestions/model";
import { eraseAuthIdentity, remainingIdentityNote } from "@/lib/auth/erase";
import { NEEDS_TRANSLATION } from "@/lib/copy/values";
import { resolveOneWord } from "@/lib/dict/resolveScan";
import { guessPos, MAX_ITEMS as SCAN_MAX_ITEMS } from "@/lib/scan/extract";
import { parseItems, sanitiseItems, serialiseItems } from "@/lib/scan/items";
import { translateSentenceWithAnu } from "@/lib/tutor/translate";
import { checkAchievementsFor } from "@/lib/progress/achievements";
import { resolveStreakFor } from "@/lib/progress/summary";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { isTimeZone } from "@/lib/time/day";
import {
  numberSetting, readSetting, SETTING_KEYS, writeSetting, type ReviewMode,
} from "@/lib/settings/store";
import { letterBarFrom, type LetterBar } from "@/lib/ux/letterBar";
import {
  availableCardTypes, generateCards, type CardType, type LexemeForCards,
} from "@/lib/srs/cards";
import { emptyScheduling, grade, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";

import { applyGradeBatch, type ReplayItem } from "@/lib/srs/replay";
import { MAX_PASSAGE_CHARS, buildPassageCloze, type KnownForm } from "@/lib/estonian/passage";
import { DEFAULT_DAYS_PER_WEEK, normaliseGoals } from "@/lib/assessment/goals";
import { placement } from "@/lib/assessment/score";
import type { Band, ItemRef, Response } from "@/lib/assessment/types";
import { goalsFor, saveGoals, saveResult } from "@/lib/progress/assessment";
import { REPLAY_BATCH } from "@/lib/offline/outbox";
import { paperFor as examPaperFor, recordAttempt } from "@/lib/progress/exam";
import { gradesFrom, markPaper, type Response as ExamResponse } from "@/lib/exam/score";
import { isExamLevel } from "@/lib/exam/spec";

// ─────────────────────────────── Cards ────────────────────────────────────

/**
 * Adds a word to the deck. Skips card types that already exist, so it is safe to click twice.
 * Cards are per-user (`ownerId`) even though the Lexeme they're generated from is the shared
 * dictionary — see docs/03-architecture.md ADR-012.
 */
export async function addToDeck(lexemeId: string, types: CardType[], source = "DICTIONARY") {
  return addCardsFor(await requireUserId(), lexemeId, types, source);
}

/**
 * The body of `addToDeck`, for callers that have already established the owner.
 *
 * Deliberately not exported: this file is `"use server"`, so every export is an
 * endpoint any signed-in user can call with arguments of their choosing. An
 * exported `ownerId` parameter would therefore let one learner write cards into
 * another's deck. Owner comes from the session, never from the caller.
 */
async function addCardsFor(
  owner: string, lexemeId: string, types: CardType[], source: string,
) {
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    include: { forms: true },
  });
  if (!lexeme) return { ok: false as const, error: "That word no longer exists." };

  const existing = await prisma.card.findMany({
    where: { lexemeId, ownerId: owner },
    select: { front: true, cardType: true },
  });
  const seen = new Set(existing.map((c) => `${c.cardType}|${c.front}`));

  const generated = generateCards(lexeme as LexemeForCards, types)
    .filter((c) => !seen.has(`${c.cardType}|${c.front}`));

  if (generated.length === 0) {
    return { ok: true as const, added: 0, message: "Already in your deck." };
  }

  const now = new Date();
  const scheduling = emptyScheduling(now);
  await prisma.card.createMany({
    data: generated.map((c) => ({
      ownerId: owner,
      lexemeId,
      cardType: c.cardType,
      front: c.front,
      back: c.back,
      hint: c.hint,
      targetCase: c.targetCase,
      source,
      due: scheduling.due,
      stability: scheduling.stability,
      difficulty: scheduling.difficulty,
      state: scheduling.state,
      learningSteps: scheduling.learningSteps,
    })),
  });

  revalidatePath("/");
  revalidatePath("/words");
  return { ok: true as const, added: generated.length };
}

/** The scheduling fields a client hands back to undo a grade. */
const SchedulingSchema = z.object({
  due: z.string(),
  stability: z.number().min(0).max(100_000),
  difficulty: z.number().min(0).max(20),
  elapsedDays: z.number().int().min(0).max(100_000),
  scheduledDays: z.number().int().min(0).max(100_000),
  reps: z.number().int().min(0).max(100_000),
  lapses: z.number().int().min(0).max(100_000),
  state: z.number().int().min(0).max(3),
  learningSteps: z.number().int().min(0).max(20),
  lastReview: z.string().nullable(),
});

export type SchedulingSnapshot = z.infer<typeof SchedulingSchema>;

/**
 * Records a grade. Writes the Review row first: the review log is append-only and
 * is the one thing we cannot reconstruct, so it must never be lost to a later failure.
 *
 * `reviewedAt` is accepted so a grade made offline can be logged at the moment it
 * actually happened rather than whenever the connection came back — otherwise a
 * whole evening of offline review would land in one second the next morning and
 * quietly lie to the streak, the heatmap and the daily goal. It is clamped to the
 * past: a client cannot book reviews into the future.
 */
export async function gradeCard(
  cardId: string, rating: RatingValue, durationMs: number, reviewedAt?: string,
) {
  const ownerId = await requireUserId();
  const card = await prisma.card.findFirst({ where: { id: cardId, ownerId } });
  if (!card) return { ok: false as const, error: "Card not found." };

  const now = new Date();
  const when = reviewedAt ? new Date(reviewedAt) : now;
  const at = Number.isNaN(when.getTime()) || when > now ? now : when;

  await prisma.review.create({
    data: {
      ownerId,
      cardId,
      lexemeId: card.lexemeId,
      rating,
      reviewedAt: at,
      durationMs: Math.min(Math.max(durationMs, 0), 600_000),
      stateBefore: card.state,
      targetCase: card.targetCase,
    },
  });

  const current: SchedulingState = {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.lastReview,
    learningSteps: card.learningSteps,
  };
  const next = grade(current, rating, at);

  await prisma.card.update({
    where: { id: cardId },
    data: {
      due: next.due,
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsedDays,
      scheduledDays: next.scheduledDays,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      learningSteps: next.learningSteps,
      lastReview: next.lastReview,
    },
  });

  revalidatePath("/");
  return { ok: true as const, due: next.due };
}

/**
 * Applies grades taken while the connection was down.
 *
 * A thin authentication wrapper: the owner comes from the session, never from
 * the caller, and the work lives in `lib/srs/replay` where it can be tested
 * against a real database without one.
 *
 * Idempotent by construction — the client generates each grade's id, so a
 * replay interrupted after the commit but before the client heard about it
 * re-sends rows that already exist and gets them back as settled. That is only
 * safe because `Review` is append-only: there is no prior state to reconcile,
 * only facts that either landed or did not.
 */
export async function replayGrades(batch: ReplayItem[]) {
  const ownerId = await requireUserId();
  const result = await applyGradeBatch(ownerId, batch);
  if (!result.ok) return { ok: false as const, error: result.error ?? "Replay failed." };
  revalidatePath("/");
  revalidatePath("/words");
  return { ok: true as const, settled: result.settled };
}

/**
 * Puts a card back the way it was before the last grade.
 *
 * The Review row stays. `Review` is append-only and is the input to FSRS
 * parameter optimisation, so deleting a row to make a mistake disappear would
 * corrupt the one table we cannot rebuild — and it would also be a lie: the
 * card really was shown, and really was answered. What undo restores is the
 * *scheduling*, which is derived state and safe to rewind.
 *
 * The previous state comes from the client because that is the only place it
 * still exists; it is validated and range-clamped on the way in, and can only
 * ever be applied to a card the caller already owns.
 */
export async function undoGrade(cardId: string, previous: SchedulingSnapshot) {
  const ownerId = await requireUserId();
  const parsed = SchedulingSchema.safeParse(previous);
  if (!parsed.success) return { ok: false as const, error: "That card state isn't valid." };

  const card = await prisma.card.findFirst({ where: { id: cardId, ownerId }, select: { id: true } });
  if (!card) return { ok: false as const, error: "Card not found." };

  const p = parsed.data;
  const due = new Date(p.due);
  if (Number.isNaN(due.getTime())) return { ok: false as const, error: "That card state isn't valid." };

  await prisma.card.update({
    where: { id: cardId },
    data: {
      due,
      stability: p.stability,
      difficulty: p.difficulty,
      elapsedDays: p.elapsedDays,
      scheduledDays: p.scheduledDays,
      reps: p.reps,
      lapses: p.lapses,
      state: p.state,
      learningSteps: p.learningSteps,
      lastReview: p.lastReview ? new Date(p.lastReview) : null,
    },
  });

  revalidatePath("/");
  return { ok: true as const };
}

export async function setCardSuspended(cardId: string, suspended: boolean) {
  const ownerId = await requireUserId();
  await prisma.card.updateMany({ where: { id: cardId, ownerId }, data: { suspended } });
  revalidatePath("/words");
  revalidatePath("/progress"); // the sticking-points list lives there
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteCard(cardId: string) {
  const ownerId = await requireUserId();
  await prisma.card.deleteMany({ where: { id: cardId, ownerId } });
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const };
}

// ────────────────────────────── Examples ──────────────────────────────────

/**
 * Translates one attested example sentence into English, and keeps it.
 *
 * Ekilex has no English on a reader key, so a learner meeting "Kitsed olid ojal
 * joomas." has the grammar in front of them and no way in. Anu translates *into*
 * English — the direction ADR-005 permits — and the result is stored on the
 * sentence so it is fetched once, not on every render, and is tagged AI so the
 * page can say where it came from.
 */
export async function translateExample(lexemeId: string, sentence: string) {
  const ownerId = await requireUserId();
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: { id: true, examples: true },
  });
  if (!lexeme) return { ok: false as const, error: "That word no longer exists." };

  const examples = parseExamples(lexeme.examples);
  const target = examples.find((e) => e.et === sentence);
  if (!target) return { ok: false as const, error: "That sentence is not on this word." };
  if (target.en) return { ok: true as const, en: target.en };

  /*
    A paid call, so it is metered like every other one. The allowance can
    refuse it, and when it does the learner is told that rather than being
    told the sentence was too hard: those are different problems and only one
    of them is worth waiting a day over.
  */
  const answer = await translateSentenceWithAnu(ownerId, sentence);
  if (!answer.ok) {
    return {
      ok: false as const,
      error: answer.reason === "quota" ? answer.message : "Anu could not translate that one.",
    };
  }
  const en = answer.text;

  await prisma.lexeme.update({
    where: { id: lexeme.id },
    data: {
      examples: serialiseExamples(
        examples.map((e) => (e.et === sentence ? { ...e, en } : e)),
      ),
    },
  });
  revalidatePath("/dictionary");
  return { ok: true as const, en };
}

/**
 * Adds a sentence of the learner's own to a word.
 *
 * Their sentence, their word — a line from class, or one Anu just corrected.
 * Stored with `source: "USER"` so the entry can distinguish it from the
 * lexicographers' examples rather than quietly passing it off as attested.
 */
export async function addExample(lexemeId: string, sentence: string, translation?: string) {
  await requireUserId();
  const et = sentence.trim();
  if (et.length < 4) return { ok: false as const, error: "That is too short to be a sentence." };

  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: { id: true, examples: true },
  });
  if (!lexeme) return { ok: false as const, error: "That word no longer exists." };

  const merged = mergeExamples(parseExamples(lexeme.examples), [
    { et, en: translation?.trim() || null, source: "USER" },
  ]);
  await prisma.lexeme.update({
    where: { id: lexeme.id },
    data: { examples: serialiseExamples(merged) },
  });
  revalidatePath("/dictionary");
  return { ok: true as const };
}

// ─────────────────────────────── Words ────────────────────────────────────

/**
 * Length caps on anything a person types into shared or stored text.
 *
 * Not a formatting preference — without them a single request can push
 * megabytes into the database, and a lemma is a word. Truncating rather than
 * rejecting: over-long input is almost always a paste accident, and losing the
 * whole entry to a stray clipboard is the worse outcome.
 */
const LIMITS = {
  lemma: 80,
  translation: 200,
  form: 80,
  government: 300,
  notes: 2000,
  taskTitle: 200,
  taskNotes: 2000,
} as const;

const capped = (value: string | undefined | null, max: number): string =>
  (value ?? "").trim().slice(0, max);


/**
 * Adds a word to the shared dictionary.
 *
 * Requires a session even though the row is shared rather than personal: every
 * export of this file is a public endpoint, and "the middleware will have caught
 * it" is the assumption that turns a gap in the middleware into a data breach.
 * It also establishes who to attribute the entry to.
 */
export async function createLexeme(input: {
  lemma: string; translation: string; pos: string; cefr?: string; notes?: string;
}) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "editDictionary");
  if (busy) return busy;
  const lemma = capped(input.lemma, LIMITS.lemma);
  const translation = capped(input.translation, LIMITS.translation);
  if (!lemma || !translation) {
    return { ok: false as const, error: "A word needs both an Estonian form and a translation." };
  }

  const existing = await prisma.lexeme.findUnique({
    where: { lemma_pos: { lemma, pos: input.pos } },
  });
  if (existing) return { ok: true as const, id: existing.id, existed: true };

  const lexeme = await prisma.lexeme.create({
    data: {
      lemma, translation, pos: input.pos,
      cefr: input.cefr || null,
      notes: capped(input.notes, LIMITS.notes) || null,
      provenance: "USER",
      editedBy: ownerId,
      editedAt: new Date(),
    },
  });
  revalidatePath("/dictionary");
  return { ok: true as const, id: lexeme.id, existed: false };
}

/**
 * Creates a word with its principal parts, and classifies the gradation from the
 * two stems given. This is the path for anything the built-in dictionary does not
 * carry — without it, "add it yourself" is a promise the app cannot keep.
 */
export async function createLexemeWithForms(input: {
  /** Present when correcting an existing entry. Without it, editing the Estonian
   *  word itself would create a second lexeme and orphan the cards made from it. */
  id?: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr?: string;
  government?: string;
  notes?: string;
  forms: Record<string, string>;
}) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "editDictionary");
  if (busy) return busy;
  const lemma = capped(input.lemma, LIMITS.lemma);
  const translation = capped(input.translation, LIMITS.translation);
  if (!lemma || !translation) {
    return { ok: false as const, error: "A word needs both an Estonian form and a translation." };
  }

  const lexeme = await upsertLexemeWithForms({
    id: input.id,
    lemma,
    translation,
    pos: input.pos,
    cefr: input.cefr,
    government: capped(input.government, LIMITS.government),
    notes: capped(input.notes, LIMITS.notes),
    forms: Object.fromEntries(
      Object.entries(input.forms).map(([type, value]) => [type, capped(value, LIMITS.form)]),
    ),
    editedBy: ownerId,
  });

  // Correcting a word must correct the cards made from it, or she keeps being
  // drilled on the mistake she just fixed. Only the text is rewritten — the FSRS
  // scheduling is untouched, so a correction never costs her progress.
  // Scoped to this learner's own cards. The dictionary is shared, but a deck is
  // not: rewriting every user's cards because one of them fixed a spelling
  // reaches into strangers' data, and they would have no idea why a card changed.
  if (lexeme.previous && (lexeme.previous.lemma !== lemma || lexeme.previous.translation !== translation)) {
    await prisma.card.updateMany({
      where: { ownerId, lexemeId: lexeme.id, cardType: "RECOGNITION" },
      data: { front: lemma, back: translation },
    });
    await prisma.card.updateMany({
      where: { ownerId, lexemeId: lexeme.id, cardType: "PRODUCTION" },
      data: { front: translation, back: lemma },
    });
  }

  revalidatePath("/dictionary");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, id: lexeme.id, lemma, updated: lexeme.previous !== null };
}

export async function toggleStar(lexemeId: string) {
  const ownerId = await requireUserId();
  const existing = await prisma.starredWord.findUnique({
    where: { ownerId_lexemeId: { ownerId, lexemeId } },
  });
  if (existing) {
    await prisma.starredWord.delete({ where: { ownerId_lexemeId: { ownerId, lexemeId } } });
  } else {
    await prisma.starredWord.create({ data: { ownerId, lexemeId } });
  }
  revalidatePath("/dictionary");
  return { ok: true as const, starred: !existing };
}

/** Bulk import from pasted text. Returns per-row outcomes so nothing fails silently. */
/** One paste. Each row is a round trip, and the dictionary it writes to is shared. */
const MAX_IMPORT_ROWS = 500;

export async function importWords(rows: { lemma: string; translation: string; pos: string }[]) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "importWords");
  if (busy) return busy;
  let created = 0;
  let cards = 0;
  const skipped: string[] = [];
  const truncated = rows.length > MAX_IMPORT_ROWS;

  for (const row of rows.slice(0, MAX_IMPORT_ROWS)) {
    const lemma = capped(row.lemma, LIMITS.lemma);
    const translation = capped(row.translation, LIMITS.translation);
    if (!lemma || !translation) continue;

    let lexeme = await prisma.lexeme.findUnique({
      where: { lemma_pos: { lemma, pos: row.pos } },
    });
    if (lexeme) {
      skipped.push(lemma);
    } else {
      lexeme = await prisma.lexeme.create({
        data: {
          lemma, translation, pos: row.pos, provenance: "USER",
          editedBy: ownerId, editedAt: new Date(),
        },
      });
      created++;
    }
    const result = await addCardsFor(ownerId, lexeme.id, ["RECOGNITION", "PRODUCTION"], "IMPORT");
    if (result.ok) cards += result.added ?? 0;
  }

  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, created, cards, skipped, truncated, limit: MAX_IMPORT_ROWS };
}

// ────────────────────────────── Achievements ───────────────────────────────

/**
 * Resolves the current streak for whoever is signed in, applying any banked
 * streak shields (Duolingo's "streak freeze") to bridge missed days.
 *
 * The logic lives in lib/progress/summary.ts so a Server Component can reach it
 * without importing this whole action module. This wrapper takes no owner id on
 * purpose: an exported Server Action is a public endpoint, and one that read a
 * streak for any id passed to it would happily report on someone else's.
 */
export async function resolveStreak() {
  const ownerId = await requireUserId();
  const result = await resolveStreakFor(ownerId, new Date(), await learnerDayClock(ownerId));
  return { ok: true as const, ...result };
}

/**
 * Computes current stats from the review log and decks, then awards any badge
 * whose condition is newly met. Idempotent and safe to call often: an already
 * -earned key is never re-awarded or removed, so a badge earned once is kept
 * forever even if the underlying stat later dips (e.g. a streak breaks).
 *
 * The work itself lives in lib/progress/achievements.ts, so a page that has
 * already loaded the learner's deck and day can award badges from what it
 * holds instead of asking the database all over again.
 *
 * No revalidatePath here: this is called from a Server Component render (Today)
 * as well as from actual actions, and revalidating during render is an error.
 */
export async function checkAchievements(session?: { count: number; accuracy: number }) {
  const ownerId = await requireUserId();
  const newBadges = await checkAchievementsFor(ownerId, session);
  return { ok: true as const, newBadges };
}

/**
 * A learner's recent turns with Anu, for the floating Anu button.
 *
 * The full `/tutor` page loads this server-side on every visit; the floating
 * button is chrome that stays mounted across navigation, so it fetches once,
 * the first time it is opened, rather than on every page load. Same table,
 * same shape, so a conversation continued from either one reads as one
 * conversation.
 */
export async function getTutorHistory() {
  const ownerId = await requireUserId();
  return loadRecentMessages(ownerId);
}

/** Sets the review count that fills the daily-goal ring on Today. */
export async function setDailyGoal(goal: number) {
  const ownerId = await requireUserId();
  const clamped = Math.min(200, Math.max(5, Math.round(goal)));
  await writeSetting(ownerId, SETTING_KEYS.dailyGoal, String(clamped));
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true as const, goal: clamped };
}

/** Records a Case Sprint score, keeping only the personal best. */
export async function recordSprintScore(score: number) {
  const ownerId = await requireUserId();
  const best = numberSetting(await readSetting(ownerId, SETTING_KEYS.sprintBest), 0);
  const isNewBest = score > best;
  if (isNewBest) await writeSetting(ownerId, SETTING_KEYS.sprintBest, String(score));
  return { ok: true as const, best: Math.max(score, best), isNewBest };
}

/**
 * Records a finished match round, keeping the fastest time.
 *
 * Lower is better here, which is the opposite of every other score in the app —
 * hence the explicit "0 means never played" rather than a plain `Math.min`,
 * which would leave a first-ever round competing against zero and always losing.
 */
export async function recordMatchTime(seconds: number) {
  const ownerId = await requireUserId();
  const rounded = Math.max(1, Math.round(seconds));
  const best = numberSetting(await readSetting(ownerId, SETTING_KEYS.matchBest), 0);
  const isNewBest = best === 0 || rounded < best;
  if (isNewBest) await writeSetting(ownerId, SETTING_KEYS.matchBest, String(rounded));
  return { ok: true as const, best: isNewBest ? rounded : best, isNewBest };
}

// ──────────────────────────── Learner preferences ──────────────────────────

/**
 * Records where the learner's midnight is, as their browser reports it.
 *
 * Not a preference anybody is asked for. Every day-shaped figure in this app —
 * the streak, the daily goal, the quests, the heatmap, the two badges about
 * the hour of the day — is derived on the server, and a server does not know
 * what midnight means to the person reading it. Without this it used the
 * deployment's zone, which on Vercel is UTC, so a learner in Tallinn who
 * studied at one in the morning had it filed under yesterday and could watch a
 * banked streak shield be spent on a day they had not missed.
 *
 * No throttle: it is one indexed upsert, the client only calls it when the
 * stored value actually disagrees with the browser, and `lib/security/
 * actionLimits.ts` says out loud that a limit on work that cheap is met by
 * learners and by nobody else. Validated rather than trusted, because the
 * value reaches a raw `AT TIME ZONE` in the streak query: anything `Intl`
 * refuses is refused here.
 */
export async function setTimeZone(zone: string) {
  const ownerId = await requireUserId();
  if (!isTimeZone(zone)) return { ok: false as const, error: "That is not a timezone." };
  await writeSetting(ownerId, SETTING_KEYS.timeZone, zone);
  return { ok: true as const, zone };
}


/** How review sessions ask their questions: type the answer, or flip the card. */
export async function setReviewMode(mode: ReviewMode) {
  const ownerId = await requireUserId();
  await writeSetting(ownerId, SETTING_KEYS.reviewMode, mode === "flip" ? "flip" : "type");
  revalidatePath("/settings");
  revalidatePath("/review");
  return { ok: true as const, mode };
}

/**
 * Whether the Estonian letter bar is drawn under text fields.
 *
 * Revalidated at the layout rather than at a path: the answer is published as
 * an attribute by the signed-in shell, so every screen inside it is stale the
 * moment this changes, not just the one the learner happened to press it on.
 */
export async function setLetterBar(value: LetterBar) {
  const ownerId = await requireUserId();
  await writeSetting(ownerId, SETTING_KEYS.letterBar, value === "off" ? "off" : "on");
  revalidatePath("/", "layout");
  return { ok: true as const, value };
}

/**
 * The name shown on the class leaderboard, and whether to appear on it at all.
 *
 * Opt-in, and off by default: a study app should never publish who studied how
 * much without being asked. The name is the learner's own text rather than
 * their Google account name, so appearing on a class board never means
 * publishing an email address or a legal name they did not choose to share.
 */
export async function setLeaderboardPreferences(input: { displayName: string; optIn: boolean }) {
  const ownerId = await requireUserId();
  const name = input.displayName.trim().slice(0, 32);
  if (input.optIn && !name) {
    return { ok: false as const, error: "Pick a name to show before joining the leaderboard." };
  }
  await Promise.all([
    writeSetting(ownerId, SETTING_KEYS.displayName, name),
    writeSetting(ownerId, SETTING_KEYS.leaderboard, input.optIn ? "1" : "0"),
  ]);
  revalidatePath("/progress");
  revalidatePath("/settings");
  return { ok: true as const, displayName: name, optIn: input.optIn };
}

// ───────────────────────────────── Onboarding ──────────────────────────────

/**
 * First run: record who this is, how hard they want to work, and put a real
 * deck in front of them.
 *
 * The starter units matter more than they look. An empty deck is the single
 * most likely place for a new learner to give up — everything the app can do is
 * behind "add some words first", and a stranger has no idea which words. So
 * onboarding finishes by actually building a deck from the path, at the level
 * they said they were.
 */
export async function completeOnboarding(input: {
  displayName: string;
  cefr: string;
  dailyGoal: number;
  unitIds: string[];
  /**
   * Whether they want the Estonian letter bar. Absent from a phone, where the
   * question is not asked because the bar is not drawn either way.
   */
  letterBar?: LetterBar;
  /** What the learner said they are here for. Absent when they skipped it. */
  goals?: {
    reason?: string | null;
    target?: string | null;
    deadline?: string | null;
    daysPerWeek?: number;
    note?: string;
  };
}) {
  const ownerId = await requireUserId();
  const goal = Math.min(200, Math.max(5, Math.round(input.dailyGoal)));

  await Promise.all([
    writeSetting(ownerId, SETTING_KEYS.displayName, input.displayName.trim().slice(0, 32)),
    writeSetting(ownerId, SETTING_KEYS.cefrGoal, input.cefr),
    // The level somebody declares at sign-up is the best guess available until
    // they take the placement test, and the course needs *some* starting point
    // to decide what to open. The test overwrites it whenever they take it.
    writeSetting(ownerId, SETTING_KEYS.cefrPlacement, input.cefr),
    writeSetting(ownerId, SETTING_KEYS.dailyGoal, String(goal)),
    writeSetting(ownerId, SETTING_KEYS.letterBar, letterBarFrom(input.letterBar)),
    writeSetting(ownerId, SETTING_KEYS.onboardedAt, new Date().toISOString()),
    input.goals
      ? saveGoals(ownerId, normaliseGoals({
          reason: input.goals.reason ?? null,
          target: (input.goals.target ?? null) as Band | null,
          deadline: input.goals.deadline ?? null,
          daysPerWeek: input.goals.daysPerWeek ?? DEFAULT_DAYS_PER_WEEK,
          note: input.goals.note ?? "",
        }))
      : Promise.resolve(),
  ]);

  let added = 0;
  for (const unitId of input.unitIds.slice(0, 6)) {
    const result = await addUnitToDeck(unitId);
    if (result.ok) added += result.added;
  }

  revalidatePath("/");
  revalidatePath("/learn");
  return { ok: true as const, added };
}

/** Marks onboarding as seen without changing anything else. */
export async function skipOnboarding() {
  const ownerId = await requireUserId();
  await writeSetting(ownerId, SETTING_KEYS.onboardedAt, new Date().toISOString());
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * Adds every word of a path unit to the deck, with the card types that unit is
 * actually about — the rektsioon unit adds government cards, a noun unit adds
 * case-form cards. Already-present cards are skipped, so re-adding a unit after
 * finishing half of it costs nothing and loses no scheduling.
 */
export async function addUnitToDeck(unitId: string) {
  const ownerId = await requireUserId();
  const unit = unitById(unitId);
  if (!unit) return { ok: false as const, error: "That unit does not exist." };

  const lexemes = await prisma.lexeme.findMany({
    where: { lemma: { in: [...unit.lemmas] } },
    select: { id: true, lemma: true },
  });
  // Keep the unit's own order: the first cards someone sees should be the ones
  // the unit leads with, not whatever order Postgres returned.
  const order = new Map(unit.lemmas.map((l, i) => [l, i]));
  lexemes.sort((a, b) => (order.get(a.lemma) ?? 0) - (order.get(b.lemma) ?? 0));

  // addCardsFor rather than addToDeck: the owner is already resolved here, and
  // re-resolving it per word would validate the session with Supabase 20 times
  // for one click.
  let added = 0;
  for (const lexeme of lexemes) {
    const result = await addCardsFor(ownerId, lexeme.id, [...unit.cardTypes], "DICTIONARY");
    if (result.ok) added += result.added ?? 0;
  }

  revalidatePath("/learn");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, added, words: lexemes.length };
}

/**
 * Which card a lesson step is evidence about.
 *
 * A lesson is not a separate scoring system bolted onto the side of the app
 * (ADR-016): each step is a real question about a real card, so the answer
 * belongs in the same review log as everything else. Mapping the step kind to
 * the card type is what keeps that log honest — a gap-fill answered right is
 * evidence about the cloze card, not about recognition, and the weak-case
 * breakdown reads case steps as case practice because that is what they were.
 *
 * Listening maps to recognition: hearing a word and knowing what it means is
 * recognition, through the ear rather than the eye. There is no listening card
 * type to write to, and inventing one here to make the mapping prettier would
 * put a card type in the schema that nothing else generates.
 */
const STEP_CARD_TYPE: Record<string, CardType> = {
  choose: "RECOGNITION",
  listen: "RECOGNITION",
  produce: "PRODUCTION",
  type: "PRODUCTION",
  gap: "CLOZE",
  build: "CLOZE",
  case: "CASE_FORM",
  govern: "GOVERNMENT",
};

const LessonResultSchema = z.object({
  /** Client-generated, so a double submit settles rather than double-counts. */
  id: z.string().min(8).max(64),
  lemma: z.string().min(1).max(80),
  kind: z.string().min(1).max(16),
  correct: z.boolean(),
  durationMs: z.number().int().min(0).max(600_000),
});

const LESSON_RESULT_LIMIT = 80;

/**
 * Grades a set of answers against cards the learner already has.
 *
 * Shared by the lesson runner and the level checkpoints, which differ in exactly
 * one way: a lesson creates the cards first, because teaching a word is how it
 * enters the deck, while a checkpoint creates nothing. Sitting an exam is not a
 * request to start studying every word it happened to ask about, so a word with
 * no card is simply not graded — the answer still counts towards the mark, it
 * just has nowhere in the scheduler to land.
 *
 * Not exported: this file is `"use server"`, so an exported ownerId parameter
 * would let one learner write grades into another's deck.
 */
async function gradeAnswers(
  ownerId: string,
  answers: readonly { id: string; lemma: string; kind: string; correct: boolean; durationMs: number }[],
) {
  const lemmas = [...new Set(answers.map((a) => a.lemma))];
  const lexemes = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: { id: true, lemma: true },
  });
  const cards = await prisma.card.findMany({
    where: { ownerId, lexemeId: { in: lexemes.map((l) => l.id) }, suspended: false },
    select: { id: true, cardType: true, lexemeId: true },
  });

  const lemmaOf = new Map(lexemes.map((l) => [l.id, l.lemma]));
  const cardFor = new Map<string, string>();
  for (const card of cards) {
    const lemma = card.lexemeId ? lemmaOf.get(card.lexemeId) : undefined;
    // First card of a type wins: a word can have two cloze cards built from two
    // different sentences, and the question asked about the word, not about one
    // of them in particular.
    if (lemma && !cardFor.has(`${lemma}|${card.cardType}`)) {
      cardFor.set(`${lemma}|${card.cardType}`, card.id);
    }
  }

  // One grade per card, from every answer about it. Two wrong is an Again, one
  // is a Hard, none is a Good. Easy is deliberately never awarded: a lesson has
  // just taught the word, so getting it right is expected rather than evidence
  // that the interval should jump.
  const perCard = new Map<string, { wrong: number; ms: number; id: string }>();
  for (const answer of answers) {
    const cardType = STEP_CARD_TYPE[answer.kind];
    if (!cardType) continue;
    const cardId = cardFor.get(`${answer.lemma}|${cardType}`);
    if (!cardId) continue;
    const entry = perCard.get(cardId) ?? { wrong: 0, ms: 0, id: answer.id };
    entry.wrong += answer.correct ? 0 : 1;
    entry.ms += answer.durationMs;
    perCard.set(cardId, entry);
  }

  const batch: ReplayItem[] = [...perCard.entries()].map(([cardId, e]) => ({
    id: e.id,
    cardId,
    rating: (e.wrong === 0 ? 3 : e.wrong === 1 ? 2 : 1) as RatingValue,
    durationMs: e.ms,
    reviewedAt: Date.now(),
  }));

  const applied = await applyGradeBatch(ownerId, batch);
  return { ok: applied.ok, graded: batch.length, error: applied.error };
}

/**
 * Records a finished lesson.
 *
 * Called once, at the end. An abandoned lesson writes nothing at all, which is
 * the same rule the other modes follow (ADR-016) and the reason the session
 * holds its answers in memory rather than grading as it goes: a learner who
 * closes the tab halfway has not proved anything, and half a lesson's worth of
 * grades would tell the scheduler otherwise.
 *
 * It also adds the lesson's words to the deck. That ordering matters — the cards
 * have to exist before there is anything to grade — and it is why the lesson is
 * the natural way into a unit: finishing one leaves the words in the SRS with
 * their first real review already recorded, instead of leaving the learner to
 * press "add to deck" and then meet the words cold tomorrow.
 */
export async function completeLesson(
  unitId: string,
  results: z.input<typeof LessonResultSchema>[],
) {
  const ownerId = await requireUserId();
  const unit = unitById(unitId);
  if (!unit) return { ok: false as const, error: "That unit does not exist." };

  const parsed = z.array(LessonResultSchema).max(LESSON_RESULT_LIMIT).safeParse(results);
  if (!parsed.success) return { ok: false as const, error: "That lesson could not be recorded." };

  // Only words this unit actually teaches. The unit id and the lemmas both come
  // from the caller, and this file is "use server", so every export is an
  // endpoint: without this, a crafted call could grade any word in the
  // dictionary as though a lesson had asked about it.
  const taught = new Set(unit.lemmas);
  const answers = parsed.data.filter((r) => taught.has(r.lemma) && STEP_CARD_TYPE[r.kind]);
  if (answers.length === 0) return { ok: true as const, graded: 0, added: 0 };

  const lemmas = [...new Set(answers.map((r) => r.lemma))];
  const lexemes = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: { id: true, lemma: true },
  });

  let added = 0;
  for (const lexeme of lexemes) {
    const result = await addCardsFor(ownerId, lexeme.id, [...unit.cardTypes], "DICTIONARY");
    if (result.ok) added += result.added ?? 0;
  }

  const applied = await gradeAnswers(ownerId, answers);
  if (!applied.ok) return { ok: false as const, error: applied.error ?? "Could not record the lesson." };
  await checkAchievementsFor(ownerId);
  revalidatePath("/learn");
  revalidatePath(`/learn/${unitId}`);
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, graded: applied.graded, added };
}

/**
 * Records where the placement test put somebody.
 *
 * The level is re-derived here from the per-level scores rather than trusted
 * from the caller. This file is `"use server"`, so `savePlacement("C1")` is an
 * endpoint anybody can call — and while placing yourself at C1 only unlocks
 * units you could have opened anyway, a stored level that no test produced would
 * quietly become a lie the whole path is built on.
 */
const StageScoreSchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  correct: z.number().int().min(0).max(20),
  asked: z.number().int().min(0).max(20),
});

export async function savePlacement(scores: z.input<typeof StageScoreSchema>[]) {
  const ownerId = await requireUserId();
  const parsed = z.array(StageScoreSchema).max(12).safeParse(scores);
  if (!parsed.success) return { ok: false as const, error: "That result could not be read." };

  const clean = parsed.data.filter((s) => s.correct <= s.asked);
  const level = placementResult(clean);
  await writeSetting(ownerId, SETTING_KEYS.cefrPlacement, level);

  revalidatePath("/learn");
  revalidatePath("/");
  return { ok: true as const, level };
}

/**
 * Records a level checkpoint.
 *
 * Passing moves the learner up, and only ever up: a C1 speaker who takes the A2
 * checkpoint for fun should not be demoted to A2 by passing it. Failing changes
 * nothing at all — a checkpoint is a measurement, and a bad evening is not
 * evidence that somebody has lost a level they already had.
 *
 * The score is re-checked here rather than trusted. Every export in this file is
 * a public endpoint, so `recordCheckpoint("c1", 20, 20)` is a call anybody can
 * make; what it can buy is only the level marker the path uses to decide what to
 * open by default, and nothing in the review log moves, but a stored level that
 * no exam produced is still a lie the whole course is arranged around.
 */
export async function recordCheckpoint(
  level: string,
  correct: number,
  total: number,
  answers: z.input<typeof LessonResultSchema>[] = [],
) {
  const ownerId = await requireUserId();
  const parsed = z.object({
    level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
    correct: z.number().int().min(0).max(100),
    total: z.number().int().min(1).max(100),
  }).safeParse({ level: level.toUpperCase(), correct, total });
  if (!parsed.success || parsed.data.correct > parsed.data.total) {
    return { ok: false as const, error: "That result could not be read." };
  }

  // Twenty typed productions on cards the learner owns is real retrieval
  // practice, and ADR-016 wants the scheduler to see what was actually
  // practised. It grades what has a card and silently skips what does not: a
  // checkpoint may ask about words from units the learner has never opened, and
  // sitting an exam is not a request to start studying them.
  const graded = z.array(LessonResultSchema).max(LESSON_RESULT_LIMIT).safeParse(answers);
  if (graded.success && graded.data.length > 0) {
    // Only words this level actually teaches, the same restriction completeLesson
    // puts on a unit. Every export here is a public endpoint, so without it a
    // crafted call could post a Good against any card in the caller's deck and
    // move its schedule without anybody having answered anything. The damage
    // would be self-inflicted, but `Review` is append-only and feeds FSRS
    // optimisation, so a grade for a review that never happened is a lie that
    // cannot be taken back out.
    const taughtHere = new Set(wordsAtLevel(parsed.data.level).map((w) => w.lemma));
    const own = graded.data.filter((a) => taughtHere.has(a.lemma));
    if (own.length > 0) await gradeAnswers(ownerId, own);
  }

  const checkpoint = checkpointFor(parsed.data.level);
  const passedIt = checkpointPassed(parsed.data.correct, parsed.data.total, checkpoint.passMark);
  if (!passedIt) return { ok: true as const, passed: false, level: null };

  const current = await readSetting(ownerId, SETTING_KEYS.cefrPlacement);
  const currentLevel = (LEVELS as readonly string[]).includes(current ?? "")
    ? (current as (typeof LEVELS)[number])
    : "A1";
  const next = LEVELS[Math.min(levelIndex(parsed.data.level) + 1, LEVELS.length - 1)]!;
  const promoted = levelIndex(next) > levelIndex(currentLevel) ? next : currentLevel;
  await writeSetting(ownerId, SETTING_KEYS.cefrPlacement, promoted);

  revalidatePath("/learn");
  revalidatePath("/");
  return { ok: true as const, passed: true, level: promoted };
}

// ────────────────────────────── Classrooms ─────────────────────────────────

/** How many attempts to find an unused join code before giving up. */
const CODE_ATTEMPTS = 8;

/**
 * Creates a class and makes the caller its teacher.
 *
 * The display name is copied onto the membership at join time rather than
 * looked up live, so a learner changing what they call themselves later does
 * not silently rename someone halfway through a term.
 */
export async function createClassroom(name: string) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "createClassroom");
  if (busy) return busy;
  const trimmed = name.trim().slice(0, 60);
  if (trimmed.length < 2) return { ok: false as const, error: "Give the class a name." };

  let code = "";
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const candidate = generateCode();
    const taken = await prisma.classroom.findUnique({ where: { code: candidate }, select: { id: true } });
    if (!taken) { code = candidate; break; }
  }
  if (!code) return { ok: false as const, error: "Could not allocate a join code. Try again." };

  const displayName = await resolveDisplayName(ownerId);
  const classroom = await prisma.classroom.create({
    data: {
      name: trimmed,
      code,
      ownerId,
      members: { create: { ownerId, role: "TEACHER", displayName } },
    },
  });

  revalidatePath("/class");
  return { ok: true as const, id: classroom.id, code };
}

/**
 * Joins a class by its code.
 *
 * Joining is the consent: from here the teacher and classmates can see this
 * learner's name, streak, weekly XP and how many words they know. The screen
 * says so before the button is pressed — nothing about a class is retroactive
 * or hidden, and leaving removes the membership and nothing else.
 */
export async function joinClassroom(code: string, displayName?: string) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "joinClassroom");
  if (busy) return busy;
  if (!isValidCode(code)) {
    return { ok: false as const, error: "That is not a valid join code." };
  }

  const classroom = await prisma.classroom.findUnique({
    where: { code: normaliseCode(code) },
    select: { id: true, name: true, archived: true },
  });
  if (!classroom || classroom.archived) {
    return { ok: false as const, error: "No class with that code." };
  }

  const name = displayName?.trim().slice(0, 32) || await resolveDisplayName(ownerId);
  if (!name) return { ok: false as const, error: "Pick a name your class will recognise." };

  await prisma.classroomMember.upsert({
    where: { classroomId_ownerId: { classroomId: classroom.id, ownerId } },
    create: { classroomId: classroom.id, ownerId, displayName: name },
    update: { displayName: name },
  });
  // The name they chose here becomes their name elsewhere too, rather than
  // keeping two that can disagree.
  await writeSetting(ownerId, SETTING_KEYS.displayName, name);

  revalidatePath("/class");
  revalidatePath("/progress");
  return { ok: true as const, id: classroom.id, name: classroom.name };
}

/** Leaves a class. Removes the membership row and nothing else — no deck, no history. */
export async function leaveClassroom(classroomId: string) {
  const ownerId = await requireUserId();
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { ownerId: true },
  });
  if (classroom?.ownerId === ownerId) {
    return { ok: false as const, error: "You teach this class. Archive it instead of leaving." };
  }
  await prisma.classroomMember.deleteMany({ where: { classroomId, ownerId } });
  revalidatePath("/class");
  return { ok: true as const };
}

/** Archives a class the caller teaches: the code stops working, the data stays. */
export async function archiveClassroom(classroomId: string) {
  const ownerId = await requireUserId();
  const updated = await prisma.classroom.updateMany({
    where: { id: classroomId, ownerId },
    data: { archived: true },
  });
  if (updated.count === 0) return { ok: false as const, error: "That is not your class." };
  revalidatePath("/class");
  return { ok: true as const };
}

/**
 * Sets a unit as homework for everyone in the class.
 *
 * This writes a Task into each member's own list rather than inventing a
 * separate assignments system: the learner already has one place where work
 * they owe lives, and homework from class belongs in it. Nobody's deck is
 * touched — the task says what to do, the student decides when.
 */
export async function assignUnit(classroomId: string, unitId: string, dueAt?: string) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "assignUnit");
  if (busy) return busy;
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, ownerId },
    select: { id: true, name: true },
  });
  if (!classroom) return { ok: false as const, error: "That is not your class." };

  const unit = unitById(unitId);
  if (!unit) return { ok: false as const, error: "That unit does not exist." };

  const members = await prisma.classroomMember.findMany({
    where: { classroomId },
    select: { ownerId: true },
  });

  const due = dueAt ? new Date(dueAt) : null;
  await prisma.task.createMany({
    data: members.map((m) => ({
      ownerId: m.ownerId,
      title: `${unit.title}, ${unit.subtitle}`,
      notes: `Set by ${classroom.name}. Open the unit on the learning path, add its words and review them.`,
      tag: "VOCABULARY",
      dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    })),
  });

  revalidatePath("/class");
  revalidatePath("/tasks");
  return { ok: true as const, assigned: members.length };
}

/** The marker every classroom-issued task's `notes` starts with, teacher and student alike. */
function classworkMarker(classroomName: string): string {
  return `Set by ${classroomName}.`;
}

/**
 * Sets anything as homework, not just a unit — a page number, an exercise from
 * the textbook, a sentence to write, whatever the lesson actually was. A join
 * code and a roster do not make a classroom feature on their own if the only
 * thing a teacher can hand out is one of eighty-three fixed units; most
 * homework is not a unit.
 *
 * Same shape as `assignUnit` on purpose — one task per member, nobody's deck
 * touched, the teacher's own copy of the task (they are a member too) is what
 * lets the class page read its own history back without a table to hold it.
 */
export async function assignHomework(classroomId: string, title: string, notes: string, dueAt?: string) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "assignHomework");
  if (busy) return busy;
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, ownerId },
    select: { id: true, name: true },
  });
  if (!classroom) return { ok: false as const, error: "That is not your class." };

  const cleanTitle = capped(title, LIMITS.taskTitle);
  if (!cleanTitle) return { ok: false as const, error: "Give the homework a title." };
  const cleanNotes = capped(notes, LIMITS.taskNotes - classworkMarker(classroom.name).length - 1);

  const members = await prisma.classroomMember.findMany({
    where: { classroomId },
    select: { ownerId: true },
  });

  const due = dueAt ? new Date(dueAt) : null;
  const marker = classworkMarker(classroom.name);
  await prisma.task.createMany({
    data: members.map((m) => ({
      ownerId: m.ownerId,
      title: cleanTitle,
      notes: cleanNotes ? `${marker} ${cleanNotes}` : marker,
      tag: "HOMEWORK",
      dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    })),
  });

  revalidatePath("/class");
  revalidatePath("/tasks");
  return { ok: true as const, assigned: members.length };
}

/**
 * What a teacher has sent this class, most recent first.
 *
 * There is no table for this, deliberately: an assignment is a `Task` on
 * every member, and the teacher is a member too (they joined their own class
 * at creation), so their own copy of each task they ever assigned already
 * carries the record. Reading it back is a filter on the marker every
 * classroom-issued task's `notes` starts with, not a new source of truth to
 * keep in sync with the real one.
 *
 * The one place this heuristic can be fooled: two classes taught by the same
 * teacher with the exact same name would share a marker. Rare enough, and
 * visible enough if it happens, not to be worth a schema change over.
 */
export async function classworkHistory(classroomId: string) {
  const ownerId = await requireUserId();
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, ownerId },
    select: { name: true },
  });
  if (!classroom) return [];

  const marker = classworkMarker(classroom.name);
  const tasks = await prisma.task.findMany({
    where: { ownerId, notes: { startsWith: marker } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, notes: true, dueAt: true, createdAt: true },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.notes?.slice(marker.length).trim() || null,
    dueAt: t.dueAt,
    createdAt: t.createdAt,
  }));
}

/** The name to show in a class: their chosen one, else their account's. */
async function resolveDisplayName(ownerId: string): Promise<string> {
  const stored = await readSetting(ownerId, SETTING_KEYS.displayName);
  if (stored?.trim()) return stored.trim().slice(0, 32);
  const learner = await currentLearner();
  return learner.name === "you" ? "A learner" : learner.name.slice(0, 32);
}

// ─────────────────────────────── Tasks ────────────────────────────────────

export async function createTask(input: {
  title: string; tag: string; classWeek?: number | null; dueAt?: string | null; notes?: string;
}) {
  const ownerId = await requireUserId();
  const title = capped(input.title, LIMITS.taskTitle);
  if (!title) return { ok: false as const, error: "A task needs a title." };
  await prisma.task.create({
    data: {
      ownerId,
      title,
      tag: input.tag,
      classWeek: input.classWeek ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      notes: input.notes?.trim() || null,
    },
  });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true as const };
}

export async function toggleTask(id: string) {
  const ownerId = await requireUserId();
  const task = await prisma.task.findFirst({ where: { id, ownerId }, select: { completed: true } });
  if (!task) return { ok: false as const };
  await prisma.task.update({
    where: { id },
    data: { completed: !task.completed, completedAt: task.completed ? null : new Date() },
  });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteTask(id: string) {
  const ownerId = await requireUserId();
  await prisma.task.deleteMany({ where: { id, ownerId } });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true as const };
}

// ─────────────────────────────── The course week ──────────────────────────

// Not exported: every export of a "use server" file is a public endpoint, and a
// constant is not an endpoint.
const CURRENT_WEEK_KEY = "currentWeek";

/** The course week the learner says they are in. Null until they set one. */
async function currentClassWeek(ownerId: string): Promise<number | null> {
  const setting = await prisma.setting.findUnique({
    where: { ownerId_key: { ownerId, key: CURRENT_WEEK_KEY } },
  });
  if (!setting) return null;
  const week = Number(setting.value);
  return Number.isInteger(week) && week > 0 ? week : null;
}

export async function getCurrentWeek() {
  return currentClassWeek(await requireUserId());
}

/**
 * Sets the course week. Everything added from now on is filed under it, which is
 * what turns `classWeek` from a stored column into a lens over the whole app.
 */
export async function setCurrentWeek(week: number | null) {
  const ownerId = await requireUserId();
  if (week === null) {
    await prisma.setting.deleteMany({ where: { ownerId, key: CURRENT_WEEK_KEY } });
  } else {
    const clamped = Math.max(1, Math.min(60, Math.round(week)));
    await prisma.setting.upsert({
      where: { ownerId_key: { ownerId, key: CURRENT_WEEK_KEY } },
      create: { ownerId, key: CURRENT_WEEK_KEY, value: String(clamped) },
      update: { value: String(clamped) },
    });
  }
  revalidatePath("/");
  revalidatePath("/week");
  return { ok: true as const };
}

/** Files (or unfiles) every card of one word under a week. */
export async function setWordWeek(lexemeId: string, week: number | null) {
  const ownerId = await requireUserId();
  const classWeek = week === null ? null : Math.max(1, Math.min(60, Math.round(week)));
  await prisma.card.updateMany({ where: { ownerId, lexemeId }, data: { classWeek } });
  revalidatePath("/week");
  revalidatePath("/words");
  return { ok: true as const };
}

// ──────────────────────── Gap-fill from pasted reading ─────────────────────

/**
 * Turns a passage the learner pasted into gap-fill exercises.
 *
 * Only words already in their deck are blanked, which makes this practice
 * rather than a comprehension test: every gap is a word they chose to learn,
 * now in a sentence a native writer actually produced. The answer comes out of
 * their own text, so nothing is generated.
 *
 * The passage is never stored. It is somebody's homework, a news article or a
 * private message, and the app has no reason to keep it.
 */
export async function buildClozeFromText(text: string) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "buildCloze");
  if (busy) return busy;
  const passage = text.slice(0, MAX_PASSAGE_CHARS);
  if (!passage.trim()) return { ok: false as const, error: "Paste some Estonian first." };

  const cards = await prisma.card.findMany({
    where: { ownerId, lexemeId: { not: null } },
    select: { id: true, lexemeId: true, cardType: true },
    take: 4000,
  });
  const lexemeIds = [...new Set(cards.map((c) => c.lexemeId).filter((id): id is string => !!id))];

  // ADR-016: filling a gap is evidence about the word, so the round grades the
  // same card the daily loop would rather than scoring itself.
  const cardFor = new Map<string, string>();
  for (const c of cards) {
    if (!c.lexemeId) continue;
    const better = c.cardType === "CASE_FORM" || c.cardType === "PRODUCTION";
    if (!cardFor.has(c.lexemeId) || better) cardFor.set(c.lexemeId, c.id);
  }

  if (lexemeIds.length === 0) {
    return {
      ok: false as const,
      error: "Your deck is empty, so there is nothing to look for in that text yet.",
    };
  }

  const lexemes = await prisma.lexeme.findMany({
    where: { id: { in: lexemeIds } },
    select: {
      id: true, lemma: true, translation: true,
      forms: { select: { value: true, formType: true, morphName: true } },
    },
  });

  const known: KnownForm[] = [];
  for (const lexeme of lexemes) {
    // The headword counts: meeting it in a real sentence is worth drilling even
    // when it is not inflected.
    known.push({
      value: lexeme.lemma, lexemeId: lexeme.id, lemma: lexeme.lemma,
      translation: lexeme.translation, formLabel: "dictionary form",
    });
    for (const form of lexeme.forms) {
      known.push({
        value: form.value,
        lexemeId: lexeme.id,
        lemma: lexeme.lemma,
        translation: lexeme.translation,
        formLabel: formName(form)?.et ?? form.morphName ?? "form",
      });
    }
  }

  const items = buildPassageCloze(passage, known)
    .map((item) => ({ ...item, cardId: cardFor.get(item.lexemeId) ?? null }))
    .filter((item) => item.cardId !== null);
  if (items.length === 0) {
    return {
      ok: false as const,
      error:
        "No words from your deck turned up in that text. Try a longer passage, or add some of " +
        "its vocabulary from the dictionary first.",
    };
  }

  return { ok: true as const, items };
}

// ─────────────────────────────── Account ──────────────────────────────────

/**
 * Deletes everything belonging to this account.
 *
 * The privacy page promises this, so it has to exist — a promise about data the
 * software cannot keep is worse than no promise.
 *
 * The review log is deleted here and only here. Append-only means no updates and
 * no incidental deletes, not that a person cannot ask for their own history to
 * be erased, which is the one request that outranks the invariant. It all goes
 * in one transaction, so a half-deleted account is not a reachable state.
 *
 * The shared dictionary stays: removing a word other learners hold cards for
 * would delete *their* data to satisfy this request. The attribution on anything
 * this person edited is cleared instead.
 */
export async function deleteMyAccount(confirmation: string) {
  const ownerId = await requireUserId();
  if (confirmation.trim().toLowerCase() !== "delete") {
    return { ok: false as const, error: 'Type "delete" to confirm.' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.review.deleteMany({ where: { ownerId } });
      await tx.card.deleteMany({ where: { ownerId } });
      await tx.task.deleteMany({ where: { ownerId } });
      await tx.message.deleteMany({ where: { ownerId } });
      await tx.starredWord.deleteMany({ where: { ownerId } });
      await tx.achievement.deleteMany({ where: { ownerId } });
      await tx.setting.deleteMany({ where: { ownerId } });
      await tx.usageEvent.deleteMany({ where: { ownerId } });
      await tx.scan.deleteMany({ where: { ownerId } });
      /*
        Append-only means never edited, not never erased on request. A level
        check is a measurement of this person and it goes with the rest of
        them, or the deletion promise on /privacy is not one.
      */
      await tx.assessment.deleteMany({ where: { ownerId } });
      /*
        And a mock sitting, for the same reason and more strongly. It is the
        only table holding something the learner composed at length: the
        marked paper carries the writing part back verbatim. That was left
        behind by every deletion this app performed until now, which made the
        one category of free-form writing in the schema the one category that
        survived "delete everything".
      */
      await tx.examAttempt.deleteMany({ where: { ownerId } });
      /*
        Their membership of somebody else's class, which carries the name they
        chose to be known by in it. A class they run goes too, and its roster
        rows cascade with it: the code, the name and the roster all hang off a
        teacher who no longer exists, and there is no owner to hand them to. It
        costs the pupils nothing they own — a membership row is a display name
        and a join date, and every card, review and level check any of them
        made is theirs and stays where it is.
      */
      await tx.classroomMember.deleteMany({ where: { ownerId } });
      await tx.classroom.deleteMany({ where: { ownerId } });
      /*
        What they reported as wrong. Their own words, and a reply written to
        them, so it goes with the rest of them. A report they sent that was
        already accepted has changed the shared dictionary and that change
        stays, exactly as an edit they made by hand does: undoing it would
        delete other learners' data to satisfy this request. What is removed
        is the row that ties the report to a person.
      */
      await tx.suggestion.deleteMany({ where: { ownerId } });
      await tx.lexeme.updateMany({ where: { editedBy: ownerId }, data: { editedBy: null } });
      /*
        And the attribution on anything they reviewed, for the same reason the
        line above clears `editedBy`: a decision stays on the record, the name
        against it does not.
      */
      await tx.suggestion.updateMany({ where: { reviewedBy: ownerId }, data: { reviewedBy: null } });
    }, { timeout: 120_000 });
  } catch (error) {
    return {
      ok: false as const,
      error: `Nothing was deleted. The operation did not complete. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    };
  }

  /*
    AND THEN THE IDENTITY, WHICH IS NOT IN ANY OF THOSE TABLES.

    Everything above is this app's schema. The email address, the Google
    subject id and the sign-in history live in Supabase Auth, and deleting the
    rows left all of it behind with no route to remove it and nothing on the
    page saying so. An email address is personal data wherever it is kept, so
    "delete everything" that keeps it is not the promise /privacy makes.

    Deliberately after the transaction and outside it: the rows are already
    gone and must stay gone whatever the auth store answers. A failure here is
    reported to the learner as what is left rather than as a failed deletion,
    because those are different facts and only one of them needs following up.
  */
  const identity = await eraseAuthIdentity(ownerId);

  return { ok: true as const, remaining: remainingIdentityNote(identity) };
}

// ────────────────────────────── Backup restore ─────────────────────────────

const BackupSchema = z.object({
  // Accepts the pre-rename id too: a backup written yesterday must still restore.
  format: z.union([z.literal("kodukeel-v1"), z.literal("sonasepp-v1")]),
  lexemes: z.array(z.record(z.unknown())),
  cards: z.array(z.record(z.unknown())),
  reviews: z.array(z.record(z.unknown())),
  tasks: z.array(z.record(z.unknown())),
  /*
    Optional, because a backup written before scanned pages existed has no such
    key and must still restore. A missing key is an empty list, never a refusal:
    the whole point of the restore path is that a file you saved months ago
    still works.
  */
  scans: z.array(z.record(z.unknown())).optional(),
  /*
    Optional for the same reason `scans` is: a file written before the export
    carried them has no such key and must still restore. Every one of these is
    personal data the export is now required to contain, so a restore that
    ignored them would hand somebody a complete copy of their data and then
    refuse to put most of it back.
  */
  settings: z.array(z.record(z.unknown())).optional(),
  messages: z.array(z.record(z.unknown())).optional(),
  assessments: z.array(z.record(z.unknown())).optional(),
  stars: z.array(z.record(z.unknown())).optional(),
  achievements: z.array(z.record(z.unknown())).optional(),
  /*
    A sat mock paper, which is the one row in a backup holding something the
    learner wrote at length. Restoring it matters more than any other optional
    key here for exactly that reason: a replace that dropped it would delete a
    composition on the way to putting a deck back.

    Classes are in the export and deliberately not here. A join code is unique
    across an installation, so restoring one either collides with a live class
    or resurrects a code somebody else is now using, and a class with its
    roster gone is a room with no one in it. The copy is for the learner to
    read; rejoining is one code away.
  */
  examAttempts: z.array(z.record(z.unknown())).optional(),
});

export interface RestoreSummary {
  words: number;
  cards: number;
  reviews: number;
  tasks: number;
  /** Photographed pages. Absent from a backup written before they existed. */
  scans: number;
  /** Settings, messages, level checks, exam papers, stars and badges, together. */
  personal: number;
}

/** Reads a backup file and reports what is in it, without writing anything. */
/**
 * Reads a backup file without writing anything. Requires a session: it is a
 * public endpoint that parses JSON supplied by whoever called it.
 */
export async function inspectBackup(json: string): Promise<
  { ok: true; summary: RestoreSummary } | { ok: false; error: string }
> {
  await requireUserId();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file isn't valid JSON. Pick the .json file you downloaded from Settings." };
  }
  const result = BackupSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: "That doesn't look like a Kodukeel backup. It should be the file downloaded from Settings." };
  }
  const b = result.data;
  return {
    ok: true,
    summary: {
      words: b.lexemes.length, cards: b.cards.length, reviews: b.reviews.length,
      tasks: b.tasks.length, scans: b.scans?.length ?? 0,
      personal:
        (b.settings?.length ?? 0) + (b.messages?.length ?? 0) +
        (b.assessments?.length ?? 0) + (b.stars?.length ?? 0) +
        (b.achievements?.length ?? 0) + (b.examAttempts?.length ?? 0),
    },
  };
}

/**
 * Restores a backup.
 *
 * `merge` is the default and never deletes: rows are written by their original id,
 * so restoring the same file twice changes nothing and restoring onto a live deck
 * cannot lose work. `replace` wipes first, and is the only path that can destroy
 * review history — so it is behind an explicit choice in the UI.
 *
 * A backup you have never restored is a hypothesis, which is why this exists at all.
 */
export async function restoreBackup(json: string, mode: "merge" | "replace") {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "restoreBackup");
  if (busy) return busy;
  const check = await inspectBackup(json);
  if (!check.ok) return { ok: false as const, error: check.error };

  const backup = BackupSchema.parse(JSON.parse(json));

  try {
    await prisma.$transaction(async (tx) => {
      if (mode === "replace") {
        // Scoped to this user's own data only — Lexeme/Form are the shared
        // dictionary and must never be wiped by one person's restore.
        //
        // Reviews are deliberately untouched. They are append-only facts about
        // what happened, they are the input to FSRS optimisation, and they are
        // the one thing a restore cannot recreate. A replace rebuilds the deck;
        // it does not rewrite history. Rows whose card is gone stay as orphans,
        // which is why Review carries its own ownerId and no foreign key.
        await tx.card.deleteMany({ where: { ownerId } });
        await tx.task.deleteMany({ where: { ownerId } });
        await tx.scan.deleteMany({ where: { ownerId } });
      }

      // Shared dictionary: upserted as-is, benefits every user, never deleted here.
      for (const raw of backup.lexemes) {
        const { forms, ...lex } = raw as Record<string, unknown> & { forms?: unknown[] };
        const data = revive(lex, ["createdAt", "updatedAt"]);
        delete data.starred; // dropped field from a pre-multi-user backup
        await tx.lexeme.upsert({
          where: { id: String(data.id) },
          create: data as never,
          update: data as never,
        });
        await tx.form.deleteMany({ where: { lexemeId: String(data.id) } });
        if (Array.isArray(forms) && forms.length) {
          await tx.form.createMany({ data: forms.map((f) => revive(f as Record<string, unknown>, [])) as never });
        }
      }

      // Cards/tasks are always attributed to the person restoring them, regardless
      // of what the backup file says — restoring "my backup" always means "my data".
      for (const raw of backup.cards) {
        const data = revive(raw, ["due", "lastReview", "createdAt"]);
        data.ownerId = ownerId;
        const existing = await tx.card.findUnique({ where: { id: String(data.id) }, select: { ownerId: true } });
        if (existing && existing.ownerId !== ownerId) continue; // id collision with another user's card — skip
        await tx.card.upsert({ where: { id: String(data.id) }, create: data as never, update: data as never });
      }

      // Reviews are append-only, so they are created if absent and never updated.
      // Always attributed to the person restoring: a backup is your own history,
      // and the file cannot be allowed to name someone else as its owner.
      for (const raw of backup.reviews) {
        const data = revive(raw, ["reviewedAt"]);
        const exists = await tx.review.findUnique({ where: { id: String(data.id) }, select: { id: true } });
        if (exists) continue;
        data.ownerId = ownerId;
        await tx.review.create({ data: data as never });
      }

      for (const raw of backup.tasks) {
        const data = revive(raw, ["dueAt", "completedAt", "createdAt"]);
        data.ownerId = ownerId;
        const existing = await tx.task.findUnique({ where: { id: String(data.id) }, select: { ownerId: true } });
        if (existing && existing.ownerId !== ownerId) continue;
        await tx.task.upsert({ where: { id: String(data.id) }, create: data as never, update: data as never });
      }

      // Photographed pages, on the same terms as everything else here: written
      // by their original id so a second restore changes nothing, and always
      // attributed to whoever is restoring. The item list is re-checked on the
      // way in rather than trusted, because the file is supplied by its caller.
      for (const raw of backup.scans ?? []) {
        const data = revive(raw, ["createdAt"]);
        data.ownerId = ownerId;
        data.items = serialiseItems(parseItems(
          typeof data.items === "string" ? data.items : null, SCAN_MAX_ITEMS,
        ));
        data.title = capped(typeof data.title === "string" ? data.title : "", MAX_SCAN_TITLE);
        if (!data.title) data.title = "A page";
        const existing = await tx.scan.findUnique({ where: { id: String(data.id) }, select: { ownerId: true } });
        if (existing && existing.ownerId !== ownerId) continue;
        await tx.scan.upsert({ where: { id: String(data.id) }, create: data as never, update: data as never });
      }

      /*
        THE FIVE THAT USED TO BE EXPORTED NOWHERE AND RESTORED NOWHERE.

        Settings, the conversations with Anu, the level checks, the starred
        words and the badges. All of them are keyed by the owner, so all of
        them are attributed to whoever is restoring rather than to whatever the
        file claims, exactly like cards and reviews above.

        A level check is append-only, like a review: created if absent and
        never updated, so restoring the same file twice leaves the history it
        measured alone. The other four are upserts, because a setting or a star
        is a current value rather than a fact about a moment.
      */
      for (const raw of backup.settings ?? []) {
        const data = revive(raw, []);
        const key = String(data.key ?? "");
        if (!key) continue;
        const value = String(data.value ?? "");
        await tx.setting.upsert({
          where: { ownerId_key: { ownerId, key } },
          create: { ownerId, key, value },
          update: { value },
        });
      }

      for (const raw of backup.messages ?? []) {
        const data = revive(raw, ["createdAt"]);
        data.ownerId = ownerId;
        const exists = await tx.message.findUnique({ where: { id: String(data.id) }, select: { id: true } });
        if (exists) continue;
        await tx.message.create({ data: data as never });
      }

      for (const raw of backup.assessments ?? []) {
        const data = revive(raw, ["takenAt"]);
        data.ownerId = ownerId;
        const exists = await tx.assessment.findUnique({ where: { id: String(data.id) }, select: { id: true } });
        if (exists) continue;
        await tx.assessment.create({ data: data as never });
      }

      for (const raw of backup.examAttempts ?? []) {
        const data = revive(raw, ["startedAt", "finishedAt"]);
        data.ownerId = ownerId;
        const exists = await tx.examAttempt.findUnique({ where: { id: String(data.id) }, select: { id: true } });
        if (exists) continue;
        await tx.examAttempt.create({ data: data as never });
      }

      for (const raw of backup.stars ?? []) {
        const data = revive(raw, ["createdAt"]);
        const lexemeId = String(data.lexemeId ?? "");
        if (!lexemeId) continue;
        /*
          A star points at a dictionary entry with a real foreign key, and a
          merge onto a database that does not hold that entry would abort the
          whole transaction over a bookmark. The backup carries the dictionary,
          so this normally finds it; when it does not, one lost star is the
          right price for the rest of the restore completing.
        */
        const lexeme = await tx.lexeme.findUnique({ where: { id: lexemeId }, select: { id: true } });
        if (!lexeme) continue;
        await tx.starredWord.upsert({
          where: { ownerId_lexemeId: { ownerId, lexemeId } },
          create: { ownerId, lexemeId, ...(data.createdAt ? { createdAt: data.createdAt as Date } : {}) },
          update: {},
        });
      }

      for (const raw of backup.achievements ?? []) {
        const data = revive(raw, ["earnedAt"]);
        const key = String(data.key ?? "");
        if (!key) continue;
        await tx.achievement.upsert({
          where: { ownerId_key: { ownerId, key } },
          create: { ownerId, key, ...(data.earnedAt ? { earnedAt: data.earnedAt as Date } : {}) },
          update: {},
        });
      }
    }, { timeout: 120_000 });
  } catch (error) {
    return {
      ok: false as const,
      error: `The restore did not finish, and nothing was changed. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  revalidatePath("/");
  revalidatePath("/words");
  revalidatePath("/tasks");
  revalidatePath("/dictionary");
  revalidatePath("/scan");
  revalidatePath("/settings");
  revalidatePath("/progress");
  return { ok: true as const, summary: check.summary };
}

// ───────────────────────────── Scanned pages ──────────────────────────────

/**
 * A photographed page, once a person has looked at what came back.
 *
 * WHAT MAKES THIS SAFE IS THE TICK, not the transcription. A model read the
 * picture and the dictionary vouched for the words it recognised, but the
 * confirmation screen is where somebody holding the actual paper agrees that
 * this is what is on it. That is the same standard the paste importer has
 * always met (a human copied the list), and it is why a word the dictionary
 * has never heard of can still become a card: not because the model said so,
 * but because the learner did.
 *
 * A word that matched the dictionary brings its own principal parts and its
 * retrieved forms, so its cards are built from attested forms and nothing the model
 * wrote survives into them. A word that did not becomes a plain USER entry
 * with recognition and production cards only, exactly like a pasted line: no
 * case-form card, because there are no forms to derive one from.
 */
const MAX_SCAN_TITLE = 80;

export async function saveScan(input: {
  title: string;
  items: unknown;
  /** Whether to build flashcards now, or just keep the page. */
  addCards: boolean;
}) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "saveScan");
  if (busy) return busy;
  const items = sanitiseItems(input.items, SCAN_MAX_ITEMS);
  if (items.length === 0) {
    return { ok: false as const, error: "Nothing on that page was ticked." };
  }

  const title = capped(input.title, MAX_SCAN_TITLE) || "A page";

  /*
    An id from the client is an id the client chose, and this file is
    "use server", so every argument is attacker-controllable. Resolving the
    ids against the dictionary here means a row can only ever point at a
    Lexeme that exists, and a row whose id has gone stale falls back to being
    treated as a new word rather than silently attaching cards to whatever now
    holds that id.
  */
  const claimed = items.map((i) => i.lexemeId).filter((id): id is string => id !== null);
  const known = claimed.length
    ? await prisma.lexeme.findMany({
        where: { id: { in: claimed } },
        select: { id: true, lemma: true, translation: true },
      })
    : [];
  const byId = new Map(known.map((l) => [l.id, l]));

  const stored: typeof items = [];
  let cards = 0;
  let created = 0;

  for (const item of items) {
    const match = item.lexemeId ? byId.get(item.lexemeId) : undefined;
    let lexemeId = match?.id ?? null;
    let lemma = match?.lemma ?? null;
    let translation = match?.translation ?? null;

    if (!lexemeId) {
      // Not in the dictionary, and ticked anyway. Stored as the learner's own
      // entry, attributed to them, with the page's gloss as its English.
      const lemmaText = capped(item.et, LIMITS.lemma);
      const pos = guessPos(lemmaText);
      const existing = await prisma.lexeme.findUnique({
        where: { lemma_pos: { lemma: lemmaText, pos } },
        select: { id: true, lemma: true, translation: true },
      });
      const row = existing ?? await prisma.lexeme.create({
        data: {
          lemma: lemmaText,
          pos,
          translation: capped(item.en, LIMITS.translation) || NEEDS_TRANSLATION,
          provenance: "USER",
          editedBy: ownerId,
          editedAt: new Date(),
        },
        select: { id: true, lemma: true, translation: true },
      });
      if (!existing) created += 1;
      lexemeId = row.id;
      lemma = row.lemma;
      translation = row.translation;
    }

    stored.push({ ...item, lexemeId, lemma, translation });

    if (input.addCards) {
      // Only what the word can actually support. A hand-added entry has no
      // forms, so asking for a case-form card would produce nothing; a matched
      // one may carry every form and deserves the lot.
      const lexeme = await prisma.lexeme.findUnique({
        where: { id: lexemeId },
        include: { forms: true },
      });
      const types = lexeme
        ? availableCardTypes(lexeme as LexemeForCards)
        : (["RECOGNITION", "PRODUCTION"] as CardType[]);
      const result = await addCardsFor(ownerId, lexemeId, types, "SCAN");
      if (result.ok) cards += result.added ?? 0;
    }
  }

  const scan = await prisma.scan.create({
    data: { ownerId, title, items: serialiseItems(stored) },
    select: { id: true },
  });

  revalidatePath("/scan");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, id: scan.id, words: stored.length, cards, created };
}

/** Adds every word on a saved page that is not in the deck yet. */
export async function addScanToDeck(scanId: string) {
  const ownerId = await requireUserId();
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, ownerId },
    select: { items: true },
  });
  if (!scan) return { ok: false as const, error: "That page is not here any more." };

  const items = parseItems(scan.items, SCAN_MAX_ITEMS);
  let added = 0;
  for (const item of items) {
    if (!item.lexemeId) continue;
    const lexeme = await prisma.lexeme.findUnique({
      where: { id: item.lexemeId },
      include: { forms: true },
    });
    if (!lexeme) continue;
    const result = await addCardsFor(
      ownerId, lexeme.id, availableCardTypes(lexeme as LexemeForCards), "SCAN",
    );
    if (result.ok) added += result.added ?? 0;
  }

  revalidatePath(`/scan/${scanId}`);
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, added, words: items.length };
}

export async function renameScan(scanId: string, title: string) {
  const ownerId = await requireUserId();
  const trimmed = capped(title, MAX_SCAN_TITLE);
  if (!trimmed) return { ok: false as const, error: "Give the page a name." };

  // Scoped by owner in the filter, not only in the lookup: an updateMany that
  // matched on id alone would rename somebody else's page.
  const changed = await prisma.scan.updateMany({
    where: { id: scanId, ownerId },
    data: { title: trimmed },
  });
  if (changed.count === 0) return { ok: false as const, error: "That page is not here any more." };

  revalidatePath("/scan");
  revalidatePath(`/scan/${scanId}`);
  return { ok: true as const, title: trimmed };
}

/**
 * Forgets a page.
 *
 * The cards it produced stay, and so does every review of them. A page is a
 * record of where some words came from, not a container they live in: deleting
 * it must not quietly take a fortnight of scheduling with it.
 */
export async function deleteScan(scanId: string) {
  const ownerId = await requireUserId();
  const deleted = await prisma.scan.deleteMany({ where: { id: scanId, ownerId } });
  if (deleted.count === 0) return { ok: false as const, error: "That page is not here any more." };

  revalidatePath("/scan");
  return { ok: true as const };
}

/**
 * Looks one word up again, after the learner corrected what the camera read.
 *
 * A phone photograph in a kitchen at nine in the evening turns `ö` into `o`
 * often enough that the confirmation rows are editable, and an edit that did
 * not re-check the dictionary would leave a now-correct word still marked as
 * unrecognised. With an Ekilex key this also reaches the full lexicon, so a
 * word outside the built-in 360 arrives with its real forms rather than as
 * a bare string.
 */
export async function resolveScannedWord(word: string) {
  const ownerId = await requireUserId();
  const trimmed = capped(word, LIMITS.lemma);
  if (!trimmed) return { ok: false as const, error: "Type the word first." };

  const local = await resolveOneWord(trimmed);
  if (local?.lexemeId) return { ok: true as const, item: local, source: "LOCAL" as const };

  // Not held locally. Ekilex is authoritative and stores what it returns, so
  // the second look at this word, by anyone, is instant.
  const found = await lookupAndStore(ownerId, trimmed);
  if (!found) {
    return { ok: true as const, item: local, source: "NONE" as const };
  }
  return { ok: true as const, item: await resolveOneWord(trimmed), source: "EKILEX" as const };
}

/** JSON has no dates; turn the ISO strings back into Date objects Prisma will accept. */
function revive(row: Record<string, unknown>, dateFields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of dateFields) {
    const value = out[key];
    if (typeof value === "string") out[key] = new Date(value);
  }
  return out;
}

// ───────────────────────────── Placement check ─────────────────────────────

const BAND = z.enum(["A1", "A2", "B1", "B2", "C1"]);
const SKILL = z.enum(["reading", "listening", "writing", "speaking"]);

/**
 * One sitting of the level check, as it comes back from the browser.
 *
 * The paper is marked in the browser, because it has to be: the answers are in
 * it, feedback appears the instant a question is answered, and a placement
 * check that needed a round trip per question would be unusable on a train.
 * Nothing is at stake in it either. It sets nobody's rank, it is not on the
 * class roster (`lib/classroom/roster.ts` shares effort, never contents), and
 * the only person a forged result misleads is the person who forged it.
 *
 * What the server does *not* delegate is the rule that turns marks into a
 * level. The credits arrive, `placement()` runs here, and the level comes out
 * of the same function the tests cover, so a stale browser or a hand-made
 * request cannot invent its own scale.
 */
const ASSESSMENT = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(120), skill: SKILL, band: BAND })).min(1).max(60),
  responses: z.array(z.object({
    itemId: z.string().min(1).max(120),
    skill: SKILL,
    band: BAND,
    credit: z.number().min(0).max(1),
    selfRating: z.number().int().min(1).max(4).optional(),
    ms: z.number().int().min(0).max(3_600_000),
    skipped: z.boolean().optional(),
  })).max(60),
});

export async function recordAssessment(input: unknown) {
  const ownerId = await requireUserId();
  const parsed = ASSESSMENT.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That result could not be read." };

  /*
    Only the three fields the scale is computed from are carried across, so a
    response naming an item the paper does not contain cannot vote.
  */
  const items: ItemRef[] = parsed.data.items;
  const known = new Set(items.map((i) => i.id));
  const responses = parsed.data.responses.filter((r) => known.has(r.itemId)) as Response[];

  const result = placement(items, responses);
  const stored = await saveResult(ownerId, result);

  revalidatePath("/assess");
  revalidatePath("/progress");
  revalidatePath("/");
  return { ok: true as const, id: stored.id, placement: result };
}

const GOALS = z.object({
  reason: z.string().max(40).nullable().optional(),
  target: z.string().max(4).nullable().optional(),
  deadline: z.string().max(40).nullable().optional(),
  daysPerWeek: z.number().min(1).max(7),
  note: z.string().max(280).optional(),
});

/** Saves the why, the what and the by when. Editable from Settings for ever. */
export async function saveLearningGoals(input: unknown) {
  const ownerId = await requireUserId();
  const parsed = GOALS.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Those goals could not be read." };

  await saveGoals(ownerId, normaliseGoals({
    reason: parsed.data.reason ?? null,
    target: (parsed.data.target ?? null) as Band | null,
    deadline: parsed.data.deadline ?? null,
    daysPerWeek: parsed.data.daysPerWeek,
    note: parsed.data.note ?? "",
  }));

  revalidatePath("/assess");
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true as const, goals: await goalsFor(ownerId) };
}

// ─────────────────────────────── Mock examination ─────────────────────────

const ExamResponseSchema = z.union([
  z.object({ kind: z.literal("chosen"), value: z.string().max(400) }),
  z.object({ kind: z.literal("typed"), value: z.string().max(400) }),
  z.object({ kind: z.literal("ordered"), value: z.array(z.string().max(80)).max(24) }),
  /*
    `variant` is which of the second writing task's two briefs the learner
    chose, a story or a personal letter, exactly as the real paper offers.
    Optional because it says nothing about the marks: both briefs are marked on
    length and on the words the task named, so this travels only so the result
    can show which one was answered.
  */
  z.object({
    kind: z.literal("composed"),
    value: z.string().max(6000),
    variant: z.number().int().min(0).max(1).optional(),
  }),
  z.object({
    kind: z.literal("spoken"),
    recorded: z.boolean(),
    criteria: z.array(z.boolean()).max(20),
  }),
  z.object({ kind: z.literal("unheard") }),
  z.object({ kind: z.literal("blank") }),
]);

const ExamSubmissionSchema = z.object({
  level: z.string().regex(/^[ABC][12]$/),
  seed: z.string().min(1).max(64),
  startedAt: z.number().int().nonnegative(),
  responses: z.record(z.string().max(40), ExamResponseSchema),
});

/**
 * Submits a sat paper.
 *
 * THE PAPER IS REBUILT SERVER SIDE BEFORE ANYTHING IS MARKED. The client sends
 * a level, a seed and what the learner answered; it does not send the questions
 * and it certainly does not send the marks. `buildPaper` is deterministic in
 * (level, seed, pool), so the server can reconstruct exactly the paper that was
 * sat and mark it itself. A submission that carried its own score would be a
 * result anybody could type, and a mock examination whose result is a claim
 * rather than a measurement is worth nothing to the person sitting it.
 *
 * Grades go through `applyGradeBatch`, which is the path every other mode's
 * grades take (ADR-016), so the scheduler sees the sitting. Only items built on
 * a word the learner already has a card for produce one, and a question left
 * blank produces none: running out of time is not evidence that a word was
 * forgotten.
 */
export async function submitExam(input: unknown) {
  const ownerId = await requireUserId();

  const parsed = ExamSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That submission was malformed." };
  const { level, seed, startedAt, responses } = parsed.data;
  if (!isExamLevel(level)) return { ok: false as const, error: "No paper at that level." };

  const paper = await examPaperFor(ownerId, level, seed);
  const answered = new Map<string, ExamResponse>(
    Object.entries(responses) as [string, ExamResponse][],
  );
  const result = markPaper(paper, answered);

  const grades = gradesFrom(result).slice(0, REPLAY_BATCH);
  if (grades.length > 0) {
    const now = Date.now();
    await applyGradeBatch(ownerId, grades.map((g) => ({
      id: crypto.randomUUID(),
      cardId: g.cardId,
      rating: g.rating as RatingValue,
      durationMs: 0,
      reviewedAt: now,
    })));
  }

  const began = new Date(Math.min(startedAt, Date.now()));
  const id = await recordAttempt({ ownerId, level, seed, startedAt: began, result });

  revalidatePath("/exam");
  revalidatePath("/");
  return { ok: true as const, id, pct: result.pct, passed: result.passed };
}

// ───────────────────────── Suggested fixes ─────────────────────────────────

/**
 * A learner telling us something is wrong, and what it should say instead.
 *
 * EVERY DEAD END IN THIS APP NOW OFFERS THIS, which is what decides the shape
 * of the action. It is called from an error screen, from an empty search, from
 * a card that was marked wrong, from a page of homework whose words the
 * dictionary could not vouch for. In every one of those the person is already
 * annoyed, so the form asks for as little as it can get away with: a note is
 * optional, because the category, the screen and the message the app had just
 * shown them are the three things a reviewer actually needs, and the app knows
 * all three without asking.
 *
 * `input` is unknown and validated here for the usual reason: every export of
 * this file is a public endpoint, and this one is reachable from more screens
 * than any other. The proposal is re-parsed by `parsePatchValue` rather than
 * trusted, and it has to belong to the category it arrived under, or a report
 * filed as "wrong explanation" could create a dictionary entry on accept.
 */
const SuggestionInput = z.object({
  category: z.string(),
  note: z.string().optional(),
  lemma: z.string().optional(),
  lexemeId: z.string().optional(),
  context: z.string().optional(),
  trigger: z.string().optional(),
  patch: z.unknown().optional(),
});

export async function submitSuggestion(input: unknown) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "sendSuggestion");
  if (busy) return busy;

  const parsed = SuggestionInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "That did not arrive in a shape we could read. Nothing was sent." };
  }
  const raw = parsed.data;
  if (!isCategory(raw.category)) {
    return { ok: false as const, error: "Pick what kind of problem this is." };
  }
  const category = raw.category;

  const patch = parsePatchValue(raw.patch);
  if (!patchFitsCategory(category, patch)) {
    return { ok: false as const, error: "That correction does not match the kind of problem chosen." };
  }

  const note = capped(raw.note, SUGGESTION_LIMITS.note);
  const lemma = capped(raw.lemma, SUGGESTION_LIMITS.lemma) || null;
  const lexemeId = capped(raw.lexemeId, 64) || null;
  const context = capped(raw.context, SUGGESTION_LIMITS.context) || null;
  const trigger = capped(raw.trigger, SUGGESTION_LIMITS.trigger) || null;

  const groupKey = groupKeyFor({ category, lexemeId, lemma, context, trigger, patch });

  /*
    One person, one open report per thing. Somebody who meets the same dead end
    on Monday and again on Thursday is one voice, not two, and the count beside
    a group in the review queue is only worth reading while that is true: the
    number is there to say "this many people", and clicks would make it say
    "this many clicks" while looking identical.

    The later report wins the note and the proposal, because it is the one they
    wrote after seeing more of the problem.
  */
  const mine = await prisma.suggestion.findFirst({
    where: { ownerId, groupKey, status: "OPEN" },
    select: { id: true },
  });

  if (mine) {
    await prisma.suggestion.update({
      where: { id: mine.id },
      data: {
        note, context, trigger, lemma, lexemeId,
        patch: patch ? JSON.stringify(patch) : "{}",
      },
    });
    return { ok: true as const, repeat: true, message: acknowledgement(category) };
  }

  await prisma.suggestion.create({
    data: {
      ownerId, category, groupKey, note, context, trigger, lemma, lexemeId,
      patch: patch ? JSON.stringify(patch) : "{}",
    },
  });

  revalidatePath("/suggestions");
  return { ok: true as const, repeat: false, message: acknowledgement(category) };
}

/**
 * A reviewer acting on one, and pushing the change through if it carries one.
 *
 * Gated on `requireAdminId`, which resolves who is asking rather than taking
 * it as an argument, for the reason every action in this file resolves its own
 * owner: an exported function here is a public endpoint, and this one writes to
 * the dictionary every learner reads.
 *
 * The default scope is the whole group. That is the entire answer to a queue
 * of thousands: forty-one people reporting one dead link is one decision, and
 * making a reviewer take it forty-one times is how a queue stops being worked.
 */
const ReviewInput = z.object({
  id: z.string(),
  decision: z.union([z.literal("ACCEPT"), z.literal("DECLINE")]),
  /** Whether to write the proposal into the dictionary. Ignored on a decline. */
  apply: z.boolean().optional(),
  note: z.string().optional(),
  scope: z.union([z.literal("group"), z.literal("one")]).optional(),
});

export async function reviewSuggestion(input: unknown) {
  const reviewerId = await requireAdminId();

  const busy = throttleAction(reviewerId, "reviewSuggestion");
  if (busy) return busy;

  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "That did not arrive in a shape we could read. Nothing has changed." };
  }
  const { id, decision, scope = "group" } = parsed.data;

  const row = await prisma.suggestion.findUnique({ where: { id } });
  if (!row) return { ok: false as const, error: "That suggestion is no longer here." };

  let applied: string | null = null;
  if (decision === "ACCEPT" && parsed.data.apply) {
    const outcome = await applyPatch(parsePatch(row.patch), reviewerId);
    /*
      A failed write stops the whole thing. Marking the report accepted and
      then failing to make the change would leave the queue saying a word had
      been added that had not, which is the one state a review queue must never
      reach: the reviewer would have no reason to look at it again.
    */
    if (!outcome.ok) return { ok: false as const, error: outcome.error };
    applied = outcome.summary;
  }

  const resolved = await prisma.suggestion.updateMany({
    where: scope === "group" ? { groupKey: row.groupKey, status: "OPEN" } : { id: row.id },
    data: {
      status: decision === "ACCEPT" ? "ACCEPTED" : "DECLINED",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      decision: capped(parsed.data.note, SUGGESTION_LIMITS.decision) || null,
    },
  });

  /*
    NOT `/admin/suggestions`. Working through a queue is the one screen where
    rows must not reshuffle under the cursor between clicks, and the list is
    right again on the next load anyway.

    That is not on its own enough to keep the reviewer informed, and the
    browser suite is what proved it: any server action re-renders the tree the
    page is on, so the row that was just accepted disappears from the server's
    answer regardless of what this revalidates. `QueueRows` holds the outcome
    a level above the row for that reason, and shows it for a row the server
    has since dropped.
  */
  revalidatePath("/suggestions");
  if (applied) {
    revalidatePath("/dictionary");
    revalidatePath("/words");
  }

  return {
    ok: true as const,
    resolved: resolved.count,
    applied,
  };
}
