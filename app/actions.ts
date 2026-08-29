"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { classifyGradation, classifyVerbGradation } from "@/lib/estonian/gradation";
import { unitById } from "@/lib/collections/path";
import { generateCode, isValidCode, normaliseCode } from "@/lib/classroom/code";
import { mergeExamples, parseExamples, serialiseExamples } from "@/lib/dict/examples";
import { translateSentenceWithAnu } from "@/lib/tutor/translate";
import { checkAchievementsFor } from "@/lib/progress/achievements";
import { resolveStreakFor } from "@/lib/progress/summary";
import {
  numberSetting, readSetting, SETTING_KEYS, writeSetting, type ReviewMode,
} from "@/lib/settings/store";
import { generateCards, type CardType, type LexemeForCards } from "@/lib/srs/cards";
import { emptyScheduling, grade, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";

import { applyGradeBatch, type ReplayItem } from "@/lib/srs/replay";
import { MAX_PASSAGE_CHARS, buildPassageCloze, type KnownForm } from "@/lib/estonian/passage";
import { PRINCIPAL_FORM_TYPES, isPrincipalFormType } from "@/lib/estonian/types";

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
  await requireUserId();
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: { id: true, examples: true },
  });
  if (!lexeme) return { ok: false as const, error: "That word no longer exists." };

  const examples = parseExamples(lexeme.examples);
  const target = examples.find((e) => e.et === sentence);
  if (!target) return { ok: false as const, error: "That sentence is not on this word." };
  if (target.en) return { ok: true as const, en: target.en };

  const en = await translateSentenceWithAnu(sentence);
  if (!en) return { ok: false as const, error: "Anu could not translate that one." };

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
  const lemma = capped(input.lemma, LIMITS.lemma);
  const translation = capped(input.translation, LIMITS.translation);
  if (!lemma || !translation) {
    return { ok: false as const, error: "A word needs both an Estonian form and a translation." };
  }

  const forms = Object.entries(input.forms)
    // Only the principal parts are user-managed. Everything else on this lexeme
    // came from Ekilex and is authoritative; a hand edit must not submit one.
    .map(([formType, value]) => ({ formType, value: capped(value, LIMITS.form) }))
    .filter((f) => f.value && isPrincipalFormType(f.formType));

  const nomSg = forms.find((f) => f.formType === "NOM_SG")?.value;
  const genSg = forms.find((f) => f.formType === "GEN_SG")?.value;
  const infMa = forms.find((f) => f.formType === "INF_MA")?.value;
  const pres1 = forms.find((f) => f.formType === "PRES_1SG")?.value;

  const gradation =
    nomSg && genSg ? classifyGradation(nomSg, genSg)
    : infMa && pres1 ? classifyVerbGradation(infMa, pres1)
    : { type: "NONE" as const, note: undefined };

  const existing = input.id
    ? await prisma.lexeme.findUnique({ where: { id: input.id } })
    : await prisma.lexeme.findUnique({ where: { lemma_pos: { lemma, pos: input.pos } } });

  const data = {
    lemma, translation, pos: input.pos,
    cefr: input.cefr || null,
    government: capped(input.government, LIMITS.government) || null,
    notes: capped(input.notes, LIMITS.notes) || null,
    gradation: gradation.type,
    gradationNote: gradation.note ?? null,
    // An entry Ekilex supplied stays marked as Ekilex's after a correction —
    // relabelling it USER would quietly discard where the paradigm came from.
    ...(existing && (existing.provenance === "SEED" || existing.provenance === "EKILEX")
      ? {}
      : { provenance: "USER" }),
    editedBy: ownerId,
    editedAt: new Date(),
  };

  const lexeme = existing
    ? await prisma.lexeme.update({ where: { id: existing.id }, data })
    : await prisma.lexeme.create({ data });

  // Replace only the principal parts. Deleting every row for the lexeme threw
  // away the retrieved Ekilex paradigm — the one thing on an entry that cannot
  // be reconstructed — whenever anybody corrected a typo.
  await prisma.form.deleteMany({
    where: { lexemeId: lexeme.id, formType: { in: [...PRINCIPAL_FORM_TYPES] } },
  });
  if (forms.length) {
    await prisma.form.createMany({ data: forms.map((f) => ({ ...f, lexemeId: lexeme.id })) });
  }

  // Correcting a word must correct the cards made from it, or she keeps being
  // drilled on the mistake she just fixed. Only the text is rewritten — the FSRS
  // scheduling is untouched, so a correction never costs her progress.
  // Scoped to this learner's own cards. The dictionary is shared, but a deck is
  // not: rewriting every user's cards because one of them fixed a spelling
  // reaches into strangers' data, and they would have no idea why a card changed.
  if (existing && (existing.lemma !== lemma || existing.translation !== translation)) {
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
  return { ok: true as const, id: lexeme.id, lemma, updated: Boolean(existing) };
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
  const result = await resolveStreakFor(ownerId);
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

/** How review sessions ask their questions: type the answer, or flip the card. */
export async function setReviewMode(mode: ReviewMode) {
  const ownerId = await requireUserId();
  await writeSetting(ownerId, SETTING_KEYS.reviewMode, mode === "flip" ? "flip" : "type");
  revalidatePath("/settings");
  revalidatePath("/review");
  return { ok: true as const, mode };
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
}) {
  const ownerId = await requireUserId();
  const goal = Math.min(200, Math.max(5, Math.round(input.dailyGoal)));

  await Promise.all([
    writeSetting(ownerId, SETTING_KEYS.displayName, input.displayName.trim().slice(0, 32)),
    writeSetting(ownerId, SETTING_KEYS.cefrGoal, input.cefr),
    writeSetting(ownerId, SETTING_KEYS.dailyGoal, String(goal)),
    writeSetting(ownerId, SETTING_KEYS.onboardedAt, new Date().toISOString()),
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
    where: { lemma: { in: unit.lemmas } },
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
    const result = await addCardsFor(ownerId, lexeme.id, unit.cardTypes, "DICTIONARY");
    if (result.ok) added += result.added ?? 0;
  }

  revalidatePath("/learn");
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, added, words: lexemes.length };
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

const PASSAGE_FORM_LABELS: Record<string, string> = {
  NOM_SG: "nominative", GEN_SG: "genitive", PART_SG: "partitive",
  ILL_SG_SHORT: "short illative", PART_PL: "partitive plural", GEN_PL: "genitive plural",
  INF_MA: "ma-infinitive", INF_DA: "da-infinitive",
  PRES_1SG: "present 1sg", PAST_1SG: "past 1sg", PART_TUD: "tud-participle",
};

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
        formLabel: PASSAGE_FORM_LABELS[form.formType] ?? form.morphName ?? "form",
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
      await tx.lexeme.updateMany({ where: { editedBy: ownerId }, data: { editedBy: null } });
    }, { timeout: 120_000 });
  } catch (error) {
    return {
      ok: false as const,
      error: `Nothing was deleted. The operation did not complete. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    };
  }

  return { ok: true as const };
}

// ────────────────────────────── Backup restore ─────────────────────────────

const BackupSchema = z.object({
  // Accepts the pre-rename id too: a backup written yesterday must still restore.
  format: z.union([z.literal("kodukeel-v1"), z.literal("sonasepp-v1")]),
  lexemes: z.array(z.record(z.unknown())),
  cards: z.array(z.record(z.unknown())),
  reviews: z.array(z.record(z.unknown())),
  tasks: z.array(z.record(z.unknown())),
});

export interface RestoreSummary {
  words: number;
  cards: number;
  reviews: number;
  tasks: number;
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
    summary: { words: b.lexemes.length, cards: b.cards.length, reviews: b.reviews.length, tasks: b.tasks.length },
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
  return { ok: true as const, summary: check.summary };
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
