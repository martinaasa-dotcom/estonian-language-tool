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
import { reportError } from "@/lib/observability/report";
import { estimateTokens } from "@/lib/usage/pricing";

export type ProviderName = "openrouter" | "groq" | "gemini" | "openai" | "anthropic";

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
/**
 * How many *independent* things can answer, which is not the length of the
 * chain.
 *
 * OpenRouter contributes one link per free model, so a chain of four can still
 * be a single account with a single balance. When that balance ran out here
 * every link returned 402 together and Anu went down, which is exactly the
 * failure a fallback chain is supposed to absorb. What protects availability
 * is a second *provider*, not a fifth model.
 *
 * Pure, so Settings can say this without asking anything upstream.
 */
export function providerResilience(chain = resolveProviders()): {
  providers: string[];
  models: number;
  singlePointOfFailure: boolean;
} {
  const providers = [...new Set(chain.map((c) => c.label))];
  return {
    providers,
    models: chain.length,
    // Nothing configured is its own problem, reported elsewhere; this flag is
    // about a chain that looks redundant and is not.
    singlePointOfFailure: providers.length === 1,
  };
}

/**
 * Every environment variable that can put a provider into the chain.
 *
 * One list rather than five reads scattered through `resolveProviders`, and it
 * exists for the test suite rather than for the chain: a unit test here must
 * describe a machine, not run on one. `provider.test.ts` clears exactly these
 * before each case, so a machine that happens to carry a real key in its
 * environment measures the same chain CI does.
 *
 * That is not hypothetical. `GROQ_API_KEY` and `GEMINI_API_KEY` were added to
 * the chain without being added to the test helper that cleared keys, so the
 * whole suite passed on CI, which has none, and failed thirteen ways on any
 * machine that had either. The suite was reporting the machine.
 */
export const PROVIDER_KEY_ENV = [
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const;

export function resolveProviders(): ProviderConfig[] {
  const chain: ProviderConfig[] = [];
  if (process.env.OPENROUTER_API_KEY) {
    for (const model of openRouterModels()) {
      chain.push({ name: "openrouter", model, label: "OpenRouter" });
    }
  }
  /*
    Free providers before paid ones, and independent of OpenRouter.

    The order is the policy: everything a stranger can set up without a card is
    tried first, and a paid key is only ever reached once all of it has failed.
  */
  if (process.env.GROQ_API_KEY) {
    for (const model of configuredModels(process.env.GROQ_MODEL, FREE_GROQ_MODELS)) {
      chain.push({ name: "groq", model, label: "Groq" });
    }
  }
  if (process.env.GEMINI_API_KEY) {
    for (const model of configuredModels(process.env.GEMINI_MODEL, FREE_GEMINI_MODELS)) {
      chain.push({ name: "gemini", model, label: "Google Gemini" });
    }
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

/**
 * The free models Anu asks first, in order, and why there is more than one.
 *
 * This default used to be `openai/gpt-4o`, which is a paid model at
 * OpenRouter's full rate, three lines under a comment saying the default
 * provider is a free one. A key with no credit on it therefore got a 402 and
 * Anu could not answer at all, which is what a new install looks like:
 * somebody follows the setup, pastes a free key, and the tutor is dead.
 *
 * A free model is rate-limited hard upstream by design, so one of them is a
 * name rather than a plan. Measured on 2026-08-29 against Anu's own system
 * prompt and a real question ("Why is it 'Lugesin raamatut' and not 'Lugesin
 * raamatu'?"), two of the five free models tried answered 429 in the same
 * minute, and these three answered in six to seven seconds, each naming the
 * partitive and the Estonian term beside it, with the minimal pair the prompt
 * asks for. They are ordered by how cleanly they wrote it: the third reaches
 * for a dash, which `humanize.ts` then has to take back out.
 *
 * `OPENROUTER_MODEL` still overrides, and takes a comma-separated list, so a
 * deployment with credit can point the whole chain at a paid model without
 * touching this. `priceFor` already charges a `:free` slug nothing, so the
 * spend cap is not confused by any of it.
 */
export const FREE_OPENROUTER_MODELS = [
  "google/gemma-4-31b-it:free",
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
] as const;

/**
 * Free-tier providers other than OpenRouter, and the models they give away.
 *
 * These exist so that a second provider does not mean a credit card. Both hand
 * out a real free tier with no card, both speak the OpenAI wire format, and
 * neither shares an account with OpenRouter, which is the entire point: when
 * the OpenRouter balance ran out here, every free model behind it answered 402
 * in the same second because they were one account wearing several hats.
 *
 * Three models each, because a model name that has been retired is walkable
 * within a provider but ends the chain if it is that provider's only link.
 * Both lists are overridable, and the console's own model list is the thing to
 * check if a name here has moved on.
 *
 * EVERY NAME BELOW WAS ASKED THE QUESTION BEFORE IT WAS WRITTEN DOWN, against
 * each account's own model list and then with a real Estonian one ("Why is it
 * 'Lugesin raamatut' and not 'Lugesin raamatu'?"). Listed is not the same as
 * usable and the difference is not visible from a name, which is what the
 * three rejections are worth recording for.
 *
 * `openai/gpt-oss-20b` answers 200 and returns an empty string: it spends the
 * whole budget in its reasoning field and writes nothing into `content`, so a
 * learner would watch a stream produce nothing and the chain would count it as
 * an answer. `qwen/qwen3.6-27b` puts its reasoning in `content` behind a
 * `<think>` tag, which streams straight to the screen. And Gemini's
 * `gemini-flash-lite-latest` answers cleanly and got the Estonian wrong,
 * offering `raamatud` for the partitive, which is the one kind of failure this
 * app cannot let through to somebody who is learning the case.
 *
 * `gemini-flash-latest` answered 503 on the day this was widened, which is not
 * an argument against it. It is the alias that tracks whatever the current
 * flash model is, and a provider having a bad minute is the exact thing the
 * two names behind it are for.
 */
export const FREE_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "groq/compound-mini",
] as const;

/*
  An alias first, deliberately.

  The first names written here were `llama-3.3-70b-versatile` and
  `gemini-2.0-flash`, both plausible and both already retired: the accounts
  answered 404 for them within a day of the list being written. Google publish
  `gemini-flash-latest`, which follows whatever the current flash model is, so
  it cannot go stale the way a pinned version does. The pinned name behind it
  is the fallback for the day the alias itself moves.

  Groq publish no alias, so both of theirs are pinned and both were checked
  against the account's own model list rather than guessed.
*/
export const FREE_GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;

function configuredModels(raw: string | undefined, fallback: readonly string[]): string[] {
  const configured = (raw ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return configured.length > 0 ? configured : [...fallback];
}

function openRouterModels(): string[] {
  const configured = (process.env.OPENROUTER_MODEL ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : [...FREE_OPENROUTER_MODELS];
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
function worthFallingBackFrom(error: unknown, sameProviderNext = false): boolean {
  if (!(error instanceof TutorError)) return true;
  // A model that does not exist is fatal across providers, for the reason
  // above, and is exactly what to walk past within one: the defaults here are
  // free models, and a free model is retired the moment it stops being worth
  // somebody's money. Reaching the next one costs a request; refusing costs
  // the learner their answer over a slug that went stale in a constant.
  if (error.status === 404) return sameProviderNext;
  // 402 belongs here for the same reason as 429: one provider being out of
  // credit says nothing about the next one's balance, so falling through costs
  // a request and keeps the tutor answering.
  return (
    error.status === 402 ||
    error.status === 429 ||
    error.status === 502 ||
    error.status === 503
  );
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
  /*
    What is true of this learner today, sent after the static prompt rather
    than inside it. The Anthropic path caches the static block and this one
    follows it uncached; an OpenAI-compatible provider caches by prefix, so
    appending it costs the same. Either way a note that changes per person
    never invalidates the part that does not.
  */
  live = "",
): Promise<OpenStream> {
  if (chain.length === 0) throw new TutorError("No AI provider is configured.", 503);

  for (let i = 0; i < chain.length; i += 1) {
    const config = chain[i]!;
    try {
      const last = i === chain.length - 1;
      const upstream =
        config.name === "anthropic"
          ? await callAnthropic(config, system, messages, live)
          : await callOpenAiCompatible(config, system, messages, last, live);
      // The ledger has to see the provider that actually answered, not the head
      // of the chain — falling back to a dearer model must not go unmetered.
      return { config, chunks: readStream(config, upstream, system + live, messages, onUsage) };
    } catch (error) {
      const next = chain[i + 1];
      if (!next || !worthFallingBackFrom(error, next.name === config.name)) throw error;
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

/**
 * The OpenAI-compatible providers, and what differs between them.
 *
 * One table rather than a ternary that grew a third branch. Everything here
 * speaks the same wire format; only the address, the key and one quirk differ.
 *
 * `usageFrames` is that quirk. Asking for `stream_options: {include_usage:true}`
 * is how the ledger gets exact token counts instead of estimating from
 * characters, and a provider that does not recognise the field rejects the
 * whole request rather than ignoring it. Anthropic already cost this codebase
 * that bug once. Gemini's compatibility layer is not documented to accept it,
 * so it is not sent, and the ledger falls back to its estimate, which
 * over-counts on purpose and so keeps the cap failing closed.
 */
const OPENAI_COMPATIBLE: Record<
  "openrouter" | "groq" | "gemini" | "openai",
  { url: string; keyEnv: string; usageFrames: boolean }
> = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    usageFrames: true,
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    usageFrames: true,
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    usageFrames: false,
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    keyEnv: "OPENAI_API_KEY",
    usageFrames: true,
  },
};

/** The wire details for a provider that is not Anthropic. */
function openAiCompatible(config: ProviderConfig) {
  const entry = OPENAI_COMPATIBLE[config.name as keyof typeof OPENAI_COMPATIBLE];
  if (!entry) throw new TutorError(`${config.label} has no endpoint configured.`, 500);
  return entry;
}

async function callOpenAiCompatible(
  config: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  patient = true,
  live = "",
) {
  const { url, keyEnv, usageFrames } = openAiCompatible(config);
  // Safe only because every config reaching here came from resolveProviders(),
  // which pushes a provider onto the chain exactly when this key was set.
  const key = process.env[keyEnv]!;

  const res = await withRetry(() => fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(config.name === "openrouter"
        ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Kodukeel Estonian study" }
        : {}),
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      // Without this the stream carries no usage frame and the ledger has to
      // fall back to estimating from character counts.
      ...(usageFrames ? { stream_options: { include_usage: true } } : {}),
      max_tokens: 1200,
      messages: [{ role: "system", content: live ? `${system}\n\n${live}` : system }, ...messages],
    }),
    signal: AbortSignal.timeout(90_000),
  }), patient);

  await assertOk(res, config);
  return res;
}

async function callAnthropic(config: ProviderConfig, system: string, messages: ChatMessage[], live = "") {
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
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ...(live ? [{ type: "text", text: live }] : []),
      ],
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
  /*
    Out of credit, which is not the same as a rejected key and must not be
    reported as one. It is worth falling back from, because the next provider
    in the chain has its own balance, and it is worth saying plainly, because
    the person who can fix it is whoever runs the deployment rather than the
    learner reading the message.

    Found on a live deployment: OpenRouter answered 402 and the learner was
    shown a slice of the raw JSON, "This request requires more credits, or
    fewer max_tokens. You requested up to 1200 tokens, but can only afford
    898". Accurate, and addressed to nobody who was there.
  */
  if (res.status === 402) {
    throw new TutorError(
      `${config.label} is out of credit for this key. Add credit, or set another provider key ` +
      `in .env so the chain has somewhere to fall through to.`,
      402,
    );
  }
  /*
    Everything else. The upstream text goes to the log rather than to the
    screen: it is provider JSON, it can carry the request back verbatim, and
    it means nothing to a learner. The status is what the caller needs.
  */
  reportError(new Error(`${config.label} returned ${res.status}: ${detail.slice(0, 500)}`), {
    at: "tutor/provider",
    extra: { provider: config.label, model: config.model, status: res.status },
  });
  throw new TutorError(
    `${config.label} could not answer just now (${res.status}).`,
    502,
  );
}

// ─────────────────────────── Looking at a picture ──────────────────────────

/**
 * A photograph on its way to a model, decoded and ready to send.
 *
 * Kept as base64 rather than bytes because that is the shape both wire formats
 * want, and re-encoding it twice for one request is work for nothing.
 */
export interface ImageAttachment {
  mediaType: string;
  base64: string;
}

/** One complete answer, and who wrote it. */
export interface CompletedReply {
  config: ProviderConfig;
  text: string;
  usage: UsageReport;
}

/**
 * Which model each provider is asked to look at pictures with.
 *
 * It defaults to whatever the deployment already configured for chat, because
 * the operator picked that model and picking a different one behind their back
 * is how a deployment that chose a free model ends up with an invoice. The
 * override exists for the case that default cannot serve: a text-only model
 * cannot read a photograph, and `OPENROUTER_VISION_MODEL` and friends are how
 * a free-model deployment points the one feature that needs eyes at something
 * that has them.
 */
export function visionProviders(): ProviderConfig[] {
  const override: Record<ProviderName, string | undefined> = {
    openrouter: process.env.OPENROUTER_VISION_MODEL,
    groq: process.env.GROQ_VISION_MODEL,
    gemini: process.env.GEMINI_VISION_MODEL,
    anthropic: process.env.ANTHROPIC_VISION_MODEL,
    openai: process.env.OPENAI_VISION_MODEL,
  };

  /*
    Collapsed to one entry per model, because the chat chain is no longer one
    entry per provider: OpenRouter contributes a link per free model, so an
    override would otherwise ask the same model the same question three times
    and call the third refusal a fallback. Order is kept, first occurrence wins.
  */
  const seen = new Set<string>();
  const chain: ProviderConfig[] = [];
  for (const config of resolveProviders()) {
    const model = override[config.name]?.trim() || config.model;
    const key = `${config.name}:${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push({ ...config, model });
  }
  return chain;
}

/**
 * Asks the chain to read one image, and returns the whole answer at once.
 *
 * NOT STREAMED, DELIBERATELY. The reply is a JSON object that means nothing
 * until its last brace arrives, so streaming it would buy a spinner that
 * flickers and cost the ability to fall back once text has started. Since
 * nothing is shown until the answer is complete, this can keep trying
 * providers for as long as the chain lasts.
 *
 * WHY IT FALLS BACK MORE READILY THAN THE CHAT PATH DOES. `openWithFallback`
 * refuses to walk past a 400 or a 404, because a malformed request or a
 * missing model would be answered the same way by everybody and trying them
 * all turns one clear message into a slower one. That reasoning does not hold
 * for a picture: whether a model can see is a fact about that one model, and
 * "this model does not accept images" is exactly the case where the next
 * provider in the chain is worth asking. Only a rejected key stops the walk,
 * because that is a configuration mistake no amount of retrying fixes.
 */
export async function completeWithImage(
  chain: ProviderConfig[],
  system: string,
  prompt: string,
  image: ImageAttachment,
  onUsage?: (usage: UsageReport, config: ProviderConfig) => void,
): Promise<CompletedReply> {
  if (chain.length === 0) throw new TutorError("No AI provider is configured.", 503);

  let last: unknown = null;
  for (let i = 0; i < chain.length; i += 1) {
    const config = chain[i]!;
    try {
      const reply = config.name === "anthropic"
        ? await readImageAnthropic(config, system, prompt, image)
        : await readImageOpenAiCompatible(config, system, prompt, image);
      onUsage?.(reply.usage, config);
      return reply;
    } catch (error) {
      last = error;
      const fatal = error instanceof TutorError && error.status === 401;
      if (fatal || i === chain.length - 1) throw error;
    }
  }

  throw last instanceof Error ? last : new TutorError("No AI provider could read that.", 502);
}

/** Output ceiling for a page of vocabulary. Sixty pairs is well inside this. */
const IMAGE_REPLY_TOKENS = 1500;

async function readImageOpenAiCompatible(
  config: ProviderConfig,
  system: string,
  prompt: string,
  image: ImageAttachment,
): Promise<CompletedReply> {
  // Same table as the chat path, so a provider cannot be reachable for one and
  // silently pointed at OpenAI for the other.
  const { url, keyEnv } = openAiCompatible(config);
  // Same invariant as callOpenAiCompatible above: the chain only ever offers
  // a config whose key env var was set.
  const key = process.env[keyEnv]!;
  const isOpenRouter = config.name === "openrouter";

  const res = await fetch(url, {
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
      max_tokens: IMAGE_REPLY_TOKENS,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  await assertOk(res, config);
  const body = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const raw = body.choices?.[0]?.message?.content;
  // Some OpenAI-compatible gateways answer with the parts array rather than a
  // string, even when every part is text. Both mean the same thing.
  const text = typeof raw === "string"
    ? raw
    : Array.isArray(raw)
      ? raw.map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text ?? "") : "")).join("")
      : "";

  return {
    config,
    text,
    usage: usageFrom(body.usage?.prompt_tokens, body.usage?.completion_tokens, system + prompt, text),
  };
}

async function readImageAnthropic(
  config: ProviderConfig,
  system: string,
  prompt: string,
  image: ImageAttachment,
): Promise<CompletedReply> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: IMAGE_REPLY_TOKENS,
      // The instruction is identical for every scan, so it is worth caching
      // exactly as the Estonian system prompt is. The picture never is.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  await assertOk(res, config);
  const body = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };

  const text = (body.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  const input =
    (body.usage?.input_tokens ?? 0) +
    (body.usage?.cache_creation_input_tokens ?? 0) +
    (body.usage?.cache_read_input_tokens ?? 0);

  return {
    config,
    text,
    usage: usageFrom(input || undefined, body.usage?.output_tokens, system + prompt, text),
  };
}

/**
 * Token counts as reported, or estimated over the text when they were not.
 *
 * An estimate over text alone undercounts a request carrying a photograph by
 * the entire cost of the photograph, so the caller adds the image's share on
 * top. `measured` is what tells it whether to.
 */
function usageFrom(
  input: number | undefined,
  output: number | undefined,
  sent: string,
  received: string,
): UsageReport {
  if (input != null || output != null) {
    return { inputTokens: input ?? 0, outputTokens: output ?? 0, measured: true };
  }
  return {
    inputTokens: estimateTokens(sent),
    outputTokens: estimateTokens(received),
    measured: false,
  };
}
