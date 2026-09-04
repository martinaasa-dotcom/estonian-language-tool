/**
 * The room a clip is heard in, made in the browser.
 *
 * `lib/audio/conditions.ts` says what a condition is; this turns one into
 * sound. A clip arrives as the same WAV the speech service always sends, and
 * on its way to the speaker it may be cut to a telephone band, sat inside
 * filtered noise, or started from partway through. None of that touches the
 * text: what changes is the delivery of a sentence a lexicographer recorded.
 *
 * Web Audio rather than a second file, because a café is a filter over noise
 * the browser can generate for nothing, and a phone line is one band-pass.
 * Nothing ships, nothing is fetched twice, nothing needs a licence, and it
 * works with the network off exactly as far as the clip itself does.
 *
 * THIS IS NOT A SECOND PLAY PATH. `playClip` in `lib/audio/clip.ts` is the
 * one door and it calls in here only for a condition that needs the graph;
 * a clean clip still goes through `HTMLAudioElement`, which is what every
 * existing screen measured. The invariant on `new Audio(` covers that door,
 * and the one on `AudioContext` covers this file and the feedback tones.
 *
 * A BLOCKED AUTOPLAY IS STILL NOT A FAILURE. A context made before the reader
 * has touched the page comes up suspended and will not resume until a gesture,
 * which is the same policy `playClip` already tells apart from a real absence.
 * So a suspended context on an unasked play reports `blocked`, the caller
 * asks for a press, and the press is what resumes it.
 *
 * Browser only.
 */
import type { Condition } from "./conditions";
import type { PlayOutcome } from "./clip";

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

/** A second of white noise, made once per context and looped. */
let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** Whether a condition needs the graph at all, or is the plain element's job. */
export function needsMixer(condition: Condition): boolean {
  return condition.noise !== null || condition.band !== null || condition.skip > 0;
}

/**
 * Plays the clip at `url` under `condition`, resolving when it has finished.
 *
 * `unasked` is the autoplay case: a context the browser will not run yet
 * answers `blocked` rather than throwing, and anything else that goes wrong
 * throws, which is the one outcome a caller has to act on.
 */
export async function playThrough(
  url: string,
  condition: Condition,
  { unasked = false }: { unasked?: boolean } = {},
): Promise<PlayOutcome> {
  const ctx = audioContext();
  if (!ctx) throw new Error("no audio context");
  const running = (): boolean => (ctx.state as string) === "running";
  if (!running()) {
    // A gesture resumes it at once; without one it stays suspended, and a
    // resume that has not settled inside a beat is the no-gesture case.
    await Promise.race([
      ctx.resume().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
    if (!running()) {
      if (unasked) return "blocked";
      throw new Error("audio context suspended");
    }
  }

  const bytes = await (await fetch(url)).arrayBuffer();
  const buffer = await ctx.decodeAudioData(bytes);
  const offset = Math.min(buffer.duration * condition.skip, Math.max(0, buffer.duration - 0.4));
  const remaining = buffer.duration - offset;
  const at = ctx.currentTime + 0.02;

  const voice = ctx.createBufferSource();
  voice.buffer = buffer;
  let head: AudioNode = voice;
  if (condition.band) {
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = condition.band.lowHz;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = condition.band.highHz;
    head.connect(high).connect(low);
    head = low;
  }
  const voiceGain = ctx.createGain();
  // A band-passed voice loses energy, so it is brought back up a little.
  voiceGain.gain.value = condition.band ? 1.6 : 1;
  head.connect(voiceGain).connect(ctx.destination);

  let room: AudioBufferSourceNode | null = null;
  if (condition.noise) {
    room = ctx.createBufferSource();
    room.buffer = noise(ctx);
    room.loop = true;
    const shape = ctx.createBiquadFilter();
    shape.type = "lowpass";
    shape.frequency.value = condition.noise.lowpassHz;
    const roomGain = ctx.createGain();
    // Fades in ahead of the voice and out after it, so the room is there
    // before anybody speaks rather than switching on with the first word.
    roomGain.gain.setValueAtTime(0, at);
    roomGain.gain.linearRampToValueAtTime(condition.noise.level, at + 0.25);
    roomGain.gain.setValueAtTime(condition.noise.level, at + 0.35 + remaining);
    roomGain.gain.linearRampToValueAtTime(0, at + 0.7 + remaining);
    room.connect(shape).connect(roomGain).connect(ctx.destination);
    room.start(at);
    room.stop(at + 0.75 + remaining);
  }

  const voiceAt = condition.noise ? at + 0.35 : at;
  voice.start(voiceAt, offset);

  await new Promise<void>((resolve) => {
    voice.onended = () => resolve();
  });
  if (room) {
    await new Promise<void>((resolve) => {
      room!.onended = () => resolve();
    });
  }
  return "played";
}
