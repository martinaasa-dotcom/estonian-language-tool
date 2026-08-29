/**
 * Provider-agnostic chat streaming.
 *
 * The app works with whichever key is configured — OpenRouter (which has genuinely
 * free models), OpenAI, or Anthropic. Nothing above this layer knows which.
 * Keys are read from the environment on the server and never leave it.
 */
import { estimateTokens } from "@/lib/usage/pricing";

export type ProviderName = "openrouter" | "openai" | "anthropic";

export interface ProviderConfig {
  name: ProviderName;
  model: string;
  label: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Tokens a completed call actually consumed, for the usage ledger. */
export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  /** False when the provider never sent a usage frame and this is an estimate. */
  measured: boolean;
}

/** Picks whichever provider has a key, preferring the free option. */
export function resolveProvider(): ProviderConfig | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      name: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o",
      label: "OpenRouter",
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      label: "Anthropic",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      label: "OpenAI",
    };
  }
  return null;
}

export class TutorError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Streams a reply as plain text chunks. Throws TutorError with a message worth
 * showing.
 *
 * `onUsage` receives the token counts once the stream ends. Providers report
 * these in their own way and only at the end, so the callback fires exactly
 * once — including on an error partway through, because tokens spent before a
 * failure were still spent and the ledger has to see them.
 */
export async function* streamReply(
  config: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  onUsage?: (usage: UsageReport) => void,
): AsyncGenerator<string> {
  const usage: UsageReport = { inputTokens: 0, outputTokens: 0, measured: false };
  let produced = "";
  let reported = false;

  const report = () => {
    if (reported) return;
    reported = true;
    if (!usage.measured) {
      // No usage frame arrived. Fall back to an estimate over the text we know
      // about, so an unmetered call never counts as free.
      usage.inputTokens = estimateTokens(system + messages.map((m) => m.content).join(""));
      usage.outputTokens = estimateTokens(produced);
    }
    onUsage?.(usage);
  };

  try {
    const upstream =
      config.name === "anthropic"
        ? await callAnthropic(config, system, messages)
        : await callOpenAiCompatible(config, system, messages);

    const reader = upstream.body?.getReader();
    if (!reader) throw new TutorError("Anu sent an empty response.", 502);

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Server-sent events are separated by a blank line; a chunk can split one.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const frame = JSON.parse(payload);
            absorbUsage(config.name, frame, usage);
            const text = extractText(config.name, frame);
            if (text) {
              produced += text;
              yield text;
            }
          } catch {
            // A malformed frame is not worth killing the stream over.
          }
        }
      }
    }
  } finally {
    report();
  }
}

/**
 * Pulls token counts out of whichever frame carries them.
 *
 * OpenAI-compatible providers send a final chunk with a `usage` object when
 * `stream_options.include_usage` is set. Anthropic splits it: input tokens
 * arrive on `message_start`, output tokens on `message_delta`.
 */
function absorbUsage(provider: ProviderName, frame: unknown, into: UsageReport): void {
  const f = frame as Record<string, any>;

  if (provider === "anthropic") {
    if (f.type === "message_start" && f.message?.usage) {
      const u = f.message.usage;
      // Cache reads and writes are real input tokens and are billed as such.
      into.inputTokens =
        (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0);
      into.measured = true;
    }
    if (f.type === "message_delta" && f.usage?.output_tokens != null) {
      into.outputTokens = f.usage.output_tokens;
      into.measured = true;
    }
    return;
  }

  if (f.usage) {
    into.inputTokens = f.usage.prompt_tokens ?? into.inputTokens;
    into.outputTokens = f.usage.completion_tokens ?? into.outputTokens;
    into.measured = true;
  }
}

function extractText(provider: ProviderName, frame: unknown): string {
  const f = frame as Record<string, any>;
  if (provider === "anthropic") {
    if (f.type === "content_block_delta" && f.delta?.type === "text_delta") return f.delta.text ?? "";
    return "";
  }
  return f.choices?.[0]?.delta?.content ?? "";
}

/**
 * OpenRouter's free models are aggressively rate-limited upstream, so a single 429
 * is normal rather than fatal. Retrying twice with a short backoff turns most of
 * them into an answer; a persistent 429 still surfaces as a clear message.
 */
async function withRetry(send: () => Promise<Response>): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await send();
    if (res.status !== 429) return res;
    last = res;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return last!;
}

async function callOpenAiCompatible(config: ProviderConfig, system: string, messages: ChatMessage[]) {
  const isOpenRouter = config.name === "openrouter";
  const key = isOpenRouter ? process.env.OPENROUTER_API_KEY! : process.env.OPENAI_API_KEY!;
  const url = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const res = await withRetry(() => fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(isOpenRouter
        ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Kodukeel Estonian study" }
        : {}),
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      // Without this the stream carries no usage frame and the ledger has to
      // fall back to estimating from character counts.
      stream_options: { include_usage: true },
      max_tokens: 1200,
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(90_000),
  }));

  await assertOk(res, config);
  return res;
}

async function callAnthropic(config: ProviderConfig, system: string, messages: ChatMessage[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      max_tokens: 1200,
      // The Estonian reference is identical every turn, so cache it rather than
      // paying to re-read it on each message.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  await assertOk(res, config);
  return res;
}

async function assertOk(res: Response, config: ProviderConfig) {
  if (res.ok) return;
  const detail = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) {
    throw new TutorError(`${config.label} rejected the API key. Check it in your .env file.`, 401);
  }
  if (res.status === 429) {
    throw new TutorError(
      `${config.label} is rate-limiting this model. Free models are throttled hard upstream — ` +
      `wait a moment, or set OPENROUTER_MODEL to a paid one in .env (openai/gpt-4o is about ` +
      `half a cent per question).`,
      429,
    );
  }
  if (res.status === 404) {
    throw new TutorError(`${config.label} does not have a model called "${config.model}".`, 404);
  }
  throw new TutorError(
    `${config.label} returned ${res.status}. ${detail.slice(0, 180)}`.trim(),
    502,
  );
}
