"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { throttleAction } from "@/lib/security/actionLimits";
import { sceneById } from "@/lib/scenes/catalogue";
import { BUDGETS, type Difficulty } from "@/lib/scenes/curveballs";
import { beatNow, beginRun, finishRun, MAX_TURNS, MAX_TURN_CHARS } from "@/lib/progress/scene";
import { resolveProviders } from "@/lib/tutor/provider";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { formName } from "@/lib/estonian/morph";
import {
  LEVELS, checkpointFor, levelIndex, unitById, wordsAtLevel,
} from "@/lib/collections/syllabus";
import { checkpointPassed } from "@/lib/collections/checkpoint";
import { generateCode, isValidCode, normaliseCode } from "@/lib/classroom/code";
import { cohortKind } from "@/lib/classroom/cohort";
import { EXAM_LEVELS, type ExamLevel } from "@/lib/exam/spec";
import { loadRecentMessages } from "@/lib/tutor/history";
import { mergeExamples, parseExamples, serialiseExamples, MAX_CHARS as EXAMPLE_MAX_CHARS } from "@/lib/dict/examples";
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
  forgetSettings, numberSetting, readSetting, SETTING_KEYS, writeSetting, type ReviewMode,
} from "@/lib/settings/store";
import { letterBarFrom, type LetterBar } from "@/lib/ux/letterBar";
import { autoplayFrom, feedbackSoundsFrom, voiceFrom } from "@/lib/audio/voice";
import { kindFrom } from "@/lib/ux/schedule";
import { participationValue } from "@/lib/research/participation";
import { glossLanguageFrom } from "@/lib/collections/glossLanguage";
import {
  availableCardTypes, CARD_TYPES, generateCards, type CardType, type LexemeForCards,
} from "@/lib/srs/cards";
import { writeGrade } from "@/lib/srs/grade";
import { emptyScheduling, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";
import { addPlanToDeck, addUnitsToDeck, lockDeck, planLemmas } from "@/lib/srs/deck";
import { ratingFor, SONAD_GUESSES } from "@/lib/games/sonad";
import { solvedEntries } from "@/lib/games/crossword";
import { crosswordFor } from "@/lib/progress/crossword";
import { puzzleFor } from "@/lib/progress/sonad";
import { courseLevelFor } from "@/lib/progress/level";
import type { DayKey } from "@/lib/time/day";
import { FREQUENCY_GROUPS, type FrequencyGroup } from "@/lib/collections/frequency";
import { lemmasIn, nextCommonBatch } from "@/lib/progress/common";
import { MAX_STARTER_UNITS } from "@/lib/collections/starter";

import { applyGradeBatch, type ReplayItem } from "@/lib/srs/replay";
import { MAX_PASSAGE_CHARS, buildPassageCloze, type KnownForm } from "@/lib/estonian/passage";
import { DEFAULT_DAYS_PER_WEEK, normaliseGoals } from "@/lib/assessment/goals";
import { placement } from "@/lib/assessment/score";
import { PAPER_SIZE } from "@/lib/assessment/items";
import type { Band, ItemRef, Response } from "@/lib/assessment/types";
import { goalsFor, saveGoals, saveResult } from "@/lib/progress/assessment";
import { recordCourseLevel } from "@/lib/progress/level";
import { REPLAY_BATCH } from "@/lib/offline/outbox";
import { paperFor as examPaperFor, recordAttempt } from "@/lib/progress/exam";
import { gradesFrom, markPaper, type Response as ExamResponse } from "@/lib/exam/score";
import { isExamLevel } from "@/lib/exam/spec";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { safeMessage } from "@/lib/observability/report";

// ─────────────────────────────── Cards ────────────────────────────────────

/**
 * Adds a word to the deck. Skips card types that already exist, so it is safe to click twice.
 * Cards are per-user (`ownerId`) even though the Lexeme they're generated from is the shared
 * dictionary — see docs/03-architecture.md ADR-012.
 */
/**
 * The card sources a caller may name.
 *
 * `Card.source` is not decoration: `lib/progress/wordOfDay.ts` counts the
 * words a learner kept from the almanac by querying it, and `/words` groups
 * by it. It is also a free-text column on a row a signed-in stranger can
 * create, and this endpoint was passing whatever arrived straight into it, so
 * one caller could file a card under a source nothing else in the app has
 * ever written and quietly break a count that is supposed to be derived from
 * facts. A closed list costs nothing: every caller in the tree already names
 * one of these.
 */
const CARD_SOURCES = new Set(["DICTIONARY", "MANUAL", "TUTOR", "IMPORT", "SCAN", "ALMANAC"]);

/**
 * Add a word to the deck.
 *
 * Every argument here comes from a browser, because this file is
 * `"use server"` and each export is a public endpoint. `types` is typed
 * `CardType[]` for the callers in this tree and is a JSON array at runtime, so
 * it is filtered against the table that defines what a card type is, capped at
 * the length of that table, and deduplicated: an unbounded array of the same
 * key was a way to make the generator run a thousand times for one word.
 */
export async function addToDeck(lexemeId: string, types: CardType[], source = "DICTIONARY") {
  const known = new Set(CARD_TYPES.map((t) => t.type));
  const wanted = [...new Set(Array.isArray(types) ? types : [])]
    .filter((t): t is CardType => known.has(t as CardType));
  return addCardsFor(
    await requireUserId(),
    lexemeId,
    wanted,
    CARD_SOURCES.has(source) ? source : "MANUAL",
  );
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

  /*
    READ AND WRITE UNDER ONE LOCK, BECAUSE "IS IT ALREADY THERE" IS CHECK-THEN-ACT.

    This read the learner's existing cards for the word, filtered the generated
    ones against them, and inserted the rest. Two requests inside that gap both
    see an empty deck and both insert. Measured against a real database, firing
    the same shape concurrently: two adds gave two cards, four gave four, and
    eight gave fourteen where two is right. A learner meets it by
    double-tapping "Add to deck", and `addUnitToDeck` walks this once per word
    with no throttle in front of it, so one impatient second on a nineteen-word
    unit is the worst case rather than the unlikely one.

    The answer is `lib/usage/ledger.ts`'s, for the reasons its own header gives:
    a *transaction* advisory lock, so a connection pooler cannot strand it, and
    the blocking form, since the non-blocking one serialises nothing.

    The key is `lockDeck`'s and is the learner rather than the learner and the
    word, which is a widening this path did not need on its own and the batched
    builder does. A key naming the word is safe against another add of the same
    word and says nothing about `addUnitsToDeck` writing a unit that contains
    it, so two keys would leave each path guarded against itself and neither
    against the other. One definition, in `lib/srs/deck.ts`, because two spellings
    of a lock key are a lock that is not held.

    Held across one select and one insert, which is milliseconds, and the whole
    of it is work this action was doing anyway.

    A unique index would be the other answer and is the one not taken: an
    existing deck that already holds duplicates from this bug would fail the
    push, and the deployment's own build is what runs it.
  */
  const now = new Date();
  const scheduling = emptyScheduling(now);
  const added = await prisma.$transaction(async (tx) => {
    await lockDeck(tx, owner);

    const existing = await tx.card.findMany({
      where: { lexemeId, ownerId: owner },
      select: { front: true, cardType: true },
    });
    const seen = new Set(existing.map((c) => `${c.cardType}|${c.front}`));

    const generated = generateCards(lexeme as LexemeForCards, types)
      .filter((c) => !seen.has(`${c.cardType}|${c.front}`));
    if (generated.length === 0) return 0;

    await tx.card.createMany({
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
    return generated.length;
  });

  if (added === 0) return { ok: true as const, added: 0, message: "Already in your deck." };

  revalidatePath("/");
  revalidatePath("/words");
  return { ok: true as const, added };
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
  /**
   * What the round actually asked about, where that is narrower than the card.
   *
   * Checked against a closed list inside `writeGrade` rather than trusted,
   * exactly as `CARD_SOURCES` is above: this is a public endpoint and the
   * value lands in the one table that is never updated and never deleted.
   */
  practisedSlot?: string,
  /**
   * The form that came back instead, where the round could name one.
   *
   * Checked the same way and against a narrower list: `writeGrade` keeps it
   * only where both sides are forms, so a caller cannot file "asked what it
   * meant, got a case" as a confusion between two cases.
   */
  reachedSlot?: string,
) {
  const ownerId = await requireUserId();

  /*
    `Review` IS APPEND-ONLY, SO A BAD ROW IS PERMANENT.

    `rating` is typed here and is a number off a POST body at runtime. Nothing
    checked it, so a 7 or a NaN would have been written into the one table this
    app cannot repair, read back by every chart and fed to the scheduler. The
    four values are the four the scheduler defines.
  */
  if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
    return { ok: false as const, error: "That is not a rating." };
  }

  const card = await prisma.card.findFirst({ where: { id: cardId, ownerId } });
  if (!card) return { ok: false as const, error: "Card not found." };

  /*
    A grade carries the time it was actually answered, because the offline
    outbox replays in order with the timestamp it was given (ADR-015), and a
    device's clock is whatever its owner set it to. `writeGrade` bounds it at
    both ends and is the one place either door writes a grade: this one had the
    floor at the card's own creation and the replay path, which is the door
    those timestamps actually come through, did not.
  */
  const next = await writeGrade(ownerId, {
    card,
    rating,
    durationMs,
    reviewedAt: reviewedAt ? new Date(reviewedAt) : new Date(),
    practisedSlot,
    reachedSlot,
  });

  revalidatePath("/");
  /*
    The state the server just wrote, so the session can hand it back to undo.

    `cards` is snapshotted on mount and its scheduling is never refreshed,
    which is right for the queue and was wrong for undo: an "Again" puts a card
    back into the same session, so a card can be graded twice, and both grades
    recorded the same mount-time state as the one to restore. Undoing the
    second rewound past the first as well, dropping a lapse the learner really
    had and sending a card they had just failed away on its old interval.
  */
  return { ok: true as const, due: next.due, scheduling: snapshotOf(next) };
}

/** A scheduling state in the shape that crosses the wire, which `undoGrade` takes back. */
function snapshotOf(state: SchedulingState): SchedulingSnapshot {
  return {
    due: state.due.toISOString(),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsedDays: state.elapsedDays,
    scheduledDays: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    learningSteps: state.learningSteps,
    lastReview: state.lastReview?.toISOString() ?? null,
  };
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
  /*
    THIS IS A WRITE INTO THE SHARED DICTIONARY, SO IT OBEYS WHAT ONE COSTS.

    It took any lexeme id, any length of text, no throttle and no attribution,
    and `Lexeme` is read by everybody: eight calls put eight of one learner's
    sentences on a word and pushed every Ekilex usage off it, for every other
    learner and for the exam and level-check questions built out of them.
    Capped, throttled and signed now, and `usableExamples` keeps an attested
    sentence ahead of a typed one.
  */
  const ownerId = await requireUserId();
  const busy = throttleAction(ownerId, "editDictionary");
  if (busy) return busy;

  const et = capped(sentence, LIMITS.example);
  if (et.length < 4) return { ok: false as const, error: "That is too short to be a sentence." };

  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: { id: true, examples: true },
  });
  if (!lexeme) return { ok: false as const, error: "That word no longer exists." };

  const merged = mergeExamples(parseExamples(lexeme.examples), [
    { et, en: capped(translation ?? "", LIMITS.translation) || null, source: "USER" },
  ]);
  await prisma.lexeme.update({
    where: { id: lexeme.id },
    data: { examples: serialiseExamples(merged), editedBy: ownerId, editedAt: new Date() },
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
  /** One sentence: the same ceiling the reader applies, so nothing is stored unshowable. */
  example: EXAMPLE_MAX_CHARS,
  form: 80,
  government: 300,
  taskTitle: 200,
  taskNotes: 2000,
} as const;

const capped = (value: string | undefined | null, max: number): string =>
  (value ?? "").trim().slice(0, max);

/**
 * An argument that is supposed to be a string, as a string.
 *
 * Every export of this file is a public endpoint and its arguments are JSON
 * off the wire, so the types here describe the callers in this tree and say
 * nothing about what actually arrives. `joinClassroom(42)` reached
 * `input.trim()` and threw a `TypeError`, which the framework answers with a
 * 500 and a digest: an unhandled fault where the honest answer is a refusal.
 * Anything that is not a string is nothing, and every one of these paths
 * already has a sentence for nothing.
 */
const text = (value: unknown): string => (typeof value === "string" ? value : "");


/**
 * Adds a word to the shared dictionary.
 *
 * Requires a session even though the row is shared rather than personal: every
 * export of this file is a public endpoint, and "the middleware will have caught
 * it" is the assumption that turns a gap in the middleware into a data breach.
 * It also establishes who to attribute the entry to.
 */
export async function createLexeme(input: {
  lemma: string; translation: string; pos: string; cefr?: string;
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
      /*
        AI, NOT USER, BECAUSE A MODEL SUGGESTED IT AND NOBODY HAS CHECKED IT.

        The one caller is Anu's vocabulary bridge, where a learner presses a
        button on a word the model offered. It was written down as `USER` with
        the sentence "Suggested by Anu, forms unverified" in `notes`, and that
        sentence was the only record of either fact: `AI · verify` is keyed on
        the provenance, so the chip never appeared on the entry or on the card
        whose answer had never been checked, which is the one place ADR-005
        cares about. And `enrichFromEkilex` refuses to touch a `USER` word,
        "hers, not ours to overwrite", so the word could never be upgraded to
        real Ekilex forms either. Both of those turn round with the label.

        `notes` is the English further senses and nothing else now, which is
        what lets the entry give it a heading; a provenance sentence sitting in
        it would print under "other meanings" and read as one.
      */
      provenance: "AI",
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

  /*
    ASKED ONCE FOR THE WHOLE PASTE, NOT ONCE PER LINE.

    This ran a `findUnique` and then usually a `create` for every row, and the
    cap is five hundred of them. Measured against a real database, and a local
    one where a round trip is nearly free: five hundred rows took 3.8 seconds,
    of which the lookup was 13% and the creation 18%. Both are the same
    question asked five hundred times, and `@@unique` on `(lemma, pos)` means
    one `IN` over the lemmas answers all of it.

    What is left per row is `addCardsFor`, which is half the cost and stays
    per word: it takes a lock and reads that word's existing cards, and
    collapsing that would mean a second path that writes cards, which is the
    one thing this file should not grow. The route's own time budget is what
    covers the rest; see `maxDuration` in `app/(app)/settings/page.tsx`.

    Deduplicated by `(lemma, pos)` after capping, which the per-row version got
    for free by asking the database again for each row and finding what the row
    before it had just written. Two lines can be the same because somebody
    assembled a list from two handouts, or because capping a long lemma made
    them the same.

    What that costs if it is missed is not the write, which `skipDuplicates`
    below handles: it is the counting. `skipped` collects a lemma per row that
    was already there, so a repeated line reports one word as two, and a paste
    of a new word plus a repeated old one reads "Skipped 2 you already had"
    about a single word. Measured rather than assumed, and the first check
    written for this asserted the created count, which is 1 either way and so
    could not fail.
  */
  const wanted: { lemma: string; translation: string; pos: string }[] = [];
  const seenKeys = new Set<string>();
  for (const row of rows.slice(0, MAX_IMPORT_ROWS)) {
    const lemma = capped(row.lemma, LIMITS.lemma);
    const translation = capped(row.translation, LIMITS.translation);
    if (!lemma || !translation) continue;
    const key = `${lemma}|${row.pos}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    wanted.push({ lemma, translation, pos: row.pos });
  }

  const present = new Map(
    (wanted.length
      ? await prisma.lexeme.findMany({
          where: { lemma: { in: wanted.map((w) => w.lemma) } },
          select: { id: true, lemma: true, pos: true },
        })
      : []
    ).map((l) => [`${l.lemma}|${l.pos}`, l.id]),
  );

  const fresh = wanted.filter((w) => !present.has(`${w.lemma}|${w.pos}`));
  for (const w of wanted) if (present.has(`${w.lemma}|${w.pos}`)) skipped.push(w.lemma);

  if (fresh.length) {
    const now = new Date();
    /*
      `skipDuplicates` because another request can create the same word between
      the read above and this write. The per-row version had the same gap and
      threw the whole import away on it; skipping means the word is simply one
      somebody else added, which is what the re-read below then finds. It also
      makes the write itself indifferent to a repeated line, which is why the
      deduplication above is about the counting rather than about this.
    */
    const written = await prisma.lexeme.createMany({
      data: fresh.map((w) => ({
        lemma: w.lemma, translation: w.translation, pos: w.pos,
        provenance: "USER", editedBy: ownerId, editedAt: now,
      })),
      skipDuplicates: true,
    });
    created = written.count;

    for (const l of await prisma.lexeme.findMany({
      where: { lemma: { in: fresh.map((w) => w.lemma) } },
      select: { id: true, lemma: true, pos: true },
    })) present.set(`${l.lemma}|${l.pos}`, l.id);
  }

  for (const w of wanted) {
    const id = present.get(`${w.lemma}|${w.pos}`);
    if (!id) continue;
    const result = await addCardsFor(ownerId, id, ["RECOGNITION", "PRODUCTION"], "IMPORT");
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
/**
 * Awards whatever this learner has earned, and takes no numbers on trust.
 *
 * The argument used to be `{ count, accuracy }` for the session that just
 * ended, and this file is `"use server"`, so those were a claim rather than a
 * measurement: `checkAchievements({ count: 10, accuracy: 100 })` from a
 * console earned `perfect_session` with no card answered, into a table that is
 * never re-awarded and never removed. Only the learner is cheated by that,
 * which is why it is worth fixing rather than worth an alarm: a badge shelf
 * you know is a lie is not a badge shelf.
 *
 * What is left is a boolean saying a session ended, which the caller does know
 * and cannot lie usefully about: the run is read off the review log
 * (`lib/progress/session.ts`), so a forged `true` at a keyboard nobody has
 * touched counts nothing.
 */
export async function checkAchievements(sessionEnded = false) {
  const ownerId = await requireUserId();
  const newBadges = await checkAchievementsFor(ownerId, sessionEnded === true);
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

/*
  A PERSONAL BEST IS THE ONE FIGURE THE LOG CANNOT REBUILD, AND IT IS STILL A
  NUMBER OFF A POST BODY.

  ADR-014 says progress is derived and names a personal best as one of its
  three exceptions, because `Review` records no note of which mode wrote a row
  and so cannot say what a sixty-second sprint scored. That exception is why
  these two are stored, and it is not a reason to store whatever arrives.
  Neither of these clamped anything: `recordSprintScore(NaN)` wrote the string
  "NaN", `recordMatchTime(NaN)` slipped through its own `Math.max(1, ...)`
  because `Math.max(1, NaN)` is `NaN`, and `1e21` came back on the sprint
  screen as somebody's best score in scientific notation.

  What is *not* attempted is bounding a score against the review log. Every
  answer in both rounds grades through it (ADR-016), so a count is there, but
  the grades are in flight when the round ends and go to the outbox entirely
  when the connection is down: a clamp would take an honest best away from
  somebody who played on a train. The exposure is a learner lying to
  themselves, on a board that no longer has anybody else on it.
*/

/** A round of this app is a minute long; nothing honest reaches these. */
const MAX_SPRINT_SCORE = 500;
const MAX_MATCH_SECONDS = 3_600;

/** Records a Case Sprint score, keeping only the personal best. */
export async function recordSprintScore(score: number) {
  const ownerId = await requireUserId();
  if (!Number.isFinite(score)) return { ok: false as const, error: "That is not a score." };
  const clamped = Math.min(MAX_SPRINT_SCORE, Math.max(0, Math.round(score)));
  const best = numberSetting(await readSetting(ownerId, SETTING_KEYS.sprintBest), 0);
  const isNewBest = clamped > best;
  if (isNewBest) await writeSetting(ownerId, SETTING_KEYS.sprintBest, String(clamped));
  return { ok: true as const, best: Math.max(clamped, best), isNewBest };
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
  if (!Number.isFinite(seconds)) return { ok: false as const, error: "That is not a time." };
  const rounded = Math.min(MAX_MATCH_SECONDS, Math.max(1, Math.round(seconds)));
  const best = numberSetting(await readSetting(ownerId, SETTING_KEYS.matchBest), 0);
  const isNewBest = best === 0 || rounded < best;
  if (isNewBest) await writeSetting(ownerId, SETTING_KEYS.matchBest, String(rounded));
  return { ok: true as const, best: isNewBest ? rounded : best, isNewBest };
}

/**
 * A finished round of Sõnad, in the review log where every other mode's is.
 *
 * ADR-016 has no exemptions and this does not ask for one: the puzzle's answer
 * is a dictionary entry, and where the learner already holds a card for it,
 * finishing the round is evidence about that word. Where they do not, this
 * writes nothing at all and the finish screen offers to add it instead, which
 * is the same shape the picture round takes.
 *
 * THE CLIENT SENDS GUESSES AND NEVER A SCORE. The board knows the answer,
 * because marking a guess without a round trip is most of how the game feels
 * to play, so a posted rating would be a rating anybody can type. The puzzle is
 * rebuilt here from the day and the learner's own level, exactly as the mock
 * exam rebuilds its paper to mark it (ADR-022), and `ratingFor` is pure and
 * runs over the guesses on this side.
 *
 * The day is the caller's, and that is deliberate rather than sloppy: the
 * learner's own midnight is a browser fact, the board is keyed on it, and a
 * server that recomputed it from its own clock would refuse a round played at
 * half past eleven at night. The worst a chosen day can do is name a different
 * word, which grades a different card of the learner's own deck at a rating
 * they earned on a board they played.
 */
export async function recordSonad(day: string, guesses: unknown) {
  const ownerId = await requireUserId();
  const played = Array.isArray(guesses)
    ? guesses.filter((g): g is string => typeof g === "string").slice(0, SONAD_GUESSES)
    : [];
  if (played.length === 0) return { ok: false as const, error: "Nothing to record." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false as const, error: "Not a day." };

  const puzzle = await puzzleFor(ownerId, day as DayKey, await courseLevelFor(ownerId));
  if (!puzzle) return { ok: false as const, error: "No puzzle for that day." };

  const rating = ratingFor(played, puzzle.answer);
  if (rating === null) return { ok: false as const, error: "That round is not over." };
  if (!puzzle.inDeck) return { ok: true as const, graded: false };

  /*
    The production card, because that is the question the game asks: the
    learner produced the Estonian spelling. Recognition is the other way round
    and nothing here tested it.
  */
  const card = await prisma.card.findFirst({
    where: { ownerId, lexemeId: puzzle.lexemeId, cardType: "PRODUCTION" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!card) return { ok: true as const, graded: false };

  const result = await gradeCard(card.id, rating, 0);
  return result.ok ? { ok: true as const, graded: true } : result;
}

/**
 * A finished crossword, in the review log for the words that are cards.
 *
 * `recordSonad`'s shape, over more words. The client sends the grid it filled
 * in and which entries it asked to be shown; the server rebuilds the day's
 * puzzle from the date and the learner's level, checks the letters itself, and
 * grades only the entries that are right. A filled-in grid is the only route
 * to a Good, which is the half that matters; whether the Show button was used
 * can only make a rating worse, and is the same latitude the guesses have.
 *
 * Every entry is one card at most, so a seven-word grid is at most seven rows
 * in an append-only table, which is the size of one review session.
 */
/**
 * Starts a conversation: draws it and writes it down.
 *
 * It books nothing. §16 said a scene should book **one call rather than one per
 * turn**, on the argument that running out of allowance halfway through a
 * conversation is the worst failure available here, and that half of it is
 * right and is not what a booking buys: the ledger writes a call down when it
 * authorises one because two of its three limits count `CALL` rows, so a dozen
 * turns behind one booking is eleven calls the allowance never saw. The route
 * books each composed turn instead, and the mid-scene refusal is survivable for
 * the reason it was always survivable: the rung below the model is a real
 * conversational move rather than an error.
 *
 * **A refusal is never a refusal to run the scene.** A deployment with no key,
 * and a learner who has spent the day's allowance, both get a real conversation
 * built from the beats retrieval can fill, and the screen says so.
 *
 * The seed is the server's. A seed a learner picks is a learner picking their
 * persona, their card and their curveballs, which is every axis of §5 at once.
 */
export async function beginScene(sceneId: unknown, difficulty: unknown) {
  const ownerId = await requireUserId();
  const busy = throttleAction(ownerId, "finishScene");
  if (busy) return busy;

  const scene = sceneById(text(sceneId).slice(0, 64));
  if (!scene) return { ok: false as const, error: "No scene by that name." };
  const chosen = text(difficulty);
  if (!(chosen in BUDGETS)) return { ok: false as const, error: "Not a difficulty." };

  const opened = await beginRun({
    ownerId,
    sceneId: scene.id,
    level: await courseLevelFor(ownerId),
    difficulty: chosen as Difficulty,
  });
  if (!opened) return { ok: false as const, error: "That scene could not be built." };

  /*
    Only the briefing crosses, never the plan: the curveballs and the persona's
    leans are what is supposed to happen to somebody rather than be read off a
    card, and nothing here is bought by sending them, because the route marks
    every turn on the server anyway. `Briefing` is where that is written down.

    And nothing is booked here either. A run is many turns and the ledger books
    a call when it authorises one, so one booking at the door would let a whole
    conversation through on the burst allowance for a single call, which is the
    limit's own arithmetic broken rather than bent. The route books each
    composed turn and hands the booking back where nothing was composed. What
    this reports is the only part that is a fact about the deployment rather
    than about the next minute: whether a provider is configured at all.
  */
  return {
    ok: true as const,
    runId: opened.runId,
    briefing: opened.briefing,
    composed: resolveProviders().length > 0,
  };
}

/**
 * One word the current beat is about, for the "I need a word" button.
 *
 * A LEARNER WHO ASKS IS NOT PENALISED, and this is where that is paid for: the
 * scene's own beats declare what they are about as lemmas, so the help is a
 * word out of the closed list rather than anything a model wrote, and the whole
 * cost is that `advance` sees the next turn as helped. Nothing is deducted, no
 * objective is withheld, and the word goes on the debrief with a button to keep
 * it. Somebody who asks for four words and finishes has learned more than
 * somebody who gave up with none (`docs/19-situations.md` §12).
 *
 * The first version of this button recorded the *beat id* as the word needed,
 * so a debrief listed `reason` and `greet` under "words this conversation
 * needed" and offered no way to keep any of them, which is the one screen in
 * the feature whose whole job is turning a gap into a card.
 *
 * It reaches no provider and books nothing: it is the beat's own topic and one
 * indexed read. The English gloss is the dictionary's, which is the only
 * language this project may write.
 */
export async function sceneHelp(runId: unknown, turns: unknown) {
  const ownerId = await requireUserId();
  const busy = throttleAction(ownerId, "sceneHelp");
  if (busy) return busy;

  const id = text(runId).slice(0, 64);
  if (!id) return { ok: false as const, error: "That run is not open." };

  const said = Array.isArray(turns)
    ? turns.slice(0, MAX_TURNS).map((one) => {
        const row = (one ?? {}) as Record<string, unknown>;
        return {
          beatId: text(row.beatId).slice(0, 64),
          said: text(row.said).slice(0, MAX_TURN_CHARS),
          helped: row.helped === true,
        };
      })
    : [];

  const beat = await beatNow({ ownerId, runId: id, turns: said });
  if (!beat) return { ok: false as const, error: "That run is not open." };

  /*
    A word they have not already used, so pressing it twice on one beat is not
    the same word twice. Ordered, because two entries can share a lemma and the
    debrief offers exactly one to keep.
  */
  const typed = said.map((one) => one.said.toLowerCase()).join(" ");
  const fresh = beat.topic.filter((lemma: string) => !typed.includes(lemma.toLowerCase()));
  const wanted = (fresh.length > 0 ? fresh : beat.topic).slice(0, 12);
  if (wanted.length === 0) return { ok: false as const, error: "Nothing to offer here." };

  /*
    Through `oneEntryPerLemma`, because a lemma can hold two entries and this
    hands one of them to a button that keeps it. `hall` is a noun meaning frost
    and an adjective meaning grey; a word confirmed off a photograph makes a
    pair for any lemma at all, with no forms behind it. `bySubstance` is the
    rule the dictionary itself leads with, so the entry the help offers and the
    entry a search would show are the same entry.
  */
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: wanted } },
    select: {
      id: true, lemma: true, translation: true, pos: true, provenance: true,
      forms: { select: { id: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  const entry = oneEntryPerLemma(rows, wanted)[0];
  if (!entry) return { ok: false as const, error: "Nothing to offer here." };

  return {
    ok: true as const,
    lemma: entry.lemma,
    gloss: entry.translation,
    lexemeId: entry.id,
  };
}

/**
 * A finished conversation, marked by the server and written down.
 *
 * `recordSonad`'s shape over a whole scene, and the same rule behind it: the
 * client sends what it typed and the server rebuilds the run from its seed and
 * reads every turn again (ADR-022). A result anybody can type is not a
 * measurement, and here it would be worse than that, because a conversation
 * writes into the review log and a forged one would schedule words nobody said.
 *
 * Nothing in the transcript is true about the learner. The role card is fiction
 * (`docs/19-situations.md` §3), which is what makes a table of somebody's
 * practice sentences about a doctor's appointment safe to hold at all.
 */
export async function finishScene(input: {
  runId: unknown;
  turns: unknown;
  walkedOut: unknown;
  asked: unknown;
}) {
  const ownerId = await requireUserId();
  const busy = throttleAction(ownerId, "finishScene");
  if (busy) return busy;

  /*
    Off the wire, whatever the types say: every export of this file is a public
    endpoint and its arguments are JSON. What has to be stopped here is the size
    rather than the shape, since a turn that is not a string is read as an empty
    one and marked as nothing.
  */
  const runId = text(input.runId).slice(0, 64);
  if (!runId) return { ok: false as const, error: "That run has no name." };

  const turns = Array.isArray(input.turns)
    ? input.turns.slice(0, MAX_TURNS).map((turn) => {
        const row = (turn ?? {}) as Record<string, unknown>;
        return {
          beatId: text(row.beatId).slice(0, 64),
          said: text(row.said).slice(0, MAX_TURN_CHARS),
          helped: row.helped === true,
        };
      })
    : [];

  const asked = Array.isArray(input.asked)
    ? input.asked.slice(0, MAX_TURNS).map((one) => {
        const row = (one ?? {}) as Record<string, unknown>;
        return {
          lemma: text(row.lemma).slice(0, 64),
          lexemeId: typeof row.lexemeId === "string" ? row.lexemeId : null,
        };
      }).filter((one) => one.lemma)
    : [];

  const finished = await finishRun({
    ownerId, runId, turns, walkedOut: input.walkedOut === true, asked,
  });
  if (!finished) return { ok: false as const, error: "That run is not open." };

  /*
    EVERY MODE GRADES THROUGH `gradeCard` (ADR-016), and a scene is no
    exception. What is conservative is which turns earn a row rather than where
    the row goes: `gradesFor` writes only where the retrieval was unambiguous,
    and where the beat asked for a case the row carries it, so the case somebody
    fails under pressure lands in the same weak-case charts as the case they
    fail on a card.
  */
  let graded = 0;
  for (const grade of finished.grades) {
    const card = await prisma.card.findFirst({
      where: {
        ownerId,
        lexeme: { lemma: grade.lemma },
        ...(grade.grammCase
          ? { cardType: "CASE_FORM", targetCase: grade.grammCase }
          : { cardType: "PRODUCTION" }),
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!card) continue;
    const result = await gradeCard(card.id, grade.rating, 0);
    if (result.ok) graded += 1;
  }

  revalidatePath("/situations");
  return {
    ok: true as const,
    runId: finished.runId,
    objectives: finished.objectives,
    outcome: finished.outcome,
    turns: finished.turns,
    gaps: finished.gaps,
    graded,
  };
}

export async function recordCrossword(day: string, typed: unknown, helped: unknown) {
  const ownerId = await requireUserId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false as const, error: "Not a day." };

  /*
    Off the wire, whatever the types say. A cell index that is not a number and
    a letter that is a paragraph both reach `solvedEntries`, which compares
    strings, so what this has to stop is the size rather than the shape: a
    thousand-key object is a thousand comparisons of a thousand characters.
  */
  const grid: Record<number, string> = {};
  if (typed && typeof typed === "object") {
    for (const [cell, letter] of Object.entries(typed as Record<string, unknown>).slice(0, MAX_CELLS)) {
      if (typeof letter === "string" && letter.length <= 2) grid[Number(cell)] = letter;
    }
  }
  const shown = new Set(
    Array.isArray(helped) ? helped.filter((h): h is number => typeof h === "number") : [],
  );

  const puzzle = await crosswordFor(ownerId, day as DayKey, await courseLevelFor(ownerId));
  if (!puzzle) return { ok: false as const, error: "No crossword for that day." };

  const solved = solvedEntries(puzzle, grid);
  if (solved.size === 0) return { ok: true as const, graded: 0 };

  const wanted = [...solved].map((index) => puzzle.entries[index]!);
  const cards = await prisma.card.findMany({
    where: { ownerId, lexemeId: { in: wanted.map((e) => e.lexemeId) }, cardType: "PRODUCTION" },
    orderBy: { id: "asc" },
    select: { id: true, lexemeId: true },
  });
  const byLexeme = new Map(cards.map((c) => [c.lexemeId ?? "", c.id]));

  let graded = 0;
  for (const index of solved) {
    const entry = puzzle.entries[index]!;
    const cardId = byLexeme.get(entry.lexemeId);
    if (!cardId) continue;
    // Shown is not solved. A learner who pressed the button read the answer,
    // which is worth telling the scheduler about and is not worth a Good.
    const result = await gradeCard(cardId, shown.has(index) ? 1 : 3, 0);
    if (result.ok) graded += 1;
  }
  return { ok: true as const, graded };
}

/** A nine by nine grid is 81 cells; anything past that is not a grid. */
const MAX_CELLS = 81;

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
 * Which voice reads Estonian aloud, whether a card reads itself, and whether
 * an answer makes a sound. Each value is normalised against its allowlist on
 * the way in, so a request cannot store a voice the speech route would not
 * accept. Revalidated at the layout, since the shell publishes all three.
 */
export async function setVoice(voice: string) {
  const ownerId = await requireUserId();
  const value = voiceFrom(voice);
  await writeSetting(ownerId, SETTING_KEYS.ttsVoice, value);
  revalidatePath("/", "layout");
  return { ok: true as const, voice: value };
}

export async function setAutoplay(value: string) {
  const ownerId = await requireUserId();
  const normalised = autoplayFrom(value);
  await writeSetting(ownerId, SETTING_KEYS.autoplayAudio, normalised);
  revalidatePath("/", "layout");
  return { ok: true as const, value: normalised };
}

/**
 * Which language a meaning is given in beside the English.
 *
 * The equivalents themselves come from Ekilex and are already in the
 * dictionary; this only decides what a screen leads with. Revalidated across
 * the whole layout because the answer is read on the dictionary, in review and
 * on the course pages, and a learner who changes it should see it change
 * everywhere rather than on the next page they happen to reload.
 */
export async function setGlossLanguage(value: string) {
  const ownerId = await requireUserId();
  const normalised = glossLanguageFrom(text(value));
  await writeSetting(ownerId, SETTING_KEYS.glossLanguage, normalised);
  revalidatePath("/", "layout");
  return { ok: true as const, value: normalised };
}

export async function setFeedbackSounds(value: string) {
  const ownerId = await requireUserId();
  const normalised = feedbackSoundsFrom(value);
  await writeSetting(ownerId, SETTING_KEYS.feedbackSounds, normalised);
  revalidatePath("/", "layout");
  return { ok: true as const, value: normalised };
}

/**
 * Whether this learner's answers are counted in the anonymous statistics.
 *
 * Revalidated at the settings path rather than at the layout, because nothing
 * outside this screen reads it: the export reads the table directly, at the
 * moment it runs, so a change here is honoured by the next export whether or
 * not any page has re-rendered. See lib/research/participation.ts.
 */
export async function setResearchParticipation(value: string) {
  const ownerId = await requireUserId();
  const participation = value === "out" ? "out" : "in";
  await writeSetting(
    ownerId,
    SETTING_KEYS.researchOptOut,
    participationValue(participation),
  );
  revalidatePath("/settings");
  return { ok: true as const, value: participation };
}

/**
 * The name a class sees, which is the learner's own text and not their
 * Google account name.
 *
 * There is no opt-in beside it any more. The box this used to tick put
 * somebody on a board of everybody else on the deployment who had ticked it,
 * and that board is gone for the reasons written down in
 * `app/(app)/progress/page.tsx`. A class board is what is left, and joining
 * the class is the consent for it (ADR-019), so the only question left here
 * is what to be called.
 */
export async function setClassDisplayName(input: { displayName: string }) {
  const ownerId = await requireUserId();
  const name = cleanDisplayName(input?.displayName);
  if (!name) {
    return { ok: false as const, error: "Pick a name your class will recognise." };
  }
  await writeSetting(ownerId, SETTING_KEYS.displayName, name);
  revalidatePath("/progress");
  revalidatePath("/settings");
  return { ok: true as const, displayName: name };
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
  /**
   * Which language a meaning is given in.
   *
   * Asked on the first screen rather than left in Settings: most people
   * learning Estonian in Estonia already speak Russian or Ukrainian, and the
   * people who would never go looking for this setting are the ones it is for.
   */
  glossLanguage?: string;
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
    writeSetting(ownerId, SETTING_KEYS.displayName, cleanDisplayName(input?.displayName) || "A learner"),
    writeSetting(ownerId, SETTING_KEYS.cefrGoal, input.cefr),
    /*
      The level somebody declares at sign-up is the best guess available until
      they take the placement test, and the course needs *some* starting point
      to decide what to open. The test overwrites it whenever they take it.

      Deliberately written with no `cefrPlacementAt` beside it, unlike every
      other writer of this key. An unstamped declaration reads as older than
      any measurement (`lib/progress/level.ts`), and a level ticked in ninety
      seconds by somebody who has not answered a question yet is exactly that:
      it must never outrank the check sat on the next screen of this same
      wizard. The blank clears a stamp left by an earlier life of the account.
    */
    writeSetting(ownerId, SETTING_KEYS.cefrPlacement, input.cefr),
    writeSetting(ownerId, SETTING_KEYS.cefrPlacementAt, ""),
    writeSetting(ownerId, SETTING_KEYS.dailyGoal, String(goal)),
    writeSetting(ownerId, SETTING_KEYS.letterBar, letterBarFrom(input.letterBar)),
    writeSetting(ownerId, SETTING_KEYS.glossLanguage, glossLanguageFrom(text(input.glossLanguage))),
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

  /*
    One batched build rather than a call per unit.

    The per-unit version re-resolved the session, re-read the dictionary a word
    at a time and revalidated three paths on every pass, which on a hosted
    database left a stranger watching "Building your deck..." for tens of
    seconds on the one screen where the app is asking them to trust it. See
    `lib/srs/deck.ts` for the shape.
  */
  const { added } = await addUnitsToDeck(ownerId, input.unitIds.slice(0, MAX_STARTER_UNITS));

  revalidatePath("/");
  revalidatePath("/learn");
  return { ok: true as const, added };
}

/**
 * Adds every word of a path unit to the deck, with the card types that unit is
 * actually about — the rektsioon unit adds government cards, a noun unit adds
 * case-form cards. Already-present cards are skipped, so re-adding a unit after
 * finishing half of it costs nothing and loses no scheduling.
 */
/**
 * The hundred commonest words of one kind, into the deck.
 *
 * The group rather than a list of words, and that is the point: every export
 * of this file is a public endpoint whose arguments are JSON off the wire
 * whatever the types say, so a caller handing over lemmas would be choosing
 * what gets built. A group name indexes a table checked into the repository
 * and cannot name anything else.
 *
 * Recognition and production only (`planLemmas` decides), because a case card
 * apiece would be eight hundred cards for one press. Already-present cards are
 * skipped under the same lock every other deck write takes, so pressing twice
 * costs nothing and loses no scheduling.
 */
export async function addCommonWords(group: string) {
  const ownerId = await requireUserId();
  if (!FREQUENCY_GROUPS.includes(group as FrequencyGroup)) {
    return { ok: false as const, error: "That list does not exist." };
  }

  const { added, words } = await addPlanToDeck(
    ownerId,
    planLemmas(lemmasIn(group as FrequencyGroup), ["RECOGNITION", "PRODUCTION"]),
    "DICTIONARY",
  );

  revalidatePath("/dictionary/common");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, added, words };
}

/**
 * THE NEXT BATCH OF ONE LIST, BUILT OUT INTO EVERY CARD ITS WORDS SUPPORT.
 *
 * `addCommonWords` above is the browsing screen's button: a hundred words, a
 * recognition card and a production card each, cheap. This is the round's, and
 * it is the other half of the same list. A round that only ever asked what a
 * word means would not be flash cards, it would be a vocabulary list read back
 * at you, and the whole point of asking these hundred is that they are the
 * words you meet in every form there is.
 *
 * So the plan is `CARD_TYPES` entire, read off the one table rather than a list
 * typed here, and `generateCards` decides what each word can actually make: a
 * noun gets its cases, a verb its persons and its government, an adverb gets
 * the two it can support and no more. A unit asking for a card its own words
 * cannot build is the `objekt` fault, and this cannot make it, because it never
 * names a type at all.
 *
 * Bounded by `nextCommonBatch`, which is twenty words and only ones that are
 * short of something. Pressing again takes the next twenty; pressing when the
 * whole hundred is finished writes nothing and says so.
 *
 * The group rather than a list of words, for the reason `addCommonWords` gives:
 * every export of this file is a public endpoint whose arguments are JSON off
 * the wire whatever the types say, so a group name indexing a table checked
 * into the repository is the argument that cannot name anything else.
 */
export async function deepenCommonWords(group: string) {
  const ownerId = await requireUserId();
  if (!FREQUENCY_GROUPS.includes(group as FrequencyGroup)) {
    return { ok: false as const, error: "That list does not exist." };
  }

  const busy = throttleAction(ownerId, "deepenCommonWords");
  if (busy) return busy;

  const batch = await nextCommonBatch(ownerId, group as FrequencyGroup);
  if (batch.length === 0) {
    return { ok: true as const, added: 0, words: 0 };
  }

  const { added, words } = await addPlanToDeck(
    ownerId,
    planLemmas(batch, CARD_TYPES.map((spec) => spec.type)),
    "DICTIONARY",
  );

  revalidatePath("/review/common");
  revalidatePath("/practice");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, added, words };
}

export async function addUnitToDeck(unitId: string) {
  const ownerId = await requireUserId();
  const unit = unitById(unitId);
  if (!unit) return { ok: false as const, error: "That unit does not exist." };

  const { added, words } = await addUnitsToDeck(ownerId, [unitId]);

  revalidatePath("/learn");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, added, words };
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
  // One entry per lemma, by the same rule the dictionary leads with, so an
  // answer about `vana` is credited to the word the learner was shown.
  const lexemes = oneEntryPerLemma(
    await prisma.lexeme.findMany({
      where: { lemma: { in: lemmas } },
      select: { id: true, lemma: true, pos: true, provenance: true, forms: { select: { formType: true } } },
    }),
    lemmas,
  );
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
  // One entry per lemma, or a lemma holding two rows adds two sets of cards for
  // the one word the lesson taught.
  const lexemes = oneEntryPerLemma(
    await prisma.lexeme.findMany({
      where: { lemma: { in: lemmas } },
      select: { id: true, lemma: true, pos: true, provenance: true, forms: { select: { formType: true } } },
    }),
    lemmas,
  );

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
 * The level the learner says they are at.
 *
 * Everything else that writes this key is a measurement: a passed checkpoint,
 * the check at `/assess`. This one is a person telling
 * the app something it has no way to find out. Somebody was moved up in the
 * class they sit in every Tuesday, or sat the state examination, or simply
 * knows the check caught them on a bad evening, and until now the app had no
 * answer to any of that except "take it again and hope".
 *
 * It is a statement rather than a claim about a score, so unlike a level
 * check's result there is nothing to re-derive and nothing to distrust. Every
 * export here is a public endpoint and `setCourseLevel("C1")` is a call
 * anybody can make against their own account, which is the same thing the
 * button does: what it buys is which units the course opens at and which band
 * of words gets offered, and a learner who lies to it is only choosing their
 * own reading. Nothing in the review log moves, because a level is not a
 * score.
 */
export async function setCourseLevel(level: string) {
  const ownerId = await requireUserId();
  const parsed = z.enum(["A1", "A2", "B1", "B2", "C1"]).safeParse(text(level).toUpperCase());
  if (!parsed.success) return { ok: false as const, error: "That is not a level." };

  await recordCourseLevel(ownerId, parsed.data);

  /*
    Every screen that reads a level, which is more of them than it looks: the
    course opens at a unit, Today draws its next unit from the same answer, the
    dictionary's suggestion row bands its words by it, and review introduces
    new cards in that band. A picker that took effect on the next cold load
    would read as a button that does nothing.
  */
  revalidatePath("/learn");
  revalidatePath("/settings");
  revalidatePath("/review");
  revalidatePath("/practice");
  revalidatePath("/");
  return { ok: true as const, level: parsed.data };
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
  await recordCourseLevel(ownerId, promoted);

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
export async function createClassroom(name: string, kind?: string, targetLevel?: string) {
  const ownerId = await requireUserId();

  const busy = throttleAction(ownerId, "createClassroom");
  if (busy) return busy;
  const trimmed = text(name).trim().slice(0, 60);
  if (trimmed.length < 2) return { ok: false as const, error: "Give the class a name." };

  /*
    Both read through their own tables rather than trusted as sent. Every export
    here is a public endpoint, so `kind` arrives as a string somebody could set
    to anything, and an unrecognised one has to become a class: that is the
    shape whose consent screen a member will actually be shown.
  */
  const cohort = cohortKind(kind);
  const level: ExamLevel = (EXAM_LEVELS as readonly string[]).includes(targetLevel ?? "")
    ? (targetLevel as ExamLevel)
    : "B1";

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
      kind: cohort,
      targetLevel: level,
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

  const name = cleanDisplayName(displayName) || await resolveDisplayName(ownerId);
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

/**
 * A name a class is going to see, cleaned.
 *
 * `trim().slice(0, 32)` was the whole of it, and `String.prototype.trim` does
 * not remove U+200B: two zero-width spaces are a two-character string that
 * passes the `!name` check and renders as nothing on the roster, so a member
 * could sit in a class with no name at all. U+202E is worse, because it
 * reverses what follows it and can be used to make one pupil's row read as
 * another's. The roster is the one screen in this app where a stranger's text
 * is shown to a teacher beside real pupils' names.
 *
 * `\p{C}` is every control, format and unassigned code point, which is the
 * category both of those are in, and NFC first so a name is compared and
 * stored in one normalisation. At least one letter or digit, because a row
 * of punctuation is the same "renders as nothing" fault wearing a visible
 * character.
 */
function cleanDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.normalize("NFC").replace(/\p{C}/gu, "").replace(/\s+/g, " ").trim().slice(0, 32);
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : "";
}

/** The name to show in a class: their chosen one, else their account's. */
async function resolveDisplayName(ownerId: string): Promise<string> {
  const stored = cleanDisplayName(await readSetting(ownerId, SETTING_KEYS.displayName));
  if (stored) return stored;
  const learner = await currentLearner();
  const account = cleanDisplayName(learner.name);
  return !account || learner.name === "you" ? "A learner" : account;
}

// ─────────────────────────────── Tasks ────────────────────────────────────

/**
 * Ticks a task a teacher assigned. The manual homework list is gone, so this
 * is the one thing a learner does to a task: the row on Today, done or not.
 */
export async function toggleTask(id: string) {
  const ownerId = await requireUserId();
  const task = await prisma.task.findFirst({ where: { id, ownerId }, select: { completed: true } });
  if (!task) return { ok: false as const };
  await prisma.task.update({
    where: { id },
    data: { completed: !task.completed, completedAt: task.completed ? null : new Date() },
  });
  revalidatePath("/");
  return { ok: true as const };
}


// ──────────────────────────── The learner's calendar ───────────────────────

/**
 * Adds something to the learner's own Estonian week.
 *
 * No throttle, deliberately, and `lib/security/actionLimits.ts` says why most
 * actions must not have one: this is a single small insert, and a limit here
 * would be met by somebody filling in their term timetable on a Sunday evening
 * and by nobody else.
 *
 * Every field is clamped rather than trusted. `"use server"` makes this a public
 * endpoint, so a start minute of a million or a weekday of 9 has to come out
 * the other side as something a calendar can draw, and the owner comes from
 * `requireUserId` rather than from the caller.
 */
export async function addStudyEvent(input: {
  title: string;
  notes?: string;
  kind: string;
  startMinute: number;
  durationMinutes: number;
  weekdays: number[];
  onDate?: string | null;
}) {
  const ownerId = await requireUserId();

  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false as const, error: "Give it a name." };

  const weekdays = [...new Set(input.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  /*
    A one-off needs a day and a repeat must not carry one. Reading a stray
    `onDate` on a repeating event would make `eventsOn` answer two ways about
    the same row, since it tests the weekdays first and would never look.
  */
  const onDate = weekdays.length > 0 ? null : dayKeyOrNull(input.onDate);
  if (weekdays.length === 0 && !onDate) {
    return { ok: false as const, error: "Pick a day, or the days it repeats on." };
  }

  await prisma.studyEvent.create({
    data: {
      ownerId,
      title,
      notes: input.notes?.trim().slice(0, 500) || null,
      kind: kindFrom(input.kind),
      startMinute: clamp(Math.round(input.startMinute), 0, 1439),
      durationMinutes: clamp(Math.round(input.durationMinutes), 5, 12 * 60),
      weekdays,
      onDate,
    },
  });
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true as const };
}

/** Removes one of the learner's own events. Scoped by owner, like every delete. */
export async function deleteStudyEvent(id: string) {
  const ownerId = await requireUserId();
  const { count } = await prisma.studyEvent.deleteMany({ where: { id, ownerId } });
  if (count === 0) return { ok: false as const };
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * Adds a reminder: a task with a due date, which is what Today already draws.
 *
 * A reminder and a piece of homework are the same row, and that is on purpose.
 * `Task` is what `lib/ux/agenda.ts` buckets and what `components/TodayPlan.tsx`
 * prints, so a note a learner writes themselves lands in the same place a
 * teacher's assignment does rather than in a second list beside it.
 */
export async function addReminder(input: { title: string; notes?: string; dueAt?: string | null }) {
  const ownerId = await requireUserId();
  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false as const, error: "Give it a name." };

  const key = dayKeyOrNull(input.dueAt);
  await prisma.task.create({
    data: {
      ownerId,
      title,
      notes: input.notes?.trim().slice(0, 500) || null,
      tag: "HOMEWORK",
      // Stored at midnight UTC, which is what `<input type="date">` sends and
      // what `bucketFor` already expects: it counts whole days on the learner's
      // own clock rather than comparing instants. See lib/ux/agenda.ts.
      dueAt: key ? new Date(`${key}T00:00:00.000Z`) : null,
    },
  });
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true as const };
}

/** Removes a reminder the learner wrote. A teacher's assignment is theirs to remove. */
export async function deleteReminder(id: string) {
  const ownerId = await requireUserId();
  const { count } = await prisma.task.deleteMany({ where: { id, ownerId, classWeek: null } });
  if (count === 0) return { ok: false as const };
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true as const };
}

const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

/** A `YYYY-MM-DD` string, or null for anything that is not one. */
function dayKeyOrNull(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? null : value;
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
export async function buildClozeFromText(passageIn: string) {
  const ownerId = await requireUserId();
  const raw = text(passageIn);

  const busy = throttleAction(ownerId, "buildCloze");
  if (busy) return busy;
  const passage = raw.slice(0, MAX_PASSAGE_CHARS);
  if (!passage.trim()) return { ok: false as const, error: "Paste some Estonian first." };

  // Ordered, because past the cap which of somebody's words could be blanked
  // was the plan's choice, so the same passage pasted twice gave two different
  // exercises. Oldest card first: on a deck bigger than this the words they
  // have held longest are the ones a gap-fill is worth building on.
  const cards = await prisma.card.findMany({
    where: { ownerId, lexemeId: { not: null } },
    select: { id: true, lexemeId: true, cardType: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
      await tx.studyEvent.deleteMany({ where: { ownerId } });
      await tx.message.deleteMany({ where: { ownerId } });
      await tx.starredWord.deleteMany({ where: { ownerId } });
      await tx.achievement.deleteMany({ where: { ownerId } });
      await tx.setting.deleteMany({ where: { ownerId } });
      forgetSettings(ownerId);
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
      /*
        Every conversation they had and every word one of them needed.
        `SceneRun` is append-only like `Review` and `Assessment`, and this is
        the single exception all three share: the promise on /privacy outranks
        the rule. The gaps go first because they point at a run.
      */
      await tx.sceneGap.deleteMany({ where: { ownerId } });
      await tx.sceneRun.deleteMany({ where: { ownerId } });
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
      // Redacted: what the database says can name the deployment's own host and
      // user, and this sentence goes to a browser. See lib/observability/report.
      error: `Nothing was deleted. The operation did not complete. ${safeMessage(error)}`.trim(),
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
  /** The learner's own calendar. Optional for the reason `scans` is. */
  studyEvents: z.array(z.record(z.unknown())).optional(),
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
  const ownerId = await requireUserId();

  /*
    The restore route limits itself and this is not that route: every export
    of this file is an endpoint, so a caller can reach the parse directly and
    the route's allowance says nothing about it. Nothing is written here,
    which is exactly why it had no limit and exactly why it needed one: a loop
    of 16 MB bodies is a parse and a zod walk of every row, per request, for
    free.
  */
  const busy = throttleAction(ownerId, "inspectBackup");
  if (busy) return { ok: false as const, error: busy.error };

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
        await tx.studyEvent.deleteMany({ where: { ownerId } });
        await tx.scan.deleteMany({ where: { ownerId } });
      }

      /*
        THE SHARED DICTIONARY IS ADDED TO BY A RESTORE, NEVER REWRITTEN BY ONE.

        This upserted every `Lexeme` row in the file by id and then deleted and
        recreated its forms, taking `lemma`, `translation`, `pos`,
        `provenance`, `editedBy`, `ekilexWordId` and every `Form` exactly as
        the uploaded file wrote them. A backup file is a document one learner
        hands the server, so that was any signed-in learner rewriting any word
        every other learner reads, forging "retrieved from Ekilex" on their
        own text, and deleting the attested forms underneath it. Every other
        shared write in this app goes through `lib/dict/upsert.ts` and obeys
        three rules: only principal parts may be replaced, a retrieved form is
        never touched, and the edit is attributed.

        So a restore does what the seed does, `ON CONFLICT DO NOTHING`: a word
        the dictionary already holds is left exactly as it is, and a word it
        does not is created as this learner's own, without the provenance or
        the Ekilex identifiers that would claim otherwise. Nothing is lost by
        it, because the cards below point at ids either way.
      */
      const wanted = backup.lexemes.map((l) => String((l as { id?: unknown }).id ?? ""));
      const present = new Set(
        (await tx.lexeme.findMany({ where: { id: { in: wanted } }, select: { id: true } }))
          .map((l) => l.id),
      );
      for (const raw of backup.lexemes) {
        const { forms, ...lex } = raw as Record<string, unknown> & { forms?: unknown[] };
        const data = revive(lex, ["createdAt", "updatedAt"]);
        delete data.starred; // dropped field from a pre-multi-user backup
        if (present.has(String(data.id))) continue;

        // Whoever restores it is who added it, and it is not Ekilex's.
        data.provenance = "USER";
        data.editedBy = ownerId;
        delete data.ekilexWordId;
        delete data.fetchedAt;
        delete data.lookupMissAt;

        try {
          await tx.lexeme.create({ data: data as never });
        } catch {
          // Another word already holds this (lemma, pos). Theirs stays.
          continue;
        }
        if (Array.isArray(forms) && forms.length) {
          await tx.form.createMany({
            data: forms.map((f) => {
              const form = revive(f as Record<string, unknown>, []);
              form.lexemeId = String(data.id);
              return form;
            }) as never,
            skipDuplicates: true,
          });
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

      /*
        The calendar, on the same terms: written by its original id so a second
        restore changes nothing, and always attributed to whoever is restoring.
        A replace deletes these, so a restore that did not put them back would
        take somebody's class times away in the name of giving them their data.
      */
      for (const raw of backup.studyEvents ?? []) {
        const data = revive(raw, ["createdAt"]);
        data.ownerId = ownerId;
        const existing = await tx.studyEvent.findUnique({
          where: { id: String(data.id) }, select: { ownerId: true },
        });
        if (existing && existing.ownerId !== ownerId) continue;
        await tx.studyEvent.upsert({
          where: { id: String(data.id) }, create: data as never, update: data as never,
        });
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
      // Written straight at the table rather than through `writeSetting`,
      // because a restore replaces the lot. See lib/settings/store.ts.
      forgetSettings(ownerId);

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
      error: `The restore did not finish, and nothing was changed. ${safeMessage(error)}`.trim(),
    };
  }

  revalidatePath("/");
  revalidatePath("/words");
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
  /*
    With the paradigm attached, because the card-building branch below needs it
    and used to ask for it a second time, once per word. A page carries up to
    `MAX_ITEMS` words: that was sixty round trips for rows this query already
    had, plus another sixty for the words it did not.
  */
  const known = claimed.length
    ? await prisma.lexeme.findMany({ where: { id: { in: claimed } }, include: { forms: true } })
    : [];
  const byId = new Map(known.map((l) => [l.id, l]));

  /*
    And one question for every word the dictionary would not vouch for, asked
    before the loop rather than inside it. The key is `(lemma, pos)`, which is
    `Lexeme`'s own unique key, so a word that is already there under another
    learner's hand is found rather than re-created. `createMany` with
    `skipDuplicates` then writes only what is genuinely new, and the count it
    returns is what `created` used to tally one row at a time.
  */
  let created = 0;
  const unvouched = new Map<string, { lemma: string; pos: string; en: string }>();
  // What a ticked word would be filed under if the dictionary does not already
  // hold it. `(lemma, pos)` is `Lexeme`'s own unique key, so this is the same
  // question the loop below asks and the same one the write below settles.
  const keyOf = (et: string) => {
    const lemma = capped(et, LIMITS.lemma);
    const pos = guessPos(lemma);
    return { lemma, pos, key: `${lemma}|${pos}` };
  };
  for (const item of items) {
    if (item.lexemeId && byId.has(item.lexemeId)) continue;
    const { lemma, pos, key } = keyOf(item.et);
    if (!unvouched.has(key)) unvouched.set(key, { lemma, pos, en: item.en });
  }

  const byKey = new Map<string, (typeof known)[number]>();
  if (unvouched.size) {
    const rows = await prisma.lexeme.findMany({
      where: { OR: [...unvouched.values()].map((w) => ({ lemma: w.lemma, pos: w.pos })) },
      include: { forms: true },
    });
    for (const row of rows) byKey.set(`${row.lemma}|${row.pos}`, row);

    const missing = [...unvouched.entries()].filter(([key]) => !byKey.has(key));
    if (missing.length) {
      const written = await prisma.lexeme.createMany({
        data: missing.map(([, w]) => ({
          lemma: w.lemma,
          pos: w.pos,
          translation: capped(w.en, LIMITS.translation) || NEEDS_TRANSLATION,
          provenance: "USER" as const,
          editedBy: ownerId,
          editedAt: new Date(),
        })),
        skipDuplicates: true,
      });
      created = written.count;
      const fresh = await prisma.lexeme.findMany({
        where: { OR: missing.map(([, w]) => ({ lemma: w.lemma, pos: w.pos })) },
        include: { forms: true },
      });
      for (const row of fresh) byKey.set(`${row.lemma}|${row.pos}`, row);
    }
  }

  const stored: typeof items = [];
  let cards = 0;
  const carded = new Set<string>();

  for (const item of items) {
    const vouched = item.lexemeId ? byId.get(item.lexemeId) : undefined;
    // Not in the dictionary, and ticked anyway. Stored as the learner's own
    // entry, attributed to them, with the page's gloss as its English.
    const row = vouched ?? byKey.get(keyOf(item.et).key);
    if (!row) {
      // Nothing to point at: the write above lost a race with a hand edit.
      // Kept on the page as an unmatched word rather than dropped.
      stored.push({ ...item, lexemeId: null, lemma: null, translation: null });
      continue;
    }

    stored.push({ ...item, lexemeId: row.id, lemma: row.lemma, translation: row.translation });

    // Only what the word can actually support. A hand-added entry has no
    // forms, so asking for a case-form card would produce nothing; a matched
    // one may carry every form and deserves the lot.
    if (input.addCards && !carded.has(row.id)) {
      carded.add(row.id);
      const result = await addCardsFor(
        ownerId, row.id, availableCardTypes(row as LexemeForCards), "SCAN",
      );
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

  /*
    One query for the words, not sixty.

    A page carries up to `MAX_ITEMS` words and this asked the dictionary about
    each one on its own, with its whole paradigm attached. None of those reads
    depends on what the previous word did: they are the same question sixty
    times over, and a deployment asks it through a pooler while somebody
    watches the button they just pressed. `importWords` and the offline replay
    had the same shape for the same reason.

    The `addCardsFor` below stays per word, because that one is the write and
    it takes an advisory lock on (owner, word) to keep a double tap from
    building two decks.
  */
  const wanted = [...new Set(items.map((i) => i.lexemeId).filter((id): id is string => !!id))];
  const byId = new Map(
    (wanted.length
      ? await prisma.lexeme.findMany({ where: { id: { in: wanted } }, include: { forms: true } })
      : []
    ).map((l) => [l.id, l]),
  );

  let added = 0;
  for (const id of wanted) {
    const lexeme = byId.get(id);
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
/*
  Bounded by the paper rather than by a number typed here.

  It was 60 twice over, written when the paper was nineteen questions, and the
  blueprint grew past it: `safeParse` then failed on every finished sitting and
  `recordAssessment` returned "That result could not be read". The runner shows
  the result anyway, because it computes the level in the browser and the write
  is what fails, so a learner sat the whole check, read their level, and found
  the hub saying nothing had ever been measured. Two numbers for one fact, and
  the one that was wrong was the one nobody looks at.
*/
const ASSESSMENT = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(120), skill: SKILL, band: BAND })).min(1).max(PAPER_SIZE),
  responses: z.array(z.object({
    itemId: z.string().min(1).max(120),
    skill: SKILL,
    band: BAND,
    credit: z.number().min(0).max(1),
    selfRating: z.number().int().min(1).max(4).optional(),
    ms: z.number().int().min(0).max(3_600_000),
    skipped: z.boolean().optional(),
  })).max(PAPER_SIZE),
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
  /*
    Room for every reason at once rather than for one. They are stored space
    separated in a single setting (`reasonsFor` is the parser), and all eight
    ids together are sixty characters, which the old cap of forty silently
    rejected the moment the question became multiple choice. `normaliseGoals`
    still drops anything that is not a known id, so the width here bounds the
    string and nothing else.
  */
  reason: z.string().max(200).nullable().optional(),
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
  if (!parsed.success) return { ok: false as const, error: "Something about that submission didn't make sense." };
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
    return { ok: false as const, error: "Something about that didn't make sense. Nothing was sent." };
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
    return { ok: false as const, error: "Something about that didn't make sense. Nothing has changed." };
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
