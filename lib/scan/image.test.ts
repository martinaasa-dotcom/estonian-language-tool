import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, decodeImageDataUrl, estimateImageTokens } from "./image";

/** A data URL carrying `bytes` bytes of payload. */
function dataUrl(mediaType: string, bytes: number): string {
  const base64 = Buffer.alloc(bytes, 1).toString("base64");
  return `data:${mediaType};base64,${base64}`;
}

describe("decodeImageDataUrl", () => {
  it("accepts a JPEG from a camera", () => {
    const result = decodeImageDataUrl(dataUrl("image/jpeg", 900));
    expect(result.image?.mediaType).toBe("image/jpeg");
    expect(result.image?.bytes).toBe(900);
  });

  it("accepts png and webp too", () => {
    expect(decodeImageDataUrl(dataUrl("image/png", 10)).image).toBeDefined();
    expect(decodeImageDataUrl(dataUrl("image/webp", 10)).image).toBeDefined();
  });

  it("names the format problem, because that one the learner can fix", () => {
    // An iPhone hands over HEIC when the browser is bypassed. Saying so beats
    // "that did not work".
    expect(decodeImageDataUrl(dataUrl("image/heic", 10)).problem).toBe("TYPE");
  });

  it("refuses something that is not an image at all", () => {
    expect(decodeImageDataUrl(dataUrl("application/pdf", 10)).problem).toBe("TYPE");
  });

  it("refuses a payload over the ceiling", () => {
    expect(decodeImageDataUrl(dataUrl("image/jpeg", MAX_IMAGE_BYTES + 1_000)).problem)
      .toBe("TOO_LARGE");
  });

  it("refuses anything that is not a data URL", () => {
    expect(decodeImageDataUrl("https://example.com/page.jpg").problem).toBe("MALFORMED");
    expect(decodeImageDataUrl("data:image/jpeg,notbase64").problem).toBe("MALFORMED");
  });

  it("refuses a missing or empty body", () => {
    expect(decodeImageDataUrl(undefined).problem).toBe("EMPTY");
    expect(decodeImageDataUrl(42).problem).toBe("EMPTY");
    expect(decodeImageDataUrl("data:image/jpeg;base64,").problem).toBe("MALFORMED");
  });
});

describe("estimateImageTokens", () => {
  it("prices a picture as a picture", () => {
    // The fallback exists because estimating a photograph over the prompt text
    // alone prices it at nothing, and a cap that reads a scan as free is not a
    // cap. Anything in the thousands is doing its job; a handful is not.
    expect(estimateImageTokens()).toBeGreaterThan(1000);
  });
});
