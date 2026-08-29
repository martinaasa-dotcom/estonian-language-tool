/**
 * Does Anu actually know Estonian? Connection working is not the same as correct.
 * Each question has a fact the answer must contain; a wrong grammar explanation is
 * worse than none, because the SRS then drills it.
 */
const QUESTIONS = [
  { q: "Why is it 'Lugesin raamatut' and not 'Lugesin raamatu'?",
    must: [/partitiv/i], why: "object case / aspect" },
  { q: "What case does 'aitama' take? Give an example.",
    must: [/partitiv/i, /aitan/i], why: "verb government" },
  { q: "Which case is 'toas' and what is its dictionary form?",
    must: [/inessive|seesütlev/i, /tuba/i], why: "case identification" },
  { q: "Explain the consonant gradation in 'tuba : toa'.",
    must: [/gradation|astmevaheldus/i], why: "gradation" },
  { q: "How do you say 'I like this book' in Estonian?",
    must: [/mulle/i, /meeldib/i], why: "meeldima construction" },
  { q: "What is the partitive plural of 'raamat'?",
    must: [/raamatuid/i], why: "irregular form" },
];

const system = "You are Anu, an Estonian teacher for English speakers. Answer briefly and name the grammar rule.";
const key = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL;

/*
  A REFUSAL IS NOT A WRONG ANSWER, AND THIS SCRIPT USED TO SCORE THEM THE SAME.

  It read `data.choices[0].message.content` without ever looking at the status,
  so a 429 produced an empty string, every `must` pattern failed against it,
  and the model was marked wrong six times out of six. Free models are
  rate-limited hard upstream, which means every free model measured here
  scored zero for being busy rather than for being ignorant. That reading is
  written into .env.example, as "*:free models too rate-limited upstream to
  rely on day to day", and it is what made the shipped default a paid model,
  which is what made a new key with no credit on it get a 402 and Anu answer
  nothing at all.

  So: the status is read, a refusal is its own outcome and never counted as
  knowledge, and a 429 is waited out rather than recorded, because being told
  to come back in a moment is the ordinary state of a free model and not a
  fact about whether it knows Estonian.
*/
async function ask(question) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 320,
        messages: [{ role: "system", content: system }, { role: "user", content: question }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) {
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content ?? "";
      if (answer.trim()) return { answer };
      return { refused: "answered with nothing at all" };
    }
    if (res.status !== 429) {
      return { refused: `HTTP ${res.status}` };
    }
    await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt));
  }
  return { refused: "rate-limited on every attempt" };
}

let pass = 0;
let refused = 0;

for (const { q, must, why } of QUESTIONS) {
  const { answer, refused: why_not } = await ask(q);
  if (why_not) {
    refused++;
    console.log(`SKIP  ${why} (${why_not})`);
    continue;
  }
  const ok = must.every((re) => re.test(answer));
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why}`);
  if (!ok) console.log(`      Q: ${q}\n      A: ${answer.replace(/\n/g, " ").slice(0, 200)}`);
}

const asked = QUESTIONS.length - refused;
console.log(`\n${pass}/${asked} correct on ${model}` +
  (refused ? `, and ${refused} it would not answer, which says nothing about what it knows.` : "."));
// A model that would not answer half its questions has not been measured.
process.exit(refused * 2 > QUESTIONS.length || pass < asked ? 1 : 0);
