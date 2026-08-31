import type { WritingTask } from "@/lib/estonian/writing";
import { estimateTokens } from "@/lib/usage/pricing";
import { TutorError, type ProviderConfig, type UsageReport } from "./provider";

/**
 * Grading a learner's own Estonian sentence.
 *
 * This is the one place the model looks at Estonian the learner wrote, and its
 * job is carefully bounded. It does **not** decide whether the required
 * inflected form is correct — `checkForm` does that by string comparison
 * against a form from Ekilex, before this is ever called. The model judges what
 * a model is actually good at: whether the rest of the sentence hangs together,
 * whether the word is used in a sense that makes sense, and why.
 *
 * That boundary is what makes the feature compatible with ADR-005. The forms in
 * the prompt are quoted to the model, not invented by it, and nothing it returns
 * is ever written to a card. Its output is advice attached to one attempt.
 */

export type Verdict = "correct" | "almost" | "wrong";

export interface GradedSentence {
  verdict: Verdict;
  /** One or two sentences. May quote the supplied forms; may not invent new ones. */
  comment: string;
  /** The grammatical rule at issue, named. Empty when the sentence was simply right. */
  rule: string;
}

export interface GraderInput {
  task: WritingTask;
  sentence: string;
  /** Every authoritative form, so the model never has to guess one. */
  knownForms: { label: string; value: string }[];
  level: string;
}

export function buildGraderSystemPrompt(): string {
  return `You are Anu, an Estonian teacher, marking one sentence a learner has written.

WHAT YOU ARE JUDGING
The learner was asked to use one specific word in one specific grammatical case. Whether they produced the right form has ALREADY been checked mechanically against the dictionary, and the result is given to you. Do not re-litigate it and do not contradict it.

Your job is the rest of the sentence:
- Is it grammatical Estonian?
- Is the word used in a sense that makes sense?
- Is the word order natural?
- Is the object case right, if there is an object?

RULES YOU MUST NOT BREAK
- Every Estonian form you mention must be one that appears in KNOWN FORMS below, or a word the learner themselves wrote. You may not introduce an inflected form from your own knowledge. If the sentence needs a word you have not been given, describe it in English instead ("you would need the allative of 'laud' here") and do not spell it.
- If you are unsure whether something is an error, say the sentence is acceptable. A confident correction that is wrong is far more damaging than a missed nitpick, because the learner will believe you.
- Name the rule when you correct something. "Partitive, because the action is ongoing", not "it sounds better".

TONE
Direct and brief. Say what is right before what is wrong when both apply. No praise that carries no information.

OUTPUT
Reply with a single JSON object and nothing else:
{"verdict":"correct"|"almost"|"wrong","comment":"one or two sentences","rule":"the grammatical rule at issue, or an empty string"}

"correct" means the sentence works. "almost" means understandable but with an error worth naming. "wrong" means it does not mean what they intended, or is not Estonian.

Do not use an em dash or an en dash anywhere in your comment. Use a comma, a full stop, or a pair of brackets.`;
}

export function buildGraderUserPrompt(input: GraderInput, formWasUsed: boolean): string {
  const forms = input.knownForms
    .filter((f) => f.value)
    .map((f) => `  ${f.label}: ${f.value}`)
    .join("\n");

  return `LEARNER LEVEL: ${input.level}

TASK SET: use "${input.task.lemma}" (${input.task.translation}) in the ${input.task.caseEn.toLowerCase()} (${input.task.caseEt}, ${input.task.caseQuestion}).
REQUIRED FORM: ${input.task.targetForm}
MECHANICAL CHECK: the learner ${formWasUsed ? "DID" : "DID NOT"} use the required form.

KNOWN FORMS of ${input.task.lemma}, from the dictionary. These are the only forms of this word you may write:
${forms || "  (none beyond the required form)"}

THE LEARNER WROTE:
${input.sentence}`;
}

/**
 * Parses the model's reply into a verdict.
 *
 * Models wrap JSON in prose or fences however they like, so the first balanced
 * object in the response is taken rather than assuming the whole body parses.
 * Anything unparseable becomes an honest "could not grade" rather than a guess:
 * inventing a verdict here would be inventing feedback.
 */
export function parseVerdict(raw: string): GradedSentence | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end)) as Record<string, unknown>;
    const verdict = parsed.verdict;
    if (verdict !== "correct" && verdict !== "almost" && verdict !== "wrong") return null;
    return {
      verdict,
      comment: typeof parsed.comment === "string" ? parsed.comment.slice(0, 600) : "",
      rule: typeof parsed.rule === "string" ? parsed.rule.slice(0, 200) : "",
    };
  } catch {
    return null;
  }
}

/**
 * One non-streaming call. Grading is short and the learner is waiting for a
 * single verdict, so streaming would add complexity for no perceived speed.
 */
export async function gradeSentence(
  config: ProviderConfig,
  input: GraderInput,
  formWasUsed: boolean,
): Promise<{ graded: GradedSentence | null; usage: UsageReport }> {
  const { text, usage } = await callForJson(
    config, buildGraderSystemPrompt(), buildGraderUserPrompt(input, formWasUsed),
  );
  return { graded: parseVerdict(text), usage };
}

/**
 * The transport, shared by the two things that ask a model for one JSON object.
 *
 * Extracted when the mock examination needed a second grader: the composition
 * task hands over a whole text rather than one sentence, and duplicating fifty
 * lines of provider plumbing to say so would have meant two places to fix the
 * next time a provider changed the shape of its usage block.
 */
async function callForJson(
  config: ProviderConfig,
  system: string,
  user: string,
  maxTokens = 400,
): Promise<{ text: string; usage: UsageReport }> {
  const usage: UsageReport = { inputTokens: 0, outputTokens: 0, measured: false };
  let text = "";

  if (config.name === "anthropic") {
    // config always comes from resolveProvider()/resolveProviders(), which
    // only ever offers "anthropic" when this key was set.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        // Identical on every call, so it is worth caching rather than re-reading.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new TutorError(`${config.label} returned ${res.status}.`, res.status);
    const body = await res.json() as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    };
    text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (body.usage) {
      usage.inputTokens =
        (body.usage.input_tokens ?? 0) +
        (body.usage.cache_read_input_tokens ?? 0) +
        (body.usage.cache_creation_input_tokens ?? 0);
      usage.outputTokens = body.usage.output_tokens ?? 0;
      usage.measured = true;
    }
  } else {
    const isOpenRouter = config.name === "openrouter";
    // Same invariant as the anthropic branch above.
    const key = isOpenRouter ? process.env.OPENROUTER_API_KEY! : process.env.OPENAI_API_KEY!;
    const url = isOpenRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new TutorError(`${config.label} returned ${res.status}.`, res.status);
    const body = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    text = body.choices?.[0]?.message?.content ?? "";
    if (body.usage) {
      usage.inputTokens = body.usage.prompt_tokens ?? 0;
      usage.outputTokens = body.usage.completion_tokens ?? 0;
      usage.measured = true;
    }
  }

  if (!usage.measured) {
    usage.inputTokens = estimateTokens(system + user);
    usage.outputTokens = estimateTokens(text);
  }

  return { text, usage };
}

// ── The examination composition ──────────────────────────────────────────────

/**
 * Reading back a whole text from the mock examination's writing part.
 *
 * THE MARKS ARE ALREADY DECIDED BEFORE THIS RUNS, and that is the point. The
 * composition scores on length and on whether the words the task named were
 * used, both settled by `lib/exam/score.ts` against the dictionary. Nothing this
 * returns can move a mark. A model that decided whether somebody's Estonian was
 * good enough would be deciding whether they are ready to sit a real
 * examination, which is exactly the judgement it is least qualified to make.
 *
 * So the prompt asks for the thing a model is genuinely good at: reading a text
 * and saying what a teacher would say about it, in English, without spelling a
 * single Estonian form it was not given. The learner's own words are the
 * allowlist, and `verifyComment` enforces it after the fact, because a live test
 * showed a model reaching for forms unprompted despite being told not to.
 */
export function buildCompositionSystemPrompt(): string {
  return `You are Anu, an Estonian teacher, reading back a text a learner wrote in an examination.

WHAT YOU ARE DOING
Saying what you notice, the way a teacher hands a paper back. Two or three sentences, no more.

WHAT YOU ARE NOT DOING
Marking it. The marks were awarded before you saw this, mechanically, on length and on whether the required words were used. Do not award, estimate, or mention a score, and do not tell the learner whether they passed.

RULES YOU MUST NOT BREAK
- Every Estonian word you write must be one the learner themselves wrote. You may not spell a correction. If a word is wrong, name the problem in English: "the second sentence needs the partitive after that verb", never the form itself.
- If you are unsure whether something is an error, leave it. A confident correction that is wrong is far more damaging than a missed one, because the learner will believe you.
- Name the pattern, not every instance. One thing to fix beats nine.

TONE
Direct and brief. Say what works before what does not, when both apply. No praise that carries no information.

OUTPUT
Reply with a single JSON object and nothing else:
{"verdict":"correct"|"almost"|"wrong","comment":"two or three sentences","rule":"the one thing to work on, in a few words, or an empty string"}

Do not use an em dash or an en dash anywhere in your comment. Use a comma, a full stop, or a pair of brackets.`;
}

export function buildCompositionUserPrompt(text: string, level: string): string {
  return `LEARNER LEVEL: ${level}

THIS IS WHAT THEY WROTE. Every Estonian word you may use is somewhere in it:
${text}`;
}

export async function gradeComposition(
  config: ProviderConfig,
  text: string,
  level: string,
): Promise<{ graded: GradedSentence | null; usage: UsageReport }> {
  const { text: reply, usage } = await callForJson(
    config, buildCompositionSystemPrompt(), buildCompositionUserPrompt(text, level), 500,
  );
  return { graded: parseVerdict(reply), usage };
}
