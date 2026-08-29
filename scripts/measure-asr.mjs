#!/usr/bin/env node
/**
 * Can a speech recogniser be trusted to tell an Estonian learner how they did?
 *
 * ADR-018 says speaking practice compares and never scores, because there was
 * no verified Estonian recogniser to score with. That was an availability
 * claim, and availability changed: Groq serves whisper-large-v3 on a free key
 * and it takes an Estonian audio file happily. So the claim has to be
 * re-tested, and the honest way to re-test it is to measure rather than to try
 * one sentence and be impressed.
 *
 * The method is deliberately generous to the recogniser. Every utterance is
 * synthesised by the University of Tartu's Estonian voice, which is clean,
 * native, correctly stressed audio with no background noise. A learner's
 * recording is harder than this in every way. If the recogniser cannot manage
 * these, it certainly cannot be the thing that tells somebody their own
 * pronunciation was wrong.
 *
 * The sentences come from the dictionary's own attested Ekilex usages, so this
 * measures the recogniser against the exact Estonian the app teaches.
 *
 *   node scripts/measure-asr.mjs --backend groq   [--model whisper-large-v3]
 *   node scripts/measure-asr.mjs --backend gemini [--model gemini-flash-latest]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const TTS = "https://api.tartunlp.ai/text-to-speech/v2";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const LIMIT = Number(arg("limit", 20));
const BACKEND = arg("backend", "groq");
const MODEL = arg("model", undefined);
/** Milliseconds between requests, to stay under a free tier rather than fight it. */
const PACE_MS = Number(arg("pace", 5000));

/*
  The recognisers worth comparing, and they are not the same kind of thing.

  Whisper is a dedicated speech model. Gemini is a general multimodal model
  that happens to accept audio, which is a different architecture reaching the
  same task from the other side, and the reason it is worth measuring rather
  than assuming: a bigger model trained on more of the web may simply know more
  Estonian than a speech model does.

  Both hear byte-identical audio, from the same cache, so the only difference
  between two runs is the recogniser.
*/
const BACKENDS = {
  groq: {
    label: "Groq",
    key: () => process.env.GROQ_API_KEY,
    keyName: "GROQ_API_KEY",
    defaultModel: "whisper-large-v3",
    hear: hearGroq,
  },
  gemini: {
    label: "Google Gemini",
    key: () => process.env.GEMINI_API_KEY,
    keyName: "GEMINI_API_KEY",
    defaultModel: "gemini-flash-latest",
    hear: hearGemini,
  },
};

const backend = BACKENDS[BACKEND];
if (!backend) {
  console.error(`Unknown backend "${BACKEND}". Try: ${Object.keys(BACKENDS).join(", ")}`);
  process.exit(1);
}
if (!backend.key()) {
  console.error(`Set ${backend.keyName} to measure ${backend.label}.`);
  process.exit(1);
}
const model = MODEL ?? backend.defaultModel;

/** Attested sentences from the built dictionary, shortest first so they are sayable. */
function sentences() {
  const entries = JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));
  const out = [];
  for (const entry of entries) {
    for (const example of entry.examples ?? []) {
      const text = (example.et ?? "").trim();
      /*
        A real sentence, not a dictionary fragment.

        The first run of this drew on entries like "Aasta album." and
        "Juurviljaaed.", two-word noun phrases with no surrounding context,
        which are unusually hard for any recogniser and are not what a speaking
        exercise would ever ask for. Four words is the floor now, so the
        measurement is fair to the recogniser and closer to the task.
      */
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (wordCount >= 4 && text.length <= 60 && !out.includes(text)) out.push(text);
    }
  }
  return out;
}

/** Words, lowercased, with the punctuation that never carries meaning removed. */
function words(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()"'«»„“”–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein over words: the standard word error rate, insertions included. */
function errors(said, heard) {
  const a = words(said);
  const b = words(heard);
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
    }
  }
  return { distance: d[a.length][b.length], length: a.length };
}

/*
  Synthesised once and kept on disk.

  Two recognisers being compared have to hear the same waveform, or the
  comparison measures the voice as much as the model. It also stops a rerun
  asking a public service to say the same twenty-five sentences again.
*/
const AUDIO_CACHE = "prisma/data/.cache/asr-audio";

async function speak(text) {
  const name = createHash("sha256").update(text).digest("hex").slice(0, 24);
  const path = `${AUDIO_CACHE}/${name}.wav`;
  if (existsSync(path)) return readFileSync(path);

  const res = await fetch(TTS, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/wav" },
    body: JSON.stringify({ text, speaker: "mari", speed: 1 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const wav = Buffer.from(await res.arrayBuffer());
  mkdirSync(AUDIO_CACHE, { recursive: true });
  writeFileSync(path, wav);
  return wav;
}

/** A dedicated speech model, over the OpenAI-shaped transcription endpoint. */
async function hearGroq(wav) {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  form.append("model", model);
  form.append("language", "et");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ASR ${res.status}`);
  return ((await res.json()).text ?? "").trim();
}

/**
 * A general multimodal model, asked to transcribe.
 *
 * The instruction is deliberately bare. Asking it to "correct" or "clean up"
 * anything would measure how well it guesses at Estonian rather than how well
 * it heard, and guessing is the failure this whole exercise is trying to avoid.
 */
async function hearGemini(wav) {
  const body = {
    contents: [{
      parts: [
        { text: "Transcribe this Estonian audio exactly as spoken. Output only the transcription." },
        { inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } },
      ],
    }],
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    },
  );
  if (!res.ok) throw new Error(`ASR ${res.status}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

const pool = sentences();
const chosen = pool.slice(0, LIMIT);
console.log(`${backend.label} ${model} against ${chosen.length} attested Estonian sentences,`);
console.log("spoken by a native synthetic voice: clean audio, no accent, no noise.\n");

let totalErrors = 0;
let totalWords = 0;
let exact = 0;
const wrong = [];
const skipped = [];

/**
 * A free tier will rate-limit a run like this, and a refusal is not a result.
 *
 * The first version of this script counted a 429 as "skipped" and carried on,
 * which produced the worst possible outcome: a run where almost every sentence
 * was refused reported a 2% word error rate over the three that got through,
 * and looked like the recogniser had improved fifteenfold. A measurement that
 * silently shrinks its own sample flatters whatever it is measuring.
 */
async function withRetry(hear) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await hear();
    } catch (error) {
      last = error;
      if (!String(error.message).includes("429")) throw error;
      await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt));
    }
  }
  throw last;
}

for (const said of chosen) {
  let heard;
  try {
    const wav = await speak(said);
    heard = await withRetry(() => backend.hear(wav));
  } catch (error) {
    skipped.push(`${said}  (${error.message})`);
    process.stdout.write("?");
    continue;
  }
  const { distance, length } = errors(said, heard);
  totalErrors += distance;
  totalWords += length;
  if (distance === 0) exact += 1;
  else wrong.push({ said, heard });
  process.stdout.write(distance === 0 ? "." : "x");
  /*
    Paced rather than hammered. A free tier allows a handful of requests a
    minute, and riding into its limit turns a five minute measurement into
    twenty of exponential backoff. Waiting between requests is faster than
    being refused and then waiting anyway.
  */
  await new Promise((r) => setTimeout(r, PACE_MS));
}

const measured = chosen.length - skipped.length;
const wer = totalWords === 0 ? 0 : (totalErrors / totalWords) * 100;

console.log(`\n\n  sentences measured: ${measured}/${chosen.length}`);
if (skipped.length) {
  console.log(`  refused by the service: ${skipped.length}`);
  for (const line of skipped.slice(0, 3)) console.log(`    ${line}`);
}
console.log(`  sentences transcribed exactly: ${exact}/${measured}`);
console.log(`  word error rate: ${wer.toFixed(1)}%\n`);

/*
  Refuse to conclude from a sample that shrank. Two thirds is the floor: below
  that the survivors are whichever sentences the service happened to allow,
  which is not a random sample of anything.
*/
const FLOOR = Math.ceil(chosen.length * (2 / 3));
if (measured < FLOOR) {
  console.log(
    `  NOT A RESULT. Only ${measured} of ${chosen.length} sentences were measured, ` +
    `below the floor of ${FLOOR}.\n  Re-run when the rate limit has cleared; ` +
    `a smaller --limit is the usual fix.`,
  );
  process.exit(2);
}

if (wrong.length) {
  console.log("  what it got wrong:");
  for (const { said, heard } of wrong.slice(0, 12)) {
    console.log(`    said  ${said}`);
    console.log(`    heard ${heard}\n`);
  }
}

/*
  The number that decides the feature, not a number to admire.

  A learner cannot tell a recogniser's mistake from their own. Every error here
  is one the app would have reported as *their* mispronunciation, on audio a
  native voice produced perfectly.
*/
console.log(
  wer <= 5
    ? "  Low enough to show a learner what was heard, with the caveat stated."
    : "  Too high to put in front of a learner as evidence about their speech.",
);
