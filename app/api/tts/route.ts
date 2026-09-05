import { createHash } from "node:crypto";
import { NextResponse, after } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { bucketForRequest, rateLimited } from "@/lib/security/rateLimit";
import { checkSharedRateLimit } from "@/lib/usage/sharedLimit";
import { type AudioSource, readAudio, writeAudio } from "@/lib/audio/store";
import { singleFlightTagged } from "@/lib/cache/singleFlight";
import { recordUsage, authoriseCall, releaseReservation } from "@/lib/usage/ledger";
import { DEFAULT_VOICE, voiceFrom, VOICES } from "@/lib/audio/voice";
import { prepareClip, WavError } from "@/lib/audio/wav";
import { reportError } from "@/lib/observability/report";

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

  The mechanism used to be a `Map` and a `finally` written out here. It moved
  to lib/cache/singleFlight.ts when the dictionary turned out to need exactly
  the same thing: a second copy of this is where the `finally` gets dropped and
  a bad minute upstream is remembered as a failure until the next deploy.
*/

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
  const limit = await checkSharedRateLimit(
    `tts:${bucketForRequest(request, ownerId)}`,
    SPEECH_PER_MINUTE,
    60_000,
  );
  if (!limit.ok) {
    return rateLimited(limit, "That is a lot of audio at once. Give it a moment.");
  }

  let text: string;
  let voice: string | null = null;
  try {
    /*
      No speed. There used to be one, forwarded to the model, and it is gone
      on purpose: TartuNLP applies it inside the acoustic model as a duration
      regulator, so a "slow" clip was every phoneme held 1.6 times longer on
      repeated frames, at the same pitch, which is the flat, buzzing stretch
      a learner reported. Slow is a fact about playback now, not about the
      clip: lib/audio/clip.ts plays the one clip slower with the pitch held.
      One clip per word rather than two also halves what is asked of a free
      service and what the caches hold.
    */
    const body = (await request.json()) as { text?: unknown; voice?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
    }
    text = body.text.trim().slice(0, MAX_CHARS);
    /*
      The learner's chosen voice, checked against the allowlist rather than
      passed to a third party as typed. A value that is not one of ours is
      the deployment's default, never an error, because the request carries
      it on behalf of a setting the learner may have set on another day.
    */
    if (typeof body.voice === "string" && VOICES.some((v) => v.id === body.voice)) voice = voiceFrom(body.voice);
  } catch {
    return NextResponse.json({ error: "Something about that request didn't make sense." }, { status: 400 });
  }

  const speaker = voice ?? voiceFrom(process.env.TTS_SPEAKER ?? DEFAULT_VOICE);
  // `v4` because a clip under the old key is float32 with half a second of
  // silence on each end, and the key has to say which shape is behind it.
  const hash = createHash("sha256").update(`v3|${text}|${speaker}`).digest("hex");
  // Content-addressed and shared across instances and users: a clip fetched
  // once is available to everybody, forever. Writing to /tmp instead, as this
  // did, is per-instance and wiped on every cold start — not a cache, just a
  // comment claiming to be one. See lib/audio/store.ts.
  const cached = await readAudio(hash).catch(() => null);
  if (cached) return wav(cached.body, cached.from);

  /*
    A MISS IS METERED, BECAUSE A MISS COSTS SOMETHING.

    Nothing but an in-process limiter stood in front of this, and that limiter
    resets on every cold start, which the module says of itself. A miss makes
    a request of TartuNLP, a free academic service this app promises to be a
    polite consumer of, and writes a WAV into storage that nothing prunes, on
    a key space of any text a client cares to send. `ALLOWANCE.TTS` in the
    ledger has described the gate for this the whole time and nothing called
    it, so the durable daily allowance was dead code. A hit and a joiner are
    still free: neither asks anybody for anything.
  */
  const decision = ownerId ? await authoriseCall(ownerId, "TTS") : null;
  if (decision && !decision.allowed) {
    return Response.json(
      { error: decision.message, reason: decision.reason },
      {
        status: 429,
        headers: decision.retryAfterSeconds
          ? { "retry-after": String(decision.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  try {
    /*
      Whoever gets here first fetches; everybody who arrives while that is in
      flight is handed the same promise. Which of the two this caller was
      still matters below, so it is asked for rather than thrown away.
    */
    const { value: audio, joined } = await singleFlightTagged(
      `tts:${hash}`, () => speak(text, speaker, hash),
    );
    // TartuNLP is free, so this costs nothing — it is recorded to show how
    // heavily the app leans on somebody else's goodwill. Passing an explicit
    // zero matters: the speaker name would otherwise price as an unknown model.
    // Anonymous callers are possible here (the bucket falls back to the
    // request), and the ledger is per learner, so an unattributed clip is
    // simply not recorded rather than filed under nobody.
    //
    // A joiner is not recorded, for the same reason a cache hit above is not:
    // this row counts requests actually made of TartuNLP, and a joiner made
    // none. Counting them would tighten the speech allowance by the size of
    // whatever burst the deduplication just absorbed.
    const joinerBooking = joined ? decision?.reservation : undefined;
    if (joinerBooking) {
      // A joiner made no request of anybody, so it hands its booking back.
      after(() => releaseReservation(joinerBooking));
    }
    if (ownerId && !joined) {
      after(() => recordUsage({
        ownerId, kind: "TTS", provider: "tartunlp", model: speaker,
        inputTokens: text.length, outputTokens: 0, costMicros: 0,
        reservation: decision?.reservation,
      }));
    }
    return wav(audio, joined ? "joined" : "upstream");
  } catch (error) {
    // Nothing was spoken, so the booking goes back: a learner must not spend
    // their day's allowance on a minute when TartuNLP was down.
    const booking = decision?.reservation;
    if (booking) after(() => releaseReservation(booking));
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
  hash: string,
): Promise<Buffer> {
  let upstream: Response;
  try {
    upstream = await fetch(TARTU_NLP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, speaker }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SpeechError(503);
  }

  if (!upstream.ok) throw new SpeechError(502);

  const raw = new Uint8Array(await upstream.arrayBuffer());
  const audio = Buffer.from(prepare(raw));
  await writeAudio(hash, audio); // Never throws: a failed cache write is a slower next play.
  return audio;
}

/**
 * Trimmed, leveled and written as 16-bit before it is kept; see lib/audio/wav.ts.
 * A response this cannot read is kept as it came, reported, and still spoken,
 * because an untrimmed clip is better than none and the report is how anybody
 * learns the service changed its format.
 */
function prepare(raw: Uint8Array): Uint8Array {
  try {
    return prepareClip(raw);
  } catch (error) {
    if (error instanceof WavError) {
      reportError(error, { at: "tts/prepare", extra: { bytes: raw.byteLength } });
      return raw;
    }
    throw error;
  }
}

/**
 * One clip, and an honest word about who is allowed to keep it.
 *
 * This used to send `public, max-age=31536000, immutable`, which reads as the
 * strongest caching statement HTTP has and did nothing whatsoever. There is no
 * `GET` here; a browser does not put a response to a `POST` in its HTTP cache,
 * and neither does a CDN. So the header described an intention on a transport
 * that cannot carry it, and the next person to read this file would have
 * believed repeat plays were free at the network layer when nothing at that
 * layer was involved.
 *
 * The caching is real, and it is in three other places, none of which reads
 * this header:
 *
 *   the page      `Speak` and `PairsSession` hold the blob for a clip they
 *                 have already fetched, so a replay inside one screen never
 *                 leaves the browser at all
 *   the worker    `audioWithCache` in public/sw.js builds a `GET`-shaped key
 *                 out of the request body and keeps the clip in the Cache API,
 *                 which is what makes review work with the network down. The
 *                 Cache API stores what it is told to store and ignores
 *                 `Cache-Control` entirely
 *   the server    `lib/audio/store.ts`, content-addressed and shared across
 *                 instances and learners, which is the one that keeps us a
 *                 polite consumer of a free academic service
 *
 * `no-store` rather than nothing, because it is the true statement: no HTTP
 * cache should hold this, and none would have anyway. The audio is not secret
 * and this is not protecting it — it is refusing to claim something that does
 * not happen. Turning this route into a `GET` would make the old header mean
 * something, and would put the sentence being spoken into every access log and
 * CDN log between here and the learner, which is a worse trade than one
 * accurate header.
 */
function wav(body: Buffer, cache: AudioSource | "joined") {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "no-store",
      // Which of the three caches answered, for the offline smoke test and for
      // anybody wondering whether the disk store is doing its job.
      "x-tts-cache": cache,
    },
  });
}
