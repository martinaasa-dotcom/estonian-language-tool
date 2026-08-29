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
 *   GROQ_API_KEY=... node scripts/measure-asr.mjs [--limit 20]
 */
import { readFileSync } from "node:fs";

const KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.ASR_MODEL ?? "whisper-large-v3";
const TTS = "https://api.tartunlp.ai/text-to-speech/v2";
const ASR = "https://api.groq.com/openai/v1/audio/transcriptions";

if (!KEY) {
  console.error("Set GROQ_API_KEY to run this.");
  process.exit(1);
}

const limitAt = process.argv.indexOf("--limit");
const LIMIT = limitAt > 0 ? Number(process.argv[limitAt + 1]) : 20;

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

async function speak(text) {
  const res = await fetch(TTS, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/wav" },
    body: JSON.stringify({ text, speaker: "mari", speed: 1 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function hear(wav) {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  form.append("model", MODEL);
  form.append("language", "et");
  form.append("response_format", "json");
  const res = await fetch(ASR, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ASR ${res.status}`);
  return ((await res.json()).text ?? "").trim();
}

const pool = sentences();
const chosen = pool.slice(0, LIMIT);
console.log(`${MODEL} against ${chosen.length} attested Estonian sentences,`);
console.log("spoken by a native synthetic voice: clean audio, no accent, no noise.\n");

let totalErrors = 0;
let totalWords = 0;
let exact = 0;
const wrong = [];

for (const said of chosen) {
  let heard;
  try {
    heard = await hear(await speak(said));
  } catch (error) {
    console.log(`  skipped (${error.message}): ${said}`);
    continue;
  }
  const { distance, length } = errors(said, heard);
  totalErrors += distance;
  totalWords += length;
  if (distance === 0) exact += 1;
  else wrong.push({ said, heard });
  process.stdout.write(distance === 0 ? "." : "x");
}

const wer = totalWords === 0 ? 0 : (totalErrors / totalWords) * 100;
console.log(`\n\n  sentences transcribed exactly: ${exact}/${chosen.length}`);
console.log(`  word error rate: ${wer.toFixed(1)}%\n`);

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
