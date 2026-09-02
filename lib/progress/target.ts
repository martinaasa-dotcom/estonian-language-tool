import { prisma } from "@/lib/db";
import { CASES } from "@/lib/estonian/cases";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { grammarTerm } from "@/lib/estonian/terms";
import { decoyOptions } from "@/lib/dict/facts";
import { unitIntroducing } from "@/lib/collections/syllabus";
import {
  bandOf, differentMeaning, differentText, formNearness, glossNearness, glossOption,
  pickOptions,
} from "@/lib/questions/distractors";
import { shuffle } from "@/lib/random/shuffle";

/**
 * THE QUESTIONS A TARGET ROUND FIRES AT.
 *
 * A fast aim-and-pick round: a prompt at the top, four targets, hit the right
 * one before the clock runs out. What decides whether it teaches anything is
 * what the targets *are*, and there are two shapes here rather than one.
 *
 * A **meaning** question is the vocabulary round: the Estonian word, four
 * English glosses, ranked by `lib/questions/distractors.ts` so the wrong ones
 * are the same part of speech and the same band and cannot be crossed out
 * without knowing the word.
 *
 * A **case** question is the one this round exists for. The prompt is a word
 * and the question a class names the case by, `maja` and `kus?`, and the four
 * targets are four case forms of that same word: `majas`, `majja`, `majast`,
 * `majani`. Nothing can be eliminated by meaning, because every option means
 * the same word; the only way through is to read the ending. That is the
 * hardest question this app can ask at speed and it is the one an English
 * speaker cannot reason their way around.
 *
 * CASE QUESTIONS LEAD, and the mix is the point rather than a setting. A round
 * of nothing but meanings is a vocabulary quiz, which the deck already has
 * three of; a round of nothing but endings is a grammar drill, which
 * `/review/sprint` already is. Two thirds cases is what makes it a round about
 * Estonian rather than about words.
 *
 * Every option is a form the dictionary vouches for or a gloss it holds.
 * Nothing here is written and nothing is derived beyond what `caseAnswer`
 * already licenses (ADR-005), and a word whose stems will not build four
 * distinct forms is skipped rather than padded.
 */

/** Questions in a round. More than a minute's worth, so the clock ends it. */
export const TARGET_QUESTIONS = 30;

/** How many of them are about an ending rather than a meaning. */
const CASE_SHARE = 2 / 3;

/** Options per question. Four, like every other multiple choice here. */
const OPTIONS = 4;

/** Cards read before the round is built. */
const POOL = 300;

export type TargetKind = "meaning" | "case";

export interface TargetQuestion {
  /** The card this is evidence about, so the round can grade (ADR-016). */
  cardId: string | null;
  kind: TargetKind;
  /** The Estonian word being asked about. */
  lemma: string;
  /** The question a class names the case by, on a case question. */
  question: string | null;
  /** The case's Estonian name, for the note after an answer. */
  caseEt: string | null;
  options: string[];
  answer: number;
}

export async function targetRound(ownerId: string): Promise<TargetQuestion[]> {
  /*
    The learner's own deck, most-lapsed first, which is the round's own version
    of "words you consistently get wrong appear more frequently": the pool is
    weighted before the round starts rather than adapting inside it, because a
    round that reshuffles under the player is a round whose difficulty is not a
    fact about them.

    Ordered because this is a `take`, and ending on the id because neither
    `lapses` nor `due` is unique.
  */
  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, state: { not: 0 } },
    orderBy: [{ lapses: "desc" }, { due: "asc" }, { id: "asc" }],
    take: POOL,
    include: {
      lexeme: {
        select: { id: true, lemma: true, translation: true, pos: true, cefr: true,
          forms: { select: { formType: true, morphCode: true, value: true } } },
      },
    },
  });

  const wantCases = Math.round(TARGET_QUESTIONS * CASE_SHARE);
  const questions: TargetQuestion[] = [];

  // Case questions first, from the words whose stems will build four forms.
  for (const card of shuffle(cards)) {
    if (questions.filter((q) => q.kind === "case").length >= wantCases) break;
    if (!card.lexeme || card.lexeme.pos !== "NOUN") continue;
    const built = caseQuestion(card.lexeme, card.id);
    if (built) questions.push(built);
  }

  // Meanings fill the rest, ranked by the one table of what a wrong answer is
  // worth so an option cannot be crossed out on part of speech or band.
  const pool = await decoyOptions();
  const usedLemmas = new Set(questions.map((q) => q.lemma));
  for (const card of shuffle(cards)) {
    if (questions.length >= TARGET_QUESTIONS) break;
    const lexeme = card.lexeme;
    if (!lexeme || usedLemmas.has(lexeme.lemma) || !lexeme.translation.trim()) continue;

    const answer = glossOption({
      text: lexeme.translation,
      pos: lexeme.pos,
      band: bandOf(lexeme.cefr),
      theme: unitIntroducing(lexeme.lemma, lexeme.pos),
    });
    const picked = pickOptions({
      answer, candidates: pool, rng: Math.random,
      distinct: differentMeaning, nearness: glossNearness,
    });
    if (!picked) continue;

    usedLemmas.add(lexeme.lemma);
    questions.push({
      cardId: card.id, kind: "meaning", lemma: lexeme.lemma,
      question: null, caseEt: null,
      options: picked.options, answer: picked.answer,
    });
  }

  return shuffle(questions);
}

/**
 * One word, one case asked, and three other cases of the same word as the
 * wrong answers.
 *
 * The wrong answers are forms of the *same* word on purpose. Drawing them from
 * other words would let a learner answer on the stem alone without reading a
 * single ending, which is the whole of what this question is for. `formNearness`
 * then puts the closest-looking of them first, so `majas` is offered against
 * `majast` rather than against `majani`.
 *
 * Returns null rather than padding when a word cannot supply four distinct
 * forms: a question with a repeated option has two right answers, and
 * `differentText` is what refuses it. Plenty of words cannot, because several
 * cases can land on one spelling.
 */
function caseQuestion(
  lexeme: {
    lemma: string;
    forms: readonly { formType: string | null; morphCode: string | null; value: string }[];
  },
  cardId: string,
): TargetQuestion | null {
  const stems = stemsFrom(lexeme.forms);

  const built: { key: string; value: string }[] = [];
  for (const spec of CASES) {
    if (spec.principal) continue;
    const answer = caseAnswer(stems, spec.key);
    if (answer) built.push({ key: spec.key, value: answer.value });
  }
  if (built.length < OPTIONS) return null;

  const [asked, ...others] = shuffle(built);
  if (!asked) return null;

  const picked = pickOptions({
    answer: { text: asked.value },
    candidates: others.map((o) => ({ text: o.value })),
    rng: Math.random,
    distinct: differentText,
    nearness: formNearness,
  });
  if (!picked) return null;

  const spec = CASES.find((c) => c.key === asked.key)!;
  return {
    cardId,
    kind: "case",
    lemma: lexeme.lemma,
    question: spec.question,
    caseEt: grammarTerm(spec.key)?.et ?? spec.et,
    options: picked.options,
    answer: picked.answer,
  };
}
