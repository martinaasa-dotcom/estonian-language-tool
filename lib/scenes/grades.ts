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
import type { RoleCard } from "./props";
import type { SceneState } from "./state";
import { leafNeeds, type BeatSpec, type SceneSpec } from "./types";

/** One row this run earned. `rating` is the scheduler's own vocabulary. */
export interface SceneGrade {
  readonly lemma: string;
  /** Set where the beat asked for a case, so the weak-case charts see it. */
  readonly grammCase: CaseKey | null;
  /**
   * The case that came back instead, where exactly one case spells it that
   * way. `Review.reachedSlot` is the column it lands in, so the pair somebody
   * mixes up at a counter is counted beside the pair they mix up on a card
   * (`lib/stats/confusions.ts`), which is the whole argument for a scene
   * writing to the shared log at all.
   */
  readonly reachedCase: CaseKey | null;
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
    /*
      The app supplied the word either way: because the learner pressed the
      button, or because they said they were not following and the other side
      handed it over (`offerFor`). Both are help and both grade `Again`, or
      the scheduler would stretch an interval on a word it had just been told.
    */
    const helped = turns.some((turn) => turn.helped || turn.reading === "lost");

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
      const reachedCase = turns
        .flatMap((turn) => turn.slips ?? [])
        .find((slip) => slip.kind === "case" && slip.grammCase && slip.reached)?.reached ?? null;

      if (need.kind === "lemma") {
        // One requirement, one row: `oneOf` is a choice and the turn does not
        // say which was taken, so a row per candidate would credit words
        // nobody used. The first is the beat's own head word.
        const lemma = need.oneOf[0];
        if (lemma && turns.some((turn) => turn.met[index])) {
          out.push({ lemma, grammCase: null, reachedCase: null, rating, beatId: beat.id });
        }
      }
      if (need.kind === "case" && turns.some((turn) => turn.met[index])) {
        out.push({
          lemma: need.lemma, grammCase: need.grammCase, rating, beatId: beat.id,
          reachedCase: reachedCase === need.grammCase ? null : reachedCase,
        });
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
 * The one word to hand over when the learner says they are not following.
 *
 * The beat's own, off its requirements rather than off its topic, because
 * the topic is what the other side's line is about and the requirement is
 * what the learner is being asked for. Beside `stalledWords` because it is
 * the same question asked of one beat instead of every unmet one, and a
 * second rule about "which word does this beat want" is how the two would
 * come apart.
 */
export function offerFor(beat: BeatSpec, card: RoleCard | null = null): string | null {
  for (const { need } of leafNeeds(beat.needs)) {
    if (need.kind === "lemma") {
      /*
        THE CARD IS THE TRUTH ABOUT THIS RUN, AND THE HINT HAS TO AGREE WITH
        IT. A beat lists every word that would satisfy it, so the landlord's
        "say what has gone wrong" offers eleven; the first of them was handed
        over regardless, and a learner whose card said the door was broken was
        told to say the heating was. That is worse than no hint: they follow
        it, they are marked as having met the beat, and they have practised
        saying something that was not true of their own card. Where the card
        drew one of the beat's own words, that is the word.
      */
      const drawn = card?.props.flatMap((prop) => prop.lemmas).find((lemma) => need.oneOf.includes(lemma));
      return drawn ?? need.oneOf[0] ?? null;
    }
    if (need.kind === "case") return need.lemma;
  }
  /*
    And nothing where the beat wants a value off the card or a question: the
    answer is already in front of them, or what they need is a shape rather
    than a word, and a word that would not meet the beat is the fault above
    in a smaller room. The question said again is the honest move there.
  */
  return null;
}

/**
 * How many of a beat's words a stall is worth.
 *
 * Three, which is enough to show the shape of what was wanted (`pea`, `kõrv`,
 * `käsi` says "a body part" in a way one word does not) and few enough to read
 * as a gap rather than as a vocabulary list.
 */
const PER_BEAT = 3;
