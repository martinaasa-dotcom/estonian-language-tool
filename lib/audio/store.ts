import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { reportError } from "@/lib/observability/report";

/**
 * Content-addressed storage for synthesised speech.
 *
 * A word's pronunciation never changes, so a clip is worth fetching exactly once
 * — for everyone, forever. The previous implementation wrote to `/tmp` when
 * hosted, which on a serverless platform is per-instance and wiped on every cold
 * start: not a cache, just a comment claiming to be one. Every cold instance
 * re-fetched every clip from a free academic service.
 *
 * Three tiers, tried in order:
 *   1. an in-process map, for the same word twice in one session,
 *   2. an object store shared by every instance and every user,
 *   3. upstream.
 *
 * With no object store configured it falls back to local disk, which is exactly
 * right for development and honest about what it is in production.
 */

const BUCKET = process.env.SUPABASE_AUDIO_BUCKET || "audio";
const LOCAL_DIR = join(process.cwd(), ".data", "audio");

/**
 * Hot clips for the life of this instance. Bounded, because a lambda that plays
 * a long text repeatedly should not grow without limit — 64 clips is a session's
 * worth of review at a few hundred kB.
 */
const MEMO = new Map<string, Buffer>();
const MEMO_MAX = 64;

function memoise(key: string, value: Buffer): void {
  if (MEMO.size >= MEMO_MAX) {
    const oldest = MEMO.keys().next().value;
    if (oldest !== undefined) MEMO.delete(oldest);
  }
  MEMO.set(key, value);
}

/**
 * The service-role client. Server-only: this key bypasses row-level security,
 * so it must never be imported from a Client Component. CI greps the built
 * client bundle for a `service_role` JWT specifically.
 */
function objectStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type AudioSource = "memory" | "store" | "disk" | "upstream";

export async function readAudio(hash: string): Promise<{ body: Buffer; from: AudioSource } | null> {
  const memo = MEMO.get(hash);
  if (memo) return { body: memo, from: "memory" };

  const store = objectStore();
  if (store) {
    const { data } = await store.storage.from(BUCKET).download(`${hash}.wav`);
    if (data) {
      const body = Buffer.from(await data.arrayBuffer());
      memoise(hash, body);
      return { body, from: "store" };
    }
    return null;
  }

  const local = await readFile(join(LOCAL_DIR, `${hash}.wav`)).catch(() => null);
  if (local) {
    memoise(hash, local);
    return { body: local, from: "disk" };
  }
  return null;
}

/**
 * Never throws. A clip that failed to cache is a slower next play, not a failed
 * one — the audio is already on its way to the learner by the time this runs.
 */
export async function writeAudio(hash: string, body: Buffer): Promise<void> {
  memoise(hash, body);

  const store = objectStore();
  if (store) {
    const { error } = await store.storage.from(BUCKET).upload(`${hash}.wav`, body, {
      contentType: "audio/wav",
      // Two instances can synthesise the same word at the same moment; the
      // second upload losing the race is the correct outcome, not an error.
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) reportError(error, { at: "audio/writeAudio", extra: { bucket: BUCKET } });
    return;
  }

  try {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(join(LOCAL_DIR, `${hash}.wav`), body);
  } catch {
    // Development convenience only.
  }
}

/** True when clips survive a cold start. Surfaced in Settings so it is not a guess. */
export function audioCacheIsDurable(): boolean {
  return objectStore() !== null;
}
