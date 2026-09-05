import { describe, expect, it } from "vitest";
import {
  decodeWav, encodeWav16, FADE_MS, LEAD_MS, normalisePeak, prepareClip, SILENCE_SHARE,
  TARGET_PEAK, TRAIL_MS, trimSilence, WavError,
} from "./wav";

const RATE = 22050;

/** A float32 WAV the way TartuNLP writes one: `pad` seconds of silence round a tone. */
function tartuLike(pad: number, speech: number, amplitude = 0.7): Uint8Array {
  const n = Math.round(RATE * (pad * 2 + speech));
  const bytes = new Uint8Array(44 + n * 4);
  const view = new DataView(bytes.buffer);
  const put = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  put(0, "RIFF"); view.setUint32(4, 36 + n * 4, true); put(8, "WAVE");
  put(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 32, true);
  put(36, "data"); view.setUint32(40, n * 4, true);
  const from = Math.round(RATE * pad);
  const to = from + Math.round(RATE * speech);
  for (let i = 0; i < n; i++) {
    const v = i >= from && i < to ? amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE) : 0;
    view.setFloat32(44 + i * 4, v, true);
  }
  return bytes;
}

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
    expect(Math.abs(out.samples.length - expected)).toBeLessThanOrEqual(2);
    // The first sound now arrives inside the lead rather than half a second in.
    const floor = 0.7 * SILENCE_SHARE;
    let first = 0;
    while (Math.abs(out.samples[first] ?? 0) < floor) first++;
    expect(first / RATE).toBeLessThan((LEAD_MS + FADE_MS) / 1000 + 0.005);
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

describe("leveling", () => {
  it("puts a quiet voice and a loud one at the same peak", () => {
    const quiet = normalisePeak(decodeWav(tartuLike(0, 0.2, 0.3)));
    const loud = normalisePeak(decodeWav(tartuLike(0, 0.2, 0.9)));
    const peak = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(quiet.samples)).toBeCloseTo(TARGET_PEAK, 3);
    expect(peak(loud.samples)).toBeCloseTo(TARGET_PEAK, 3);
  });

  it("does not turn near silence into noise", () => {
    const faint = normalisePeak(decodeWav(tartuLike(0, 0.2, 0.001)));
    const peak = faint.samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeLessThan(0.01);
  });
});

describe("prepareClip", () => {
  it("halves the bytes and takes the dead air off in one pass", () => {
    const raw = tartuLike(0.5, 0.4);
    const out = prepareClip(raw);
    // 16-bit rather than 32, and 1.4 seconds down to about 0.76.
    expect(out.byteLength).toBeLessThan(raw.byteLength / 3);
    const pcm = decodeWav(out);
    expect(pcm.samples.length / RATE).toBeCloseTo(0.4 + (LEAD_MS + TRAIL_MS) / 1000, 2);
  });
});
