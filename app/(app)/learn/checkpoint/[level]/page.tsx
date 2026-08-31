import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { LEVELS, checkpointFor, wordsAtLevel, type Level } from "@/lib/collections/syllabus";
import { buildCheckpoint, type CheckpointWord } from "@/lib/collections/checkpoint";
import { parseExamples } from "@/lib/dict/examples";
import { isPrincipalFormType } from "@/lib/estonian/types";
import { CheckpointSession } from "./CheckpointSession";
import { oneEntryPerLemma } from "@/lib/dict/search";

export async function generateMetadata({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  const upper = level.toUpperCase();
  return { title: (LEVELS as readonly string[]).includes(upper) ? `${upper} checkpoint` : "Checkpoint" };
}

export const dynamic = "force-dynamic";

/**
 * The exam at the end of a level.
 *
 * Its words are drawn from the whole level rather than one unit, which is the
 * point: a checkpoint asks whether the level holds together, not whether the
 * last thing studied is still fresh.
 */
export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: raw } = await params;
  const level = raw.toUpperCase() as Level;
  if (!(LEVELS as readonly string[]).includes(level)) notFound();

  await requireUserId();
  const checkpoint = checkpointFor(level);

  const lemmas = wordsAtLevel(level).map((w) => w.lemma);
  const found = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: {
      id: true, lemma: true, translation: true, pos: true, provenance: true, examples: true,
      forms: { select: { formType: true, value: true } },
    },
  });
  // One row per lemma: a lemma can hold two entries and both were being asked.
  const rows = oneEntryPerLemma(found, lemmas);

  const words: CheckpointWord[] = rows.map((row) => ({
    lemma: row.lemma,
    gloss: row.translation,
    pos: row.pos,
    examples: parseExamples(row.examples).map((e) => e.et),
    parts: Object.fromEntries(
      row.forms.filter((f) => isPrincipalFormType(f.formType)).map((f) => [f.formType, f.value]),
    ),
  }));

  // A fresh paper each attempt, so retaking a checkpoint is another exam rather
  // than a second run at the same twenty questions.
  const questions = buildCheckpoint(words, checkpoint.questions, Date.now() % 100_000);

  return (
    <CheckpointSession
      level={level}
      title={checkpoint.title}
      blurb={checkpoint.blurb}
      passMark={checkpoint.passMark}
      initialQuestions={questions}
    />
  );
}
