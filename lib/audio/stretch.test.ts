import { describe, expect, it } from "vitest";
import { classify, SEGMENT_WEIGHT, stretch, stretchMap, type Samples } from "./stretch";

const RATE = 22050;

/** A signal built from `pieces` of `[seconds, kind]`: a tone, hiss, a click, or nothing. */
function build(pieces: Array<[number, "tone" | "hiss" | "click" | "silence"]>, f0 = 180): Samples {
  const n = pieces.reduce((sum, [s]) => sum + Math.round(RATE * s), 0);
  const samples = new Float32Array(n);
  let i = 0;
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (const [seconds, kind] of pieces) {
    const len = Math.round(RATE * seconds);
    for (let k = 0; k < len; k++, i++) {
      if (kind === "tone") {
        // A few harmonics, so it has a pitch and a shape the way a vowel does.
        const t = i / RATE;
        samples[i] = 0.5 * Math.sin(2 * Math.PI * f0 * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f0 * t) + 0.12 * Math.sin(2 * Math.PI * 3 * f0 * t);
      } else if (kind === "hiss") {
        samples[i] = 0.3 * rand();
      } else if (kind === "click") {
        samples[i] = k < 40 ? 0.8 * Math.exp(-k / 8) * (k % 2 ? 1 : -1) : 0;
      }
    }
  }
  return { rate: RATE, samples };
}

/** The pitch of a periodic signal, off its autocorrelation over a 30 ms window at `at` seconds. */
function pitchAt({ rate, samples }: Samples, at: number): number {
  const start = Math.round(at * rate);
  const win = Math.round(rate * 0.03);
  let best = 0;
  let bestLag = 1;
  for (let lag = Math.round(rate / 400); lag <= Math.round(rate / 150); lag++) {
    let dot = 0;
    for (let i = 0; i < win; i++) dot += (samples[start + i] ?? 0) * (samples[start + lag + i] ?? 0);
    if (dot > best) { best = dot; bestLag = lag; }
  }
  return rate / bestLag;
}

const word = () => build([[0.04, "silence"], [0.02, "click"], [0.3, "tone"], [0.25, "silence"], [0.1, "hiss"], [0.3, "tone"], [0.3, "silence"]]);

describe("classify", () => {
  it("tells a pause, a burst, hiss and a vowel apart", () => {
    const seg = classify(word());
    const at = (s: number) => seg[Math.round(s / 0.01)];
    expect(at(0.01)).toBe("padding");
    expect(at(0.045)).toBe("transient");
    expect(at(0.2)).toBe("steady");
    expect(at(0.5)).toBe("silence");
    expect(at(0.66)).toBe("noise");
    expect(at(0.9)).toBe("steady");
    expect(at(1.25)).toBe("padding");
  });

  it("marks the rise into a vowel after a pause as a transient, once", () => {
    const seg = classify(word());
    const onsets = seg.filter((s, i) => s === "transient" && seg[i - 1] !== "transient").length;
    // The click, and the vowel coming in after the hiss.
    expect(onsets).toBeGreaterThanOrEqual(1);
    expect(onsets).toBeLessThanOrEqual(3);
  });
});

describe("stretchMap", () => {
  it("spends the slowing on the vowels and the pauses and none of it on a burst", () => {
    const map = stretchMap(["padding", "transient", "steady", "silence", "noise", "padding"], 0.7);
    expect(map[0]).toBe(1);
    expect(map[1]).toBe(1);
    expect(map[5]).toBe(1);
    expect(map[3]).toBeGreaterThan(map[2]!);
    expect(map[2]).toBeGreaterThan(map[4]!);
    expect(map[4]).toBeGreaterThan(1);
  });

  it("comes out at exactly the rate asked for over the speech", () => {
    const seg = classify(word());
    const inner = seg.filter((s) => s !== "padding");
    const map = stretchMap(seg, 0.65);
    const total = seg.reduce((sum, s, i) => sum + (s === "padding" ? 0 : map[i]!), 0);
    expect(total / inner.length).toBeCloseTo(1 / 0.65, 6);
  });

  it("stretches a clip that is all burst uniformly rather than not at all", () => {
    expect(stretchMap(["transient", "transient"], 0.5)).toEqual([2, 2]);
  });

  it("weights every kind of segment", () => {
    for (const kind of ["padding", "silence", "transient", "noise", "steady"] as const) {
      expect(SEGMENT_WEIGHT[kind]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("stretch", () => {
  it("returns the clip untouched at rate one", () => {
    const clip = word();
    expect(stretch(clip, 1)).toBe(clip);
  });

  it("makes the speech longer by the rate and leaves the padding alone", () => {
    const clip = word();
    const out = stretch(clip, 0.65);
    const seg = classify(clip);
    const padding = seg.filter((s) => s === "padding").length * Math.round(RATE * 0.01);
    const speech = clip.samples.length - padding;
    expect(out.samples.length).toBeCloseTo(padding + speech / 0.65, -2);
  });

  it("holds the pitch", () => {
    const clip = build([[0.04, "silence"], [0.6, "tone"], [0.3, "silence"]], 210);
    for (const rate of [0.65, 0.8, 0.9, 1.3]) {
      const out = stretch(clip, rate);
      // Well inside the tone, before and after.
      expect(pitchAt(out, 0.2)).toBeCloseTo(210, -1);
      expect(pitchAt(clip, 0.2)).toBeCloseTo(210, -1);
    }
  });

  it("keeps a burst as one burst rather than smearing it", () => {
    const clip = build([[0.04, "silence"], [0.02, "click"], [0.1, "silence"], [0.3, "tone"], [0.3, "silence"]]);
    const out = stretch(clip, 0.65);
    /** How long the first burst lasts: from its first loud sample until twenty quiet milliseconds have passed. */
    const burst = ({ rate, samples }: Samples) => {
      let start = 0;
      while (Math.abs(samples[start] ?? 0) < 0.45) start++;
      let end = start;
      let quiet = 0;
      while (end < samples.length && quiet < rate * 0.02) {
        quiet = Math.abs(samples[end] ?? 0) < 0.05 ? quiet + 1 : 0;
        end++;
      }
      return (end - quiet - start) / rate;
    };
    // Not smeared: the burst in the slow play is as short as it was, within two milliseconds.
    expect(burst(out)).toBeLessThan(burst(clip) + 0.002);
    // And not doubled: nothing loud between the burst and the vowel.
    const seg = classify(out);
    const gap = seg.slice(Math.round(0.07 / 0.01), seg.indexOf("steady"));
    expect(gap.every((s) => s === "silence" || s === "transient")).toBe(true);
    expect(gap.filter((s) => s === "silence").length).toBeGreaterThan(10);
  });

  it("plays faster the same way, with the pauses taking the most of it", () => {
    const clip = word();
    const out = stretch(clip, 1.3);
    expect(out.samples.length).toBeLessThan(clip.samples.length);
    const seg = classify(clip);
    const map = stretchMap(seg, 1.3);
    const pause = map[seg.indexOf("silence")]!;
    const vowel = map[seg.indexOf("steady")]!;
    expect(pause).toBeLessThan(vowel);
    expect(pause).toBeGreaterThanOrEqual(0.5);
  });

  it("does not clip", () => {
    const out = stretch(word(), 0.65);
    let peak = 0;
    for (const v of out.samples) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThan(1);
  });

  it("is quick enough to run on a press", () => {
    const clip = build([[0.04, "silence"], [3, "tone"], [0.3, "silence"]]);
    const t0 = performance.now();
    stretch(clip, 0.9);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
