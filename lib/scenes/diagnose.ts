/**
 * Why the wrong ending came out, said as the guess it is.
 *
 * The review can say which case was wanted and what that case is for. What a
 * teacher standing beside you says is the next thing: *why you reached for
 * the one you did*. That is not derivable with certainty from a transcript
 * and it is not undecidable either, which is the whole of this module: three
 * of the reasons a learner picks the wrong case leave evidence in the run,
 * and the honest thing to do with evidence that is strong and not conclusive
 * is to say so out loud rather than to say nothing.
 *
 * WHAT IS ACTUALLY DERIVABLE, and each of these is a real reason people give:
 *
 *   carried over   the case they used is the one the question before wanted.
 *                  Staying in the last answer's case is the commonest thing
 *                  that happens in a conversation, and the transcript has it.
 *   one question   the two cases answer the same question word. `kus?` is
 *                  answered by the seesütlev and the alalütlev, `kuhu?` by
 *                  the sisseütlev and the alaleütlev, and a learner who has
 *                  been taught the question has been taught both. This is
 *                  read off `CASES`, so it is a fact rather than a hunch
 *                  about the language; what is a hunch is that it is the
 *                  reason.
 *   the plain word the case they used is the nimetav, which is the word as
 *                  the dictionary lists it: the ending had not arrived.
 *   the stem       the case they used is the omastav or the osastav, the two
 *                  every other ending is built on. The stem arrived and the
 *                  ending did not.
 *
 * WHAT IT MAY NOT DO. Say any of that as a fact. A hunch carries how sure it
 * is and the copy is written as a guess in both tiers, because a wrong
 * confident diagnosis is worse than none: it teaches a learner a reason for
 * a mistake they did not make, and they have no way to tell. `sure` is the
 * same device the readiness rungs and the exam confidence use, which is that
 * a claim carries its evidence rather than being caveated in prose somewhere
 * else on the page.
 *
 * WHAT IT MAY WRITE. English. Not a word of Estonian: the case names and the
 * question words are read off `CASES`, which is the one table of what a case
 * is called, and nothing here types a form or an ending. Delete every
 * Estonian word from the comments above and the output is identical, which
 * is `lib/estonian/grammar.ts`'s standing and is asserted the same way.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { caseByKey } from "@/lib/estonian/cases";
import { CASE_NOTES } from "@/lib/estonian/grammar";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * A guess at why, with how sure it is.
 *
 * Two tiers rather than a percentage, for the reason the readiness rungs are
 * rungs: a number here would be arithmetic nobody performed. `likely` is
 * where the run itself carries the evidence; `possible` is where the pattern
 * fits and several other things would fit too.
 */
export interface Hunch {
  readonly says: string;
  readonly sure: "likely" | "possible";
}

/** What the previous turn of the conversation asked for, where it asked for a case. */
export interface Before {
  readonly grammCase: CaseKey | null;
}

/**
 * The one hunch worth printing, or null.
 *
 * Ordered by how much of it is evidence rather than pattern: what this run
 * did first, then what the language does, then what the dictionary looks
 * like. One at most, because two guesses side by side is a screen admitting
 * it does not know, which is what null is for.
 */
export function diagnose(
  wanted: CaseKey,
  reached: CaseKey | undefined,
  before: Before,
): Hunch | null {
  if (!reached || reached === wanted) return null;
  const asked = caseByKey(reached);
  const due = caseByKey(wanted);
  if (!asked || !due) return null;

  /*
    The case the question before wanted. The strongest of the three, because
    it is a fact about this conversation rather than a pattern about
    learners, and because it is the one a person notices about themselves.
  */
  if (before.grammCase === reached) {
    return {
      sure: "likely",
      says: `That is the case the question before wanted. Staying in the last answer's ending is the `
        + `commonest thing that happens in a conversation, and hearing the new question word is what breaks it.`,
    };
  }

  /*
    Both answer one question word. Read off `CASES` rather than listed here,
    so the pair is the language's own and a fifteenth case would be covered
    by arriving.
  */
  if (asked.asksWhere && asked.asksWhere === due.asksWhere) {
    /*
      Which of the pair means what is read off `CASE_NOTES`, the same one
      English word the grammar reference leads a case's page with, rather
      than off the inside and outside trios: `lib/estonian/place.ts` owns
      which set a *word* takes and a second reader of it would be a second
      rule about that, which is a thing this app has been wrong about in
      eight places before.
    */
    const dueMeans = CASE_NOTES.find((n) => n.key === wanted)?.plain;
    const askedMeans = CASE_NOTES.find((n) => n.key === reached)?.plain;
    const both = dueMeans && askedMeans
      ? ` ${due.et} is the ending for ${dueMeans}, and ${asked.et} is the ending for ${askedMeans}.`
      : "";
    return {
      sure: "likely",
      says: `Both of these answer ${due.asksWhere}, so a class teaches them together and they get swapped.${both}`,
    };
  }

  if (reached === "NOMINATIVE") {
    return {
      sure: "likely",
      says: "That is the word as the dictionary lists it, so the word had arrived and the ending had not. "
        + "It is the right half to have first.",
    };
  }

  if (reached === "GENITIVE" || reached === "PARTITIVE") {
    return {
      sure: "possible",
      says: `${asked.et} is one of the three forms every other ending is built on, so this may be the stem `
        + `arriving without the ending after it. ${due.et} is that stem plus one more piece.`,
    };
  }

  return null;
}

/**
 * Why the dictionary form of a verb turned up where a person was due.
 *
 * The one hunch that needs no evidence beyond the slip, because there is
 * only one answer: a dictionary lists a verb in that form, so it is the form
 * a learner has met most and the one that comes first under pressure.
 */
export function diagnosePerson(): Hunch {
  return {
    sure: "likely",
    says: "A dictionary lists a verb in that form, so it is the one you have met most and the one that "
      + "arrives first when you are thinking about what to say rather than how to say it.",
  };
}
