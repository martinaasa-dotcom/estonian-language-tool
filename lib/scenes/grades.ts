/**
 * What a conversation is allowed to write into the review log.
 *
 * Every mode grades through `gradeCard` and a scene is no exception (ADR-016),
 * but **a conversation is a noisy instrument**, so this is deliberately
 * conservative: a row is written only where the retrieval was unambiguous. The
 * learner produced a vouched form of a word the beat actually asked for,
 * without pressing help for it, in a beat that was met.
 *
 * NEVER `Easy`, because a conversation cannot tell easy from lucky. `Good` on
 * the first attempt, `Hard` after a repair or where the word was understood
 * with a slip (`pood` for `poodi`, `tulema` for `tulen`), and `Again` where
 * the app had to supply the word. A slip is `Hard` and never `Again`, because
 * the learner *had* the word and the other side understood it, and never
 * `Good`, because the scheduler would then stretch the interval on a form
 * that has not been produced yet. Nothing about `RATINGS` or the scheduler
 * changes here; this only decides which of the four to send, which is the
 * same latitude the scene game and the crossword already take.
 *
 * WHERE THE REQUIREMENT WAS A CASE, THE ROW CARRIES IT. That is the whole
 * pedagogical point of doing this at all: **the case you fail under pressure
 * lands in the same weak-case charts as the case you fail on a card**, so the
 * partitive somebody cannot produce at a counter shows up next to the partitive
 * they cannot produce on a flashcard, and the drill they are offered is the
 * same drill.
 *
 * An abandoned scene writes nothing, exactly as an abandoned round does, which
 * falls out of this rather than being a branch: a beat nobody met is a beat
 * with nothing to grade.
 *
 * Pure: no React, no Next, no Prisma, no clock.
 */
import type { CaseKey } from "@/lib/estonian/types";
import type { SceneState } from "./state";
import { leafNeeds, type SceneSpec } from "./types";

/** One row this run earned. `rating` is the scheduler's own vocabulary. */
export interface SceneGrade {
  readonly lemma: string;
  /** Set where the beat asked for a case, so the weak-case charts see it. */
  readonly grammCase: CaseKey | null;
  /** 1 Again, 2 Hard, 3 Good. Never 4. */
  readonly rating: 1 | 2 | 3;
  /** Which beat earned it, so the debrief can say where. */
  readonly beatId: string;
}

/**
 * The grades a finished run earned.
 *
 * Read off the state rather than accumulated during it, which is ADR-014's rule
 * about progress in a different room: the transcript is the record and the
 * grades are derived from it, so the server can recompute them from a run it
 * did not watch and a client cannot send one.
 */
export function gradesFor(scene: SceneSpec, state: SceneState): SceneGrade[] {
  const met = new Set(state.done);
  const out: SceneGrade[] = [];

  for (const beat of scene.beats) {
    if (!met.has(beat.id)) continue;

    const turns = state.turns.filter((turn) => turn.beatId === beat.id);
    if (turns.length === 0) continue;
    const helped = turns.some((turn) => turn.helped);

    /*
      The attempts that count are the ones that were turns. A fragment and an
      echo cost no patience because neither was a turn (`advance`), so neither
      may cost a rating either: a learner who answered in one word, was waited
      at, and then said the sentence has not repaired anything.
    */
    const attempts = turns.filter(
      (turn) => turn.reading !== "fragment" && turn.reading !== "echo",
    ).length;

    const slipped = turns.some((turn) => (turn.slips?.length ?? 0) > 0);
    const rating = helped ? 1 : attempts <= 1 && !slipped ? 3 : 2;

    for (const { need, index } of leafNeeds(beat.needs)) {
      /*
        Only where the beat named a word. `question`, `negation`, `register`,
        `datum` and `any` are all things a learner did and none of them is a
        word they hold a card for, so there is nothing to schedule.
      */
      if (need.kind === "lemma") {
        // One requirement, one row: `oneOf` is a choice and the turn does not
        // say which was taken, so a row per candidate would credit words
        // nobody used. The first is the beat's own head word.
        const lemma = need.oneOf[0];
        if (lemma && turns.some((turn) => turn.met[index])) {
          out.push({ lemma, grammCase: null, rating, beatId: beat.id });
        }
      }
      if (need.kind === "case" && turns.some((turn) => turn.met[index])) {
        out.push({ lemma: need.lemma, grammCase: need.grammCase, rating, beatId: beat.id });
      }
    }
  }

  return out;
}

/**
 * The words this run needed and the learner did not have.
 *
 * A beat that ran out of patience is a word they reached for and could not
 * find, which is what `SceneGap` holds as `STALLED`. The help button writes
 * `ASKED`, and that one is the caller's because it happens mid-run.
 *
 * Both go in the debrief with an add-to-deck button, and neither is ever taken
 * away: a learner who asks for four words and finishes has learned more than
 * one who gave up with none.
 */
export function stalledWords(scene: SceneSpec, state: SceneState): string[] {
  const met = new Set(state.done);
  const out = new Set<string>();
  for (const beat of scene.beats) {
    if (met.has(beat.id)) continue;
    if (!state.turns.some((turn) => turn.beatId === beat.id)) continue;
    /*
      A FEW WORDS PER BEAT, NOT THE BEAT'S WHOLE VOCABULARY.

      A `lemma` requirement lists every word that would satisfy it, which for
      "say where it hurts" is eleven body parts. The first version wrote all of
      them down, so stalling on one beat handed somebody eleven words under a
      heading saying the conversation had needed them, each with a button to
      put it in their deck. It had needed one. A list that long is not a gap
      worth reporting, it is the unit, and offering to add a unit is what
      `/learn` is for.

      The cap is on the beat rather than on the total, because two beats that
      stalled are two different things the learner could not say, and a total
      would let the first one eat the second.
    */
    for (const { need } of leafNeeds(beat.needs)) {
      if (need.kind === "lemma") for (const lemma of need.oneOf.slice(0, PER_BEAT)) out.add(lemma);
      if (need.kind === "case") out.add(need.lemma);
    }
  }
  return [...out];
}

/**
 * How many of a beat's words a stall is worth.
 *
 * Three, which is enough to show the shape of what was wanted (`pea`, `kõrv`,
 * `käsi` says "a body part" in a way one word does not) and few enough to read
 * as a gap rather than as a vocabulary list.
 */
const PER_BEAT = 3;
