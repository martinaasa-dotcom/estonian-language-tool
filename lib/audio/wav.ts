/**
 * What is done to a clip between the speech service and the cache.
 *
 * TartuNLP answers with a WAV of 32-bit floats at 22,050 Hz and half a second
 * of digital silence on either side of every sentence, because the worker
 * concatenates a fixed pad round each one. For a word on a flashcard that is
 * the wrong shape twice over. Measured on `tuba`: 0.85 seconds of nothing,
 * then 0.39 seconds of speech, then 0.5 seconds of nothing, so a press on the
 * speaker button was followed by most of a second of silence before anything
 * was heard, which is the exact delay that makes a voice feel like a machine
 * warming up. And 32-bit float is a studio format for a signal that never
 * exceeds 16-bit precision on its way out of a vocoder: 88 KB a second, every
 * clip, stored for ever and shipped to every phone.
 *
 * So a clip is trimmed to a short lead and a natural release, faded at the
 * cuts so no edge clicks, leveled so every voice sits at the same loudness
 * (Kalev's clips peaked at 0.74 and Mari's at 0.66 for the same word, and a
 * learner switching voice in Settings should not have to reach for the volume
 * key), and written as 16-bit PCM, which halves the store, the egress and the
 * service worker's cache.
 *
 * NOTHING HERE CHANGES WHAT IS SAID OR HOW FAST. The samples inside the speech
 * are untouched but for a single gain. Speed is not applied here either: it
 * is applied at playback, in the browser, with the pitch held, because the
 * model's own slow setting stretches every phoneme on repeated frames and
 * sounds like it (see lib/audio/clip.ts).
 *
 * Pure. No Node, no Buffer, no React: it takes bytes and returns bytes, which
 * is what lets it be unit tested and what would let it run in a worker.
 */

export interface Pcm {
  readonly rate: number;
  readonly samples: Float32Array;
}

/**
 * How much silence stays before the first sound and after the last.
 *
 * The trail is longer than the lead on purpose. A final `s` is quiet, long
 * and falls away slowly, so a trail measured from the last loud sample has to
 * reach past the whole of it: at 160 ms `tingimus` came back as `tingimu`,
 * reported by a learner on the word's own first meeting, and a word cut short
 * is a form this app never taught.
 */
export const LEAD_MS = 40;
export const TRAIL_MS = 320;
/** A cut at a sample that is not zero clicks; this many milliseconds of ramp hides it. */
export const FADE_MS = 6;
/**
 * Below this share of the clip's own peak is silence. About -44 dB, which is
 * under the quietest consonant a vocoder produces (a word-final `s` sits
 * around -35 dB against the vowel before it, and 0.02 was cutting it) and
 * still well over the noise floor of one. It is relative rather than absolute
 * so a quiet voice is trimmed the same as a loud one.
 */
export const SILENCE_SHARE = 0.006;
/** -1 dBFS: as loud as a clip can be without a resampler clipping it. */
export const TARGET_PEAK = 0.89;
/** A clip that is nearly silent is not turned into noise by leveling it. */
export const MAX_GAIN = 4;

export class WavError extends Error {}

function ascii(view: DataView, at: number): string {
  return String.fromCharCode(
    view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3),
  );
}

/** Reads a RIFF WAV holding 32-bit float or 16-bit PCM, in one or more channels, down to mono. */
export function decodeWav(bytes: Uint8Array): Pcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || ascii(view, 0) !== "RIFF" || ascii(view, 8) !== "WAVE") {
    throw new WavError("not a WAV file");
  }
  let format: { tag: number; channels: number; rate: number; bits: number } | null = null;
  let data: { at: number; length: number } | null = null;
  let at = 12;
  while (at + 8 <= bytes.byteLength) {
    const id = ascii(view, at);
    const length = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      let tag = view.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE carries the real tag in its sub-format GUID.
      if (tag === 0xfffe && length >= 26) tag = view.getUint16(body + 24, true);
      format = {
        tag,
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      data = { at: body, length: Math.min(length, bytes.byteLength - body) };
    }
    at = body + length + (length & 1);
  }
  if (!format || !data) throw new WavError("WAV without fmt or data");
  if (format.channels < 1 || format.rate <= 0) throw new WavError("WAV with no channels or no rate");
  const isFloat = format.tag === 3 && format.bits === 32;
  const isPcm16 = format.tag === 1 && format.bits === 16;
  if (!isFloat && !isPcm16) throw new WavError(`unsupported WAV format ${format.tag}/${format.bits}`);

  const width = format.bits / 8;
  const frames = Math.floor(data.length / (width * format.channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) {
      const offset = data.at + (i * format.channels + c) * width;
      sum += isFloat ? view.getFloat32(offset, true) : view.getInt16(offset, true) / 32768;
    }
    samples[i] = sum / format.channels;
  }
  return { rate: format.rate, samples };
}

function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i] ?? 0);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * The clip with its dead air taken off, keeping `LEAD_MS` before the first
 * sound and `TRAIL_MS` after the last, and a short fade at each cut. A clip
 * that is silent throughout is returned as it came, since there is nothing to
 * keep and nothing to say about it.
 */
export function trimSilence(pcm: Pcm): Pcm {
  const { rate, samples } = pcm;
  const peak = peakOf(samples);
  if (peak === 0) return pcm;
  const floor = peak * SILENCE_SHARE;
  let first = 0;
  while (first < samples.length && Math.abs(samples[first] ?? 0) < floor) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last] ?? 0) < floor) last--;

  const start = Math.max(0, first - Math.round((rate * LEAD_MS) / 1000));
  const end = Math.min(samples.length, last + 1 + Math.round((rate * TRAIL_MS) / 1000));
  const out = samples.slice(start, end);
  const fade = Math.min(Math.round((rate * FADE_MS) / 1000), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] = (out[i] ?? 0) * g;
    const j = out.length - 1 - i;
    out[j] = (out[j] ?? 0) * g;
  }
  return { rate, samples: out };
}

/** Every clip at the same peak, so two voices reading one word are equally loud. */
export function normalisePeak(pcm: Pcm): Pcm {
  const peak = peakOf(pcm.samples);
  if (peak === 0) return pcm;
  const gain = Math.min(TARGET_PEAK / peak, MAX_GAIN);
  const out = new Float32Array(pcm.samples.length);
  for (let i = 0; i < out.length; i++) out[i] = (pcm.samples[i] ?? 0) * gain;
  return { rate: pcm.rate, samples: out };
}

/** A mono 16-bit PCM WAV, which every browser and every WAV reader plays. */
export function encodeWav16(pcm: Pcm): Uint8Array {
  const frames = pcm.samples.length;
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  put(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, pcm.rate, true);
  view.setUint32(28, pcm.rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, pcm.samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
  }
  return bytes;
}

/**
 * What the speech route does to every clip before it is cached: decode, trim,
 * level, and write as 16-bit. Throws `WavError` on bytes that are not a WAV
 * this understands, and the route then keeps the clip as it came, because a
 * clip that is merely untrimmed is better than none.
 */
export function prepareClip(bytes: Uint8Array): Uint8Array {
  return encodeWav16(normalisePeak(trimSilence(decodeWav(bytes))));
}
