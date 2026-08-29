/**
 * The photograph itself: what is accepted, and what it is charged as.
 *
 * The picture is read and thrown away. It is never written to the database,
 * never put in object storage and never logged, for the same reason the cloze
 * exercise does not keep the passage it was built from: a photograph of
 * somebody's homework is theirs, it may have their name at the top of it, and
 * an app that only needs it for four seconds has no business keeping it.
 *
 * Pure, so the limits can be tested without a request.
 */

/**
 * The largest picture accepted, after the browser has shrunk it.
 *
 * `ScanCapture` resizes to `MAX_EDGE` and re-encodes as JPEG before uploading,
 * so a 12 megapixel phone photo arrives at a few hundred kilobytes. This is
 * the backstop for a caller that did not, and it is generous enough that no
 * honest client ever meets it.
 */
export const MAX_IMAGE_BYTES = 4_500_000;

/** Longest edge the client scales to. Enough to read printed text, small enough to send. */
export const MAX_EDGE = 1600;

/** What a camera or a photo library can hand over that every provider can read. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageMediaType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface DecodedImage {
  mediaType: ImageMediaType;
  /** Base64 payload, without the data URL preamble. */
  base64: string;
  /** Decoded size, which is what the limit is actually about. */
  bytes: number;
}

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

export type ImageProblem = "MALFORMED" | "TYPE" | "TOO_LARGE" | "EMPTY";

export interface ImageResult {
  image?: DecodedImage;
  problem?: ImageProblem;
}

/** Base64 encodes three bytes as four characters, padding excluded. */
function decodedBytes(base64: string): number {
  const clean = base64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/**
 * Reads a `data:` URL from the client, and says which way it was wrong.
 *
 * Separate reasons rather than one boolean, because the screen has something
 * different to say for each: a heic straight out of an iPhone is a format
 * problem the learner can fix by taking the photo again, and a five megabyte
 * upload is a size problem they cannot see at all.
 */
export function decodeImageDataUrl(input: unknown): ImageResult {
  if (typeof input !== "string" || input.length === 0) return { problem: "EMPTY" };

  const match = DATA_URL.exec(input.trim());
  if (!match) return { problem: "MALFORMED" };

  const mediaType = match[1]!.toLowerCase();
  const base64 = match[2]!.replace(/\s/g, "");
  if (!ALLOWED_IMAGE_TYPES.includes(mediaType as ImageMediaType)) return { problem: "TYPE" };
  if (base64.length === 0) return { problem: "EMPTY" };

  const bytes = decodedBytes(base64);
  if (bytes > MAX_IMAGE_BYTES) return { problem: "TOO_LARGE" };

  return { image: { mediaType: mediaType as ImageMediaType, base64, bytes } };
}

/**
 * What a picture costs the ledger when the provider does not say.
 *
 * Providers report usage on a non-streaming call almost always, and this is
 * the fallback for the time they do not. A picture is not text and
 * `estimateTokens` would price one at a handful of tokens, which would let a
 * loop of scans run past the spend cap unnoticed.
 *
 * The number is the arithmetic every vision provider publishes some version
 * of: roughly width times height over 750. At the longest edge the client
 * sends, that is about 3 400 tokens, and it is rounded up rather than down
 * because over-counting makes the cap bind sooner and under-counting makes it
 * a suggestion.
 */
export function estimateImageTokens(): number {
  return Math.ceil((MAX_EDGE * MAX_EDGE * 0.8) / 750);
}
