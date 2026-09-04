/**
 * One line, for one move, inside a closed word list.
 *
 * The model never sees the plot, never decides what happens next, never marks
 * anything, and never sees the learner's deck beyond the lemmas lent to the
 * list (design §6). It is asked for exactly one Estonian sentence and what
 * comes back goes through `runGate` before anybody sees it; a line that fails
 * is retried once with the failing words named, and then withheld. The route
 * that calls this meters it; this file opens a provider and nothing else.
 *
 * THE LEARNER'S TEXT REACHES A MODEL, SO IT IS DATA (§17). The last two turns
 * go in as conversation, never concatenated into an instruction, and the
 * model's only output is one line that then has to be a short Estonian
 * sentence made of listed words. The worst available outcome of anything
 * typed into it is a wasted call and a narrated turn.
 *
 * Server only: reads provider keys through `wireFor`. No Prisma.
 */
import { TutorError, resolveProviders, wireFor, type ProviderConfig, type UsageReport } from "@/lib/tutor/provider";
import { estimateTokens } from "@/lib/usage/pricing";
import { runGate, type GateData } from "./gate";
import type { PlannedBeat } from "./draw";
import { MAX_WORDS } from "./retrieval";
import { QUESTION_SHAPE, type SceneSpec } from "./types";
import type { TurnOutcome } from "./turn";

export const SYSTEM = [
  "You are one side of a short conversation in Estonian, in a role-play for a language learner.",
  "Write exactly ONE Estonian sentence: the line this character says next. Nothing else.",
  "Use ONLY words from the list you are given. Any form of a listed word is allowed.",
  "No English, no markdown, no quotation marks, no explanation.",
].join(" ");

export interface ComposeInput {
  readonly scene: SceneSpec;
  readonly beat: PlannedBeat;
  /** The lemmas the scene may use. */
  readonly lemmas: readonly string[];
  /** Every form of every one of them, for the gate. */
  readonly forms: ReadonlySet<string>;
  readonly wrongRegister: ReadonlySet<string>;
  readonly data: GateData;
  readonly recent: readonly { role: "other" | "learner"; text: string }[];
  readonly repair: TurnOutcome | null;
}

export interface Composed {
  readonly text: string | null;
  /** Why it was withheld, when it was. */
  readonly withheld: readonly string[];
  readonly usage: UsageReport;
  readonly provider: ProviderConfig | null;
}

function userPrompt(input: ComposeInput, retryOver?: readonly string[]): string {
  const { scene, beat, lemmas, repair } = input;
  return [
    `You are ${scene.place}. The learner is a member of the public and you address them as "${scene.register}".`,
    `Your move now: ${beat.move}. In English, what you are doing is: ${beat.goal}`,
    beat.topic.length > 0 ? `The line must be about: ${beat.topic.join(", ")}` : "",
    QUESTION_SHAPE[beat.move] === "required" ? "It must be a question." : "",
    QUESTION_SHAPE[beat.move] === "forbidden" ? "It must not be a question." : "",
    repair === "incomplete" ? "They answered part of it. Ask for the part that is missing, briefly." : "",
    repair === "offTarget" ? "They said something real that was not what you asked. Ask again, more simply." : "",
    repair === "unrecognised" || repair === "tooShort" ? "You did not catch that. Ask again, more simply." : "",
    `At most ${MAX_WORDS} words. Words you may use:`,
    lemmas.join(", "),
    retryOver && retryOver.length > 0
      ? `\nYour last line used words that are not on the list: ${retryOver.join(", ")}. Write it again using only listed words.`
      : "",
  ].filter(Boolean).join("\n");
}

async function once(config: ProviderConfig, user: string, recent: ComposeInput["recent"]): Promise<{ text: string; usage: UsageReport }> {
  const usage: UsageReport = { inputTokens: 0, outputTokens: 0, measured: false };
  const conversation = recent.map((t) => ({ role: t.role === "other" ? "assistant" : "user", content: t.text.slice(0, 300) }));
  let text = "";
  if (config.name === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 80,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [...conversation, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new TutorError(`${config.label} returned ${res.status}.`, res.status);
    const body = await res.json() as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (body.usage) {
      usage.inputTokens = body.usage.input_tokens ?? 0;
      usage.outputTokens = body.usage.output_tokens ?? 0;
      usage.measured = true;
    }
  } else {
    const { url, key } = wireFor(config);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.8,
        max_tokens: 80,
        messages: [{ role: "system", content: SYSTEM }, ...conversation, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20_000),
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
    usage.inputTokens = estimateTokens(SYSTEM + user);
    usage.outputTokens = estimateTokens(text);
  }
  return { text: text.trim().replace(/^["'«]|["'»]$/g, ""), usage };
}

/**
 * Walks the chain the way the tutor does: past a provider that is throttled
 * or has a bad minute, never past a rejected key. Each provider gets the one
 * retry the design allows, with the failing words named.
 */
export async function composeLine(input: ComposeInput, chain: ProviderConfig[] = resolveProviders()): Promise<Composed> {
  const usage: UsageReport = { inputTokens: 0, outputTokens: 0, measured: true };
  let withheld: string[] = [];
  let last: ProviderConfig | null = null;
  for (const config of chain) {
    last = config;
    try {
      let retryOver: readonly string[] | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const reply = await once(config, userPrompt(input, retryOver), input.recent);
        usage.inputTokens += reply.usage.inputTokens;
        usage.outputTokens += reply.usage.outputTokens;
        if (!reply.text) break;
        const verdict = runGate({
          text: reply.text, move: input.beat.move, forms: input.forms, wrongRegister: input.wrongRegister, data: input.data,
        });
        if (verdict.failed.length === 0) return { text: reply.text, withheld: [], usage, provider: config };
        withheld = [...verdict.failed];
        retryOver = verdict.unknown;
        // A shape or register failure is the model not doing what it was told; one retry either way.
      }
      return { text: null, withheld, usage, provider: config };
    } catch (error) {
      if (error instanceof TutorError && error.status === 401) throw error;
      // Throttled or unwell: the next link in the chain.
    }
  }
  return { text: null, withheld: withheld.length ? withheld : ["unavailable"], usage, provider: last };
}
