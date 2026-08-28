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
let pass = 0;

for (const { q, must, why } of QUESTIONS) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 320,
      messages: [{ role: "system", content: system }, { role: "user", content: q }] }),
  });
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content ?? "";
  const ok = must.every((re) => re.test(answer));
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why}`);
  if (!ok) console.log(`      Q: ${q}\n      A: ${answer.replace(/\n/g, " ").slice(0, 200)}`);
}
console.log(`\n${pass}/${QUESTIONS.length} correct on ${model}`);
