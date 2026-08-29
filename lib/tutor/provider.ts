/**
 * Provider-agnostic chat streaming, with a fallback chain behind it.
 *
 * The app works with whichever keys are configured: OpenRouter (which has
 * genuinely free models), Anthropic, or OpenAI. Nothing above this layer
 * knows which. Keys are read from the environment on the server and never
 * leave it.
 *
 * WHY A CHAIN RATHER THAN A CHOICE. The default provider is a free model, and
 * a free model is rate-limited hard upstream by design: a 429 is the ordinary
 * case, not the exception. `withRetry` already softened that, and retrying is
 * the wrong tool once a whole minute of quota is gone. If a second key is
 * configured, walking past the exhausted provider costs one request and gets
 * the learner an answer; refusing when there was another way to ask is the
 * app choosing to fail. The order is deliberate: free first, so the paid key
 * is the fallback rather than the default.
 *
 * WHICH ONE ANSWERED IS THEN A FACT ABOUT THE ANSWER, and the app says so.
 * `streamReply` reports the provider that actually served the stream, never
 * the head of the chain, because a screen naming the wrong model is worse
 * than one naming none.
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

/**
 * Every provider with a key, in the order they should be tried.
 *
 * Free first. A deployment with only one key gets a chain of one, which is
 * what this app has always done; a deployment with two gets somewhere to go
 * when the first is throttled.
 */
export function resolveProviders(): ProviderConfig[] {
  const chain: ProviderConfig[] = [];
  if (process.env.OPENROUTER_API_KEY) {
    chain.push({
      name: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o",
      label: "OpenRouter",
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    chain.push({
      name: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      label: "Anthropic",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    chain.push({
      name: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      label: "OpenAI",
    });
  }
  return chain;
}

/** The head of the chain, for the places that only need to say whether Anu is set up at all. */
export function resolveProvider(): ProviderConfig | null {
  return resolveProviders()[0] ?? null;
}

/**
 * Is this worth asking somebody else about?
 *
 * A throttled or broken-down provider is: another key would answer. A
 * rejected key or a model name that does not exist is not, because every
 * provider in the chain would give the same answer for its own reasons and
 * trying them all just turns one clear message into a slower one.
 */
function worthFallingBackFrom(error: unknown): boolean {
  if (!(error instanceof TutorError)) return true;
  return error.status === 429 || error.status === 502 || error.status === 503;
}

export class TutorError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Tokens a completed call actually consumed, for the usage ledger. */
export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  /** False when the provider never sent a usage frame and this is an estimate. */
  measured: boolean;
}

/** A provider that has accepted the question, and the reply it is about to give. */
export interface OpenStream {
  /** The provider that actually answered, which may not be the head of the chain. */
  config: ProviderConfig;
  chunks: AsyncGenerator<string>;
}

/**
 * Pulls token counts out of whichever frame carries them.
 *
 * OpenAI-compatible providers send a final chunk with a `usage` object when
 * `stream_options.include_usage` is set. Anthropic splits it: input tokens
 * arrive on `message_start`, output tokens on `message_delta`.
 */
interface UsageFrame {
  type?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  usage?: { output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
}

function absorbUsage(provider: ProviderName, frame: unknown, into: UsageReport): void {
  const f = frame as UsageFrame;

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

/**
 * Ask the chain until one of them accepts, and say which one did.
 *
 * THE SPLIT BETWEEN OPENING AND READING IS THE WHOLE DESIGN HERE, and it
 * exists so the answer can be labelled. Every reason to fall back, a 429, a
 * rejected key, a provider having a bad minute, arrives in the *head* of the
 * upstream response, before a single token of the reply. So the handshake is
 * finished before this function returns, the caller knows which model is
 * about to write, and it can put that in a response header, where a header
 * still can be put. Deciding halfway through a stream would leave the name
 * of the model in a trailer, which browsers do not expose, or in a data
 * format wrapped around what is meant to be plain text.
 *
 * A provider is therefore only ever walked past before it has said anything.
 * Once text is reaching the learner, a failure is left as a failure rather
 * than restarted somewhere else: a second answer appended to half of a first
 * one is two teachers talking over each other, and nothing on screen would
 * say where one stopped.
 */
export async function openWithFallback(
  chain: ProviderConfig[],
  system: string,
  messages: ChatMessage[],
  /** Called once when the stream ends, however it ends. Tokens spent before a
   *  failure were still spent, and the spend cap has to see them. */
  onUsage?: (usage: UsageReport, config: ProviderConfig) => void,
): Promise<OpenStream> {
  if (chain.length === 0) throw new TutorError("No AI provider is configured.", 503);

  for (let i = 0; i < chain.length; i += 1) {
    const config = chain[i]!;
    try {
      const last = i === chain.length - 1;
      const upstream =
        config.name === "anthropic"
          ? await callAnthropic(config, system, messages)
          : await callOpenAiCompatible(config, system, messages, last);
      // The ledger has to see the provider that actually answered, not the head
      // of the chain — falling back to a dearer model must not go unmetered.
      return { config, chunks: readStream(config, upstream, system, messages, onUsage) };
    } catch (error) {
      if (i === chain.length - 1 || !worthFallingBackFrom(error)) throw error;
    }
  }

  // Unreachable: the loop either returns or throws on its last pass.
  throw new TutorError("No AI provider is configured.", 503);
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
  yield* readStream(config, upstream);
}

/** The frames of an already-open upstream response, as text. */
async function* readStream(
  config: ProviderConfig,
  upstream: Response,
  system = "",
  messages: ChatMessage[] = [],
  onUsage?: (usage: UsageReport, config: ProviderConfig) => void,
): AsyncGenerator<string> {
  const usage: UsageReport = { inputTokens: 0, outputTokens: 0, measured: false };
  let produced = "";
  let reported = false;

  const report = () => {
    if (reported) return;
    reported = true;
    if (!usage.measured) {
      // No usage frame arrived. Estimate over the text we know about, so an
      // unmetered call never counts as free.
      usage.inputTokens = estimateTokens(system + messages.map((m) => m.content).join(""));
      usage.outputTokens = estimateTokens(produced);
    }
    onUsage?.(usage, config);
  };

  try {
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
 * OpenRouter's free models are aggressively rate-limited upstream, so a single
 * 429 is normal rather than fatal. Waiting a moment and asking again turns
 * most of them into an answer.
 *
 * WAITING IS ONLY THE RIGHT ANSWER WHEN THERE IS NOWHERE ELSE TO ASK, which
 * is why `patient` is a parameter rather than always true. With a second key
 * configured, sitting through 4.5 seconds of backoff against a provider that
 * has already said no, and then falling back anyway, is four and a half
 * seconds of a learner watching nothing happen for no gain at all. So
 * `openWithFallback` is patient on the last link of the chain and impatient
 * on every link before it, where moving on costs one request.
 */
async function withRetry(send: () => Promise<Response>, patient: boolean): Promise<Response> {
  const attempts = patient ? 3 : 1;
  let last: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await send();
    if (res.status !== 429) return res;
    last = res;
    if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return last!;
}

async function callOpenAiCompatible(
  config: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  patient = true,
) {
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
  }), patient);

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
      // No stream_options here: Anthropic reports usage natively on
      // message_start and message_delta, and rejects the OpenAI-shaped field.
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
      `${config.label} is rate-limiting this model. Free models are throttled hard upstream, so ` +
      `wait a moment, or set OPENROUTER_MODEL to a paid one in .env (openai/gpt-4o is about ` +
      `half a cent per question).`,
      429,
    );
  }
  if (res.status === 404) {
    throw new TutorError(`${config.label} does not have a model called "${config.model}".`, 404);
  }
  // Out of credit, which is where a free key ends up rather than an unusual
  // accident, and it is not the same answer as a rejected key: this account
  // cannot pay and the next one in the chain may well be able to, so it is
  // worth walking past. It arrives as JSON, and 180 characters of a provider's
  // JSON truncated mid-word is not a sentence anybody can act on.
  if (res.status === 402) {
    throw new TutorError(
      `${config.label} says this key is out of credit. Top it up, switch the model in .env to a ` +
      `cheaper one, or add another provider's key: Anu asks whichever ones are set, free first.`,
      502,
    );
  }
  // The detail goes to the log rather than to the learner. It is somebody
  // else's error format, in JSON, cut off wherever 180 characters happened to
  // land, and the one thing a reader can do with it is not understand it.
  if (detail) console.error(`[tutor] ${config.label} returned ${res.status}: ${detail.slice(0, 400)}`);
  throw new TutorError(
    `${config.label} could not answer just now, and said only that it was a ${res.status}. ` +
    `Try again in a moment.`,
    502,
  );
}
