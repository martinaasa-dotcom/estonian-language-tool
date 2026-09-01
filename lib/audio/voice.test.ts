import { describe, expect, it } from "vitest";
import { autoplayFrom, DEFAULT_VOICE, feedbackSoundsFrom, voiceFrom, VOICES } from "./voice";

describe("the voice allowlist", () => {
  it("answers a request for a voice it does not offer with the default", () => {
    expect(voiceFrom("mari")).toBe("mari");
    expect(voiceFrom("tambet")).toBe("tambet");
    expect(voiceFrom("robot")).toBe(DEFAULT_VOICE);
    expect(voiceFrom("")).toBe(DEFAULT_VOICE);
    expect(voiceFrom(null)).toBe(DEFAULT_VOICE);
    expect(voiceFrom(undefined)).toBe(DEFAULT_VOICE);
  });

  it("never passes a value through as typed", () => {
    // The identifiers go to a third party's API verbatim, so the only thing
    // that may reach it is one of ours.
    expect(voiceFrom("mari; drop table")).toBe(DEFAULT_VOICE);
    expect(voiceFrom("MARI")).toBe(DEFAULT_VOICE);
  });

  it("lists the default and uses the service's own spelling", () => {
    expect(VOICES.some((v) => v.id === DEFAULT_VOICE)).toBe(true);
    for (const v of VOICES) expect(v.id).toMatch(/^[a-z]+$/);
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length);
  });
});

describe("the two switches", () => {
  it("read a missing answer as on, which is what everybody had before the question existed", () => {
    expect(autoplayFrom(undefined)).toBe("on");
    expect(autoplayFrom("off")).toBe("off");
    expect(autoplayFrom("anything")).toBe("on");
    expect(feedbackSoundsFrom(null)).toBe("on");
    expect(feedbackSoundsFrom("off")).toBe("off");
  });
});
