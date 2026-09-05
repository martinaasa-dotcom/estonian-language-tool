import { describe, expect, it } from "vitest";
import {
  capPauses, decodeWav, encodeWav16, FADE_MS, LEAD_MS, MAX_PAUSE_MS, normaliseLoudness, prepareClip,
  SILENCE_SHARE, TARGET_PEAK, TARGET_RMS, TRAIL_MS, trimSilence, WavError,
} from "./wav";

const RATE = 22050;

/** A float32 WAV of `pieces`, each `[seconds, amplitude]`, a 220 Hz tone where the amplitude is not zero. */
function wavOf(pieces: Array<[number, number]>): Uint8Array {
  const n = pieces.reduce((sum, [s]) => sum + Math.round(RATE * s), 0);
  const bytes = new Uint8Array(44 + n * 4);
  const view = new DataView(bytes.buffer);
  const put = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  put(0, "RIFF"); view.setUint32(4, 36 + n * 4, true); put(8, "WAVE");
  put(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 32, true);
  put(36, "data"); view.setUint32(40, n * 4, true);
  let i = 0;
  for (const [seconds, amplitude] of pieces) {
    for (let k = 0; k < Math.round(RATE * seconds); k++, i++) {
      view.setFloat32(44 + i * 4, amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE), true);
    }
  }
  return bytes;
}

/** A float32 WAV the way TartuNLP writes one: `pad` seconds of silence round a tone. */
function tartuLike(pad: number, speech: number, amplitude = 0.7): Uint8Array {
  return wavOf([[pad, 0], [speech, amplitude], [pad, 0]]);
}

const peakOf = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("decoding", () => {
  it("reads the float WAV the service sends", () => {
    const pcm = decodeWav(tartuLike(0.5, 0.4));
    expect(pcm.rate).toBe(RATE);
    expect(pcm.samples.length).toBe(Math.round(RATE * 1.4));
  });

  it("reads its own 16-bit output back within a bit", () => {
    const pcm = decodeWav(tartuLike(0.1, 0.2));
    const back = decodeWav(encodeWav16(pcm));
    expect(back.rate).toBe(RATE);
    expect(back.samples.length).toBe(pcm.samples.length);
    for (let i = 0; i < pcm.samples.length; i += 97) {
      expect(Math.abs((back.samples[i] ?? 0) - (pcm.samples[i] ?? 0))).toBeLessThan(1 / 16000);
    }
  });

  it("refuses bytes that are not a WAV", () => {
    expect(() => decodeWav(new TextEncoder().encode('{"error":"nope"}'))).toThrow(WavError);
    expect(() => decodeWav(new Uint8Array(4))).toThrow(WavError);
  });
});

describe("trimming", () => {
  it("takes the service's half-second pads down to a short lead and a release", () => {
    const out = trimSilence(decodeWav(tartuLike(0.5, 0.4)));
    const expected = Math.round(RATE * 0.4) + Math.round((RATE * LEAD_MS) / 1000) + Math.round((RATE * TRAIL_MS) / 1000);
    // Frame-aligned, so within a frame either side.
    expect(Math.abs(out.samples.length - expected)).toBeLessThanOrEqual(RATE * 0.02);
    // The first sound now arrives inside the lead rather than half a second in.
    let first = 0;
    while (Math.abs(out.samples[first] ?? 0) < 0.1) first++;
    expect(first / RATE).toBeLessThan((LEAD_MS + FADE_MS) / 1000 + 0.015);
  });

  it("takes the vocoder's hiss off the front along with the zeros", () => {
    // Half a second of zeros, a third of a second of hiss at -50 dB, then the word.
    const hiss = 0.7 * 0.0032;
    const out = trimSilence(decodeWav(wavOf([[0.5, 0], [0.35, hiss], [0.4, 0.7], [0.35, hiss], [0.5, 0]])));
    let first = 0;
    while (Math.abs(out.samples[first] ?? 0) < 0.1) first++;
    expect(first / RATE).toBeLessThan(0.07);
    expect(SILENCE_SHARE).toBeGreaterThan(0.0032 * 1.5);
  });

  it("keeps a quiet final consonant, which sits well over the hiss", () => {
    // A word-final s at -36 dB against the vowel, for 150 ms, then silence.
    const out = trimSilence(decodeWav(wavOf([[0.5, 0], [0.3, 0.7], [0.15, 0.7 * 0.016], [0.5, 0]])));
    // 40 ms lead, 300 ms vowel, 150 ms consonant, 320 ms trail.
    expect(out.samples.length / RATE).toBeGreaterThan(0.04 + 0.3 + 0.15 + 0.3);
  });

  it("fades the cut so an edge cannot click", () => {
    const out = trimSilence(decodeWav(tartuLike(0.01, 0.3)));
    expect(Math.abs(out.samples[0] ?? 1)).toBe(0);
    expect(Math.abs(out.samples[out.samples.length - 1] ?? 1)).toBe(0);
  });

  it("leaves a clip with nothing in it alone", () => {
    const silent = decodeWav(tartuLike(0.2, 0, 0));
    expect(trimSilence(silent).samples.length).toBe(silent.samples.length);
  });
});

describe("pauses", () => {
  it("cuts a pause between two sentences to the length a speaker leaves", () => {
    const pcm = decodeWav(wavOf([[0.04, 0], [0.5, 0.7], [1.0, 0], [0.5, 0.7], [0.3, 0]]));
    const out = capPauses(pcm);
    const removed = 1.0 - MAX_PAUSE_MS / 1000;
    expect((pcm.samples.length - out.samples.length) / RATE).toBeCloseTo(removed, 1);
  });

  it("leaves a pause a speaker would leave, and the lead and the trail", () => {
    const pcm = decodeWav(wavOf([[0.04, 0], [0.5, 0.7], [0.3, 0], [0.5, 0.7], [0.32, 0]]));
    expect(capPauses(pcm).samples.length).toBe(pcm.samples.length);
    const padded = decodeWav(wavOf([[2, 0], [0.5, 0.7], [2, 0]]));
    expect(capPauses(padded).samples.length).toBe(padded.samples.length);
  });

  it("does not read a blip in the hiss as a word", () => {
    const hiss = 0.7 * 0.0032;
    const pcm = decodeWav(wavOf([[0.04, 0], [0.5, 0.7], [0.45, hiss], [0.01, 0.7 * 0.02], [0.45, hiss], [0.5, 0.7], [0.3, 0]]));
    const out = capPauses(pcm);
    expect((pcm.samples.length - out.samples.length) / RATE).toBeCloseTo(0.91 - MAX_PAUSE_MS / 1000, 1);
  });
});

describe("leveling", () => {
  it("puts a quiet voice and a loud one at the same loudness", () => {
    const quiet = normaliseLoudness(decodeWav(tartuLike(0, 0.2, 0.3)));
    const loud = normaliseLoudness(decodeWav(tartuLike(0, 0.2, 0.9)));
    // A sine's RMS is its peak over root two.
    expect(peakOf(quiet.samples)).toBeCloseTo(TARGET_RMS * Math.SQRT2, 3);
    expect(peakOf(loud.samples)).toBeCloseTo(TARGET_RMS * Math.SQRT2, 3);
  });

  it("measures loudness over the sound and not over the pauses", () => {
    const short = normaliseLoudness(decodeWav(wavOf([[0.2, 0.5]])));
    const paused = normaliseLoudness(decodeWav(wavOf([[0.2, 0.5], [1.5, 0], [0.2, 0.5]])));
    expect(peakOf(paused.samples)).toBeCloseTo(peakOf(short.samples), 2);
  });

  it("never pushes a peaky voice past the ceiling", () => {
    // One loud click inside quiet speech: the loudness wants a big gain, the peak forbids it.
    const pcm = decodeWav(wavOf([[0.3, 0.05]]));
    pcm.samples[1000] = 0.95;
    const out = normaliseLoudness(pcm);
    expect(peakOf(out.samples)).toBeLessThanOrEqual(TARGET_PEAK + 1e-6);
  });

  it("does not turn near silence into noise", () => {
    const faint = normaliseLoudness(decodeWav(tartuLike(0, 0.2, 0.001)));
    expect(peakOf(faint.samples)).toBeLessThan(0.01);
  });
});

describe("prepareClip", () => {
  it("halves the bytes and takes the dead air off in one pass", () => {
    const raw = tartuLike(0.5, 0.4);
    const out = prepareClip(raw);
    // 16-bit rather than 32, and 1.4 seconds down to about 0.76.
    expect(out.byteLength).toBeLessThan(raw.byteLength / 3);
    const pcm = decodeWav(out);
    expect(pcm.samples.length / RATE).toBeCloseTo(0.4 + (LEAD_MS + TRAIL_MS) / 1000, 1);
  });
});
