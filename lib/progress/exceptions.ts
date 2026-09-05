import { exceptionIndex, type ExceptionEntry } from "@/lib/dict/facts";
import { isAround } from "@/lib/collections/levels";
import { CEFR_LEVELS } from "@/lib/estonian/types";
import type { Level } from "@/lib/collections/syllabus/types";
import {
  EXCEPTION_KINDS, KIND_NOTES, type ExceptionFamily, type ExceptionKind,
} from "@/lib/estonian/exceptions";

/**
 * THE EXCEPTION AREA, READ FOR ONE LEARNER.
 *
 * `lib/estonian/exceptions.ts` says which words break which pattern, and
 * `exceptionIndex` in `lib/dict/facts.ts` answers that for the whole graded
 * dictionary once a minute. This is the layer between them and a screen: which
 * of those a learner is anywhere near, in what order, and how many of each.
 *
 * BANDED RATHER THAN FILTERED WHERE IT CAN BE. A learner at A1 does not need
 * the polite imperative of a C1 verb, and somebody at B2 does not want to be
 * shown `tuba` again. `isAround` is the same one band either side the
 * suggestion row, the pairs round and the review queue use, and the reason it
 * is a filter here rather than an ordering is that this is a reference area
 * rather than a deck: nothing is being taken away from anybody, and the whole
 * list is one press away with the band widened.
 *
 * Reads only. Nothing here writes, and nothing here is stored: which words
 * break a pattern is derived from the dictionary on every request, the way
 * every other figure in `lib/progress/` is derived from the review log
 * (ADR-014).
 */

/** Where a band sits on the ladder. An ungraded row cannot reach here. */
function bandRank(cefr: string | null): number {
  const at = CEFR_LEVELS.indexOf(cefr as never);
  return at === -1 ? CEFR_LEVELS.length : at;
}

export interface KindGroup {
  readonly kind: ExceptionKind;
  readonly family: ExceptionFamily;
  /** Every banded entry with an exception of this kind, in dictionary order. */
  readonly entries: readonly ExceptionEntry[];
  /** How many there are across the whole graded dictionary, band or no band. */
  readonly everywhere: number;
}

/** Every kind, with the words at this learner's level and the size of each. */
export async function exceptionGroups(level: Level): Promise<KindGroup[]> {
  const index = await exceptionIndex();

  /*
    Easiest first and stable, which is the argument `/review/government` makes
    about its own pool: this is a reference somebody comes back to, so the page
    should be the same page, and the word at the top of it should be one they
    already half know. Alphabetical alone put three country names at the head of
    the short illative, which is a true list and a poor advert for it.

    Ended on the lemma, because a band is not unique and an order that is loose
    at the end is loose.
  */
  const near = index
    .filter((row) => isAround(row.cefr, level))
    .sort((a, b) => bandRank(a.cefr) - bandRank(b.cefr) || a.lemma.localeCompare(b.lemma));
  const groups: KindGroup[] = [];

  for (const kind of EXCEPTION_KINDS) {
    groups.push({
      kind,
      family: KIND_NOTES[kind].family,
      entries: near.filter((row) => row.exceptions.some((e) => e.kind === kind)),
      everywhere: index.filter((row) => row.exceptions.some((e) => e.kind === kind)).length,
    });
  }
  return groups;
}

/** One kind, for its own page. Null where the key is not a kind. */
export async function exceptionGroup(kind: string, level: Level): Promise<KindGroup | null> {
  if (!(EXCEPTION_KINDS as readonly string[]).includes(kind)) return null;
  const groups = await exceptionGroups(level);
  return groups.find((g) => g.kind === kind) ?? null;
}

/**
 * How many graded words break a pattern somewhere, for the one sentence the
 * area opens with.
 *
 * Counted rather than written down. A number typed into a paragraph is a number
 * nobody re-measures, and the whole argument of the page is about proportion:
 * the pattern holds for most words and not for these.
 */
export async function exceptionScale(): Promise<number> {
  return (await exceptionIndex()).length;
}
