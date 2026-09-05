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
 * cuts so no edge clicks, its pauses capped at the length a speaker leaves,
 * leveled so every voice sits at the same loudness (Kalev's clips peaked at
 * 0.74 and Mari's at 0.66 for the same word, and a learner switching voice in
 * Settings should not have to reach for the volume key), and written as
 * 16-bit PCM, which halves the store, the egress and the service worker's
 * cache.
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
 * and falls away slowly, so a trail measured from the last loud frame has to
 * reach past the whole of it: at 160 ms `tingimus` came back as `tingimu`,
 * reported by a learner on the word's own first meeting, and a word cut short
 * is a form this app never taught.
 */
export const LEAD_MS = 40;
export const TRAIL_MS = 320;
/** A cut at a sample that is not zero clicks; this many milliseconds of ramp hides it. */
export const FADE_MS = 6;
/**
 * WHAT IS SILENCE IS DECIDED FRAME BY FRAME, NOT SAMPLE BY SAMPLE.
 *
 * The vocoder does not render a pause as digital zero. It renders about a
 * third of a second of hiss at -50 dB before the first sound and after the
 * last, inside the worker's own half-second pad of true zeros. The first
 * trimmer looked at single samples against a floor of -44 dB, and the peaks
 * of that hiss reach -40, so it stopped at the hiss and kept the lot:
 * measured on `tuba`, the "40 ms lead" was 390 ms, and a press on the speaker
 * was followed by most of half a second of nothing, which is the delay this
 * trimmer was written to remove. Ten-millisecond frames measured as RMS put
 * the hiss at -50 dB and a word-final `s` at -34 to -38, so a floor at -42
 * relative to the loudest frame takes the hiss and keeps the consonant. A
 * word-initial `h` sits at -37 and is kept too.
 */
export const FRAME_MS = 10;
export const SILENCE_SHARE = 0.008;
/**
 * A PAUSE INSIDE A CLIP IS CAPPED, BECAUSE THE WORKER PADS EVERY SENTENCE.
 *
 * A text of two sentences comes back as two renderings joined with half a
 * second of zeros, and each carries its own hiss ramp on both sides, so the
 * gap between "Kuidas läheb?" and "Ma lähen poodi" measured 0.8 seconds where
 * a speaker leaves about 0.4. A pause longer than this is cut to it, from the
 * middle, faded at the cut. What is said and how fast is untouched, since
 * nothing inside a word is a pause: the floor above is what says so.
 */
export const MAX_PAUSE_MS = 450;
/**
 * THE VOICES ARE LEVELED BY LOUDNESS, WITH A CEILING ON THE PEAK.
 *
 * They were leveled by peak, and a peak is one sample: Kylli's clips came out
 * 2.6 dB louder than Tambet's for the same sentence at the same peak, because
 * one voice is smoother and the other has a sharper plosive. Loudness is the
 * RMS of the frames that hold sound, so a pause does not count against a
 * sentence with a pause in it, and every voice is brought to -16 dBFS by
 * that measure. The ceiling is what keeps a peaky voice from clipping: it is
 * applied after, and it binds for the sharper voices, which then come out a
 * little quieter than the target rather than distorted. `MAX_GAIN` is what
 * keeps a clip that is nearly silent from being turned into noise.
 */
export const TARGET_RMS = 0.158;
/** -1 dBFS: as loud as a clip can be without a resampler clipping it. */
export const TARGET_PEAK = 0.89;
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

/** The RMS of each `FRAME_MS` frame of the clip. */
function frameLevels({ rate, samples }: Pcm): { frame: number; levels: Float64Array } {
  const frame = Math.max(1, Math.round((rate * FRAME_MS) / 1000));
  const levels = new Float64Array(Math.ceil(samples.length / frame));
  for (let f = 0; f < levels.length; f++) {
    const from = f * frame;
    const to = Math.min(samples.length, from + frame);
    let sum = 0;
    for (let i = from; i < to; i++) {
      const v = samples[i] ?? 0;
      sum += v * v;
    }
    levels[f] = Math.sqrt(sum / Math.max(1, to - from));
  }
  return { frame, levels };
}

/**
 * Which frames hold sound: those above `SILENCE_SHARE` of the loudest frame.
 * Empty for a clip with nothing in it.
 */
function soundFrames(pcm: Pcm): { frame: number; sound: boolean[] } {
  const { frame, levels } = frameLevels(pcm);
  let loudest = 0;
  for (let f = 0; f < levels.length; f++) loudest = Math.max(loudest, levels[f] ?? 0);
  const floor = loudest * SILENCE_SHARE;
  const sound: boolean[] = [];
  for (let f = 0; f < levels.length; f++) sound.push(loudest > 0 && (levels[f] ?? 0) >= floor);
  // A run of under three frames over the floor with silence either side is a
  // blip in the hiss, not a sound: nothing anybody says is twenty milliseconds
  // long on its own, since a burst is followed by the vowel it opens.
  for (let f = 0; f < sound.length; f++) {
    if (!sound[f]) continue;
    let g = f;
    while (g < sound.length && sound[g]) g++;
    if (g - f < 3) for (let k = f; k < g; k++) sound[k] = false;
    f = g;
  }
  return { frame, sound };
}

/** A short ramp in at `from` and out before `to`, in place. */
function fadeEdges(samples: Float32Array, rate: number, from: number, to: number): void {
  const fade = Math.min(Math.round((rate * FADE_MS) / 1000), Math.floor((to - from) / 2));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    samples[from + i] = (samples[from + i] ?? 0) * g;
    const j = to - 1 - i;
    samples[j] = (samples[j] ?? 0) * g;
  }
}

/**
 * The clip with its dead air taken off, keeping `LEAD_MS` before the first
 * sound and `TRAIL_MS` after the last, and a short fade at each cut. A clip
 * that is silent throughout is returned as it came, since there is nothing to
 * keep and nothing to say about it.
 */
export function trimSilence(pcm: Pcm): Pcm {
  const { rate, samples } = pcm;
  const { frame, sound } = soundFrames(pcm);
  const first = sound.indexOf(true);
  if (first < 0) return pcm;
  const last = sound.lastIndexOf(true);

  const start = Math.max(0, first * frame - Math.round((rate * LEAD_MS) / 1000));
  const end = Math.min(samples.length, (last + 1) * frame + Math.round((rate * TRAIL_MS) / 1000));
  const out = samples.slice(start, end);
  fadeEdges(out, rate, 0, out.length);
  return { rate, samples: out };
}

/**
 * Every pause inside the clip cut to at most `MAX_PAUSE_MS`, from its middle,
 * so what is kept is the natural fall into the pause and the natural rise out
 * of it. The lead and the trail are not pauses and are `trimSilence`'s.
 */
export function capPauses(pcm: Pcm): Pcm {
  const { rate, samples } = pcm;
  const { frame, sound } = soundFrames(pcm);
  const first = sound.indexOf(true);
  const last = sound.lastIndexOf(true);
  if (first < 0) return pcm;
  const cap = Math.round((rate * MAX_PAUSE_MS) / 1000);
  const keep: Array<[number, number]> = [];
  let at = 0;
  let f = first;
  while (f <= last) {
    if (sound[f]) {
      f++;
      continue;
    }
    let g = f;
    while (g <= last && !sound[g]) g++;
    const from = f * frame;
    const to = g * frame;
    if (to - from > cap) {
      const cut = to - from - cap;
      const middle = from + Math.floor((to - from) / 2);
      keep.push([at, middle - Math.floor(cut / 2)]);
      at = middle + Math.ceil(cut / 2);
    }
    f = g;
  }
  if (keep.length === 0) return pcm;
  keep.push([at, samples.length]);
  const total = keep.reduce((n, [a, b]) => n + (b - a), 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const [a, b] of keep) {
    const piece = samples.slice(a, b);
    // The cut lands in near silence, so the fade is only there for the seam.
    if (a > 0) fadeEdges(piece, rate, 0, Math.min(piece.length, Math.round((rate * FADE_MS) / 1000) * 2));
    if (b < samples.length) {
      fadeEdges(piece, rate, Math.max(0, piece.length - Math.round((rate * FADE_MS) / 1000) * 2), piece.length);
    }
    out.set(piece, o);
    o += piece.length;
  }
  return { rate, samples: out };
}

/** Every clip at the same loudness, under one peak, so two voices reading one word are equally loud. */
export function normaliseLoudness(pcm: Pcm): Pcm {
  const { frame, sound } = soundFrames(pcm);
  const peak = peakOf(pcm.samples);
  if (peak === 0) return pcm;
  let sum = 0;
  let count = 0;
  for (let f = 0; f < sound.length; f++) {
    if (!sound[f]) continue;
    const to = Math.min(pcm.samples.length, (f + 1) * frame);
    for (let i = f * frame; i < to; i++) {
      const v = pcm.samples[i] ?? 0;
      sum += v * v;
      count++;
    }
  }
  const loudness = count > 0 ? Math.sqrt(sum / count) : peak;
  const gain = Math.min(TARGET_RMS / loudness, TARGET_PEAK / peak, MAX_GAIN);
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
 * cap the pauses, level, and write as 16-bit. Throws `WavError` on bytes that
 * are not a WAV this understands, and the route then keeps the clip as it
 * came, because a clip that is merely untrimmed is better than none.
 */
export function prepareClip(bytes: Uint8Array): Uint8Array {
  return encodeWav16(normaliseLoudness(capPauses(trimSilence(decodeWav(bytes)))));
}
