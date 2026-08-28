"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { generateCards, type CardType, type LexemeForCards } from "@/lib/srs/cards";
import { emptyScheduling, grade, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";

// ─────────────────────────────── Cards ────────────────────────────────────

/** Adds a word to the deck. Skips card types that already exist, so it is safe to click twice. */
export async function addToDeck(lexemeId: string, types: CardType[], source = "DICTIONARY") {
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    include: { forms: true },
  });
  if (!lexeme) return { ok: false as const, error: "That word no longer exists." };

  const existing = await prisma.card.findMany({
    where: { lexemeId },
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
  const card = await prisma.card.findUnique({ where: { id: cardId } });
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
  await prisma.card.update({ where: { id: cardId }, data: { suspended } });
  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteCard(cardId: string) {
  await prisma.card.delete({ where: { id: cardId } });
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

export async function toggleStar(lexemeId: string) {
  const lexeme = await prisma.lexeme.findUnique({ where: { id: lexemeId }, select: { starred: true } });
  if (!lexeme) return { ok: false as const };
  await prisma.lexeme.update({ where: { id: lexemeId }, data: { starred: !lexeme.starred } });
  revalidatePath("/dictionary");
  return { ok: true as const, starred: !lexeme.starred };
}

/** Bulk import from pasted text. Returns per-row outcomes so nothing fails silently. */
export async function importWords(rows: { lemma: string; translation: string; pos: string }[]) {
  let created = 0;
  let cards = 0;
  const skipped: string[] = [];

  for (const row of rows) {
    const lemma = row.lemma.trim();
    const translation = row.translation.trim();
    if (!lemma || !translation) continue;

    const existing = await prisma.lexeme.findUnique({
      where: { lemma_pos: { lemma, pos: row.pos } },
    });
    if (existing) { skipped.push(lemma); continue; }

    const lexeme = await prisma.lexeme.create({
      data: { lemma, translation, pos: row.pos, provenance: "USER" },
    });
    created++;
    const result = await addToDeck(lexeme.id, ["RECOGNITION", "PRODUCTION"], "IMPORT");
    if (result.ok) cards += result.added ?? 0;
  }

  revalidatePath("/words");
  revalidatePath("/");
  return { ok: true as const, created, cards, skipped };
}

// ─────────────────────────────── Tasks ────────────────────────────────────

export async function createTask(input: {
  title: string; tag: string; classWeek?: number | null; dueAt?: string | null; notes?: string;
}) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "A task needs a title." };
  await prisma.task.create({
    data: {
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
  const task = await prisma.task.findUnique({ where: { id }, select: { completed: true } });
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
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true as const };
}
