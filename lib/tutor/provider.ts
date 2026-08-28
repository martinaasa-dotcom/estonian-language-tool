/**
 * Provider-agnostic chat streaming.
 *
 * The app works with whichever key is configured — OpenRouter (which has genuinely
 * free models), OpenAI, or Anthropic. Nothing above this layer knows which.
 * Keys are read from the environment on the server and never leave it.
 */
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

/** Streams a reply as plain text chunks. Throws TutorError with a message worth showing. */
export async function* streamReply(
  config: ProviderConfig,
  system: string,
  messages: ChatMessage[],
): AsyncGenerator<string> {
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
          const text = extractText(config.name, JSON.parse(payload));
          if (text) yield text;
        } catch {
          // A malformed frame is not worth killing the stream over.
        }
      }
    }
  }
}

/**
 * The parts of a streaming frame we actually read.
 *
 * Both shapes in one type rather than `any`: Anthropic sends
 * `content_block_delta` frames with a `delta.text`, and every OpenAI-compatible
 * provider sends `choices[0].delta.content`. Everything else in a frame is
 * ignored, so describing only these fields is both honest and enough — and it
 * means a typo in one of these paths is a compile error rather than a silently
 * empty stream.
 */
interface StreamFrame {
  type?: string;
  delta?: { type?: string; text?: string };
  choices?: { delta?: { content?: string } }[];
}

function extractText(provider: ProviderName, frame: unknown): string {
  const f = frame as StreamFrame;
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
