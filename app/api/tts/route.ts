import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { bucketForRequest, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import { type AudioSource, readAudio, writeAudio } from "@/lib/audio/store";
import { recordUsage } from "@/lib/usage/ledger";

const TARTU_NLP = "https://api.tartunlp.ai/text-to-speech/v2";
const MAX_CHARS = 400;

/*
  How much of a free academic service one learner may use in a minute.

  TartuNLP is run by the University of Tartu and asks nothing of us, which is
  exactly why it gets a cap rather than nothing: the whole point of the disk
  cache below is to be a polite consumer of it, and a retry loop with a
  slightly different string each time walks straight past a cache.

  A hundred and twenty is far above real use and far below abuse. Reviewing
  with audio on plays roughly one clip a card, and the fastest anybody clears
  a card is a few seconds, so a real session lands nearer twenty; a script
  reaches this inside a second. The charge is per learner rather than per
  address, so a classroom on one school network is twenty-five allowances
  rather than one -- see lib/security/rateLimit.ts.
*/
const SPEECH_PER_MINUTE = 120;

/*
  ONE REQUEST UPSTREAM PER CLIP, HOWEVER MANY PEOPLE ASK AT ONCE.

  A cache that is only consulted before the call and only written after it has
  a gap exactly as wide as the call itself, and that gap is where the traffic
  is: a class of twenty-five starting the same unit together asks for the same
  word inside the same second, every one of them misses, and the free service
  we are trying to be polite to gets twenty-five identical requests. The same
  thing happens to one learner whose card renders a word and its example
  sentence side by side.

  So a miss records the promise it is waiting on before it awaits it, and
  anybody arriving during that window awaits the same one. It is per warm
  instance, like the rate limiter, and for the same reason: it costs no
  infrastructure and it removes the burst that actually happens. The entry is
  deleted in a `finally`, so a failed fetch is retried by the next caller
  rather than remembered as a failure.
*/
const inFlight = new Map<string, Promise<Buffer>>();

/**
 * Server-side proxy and cache for Estonian speech.
 *
 * A word's pronunciation never changes, so each clip is fetched once per
 * cache lifetime and then served from disk. That also keeps review sessions
 * working with audio when the network is gone, and keeps us a polite
 * consumer of a free academic service.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId().catch(() => null);
  const limit = checkRateLimit(
    `tts:${bucketForRequest(request, ownerId)}`,
    SPEECH_PER_MINUTE,
    60_000,
  );
  if (!limit.ok) {
    return rateLimited(limit, "That is a lot of audio at once. Give it a moment.");
  }

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
  // Content-addressed and shared across instances and users: a clip fetched
  // once is available to everybody, forever. Writing to /tmp instead, as this
  // did, is per-instance and wiped on every cold start — not a cache, just a
  // comment claiming to be one. See lib/audio/store.ts.
  const cached = await readAudio(hash).catch(() => null);
  if (cached) return wav(cached.body, cached.from);

  const joined = inFlight.get(hash);
  if (joined) {
    // Somebody else is already asking for this exact clip. Wait on their
    // answer rather than making a second identical request.
    try {
      return wav(await joined, "joined");
    } catch {
      return NextResponse.json({ error: "Speech service unreachable." }, { status: 503 });
    }
  }

  const work = speak(text, speaker, speed, hash).finally(() => inFlight.delete(hash));
  inFlight.set(hash, work);

  try {
    const audio = await work;
    // TartuNLP is free, so this costs nothing — it is recorded to show how
    // heavily the app leans on somebody else's goodwill. Passing an explicit
    // zero matters: the speaker name would otherwise price as an unknown model.
    // Anonymous callers are possible here (the bucket falls back to the
    // request), and the ledger is per learner, so an unattributed clip is
    // simply not recorded rather than filed under nobody.
    if (ownerId) {
      void recordUsage({
        ownerId, kind: "TTS", provider: "tartunlp", model: speaker,
        inputTokens: text.length, outputTokens: 0, costMicros: 0,
      });
    }
    return wav(audio, "upstream");
  } catch (error) {
    const status = error instanceof SpeechError ? error.status : 503;
    const message =
      status === 502 ? "Speech service could not read that." : "Speech service unreachable.";
    return NextResponse.json({ error: message }, { status });
  }
}

class SpeechError extends Error {
  constructor(readonly status: number) {
    super(`speech service ${status}`);
  }
}

/** Fetch one clip and write it to the cache. Throws SpeechError, never a Response. */
async function speak(
  text: string,
  speaker: string,
  speed: number,
  hash: string,
): Promise<Buffer> {
  let upstream: Response;
  try {
    upstream = await fetch(TARTU_NLP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, speaker, speed }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SpeechError(503);
  }

  if (!upstream.ok) throw new SpeechError(502);

  const audio = Buffer.from(await upstream.arrayBuffer());
  await writeAudio(hash, audio); // Never throws: a failed cache write is a slower next play.
  return audio;
}

function wav(body: Buffer, cache: AudioSource | "joined") {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "public, max-age=31536000, immutable",
      "x-tts-cache": cache,
    },
  });
}
