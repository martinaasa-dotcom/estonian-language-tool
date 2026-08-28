import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const TARTU_NLP = "https://api.tartunlp.ai/text-to-speech/v2";
const CACHE_DIR = join(process.cwd(), ".data", "audio");
const MAX_CHARS = 400;

/**
 * Server-side proxy and cache for Estonian speech.
 *
 * A word's pronunciation never changes, so each clip is fetched exactly once and
 * then served from disk. That also keeps review sessions working with audio when
 * the network is gone, and keeps us a polite consumer of a free academic service.
 */
export async function POST(request: Request) {
  let text: string;
  let speed = 1;
  try {
    const body = (await request.json()) as { text?: unknown; speed?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
    }
    text = body.text.trim().slice(0, MAX_CHARS);
    if (typeof body.speed === "number" && body.speed >= 0.5 && body.speed <= 2) speed = body.speed;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const speaker = process.env.TTS_SPEAKER ?? "mari";
  const hash = createHash("sha256").update(`${text}|${speaker}|${speed}`).digest("hex");
  const file = join(CACHE_DIR, `${hash}.wav`);

  const cached = await readFile(file).catch(() => null);
  if (cached) return wav(cached, "hit");

  let upstream: Response;
  try {
    upstream = await fetch(TARTU_NLP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, speaker, speed }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json({ error: "Speech service unreachable." }, { status: 503 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Speech service could not read that." }, { status: 502 });
  }

  const audio = Buffer.from(await upstream.arrayBuffer());
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
  await writeFile(file, audio).catch(() => {}); // A failed cache write must not fail playback.
  return wav(audio, "miss");
}

function wav(body: Buffer, cache: "hit" | "miss") {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "public, max-age=31536000, immutable",
      "x-tts-cache": cache,
    },
  });
}
