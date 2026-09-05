import { cachedBlob, cachedClip, rememberClip } from "./clipCache";
import { CLEAN, type Condition } from "./conditions";
import { needsMixer, playThrough } from "./mixer";
import { stretch } from "./stretch";
import { decodeWav, encodeWav16 } from "./wav";

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
 * So the key is built here, once, from everything that changes the clip: the
 * text and the voice. The server hashes the same two. The rate it is played
 * at and the room it is heard in are made in the browser after the fetch, so
 * neither is part of the clip's key; a clip already stretched to a rate is
 * remembered under its own key beside it, in the same bounded cache.
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
   * and the condition is the round's.
   */
  readonly condition?: Condition;
  /**
   * A gentler rate than the normal one, for a screen where the learner is
   * writing down what they hear. Applied exactly as `slow` is and ignored
   * where `slow` or a condition already decides the rate.
   */
  readonly rate?: number;
}

/**
 * EVERY RATE IS THE SAME CLIP, STRETCHED HERE, WITH THE PITCH HELD.
 *
 * A slow play used to be a second clip, asked of the speech service at speed
 * 0.6. TartuNLP applies that number inside its acoustic model, as a duration
 * regulator: every phoneme's predicted length is multiplied and the extra
 * frames are copies, then the vocoder renders them. Measured on the live
 * service, the pitch does not move (240 Hz against 237) and the speech gets
 * 1.6 times longer, and what a learner hears is every vowel held flat and a
 * buzz under it. That is what a neural model does when asked to say
 * something no speaker ever said that slowly.
 *
 * The second version handed the one clip to the browser's `playbackRate` with
 * `preservesPitch`, and that was reported as stretched and robotic too: the
 * browser stretches every part of the word by the same amount, so a `t`
 * becomes a smeared double click and an `s` takes on a hum, and which
 * algorithm does it is the browser's to change in a release, so two phones
 * gave two answers. `lib/audio/stretch.ts` is the third version and the one
 * that holds: the stretch is done on the decoded samples, in this file's one
 * caller of it, and it spends the slowing on the vowels and the pauses, which
 * is where a person spends it, and leaves the consonants at the length they
 * were. Pitch, formants and voice are the recording's own throughout,
 * because every output sample is one of the recording's.
 *
 * THE NORMAL RATE IS A LITTLE UNDER THE RECORDING'S. TartuNLP reads at a
 * newsreader's clip, which is a fine pace for the news and a fast one for a
 * word somebody is meeting for the first time: reported as too quick to be
 * clear, and the report is right about the recording. So the everyday play is
 * the recording at 0.9, which is a person speaking clearly rather than
 * slowly, and every screen that has not asked for a rate gets it. The
 * stretch at that rate is inaudible as a stretch and audible as a speaker
 * taking their time over the word.
 *
 * Slow is 0.65 of the recording, which is about seven tenths of the normal
 * play: the vowels come out about 1.6 times as long and the pauses about
 * 2.5, and the consonants are untouched, which is the part of Estonian a
 * slow play exists to make audible. It could not have been this slow on the
 * browser's stretch, which smeared consonants from about 0.7 down.
 *
 * The rates are of the recording, not of one another, so a condition's
 * `speed` in `lib/audio/conditions.ts` still says what it always said.
 */
export const NORMAL_RATE = 0.9;
export const SLOW_RATE = 0.65;

/**
 * The rate a whole sentence is read at when somebody has to write it down.
 *
 * The dictation in the level check was reported as far too fast at the
 * recording's own pace, where a learner has to hold four words in their head
 * long enough to type them. 0.8 is a step under the normal play and a step
 * over slow: careful, not slowed.
 */
export const LEARNING_RATE = 0.8;

/**
 * One clip per word and voice. The rate is not in the key, because a rate
 * changes how the clip is played and never which clip it is.
 */
export function clipKey({ text, voice }: ClipRequest): string {
  return `${text}|${voice ?? ""}`;
}

/**
 * The rate this request plays at, of the recording. `slow` wins, then the
 * round's condition, then a caller's own rate, then the normal play.
 */
export function rateFor(request: ClipRequest): number {
  if (request.slow) return SLOW_RATE;
  if (request.condition && request.condition.speed !== 1) return request.condition.speed;
  if (request.rate !== undefined) return request.rate;
  return NORMAL_RATE;
}

/** A clip in hand: the url an element plays and the bytes behind it. */
export interface HeldClip {
  readonly url: string;
  readonly blob: Blob;
}

/**
 * The clip as the service sent it, from the page cache or the network.
 *
 * Both halves are returned because a `blob:` url cannot be fetched under the
 * page's Content Security Policy (`connect-src 'self'`): the bytes for the
 * stretch and for the mixer's decoder have to come from the blob itself. The
 * first browser suite to run this caught it as a page error, which is what
 * that check exists for.
 */
export async function fetchClip(request: ClipRequest): Promise<HeldClip> {
  const key = clipKey(request);
  const url = cachedClip(key);
  const blob = url ? cachedBlob(key) : null;
  if (url && blob) return { url, blob };
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: request.text,
      ...(request.voice ? { voice: request.voice } : {}),
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const fetched = await res.blob();
  return { url: rememberClip(key, fetched), blob: cachedBlob(key) ?? fetched };
}

/**
 * The clip at `rate`, stretched here and remembered beside the original, so
 * a replay and a prefetch cost no work at all. A clip this cannot read, which
 * the route only ever sends when it could not read it either, plays as it
 * came rather than not at all.
 */
export async function stretchedClip(request: ClipRequest, rate: number): Promise<HeldClip> {
  const source = await fetchClip(request);
  if (rate === 1) return source;
  const key = `${clipKey(request)}|r${rate}`;
  const url = cachedClip(key);
  const blob = url ? cachedBlob(key) : null;
  if (url && blob) return { url, blob };
  let out: Uint8Array;
  try {
    out = encodeWav16(stretch(decodeWav(new Uint8Array(await source.blob.arrayBuffer())), rate));
  } catch {
    return source;
  }
  const made = new Blob([out.buffer as ArrayBuffer], { type: "audio/wav" });
  return { url: rememberClip(key, made), blob: cachedBlob(key) ?? made };
}

/**
 * Warms the cache for a clip about to be wanted, at the rate it will be
 * wanted at, and says nothing if it cannot. The next card's word is fetched
 * and stretched while this one is being answered, so pressing the speaker on
 * it is instant rather than a round trip to a speech service and a pass over
 * the samples.
 */
export function prefetchClip(request: ClipRequest): void {
  if (typeof window === "undefined" || !request.text.trim()) return;
  void stretchedClip(request, rateFor(request)).catch(() => undefined);
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
  const clip = await stretchedClip(request, rateFor(request));
  // The rate is already in the clip; the room is the mixer's job. A slow
  // play is heard in a quiet room, because it was asked for by somebody who
  // wants to hear the word and not the café.
  const condition = request.slow ? CLEAN : (request.condition ?? CLEAN);
  if (needsMixer(condition)) return playThrough(await clip.blob.arrayBuffer(), condition, { unasked });
  // The element rather than a buffer source for the plain case, on purpose:
  // an element plays through a phone's silent switch and a Web Audio graph
  // does not, and a learner who pressed the speaker asked to hear it.
  const audio = new Audio(clip.url);
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
