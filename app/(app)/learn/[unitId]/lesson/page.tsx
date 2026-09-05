import { equivalentIn, glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { planLesson, splitIntoLessons, type LessonWord } from "@/lib/collections/lesson";
import { starredAmong } from "@/lib/progress/stars";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { naturalSentence, nominalOpener } from "@/lib/estonian/cloze";
import { isPrincipalFormType } from "@/lib/estonian/types";
import { LessonSession } from "./LessonSession";
import { oneEntryPerLemma } from "@/lib/dict/search";

export async function generateMetadata({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = unitById(unitId);
  return { title: unit ? `${unit.title} · lesson` : "Lesson" };
}

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

  const ownerId = await requireUserId();

  const select = {
    id: true, lemma: true, translation: true, pos: true, provenance: true,
    examples: true, government: true,
    // Which of the two sets of local cases the word takes, and whether it
    // answers `kes?` or `mis?`. See lib/estonian/caseQuestion.ts.
    semanticTypes: true,
    // For the meeting step only: see `LessonWord.equivalent`.
    translationRu: true, translationUk: true,
    forms: { select: { formType: true, value: true } },
  } as const;

  /*
    The wrong answers, and the window they are drawn from.

    `planLesson` below is handed a seed and its header promises the same seed
    gives the same lesson, which was true of everything except the one input
    that decides what the wrong answers are. This query asked for sixty words
    at the unit's level with no `orderBy`, against 478 of them at A1 and 1,302
    at B1, so which sixty was the query plan's choice. Measured rather than
    reasoned about: a bulk touch of the level, which is what re-running
    `npm run harvest` does, swapped seven of the sixty, and the seven that left
    were `Tere hommikust!`, `Aitäh!`, `Palun`, `Head aega!`, `Nägemist!`,
    `kohv` and `elu`, replaced by `järv`, `jalgratas` and `juust`. A learner
    coming back to a lesson would find the same question offering different
    wrong answers, under a comment saying that cannot happen.

    Ordered by lemma alone would fix that and read badly for the same reason
    the grammar reference did: every lesson at a level would draw its decoys
    from the same sixty words at the front of the alphabet, and a learner would
    start recognizing the decoys rather than the answer. So the window starts
    where the unit points, which is the answer `paperFor` reached one file over
    and for the same reason. Seeded on the unit rather than the part, because a
    unit's decoys being one slice is right and `index` is not known this early;
    which of them each question uses is the per-part seed's job, below.
  */
  const poolSeed = hash(unit.id);
  const [rows, atLevel, settings] = await Promise.all([
    prisma.lexeme.findMany({ where: { lemma: { in: [...unit.lemmas] } }, select }),
    prisma.lexeme.count({ where: { cefr: unit.level } }),
    // Which language the meeting step gives a meaning in. Memoised per render,
    // so this shares the read every other page of this request already made.
    readSettings(ownerId, [SETTING_KEYS.glossLanguage]),
  ]);
  const glossLanguage = glossLanguageFrom(settings[SETTING_KEYS.glossLanguage]);
  const pool = await prisma.lexeme.findMany({
    where: { cefr: unit.level, lemma: { notIn: [...unit.lemmas] } },
    select: { id: true, lemma: true, translation: true, pos: true, semanticTypes: true },
    orderBy: { lemma: "asc" },
    skip: atLevel > DISTRACTOR_POOL ? poolSeed % (atLevel - DISTRACTOR_POOL) : 0,
    take: DISTRACTOR_POOL,
  });

  const toWord = (row: (typeof rows)[number]): LessonWord => ({
    lexemeId: row.id,
    lemma: row.lemma,
    gloss: row.translation,
    equivalent: equivalentIn(row, glossLanguage)
      ? { text: equivalentIn(row, glossLanguage)!, lang: glossLanguage }
      : null,
    pos: row.pos,
    semanticTypes: row.semanticTypes,
    /*
      Only the sentences a lexicographer recorded, and only the ones that are
      sentences. `parseExamples` degrades a malformed or outdated blob to
      nothing rather than throwing on the page; `usableExamples` drops the
      fragments and the paragraphs and puts the attested ones first, which this
      was not calling at all; and `naturalSentence` is the gate the mock exam
      and the level check put every sentence through, so a gap-fill is never
      built out of `Nii ____ on öelda, et ..` or of a usage that leaves the
      answer standing beside the gap in its other spelling.
    */
    examples: usableExamples(parseExamples(row.examples))
      .filter((e) => naturalSentence(e.et, nominalOpener(row.pos, [row.lemma, ...row.forms.map((f) => f.value)])))
      .map((e) => e.et),
    parts: Object.fromEntries(
      row.forms.filter((f) => isPrincipalFormType(f.formType)).map((f) => [f.formType, f.value]),
    ),
    government: row.government,
  });

  /*
    The unit's own order, not whatever order Postgres returned: the words a unit
    leads with are the ones it means to teach first. And one row per lemma,
    because a lemma can hold two entries and the sort this replaces returned 0
    for exactly that pair, so a duplicate reached `splitIntoLessons` and bought
    itself a place in the sitting.
  */
  const words = oneEntryPerLemma(rows, unit.lemmas).map(toWord);

  const lessons = splitIntoLessons(words);
  const index = Math.min(Math.max(Number(part) || 1, 1), Math.max(lessons.length, 1)) - 1;
  const chosen = lessons[index] ?? [];

  const steps = planLesson({
    unit,
    words: chosen,
    distractors: pool.map((p) => ({
      lexemeId: p.id,
      lemma: p.lemma, gloss: p.translation, pos: p.pos, semanticTypes: p.semanticTypes,
      examples: [], parts: {}, government: null,
    })),
    // Stable for this unit and part, so re-entering a lesson gives the same one
    // rather than reshuffling the questions under someone who came back to it.
    seed: hash(`${unit.id}:${index}`),
  });

  /*
    Which of this lesson's words are already favorites. A set handed to the
    session rather than a field on the step, because `LessonStep` is built by a
    pure planner and which words one learner has kept is not a fact about the
    lesson.
  */
  const starred = await starredAmong(ownerId, chosen.map((w) => w.lexemeId));

  return (
    <LessonSession
      unitId={unit.id}
      unitTitle={unit.title}
      initialSteps={steps}
      starred={[...starred]}
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
