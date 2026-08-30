import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { planLesson, splitIntoLessons, type LessonWord } from "@/lib/collections/lesson";
import { parseExamples } from "@/lib/dict/examples";
import { isPrincipalFormType } from "@/lib/estonian/types";
import { LessonSession } from "./LessonSession";

export const dynamic = "force-dynamic";

/** Words offered as wrong answers. Enough to vary, few enough to stay one query. */
const DISTRACTOR_POOL = 60;

/**
 * One lesson of a unit.
 *
 * The unit is split into sittings of six new words, so `?part=2` is the second
 * one. Everything the lesson needs is resolved here and handed down as a plan:
 * the session component is then pure presentation over a frozen list, which is
 * what stops a Server Action refresh swapping a question out from under an
 * answer.
 */
export default async function LessonPage({
  params, searchParams,
}: {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ part?: string }>;
}) {
  const { unitId } = await params;
  const { part } = await searchParams;
  const unit = unitById(unitId);
  if (!unit) notFound();

  await requireUserId();

  const select = {
    lemma: true, translation: true, pos: true, examples: true, government: true,
    forms: { select: { formType: true, value: true } },
  } as const;

  const [rows, pool] = await Promise.all([
    prisma.lexeme.findMany({ where: { lemma: { in: [...unit.lemmas] } }, select }),
    prisma.lexeme.findMany({
      where: { cefr: unit.level, lemma: { notIn: [...unit.lemmas] } },
      select: { lemma: true, translation: true, pos: true },
      take: DISTRACTOR_POOL,
    }),
  ]);

  const toWord = (row: (typeof rows)[number]): LessonWord => ({
    lemma: row.lemma,
    gloss: row.translation,
    pos: row.pos,
    // Only the sentences a lexicographer recorded. `parseExamples` degrades a
    // malformed or outdated blob to nothing rather than throwing on the page.
    examples: parseExamples(row.examples).map((e) => e.et),
    parts: Object.fromEntries(
      row.forms.filter((f) => isPrincipalFormType(f.formType)).map((f) => [f.formType, f.value]),
    ),
    government: row.government,
  });

  // The unit's own order, not whatever order Postgres returned: the words a unit
  // leads with are the ones it means to teach first.
  const order = new Map(unit.lemmas.map((l, i) => [l, i]));
  const words = rows
    .sort((a, b) => (order.get(a.lemma) ?? 0) - (order.get(b.lemma) ?? 0))
    .map(toWord);

  const lessons = splitIntoLessons(words);
  const index = Math.min(Math.max(Number(part) || 1, 1), Math.max(lessons.length, 1)) - 1;
  const chosen = lessons[index] ?? [];

  const steps = planLesson({
    unit,
    words: chosen,
    distractors: pool.map((p) => ({
      lemma: p.lemma, gloss: p.translation, pos: p.pos, examples: [], parts: {}, government: null,
    })),
    // Stable for this unit and part, so re-entering a lesson gives the same one
    // rather than reshuffling the questions under someone who came back to it.
    seed: hash(`${unit.id}:${index}`),
  });

  return (
    <LessonSession
      unitId={unit.id}
      unitTitle={unit.title}
      initialSteps={steps}
      part={index + 1}
      parts={lessons.length}
    />
  );
}

/** Small stable string hash, so a lesson's seed does not depend on a clock. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
