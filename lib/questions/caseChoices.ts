import { CASES } from "@/lib/estonian/cases";
import { caseAnswer, type NounStems } from "@/lib/estonian/derive";
import { differentText, formNearness, pickOptions } from "./distractors";

/**
 * FOUR FORMS OF ONE WORD, ONE OF THEM THE ONE THE SENTENCE WANTS.
 *
 * A case card used to end in "Not yet" and "Got it": the app held the answer
 * character for character, could have marked it, and asked the learner to mark
 * it instead. That judgement then went into `Review`, the append-only log, and
 * the weakest-case panel, the mastery counter, the readiness rungs and the exam
 * confidence figure are all derived from it. The daily quest is the sharp end
 * of that, because it picks the cases a learner is worst at and then lets them
 * mark their own paper on exactly those.
 *
 * Typing is the strongest answer and is what `/review` asks for. It is not
 * what a two-minute round can ask for, and the argument the quest makes about
 * itself is sound: volume across a weakness beats depth on one card. What was
 * never true is that self-grading is the only alternative. Picking one of four
 * is a tap, exactly as "Got it" is a tap, and it is a measurement.
 *
 * THE WRONG ANSWERS ARE THIS WORD'S OTHER CASES, which is why this needs no
 * pool and no query. `toast`, `toasse` and `toale` against `toas` is the
 * confusion the round exists for, and a learner who reaches for the seestütlev
 * has said something about themselves that "Not yet" could never have said:
 * `Review.reachedSlot` records which form they went for, and a flip can never
 * populate it because a flip never learns what they were thinking.
 *
 * `formNearness` is the ranking the mock exam and the level check already use
 * for a form, and its own comment describes this pool: the three principal
 * parts sort low because `tuba` beside `toas` is answered on the first two
 * letters, where the oblique cases all have to be read to the end.
 *
 * Pure, and it writes nothing: every option is `caseAnswer`'s output for a
 * case of this word, which is an attested form or the one derivation over a
 * stored stem that ADR-005 amendment 1 allows.
 */
export function caseFormChoices(input: {
  stems: NounStems;
  /** Every spelling the card marks right, so none of them can be a wrong one. */
  accepted: readonly string[];
  /** The one the sentence used, which is the option that has to be there. */
  answer: string;
  rng: () => number;
}): string[] | null {
  const { stems, accepted, answer, rng } = input;

  /*
    Every case the word can be put into, including the three principal parts,
    which `caseAnswer` refuses. They are the commonest thing a learner reaches
    for by mistake, so leaving them out would drop the most useful distractor
    in the set; they are read straight off the stems instead.
  */
  const candidates: string[] = [stems.nomSg, stems.genSg, stems.partSg].filter(
    (f): f is string => !!f,
  );
  for (const spec of CASES) {
    const built = caseAnswer(stems, spec.key);
    if (built) candidates.push(...built.accepted);
  }

  /*
    An accepted spelling is never a wrong answer. `tuba` marks both `tuppa` and
    `toasse` right, so offering the one the sentence did not use as a decoy
    would mark a learner wrong for the other true answer, which is the `tuppa`
    fault this app has already shipped twice in opposite directions.
  */
  const barred = new Set(
    [...accepted, answer].map((f) => f.trim().toLocaleLowerCase("et")),
  );
  const pool = candidates
    .map((f) => f.trim())
    .filter((f) => f && !barred.has(f.toLocaleLowerCase("et")))
    .map((text) => ({ text }));

  const picked = pickOptions({
    answer: { text: answer },
    candidates: pool,
    rng,
    distinct: differentText,
    nearness: formNearness,
  });
  return picked ? picked.options : null;
}
