"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { classifyGradation, classifyVerbGradation } from "@/lib/estonian/gradation";
import { BADGES, type BadgeStats, computeStreakWithShields, earnedBadgeKeys } from "@/lib/achievements/badges";
import { generateCards, type CardType, type LexemeForCards } from "@/lib/srs/cards";
import { emptyScheduling, grade, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";

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

/**
 * Records a grade. Writes the Review row first: the review log is append-only and
 * is the one thing we cannot reconstruct, so it must never be lost to a later failure.
 */
export async function gradeCard(cardId: string, rating: RatingValue, durationMs: number) {
  const ownerId = await requireUserId();
  const card = await prisma.card.findFirst({ where: { id: cardId, ownerId } });
  if (!card) return { ok: false as const, error: "Card not found." };

  await prisma.review.create({
    data: {
      cardId,
      rating,
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
  const next = grade(current, rating);

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

export async function setCardSuspended(cardId: string, suspended: boolean) {
  const ownerId = await requireUserId();
  await prisma.card.updateMany({ where: { id: cardId, ownerId }, data: { suspended } });
  revalidatePath("/words");
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

// ─────────────────────────────── Words ────────────────────────────────────

export async function createLexeme(input: {
  lemma: string; translation: string; pos: string; cefr?: string; notes?: string;
}) {
  const lemma = input.lemma.trim();
  const translation = input.translation.trim();
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
      notes: input.notes || null,
      provenance: "USER",
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
  const lemma = input.lemma.trim();
  const translation = input.translation.trim();
  if (!lemma || !translation) {
    return { ok: false as const, error: "A word needs both an Estonian form and a translation." };
  }

  const forms = Object.entries(input.forms)
    .map(([formType, value]) => ({ formType, value: value.trim() }))
    .filter((f) => f.value);

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
    government: input.government?.trim() || null,
    notes: input.notes?.trim() || null,
    gradation: gradation.type,
    gradationNote: gradation.note ?? null,
    provenance: "USER",
  };

  const lexeme = existing
    ? await prisma.lexeme.update({ where: { id: existing.id }, data })
    : await prisma.lexeme.create({ data });

  await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
  if (forms.length) {
    await prisma.form.createMany({ data: forms.map((f) => ({ ...f, lexemeId: lexeme.id })) });
  }

  // Correcting a word must correct the cards made from it, or she keeps being
  // drilled on the mistake she just fixed. Only the text is rewritten — the FSRS
  // scheduling is untouched, so a correction never costs her progress.
  if (existing && (existing.lemma !== lemma || existing.translation !== translation)) {
    await prisma.card.updateMany({
      where: { lexemeId: lexeme.id, cardType: "RECOGNITION" },
      data: { front: lemma, back: translation },
    });
    await prisma.card.updateMany({
      where: { lexemeId: lexeme.id, cardType: "PRODUCTION" },
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
export async function importWords(rows: { lemma: string; translation: string; pos: string }[]) {
  const ownerId = await requireUserId();
  let created = 0;
  let cards = 0;
  const skipped: string[] = [];

  for (const row of rows) {
    const lemma = row.lemma.trim();
    const translation = row.translation.trim();
    if (!lemma || !translation) continue;

    let lexeme = await prisma.lexeme.findUnique({
      where: { lemma_pos: { lemma, pos: row.pos } },
    });
    if (lexeme) {
      skipped.push(lemma);
    } else {
      lexeme = await prisma.lexeme.create({
        data: { lemma, translation, pos: row.pos, provenance: "USER" },
      });
      created++;
    }
    const result = await addCardsFor(ownerId, lexeme.id, ["RECOGNITION", "PRODUCTION"], "IMPORT");
    if (result.ok) cards += result.added ?? 0;
  }

  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, created, cards, skipped };
}

// ────────────────────────────── Achievements ───────────────────────────────

const SPRINT_BEST_KEY = "sprintBest";
const STREAK_SHIELDS_KEY = "streakShields";
const STREAK_SHIELD_DATES_KEY = "streakShieldDates";
const SHIELD_AWARD_BADGES = new Set(["streak_7", "streak_30", "streak_100"]);

/**
 * Resolves the current streak, applying any banked streak shields (Duolingo's
 * "streak freeze") to bridge missed days. Reads the review log over a wide
 * window — long enough for the streak_100 badge to actually be reachable,
 * unlike the 30-day window a shield-unaware streak used to be limited to —
 * and persists any newly-spent shields so a bridged day is never re-charged
 * on a later call (computeStreakWithShields is pure; this is its DB shell).
 */
export async function resolveStreak() {
  // Owner comes from the session, never from an argument: this file is
  // `"use server"`, so an `ownerId` parameter here would be a public endpoint
  // letting any signed-in user read and rewrite another learner's streak.
  const ownerId = await requireUserId();
  const [reviews, shieldSetting, datesSetting] = await Promise.all([
    prisma.review.findMany({
      where: { reviewedAt: { gte: new Date(Date.now() - 400 * 86_400_000) }, card: { ownerId } },
      select: { reviewedAt: true },
    }),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: STREAK_SHIELDS_KEY } } }),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: STREAK_SHIELD_DATES_KEY } } }),
  ]);

  const shieldsAvailable = shieldSetting ? Number(shieldSetting.value) || 0 : 0;
  let shieldedDates: string[] = [];
  if (datesSetting) {
    try {
      const parsed: unknown = JSON.parse(datesSetting.value);
      if (Array.isArray(parsed)) shieldedDates = parsed.filter((d): d is string => typeof d === "string");
    } catch {
      shieldedDates = [];
    }
  }

  const result = computeStreakWithShields(reviews.map((r) => r.reviewedAt), shieldsAvailable, shieldedDates);

  if (result.newlyShieldedDates.length > 0) {
    await Promise.all([
      prisma.setting.upsert({
        where: { ownerId_key: { ownerId, key: STREAK_SHIELDS_KEY } },
        create: { ownerId, key: STREAK_SHIELDS_KEY, value: String(result.shieldsRemaining) },
        update: { value: String(result.shieldsRemaining) },
      }),
      prisma.setting.upsert({
        where: { ownerId_key: { ownerId, key: STREAK_SHIELD_DATES_KEY } },
        create: { ownerId, key: STREAK_SHIELD_DATES_KEY, value: JSON.stringify([...shieldedDates, ...result.newlyShieldedDates]) },
        update: { value: JSON.stringify([...shieldedDates, ...result.newlyShieldedDates]) },
      }),
    ]);
  }

  return { ok: true as const, streak: result.streak, shieldsAvailable: result.shieldsRemaining };
}

/**
 * Computes current stats from the review log and decks, then awards any badge
 * whose condition is newly met. Idempotent and safe to call often: an already
 * -earned key is never re-awarded or removed, so a badge earned once is kept
 * forever even if the underlying stat later dips (e.g. a streak breaks).
 *
 * Reaching a streak_7/30/100 badge for the first time also banks a streak
 * shield — the milestone worth protecting is exactly the one just reached.
 */
export async function checkAchievements(session?: { count: number; accuracy: number }) {
  const ownerId = await requireUserId();
  const [streakResult, totalReviews, cardsKnown, totalWords, sprintSetting, caseReviews] = await Promise.all([
    resolveStreak(),
    prisma.review.count({ where: { card: { ownerId } } }),
    prisma.card.count({ where: { ownerId, state: 2 } }),
    prisma.lexeme.count(),
    prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: SPRINT_BEST_KEY } } }),
    prisma.review.findMany({
      where: { targetCase: { not: null }, card: { ownerId } },
      select: { targetCase: true, rating: true },
      take: 5000,
    }),
  ]);

  const tally = new Map<string, { ok: number; total: number }>();
  for (const r of caseReviews) {
    if (!r.targetCase) continue;
    const entry = tally.get(r.targetCase) ?? { ok: 0, total: 0 };
    entry.total++;
    if (r.rating >= 3) entry.ok++;
    tally.set(r.targetCase, entry);
  }
  const bestCaseAccuracy = [...tally.entries()]
    .filter(([, v]) => v.total >= 10)
    .map(([grammCase, v]) => ({ grammCase, accuracy: Math.round((v.ok / v.total) * 100) }))
    .sort((a, b) => b.accuracy - a.accuracy)[0] ?? null;

  const stats: BadgeStats = {
    streak: streakResult.streak,
    totalReviews,
    cardsKnown,
    totalWords,
    bestCaseAccuracy,
    sprintBest: sprintSetting ? Number(sprintSetting.value) || 0 : 0,
    session,
  };

  const earnedKeys = earnedBadgeKeys(stats);
  if (earnedKeys.length === 0) return { ok: true as const, newBadges: [] };

  const already = await prisma.achievement.findMany({
    where: { ownerId, key: { in: earnedKeys } },
    select: { key: true },
  });
  const alreadySet = new Set(already.map((a) => a.key));
  const newKeys = earnedKeys.filter((k) => !alreadySet.has(k));
  if (newKeys.length === 0) return { ok: true as const, newBadges: [] };

  await prisma.achievement.createMany({ data: newKeys.map((key) => ({ ownerId, key })) });

  const shieldsEarned = newKeys.filter((k) => SHIELD_AWARD_BADGES.has(k)).length;
  if (shieldsEarned > 0) {
    const current = await prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: STREAK_SHIELDS_KEY } } });
    const currentShields = current ? Number(current.value) || 0 : 0;
    await prisma.setting.upsert({
      where: { ownerId_key: { ownerId, key: STREAK_SHIELDS_KEY } },
      create: { ownerId, key: STREAK_SHIELDS_KEY, value: String(currentShields + shieldsEarned) },
      update: { value: String(currentShields + shieldsEarned) },
    });
  }

  // No revalidatePath here: this is called from a Server Component render (Today)
  // as well as from actual actions, and revalidating during render is an error.
  // Settings reads achievements fresh on every load anyway (force-dynamic).
  return { ok: true as const, newBadges: BADGES.filter((b) => newKeys.includes(b.key)) };
}

const DAILY_GOAL_KEY = "dailyGoal";

/** Sets the review count that fills the daily-goal ring on Today. */
export async function setDailyGoal(goal: number) {
  const ownerId = await requireUserId();
  const clamped = Math.min(200, Math.max(5, Math.round(goal)));
  await prisma.setting.upsert({
    where: { ownerId_key: { ownerId, key: DAILY_GOAL_KEY } },
    create: { ownerId, key: DAILY_GOAL_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  });
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true as const, goal: clamped };
}

/** Records a Case Sprint score, keeping only the personal best. */
export async function recordSprintScore(score: number) {
  const ownerId = await requireUserId();
  const current = await prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: SPRINT_BEST_KEY } } });
  const best = current ? Number(current.value) || 0 : 0;
  const isNewBest = score > best;
  if (isNewBest) {
    await prisma.setting.upsert({
      where: { ownerId_key: { ownerId, key: SPRINT_BEST_KEY } },
      create: { ownerId, key: SPRINT_BEST_KEY, value: String(score) },
      update: { value: String(score) },
    });
  }
  return { ok: true as const, best: Math.max(score, best), isNewBest };
}

// ─────────────────────────────── Tasks ────────────────────────────────────

export async function createTask(input: {
  title: string; tag: string; classWeek?: number | null; dueAt?: string | null; notes?: string;
}) {
  const ownerId = await requireUserId();
  const title = input.title.trim();
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
export async function inspectBackup(json: string): Promise<
  { ok: true; summary: RestoreSummary } | { ok: false; error: string }
> {
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
        await tx.review.deleteMany({ where: { card: { ownerId } } });
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
      // Only restored when the card they belong to is this user's own.
      for (const raw of backup.reviews) {
        const data = revive(raw, ["reviewedAt"]);
        const exists = await tx.review.findUnique({ where: { id: String(data.id) }, select: { id: true } });
        if (exists) continue;
        const card = await tx.card.findUnique({ where: { id: String(data.cardId) }, select: { ownerId: true } });
        if (card?.ownerId === ownerId) await tx.review.create({ data: data as never });
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
