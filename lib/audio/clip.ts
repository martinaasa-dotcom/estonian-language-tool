import { cachedClip, rememberClip } from "./clipCache";
import { CLEAN, type Condition } from "./conditions";
import { needsMixer, playThrough } from "./mixer";

/**
 * One clip, fetched once.
 *
 * `Speak` and the pairs round each carried their own copy of "look in the
 * cache, otherwise POST to /api/tts and remember the blob", and a third copy
 * was about to be written for prefetching the next card. Three copies of a
 * cache key is where two of them stop agreeing about what is in it: a voice
 * added to the key in one place and not another would play the wrong voice
 * from cache and look like the setting not saving.
 *
 * So the key is built here, once, from everything that changes the *clip*:
 * the text and the voice, which is what the server hashes too. Nothing about
 * how it is played is in it. The route forwards no speed at all, and a rate,
 * a slow play and a hearing condition (`lib/audio/conditions.ts`) are all
 * applied in the browser to the one clip that came back, which is what makes
 * a slow play work offline wherever a normal one does. This paragraph said
 * the speed was in the key and hashed by the server, and had said so since
 * before the route stopped taking one: `clipKey` two screens down is the
 * truth and always was.
 *
 * Browser only, since it mints object URLs. Never throws on a play that the
 * browser refuses; a clip that could not be fetched rejects, which is the one
 * outcome a caller has to act on.
 */
export interface ClipRequest {
  readonly text: string;
  readonly slow?: boolean;
  readonly voice?: string;
  /**
   * How it is delivered: the rate, the room, the line. Clean when absent,
   * which is what every screen that has not asked gets. `slow` wins over a
   * condition's own speed, because "play it slowly" is the learner's request
   * and the condition is the round's. The rate is a playback rate on the
   * element with the pitch held, never a number sent to the service, for the
   * reason SLOW_RATE gives below.
   */
  readonly condition?: Condition;
  /**
   * A gentler rate than the service's own, for a screen where the learner is
   * writing down what they hear. Applied exactly as `slow` is, at playback
   * with the pitch held, and ignored where `slow` or a condition already
   * decides the rate.
   */
  readonly rate?: number;
}

/**
 * SLOW IS THE SAME CLIP PLAYED SLOWER, WITH THE PITCH HELD.
 *
 * It used to be a second clip, asked of the speech service at speed 0.6.
 * TartuNLP applies that number inside its acoustic model, as a duration
 * regulator: every phoneme's predicted length is multiplied and the extra
 * frames are copies, then the vocoder renders them. Measured on the live
 * service, the pitch does not move (240 Hz against 237) and the speech gets
 * 1.6 times longer, and what a learner hears is every vowel held flat and a
 * buzz under it, which is exactly the "robotic" a person reports. That is
 * what a neural model does when asked to say something no speaker ever said
 * that slowly.
 *
 * A pitch-preserving time stretch over real speech is a different thing: it
 * keeps the recording's own pitch contour and its formants and only repeats
 * or drops short overlapping grains of waveform, which is how a video player's
 * 0.75x sounds like the same person talking more slowly. Every browser ships
 * one behind `playbackRate`, and `preservesPitch` is what asks for it rather
 * than for the tape-slowed drop in pitch.
 *
 * So there is one clip per word and voice, and this is the rate it plays at
 * when asked for slowly. 0.7 is where the stretch is still clean: at 0.6 the
 * grains start to smear on consonants, which is the part of Estonian a slow
 * play exists to make audible. The clip's own leading silence is already
 * trimmed off on the server, so slowing it does not slow the wait for it.
 */
export const SLOW_RATE = 0.7;

/**
 * The rate a whole sentence is read at when somebody has to write it down.
 *
 * TartuNLP reads at a newsreader's clip, which is right for a word on a card
 * and was reported as far too fast for the dictation in the level check,
 * where a learner has to hold four words in their head long enough to type
 * them. 0.85 is a person speaking carefully rather than slowly: the stretch
 * is inaudible at that rate, and the slow half of the same control is still
 * a step down from it.
 */
export const LEARNING_RATE = 0.85;

/**
 * One clip per word and voice. The rate is not in the key, because a
 * condition changes how the clip is played and never which clip it is:
 * "at speed" is the same stretch as slow, the other way.
 */
export function clipKey({ text, voice }: ClipRequest): string {
  return `${text}|${voice ?? ""}`;
}

/** The object URL for a clip, from the page cache or the network. */
export async function fetchClip(request: ClipRequest): Promise<string> {
  const key = clipKey(request);
  const held = cachedClip(key);
  if (held) return held;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: request.text,
      ...(request.voice ? { voice: request.voice } : {}),
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return rememberClip(key, await res.blob());
}

/**
 * Warms the cache for a clip about to be wanted, and says nothing if it
 * cannot. The next card's word is fetched while this one is being answered,
 * so pressing the speaker on it is instant rather than a round trip to a
 * speech service.
 */
export function prefetchClip(request: ClipRequest): void {
  if (typeof window === "undefined" || !request.text.trim()) return;
  void fetchClip(request).catch(() => undefined);
}

/**
 * A CLIP THE BROWSER REFUSED TO AUTOPLAY IS NOT A CLIP THAT FAILED.
 *
 * Every browser blocks `HTMLAudioElement.play()` on a page the reader has not
 * touched yet, and rejects it with a `NotAllowedError`. The clip is in hand,
 * the service answered, and the same call on a press will be allowed: it is a
 * fact about the gesture, not about the audio.
 *
 * `components/Speak.tsx` knew that and said so in a comment. The minimal-pairs
 * round did not: it wrapped the fetch and the play in one `try` and set
 * `audioFailed` on either, and that state replaces the whole drill with "No
 * audio, no drill. It runs on TartuNLP and needs a connection." The round
 * autoplays on mount, which is the no-gesture case by construction, so on
 * every phone and every Safari a learner opening the drill was told their
 * connection was the problem, given a button back to Today, and never shown
 * the 80px play button sitting behind that screen which would have worked.
 * A failure that misnames its cause sends the reader to the wrong place, which
 * is the rule `scripts/test-restore.mjs` has a paragraph about.
 *
 * So the distinction lives here, once, and both callers read it. `blocked`
 * means "ask for a press"; anything else throws and is a real absence.
 */
export type PlayOutcome = "played" | "blocked";

export async function playClip(
  request: ClipRequest,
  { unasked = false }: { unasked?: boolean } = {},
): Promise<PlayOutcome> {
  const url = await fetchClip(request);
  // The room is the mixer's job; the rate and a quiet room are the element's.
  const condition = request.slow ? CLEAN : (request.condition ?? CLEAN);
  if (needsMixer(condition)) return playThrough(url, condition, { unasked });
  const audio = new Audio(url);
  if (request.slow) {
    audio.preservesPitch = true;
    audio.playbackRate = SLOW_RATE;
  } else if (condition.speed !== 1) {
    // "At speed" is the same time stretch as slow, the other way, and holds
    // the pitch for the same reason: a faster tape is a higher voice.
    audio.preservesPitch = true;
    audio.playbackRate = condition.speed;
  } else if (request.rate !== undefined && request.rate !== 1) {
    audio.preservesPitch = true;
    audio.playbackRate = request.rate;
  }
  try {
    await audio.play();
  } catch (error) {
    if (unasked && error instanceof DOMException && error.name === "NotAllowedError") {
      return "blocked";
    }
    throw error;
  }
  return "played";
}
