import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { type AudioSource, readAudio, writeAudio } from "@/lib/audio/store";
import { authoriseCall, recordUsage } from "@/lib/usage/ledger";

const TARTU_NLP = "https://api.tartunlp.ai/text-to-speech/v2";
const MAX_CHARS = 400;

/**
 * Server-side proxy and cache for Estonian speech.
 *
 * TartuNLP is a free academic service, so the contract we owe it is: ask once
 * per distinct phrase, ever. The cache is content-addressed and shared across
 * instances and users (see `lib/audio/store`), and only a genuine miss is rate
 * limited — a cache hit costs the upstream service nothing, so charging a
 * learner's quota for replaying a word they already heard would be wrong.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId();

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

  const cached = await readAudio(hash).catch(() => null);
  if (cached) return wav(cached.body, cached.from);

  // Only now — a miss is the only thing that reaches TartuNLP.
  const decision = await authoriseCall(ownerId, "TTS");
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Too many new words to pronounce at once. Give it a few seconds." },
      {
        status: 429,
        headers: decision.retryAfterSeconds
          ? { "retry-after": String(decision.retryAfterSeconds) }
          : undefined,
      },
    );
  }

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
  await writeAudio(hash, audio);

  // TartuNLP is free, so this costs nothing — it is recorded to make the rate
  // limit work and to show how heavily we lean on someone else's goodwill.
  void recordUsage({
    ownerId, kind: "TTS", provider: "tartunlp", model: speaker,
    inputTokens: text.length, outputTokens: 0,
    costMicros: 0, // TartuNLP is free; without this the speaker name prices as an unknown model.
  });

  return wav(audio, "upstream");
}

function wav(body: Buffer, from: AudioSource) {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "public, max-age=31536000, immutable",
      "x-tts-cache": from,
    },
  });
}
