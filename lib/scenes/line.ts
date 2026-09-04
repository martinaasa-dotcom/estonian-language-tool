/**
 * What the other side says, and where it came from.
 *
 * The ladder of design §2: an attested line where one fits, a composed one
 * inside a closed word list and behind the gate where none does, and a way
 * out that is always honest when both fail. Every line carries its
 * provenance, and the screen prints it, because a learner is never invited
 * to memorise a sentence without being told where it came from.
 *
 * THE WAY OUT IS NARRATED IN ENGLISH, NEVER INVENTED IN ESTONIAN. When no
 * recorded sentence fits the move and composition failed twice, there is
 * still a person standing at the desk. What the learner sees is a stage
 * direction: they did not catch that and are waiting for you to say it
 * again. It is the truest thing that can happen in a conversation and it
 * costs no Estonian this app did not write. `patience` bounds how often it
 * happens at one beat, so a beat nothing can be built for is skipped rather
 * than looped, and the debrief says so.
 *
 * The composer is injected. This module never opens a provider, never reads
 * a key, and the gate the composed line has to pass lives in `gate.ts`. On a
 * deployment with no key the composer is absent and every beat retrieval
 * cannot fill is narrated, which is the shorter scene design §16 describes.
 *
 * Pure apart from the injected function.
 */
import type { PlannedBeat } from "./draw";
import type { Line } from "./retrieval";
import type { Provenance } from "./run";
import type { TurnOutcome } from "./turn";

export interface SpokenLine {
  readonly text: string;
  readonly provenance: Provenance;
  /** The entry an attested line was recorded under. */
  readonly lemma: string | null;
}

export interface ComposeRequest {
  readonly beat: PlannedBeat;
  /** The last two turns, as conversation, learner's last. */
  readonly recent: readonly { role: "other" | "learner"; text: string }[];
  /** Whether this is a repair, and of what kind. */
  readonly repair: TurnOutcome | null;
}

export interface LineSources {
  /** Recorded sentences that fit the beat, in pool order. Already filtered. */
  readonly attested: (beat: PlannedBeat) => readonly Line[];
  /** A gated composed line, or null when withheld or unavailable. */
  readonly compose?: (request: ComposeRequest) => Promise<string | null>;
}

/**
 * How the narration reads for each way a turn can fail. English on purpose.
 *
 * `english` is the persona's: the helpful one says their line again slowly,
 * the brisk one at speed, which the caller decides from the agenda. What is
 * said here is the stage direction beside the replay.
 */
export const NARRATION: Readonly<Record<TurnOutcome | "silent" | "moveOn", string>> = {
  complete: "",
  incomplete: "They nod at the part they got, and wait for the rest.",
  unrecognised: "They did not catch that. They say it again.",
  offTarget: "They understood the words, and it was not what they asked. They ask again, more slowly.",
  english: "They heard the English, and answer in Estonian anyway.",
  repeat: "They look at you, having just said that themselves, and wait.",
  tooShort: "They wait for the rest of the sentence.",
  silent: "They wait.",
  moveOn: "They give up on that one and move on.",
};

/** Says which one of a set of attested lines to use, given what the run has already said. */
export function pickAttested(lines: readonly Line[], used: ReadonlySet<string>, random: () => number): Line | null {
  const fresh = lines.filter((l) => !used.has(l.text));
  const pool = fresh.length > 0 ? fresh : lines;
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/**
 * The other side's line for a beat.
 *
 * `repair` is a re-ask of the same beat: an attested line already said is
 * avoided where the pool allows, and where the pool is one line, saying it
 * again is what a person does.
 */
export async function sceneLine(input: {
  beat: PlannedBeat;
  sources: LineSources;
  used: ReadonlySet<string>;
  random: () => number;
  recent: readonly { role: "other" | "learner"; text: string }[];
  repair: TurnOutcome | null;
}): Promise<SpokenLine> {
  const { beat, sources, used, random, recent, repair } = input;

  // A curveball that speaks English holds its own line.
  if (beat.english) return { text: beat.english, provenance: "english", lemma: null };

  const attested = pickAttested(sources.attested(beat), used, random);
  if (attested) return { text: attested.text, provenance: "attested", lemma: attested.lemma };

  if (sources.compose) {
    const composed = await sources.compose({ beat, recent, repair });
    if (composed) return { text: composed, provenance: "composed", lemma: null };
  }

  return { text: "", provenance: "narrated", lemma: null };
}
