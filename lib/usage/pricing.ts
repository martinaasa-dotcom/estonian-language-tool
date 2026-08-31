/**
 * What a request costs, in micro-dollars (millionths of a USD).
 *
 * Integers throughout: a spend cap compared with accumulated floating-point
 * dollars drifts, and the drift is always in the direction of spending more.
 * One micro-dollar is finer than any per-token price, so nothing rounds to zero.
 *
 * The table is a *floor for safety*, not an invoice. Prices change and a
 * deployment may point at a model nobody here has heard of, so an unrecognised
 * model is charged at `UNKNOWN_MODEL` — the most expensive rate in the table —
 * rather than at zero. A cap that fails open is not a cap.
 */

export interface ModelPrice {
  /** USD per million input tokens. */
  readonly inputPerMTok: number;
  /** USD per million output tokens. */
  readonly outputPerMTok: number;
}

/**
 * Anthropic first-party rates are current as of 2026-06. OpenAI's are the
 * published gpt-4o rates. Both are checked against the provider's pricing page
 * when a model is added — never guessed from a model's name or size.
 */
const PRICES: Readonly<Record<string, ModelPrice>> = {
  // Anthropic
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },

  // OpenAI
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },

  /*
    The models the free-tier providers give away, at the rate they are given
    away for. Named one by one rather than pricing a whole provider at zero,
    because "free" is a property of the account and this table cannot see the
    account: a deployment that has upgraded its Groq or Gemini plan and pinned
    some other model still meets UNKNOWN_MODEL and still fails closed.

    Without these rows the cap would fail the other way. An unrecognised model
    is charged at the dearest rate in the table, so a handful of genuinely free
    Groq calls would have read as several dollars and switched Anu off for
    everybody, which is exactly the fault the TTS speaker name caused once
    before.
  */
  // Keyed the way `normaliseModel` leaves them: the vendor prefix a provider
  // puts in front of a model, "openai/" or "qwen/", is stripped before lookup.
  "gpt-oss-120b": { inputPerMTok: 0, outputPerMTok: 0 },
  "qwen3.8-27b": { inputPerMTok: 0, outputPerMTok: 0 },
  "compound-mini": { inputPerMTok: 0, outputPerMTok: 0 },
  "gemini-flash-latest": { inputPerMTok: 0, outputPerMTok: 0 },
  "gemini-3.6-flash": { inputPerMTok: 0, outputPerMTok: 0 },
  "gemini-3.5-flash": { inputPerMTok: 0, outputPerMTok: 0 },
};

/** Charged when the model is not in the table. Deliberately the dearest rate. */
export const UNKNOWN_MODEL: ModelPrice = { inputPerMTok: 10, outputPerMTok: 50 };

/**
 * OpenRouter slugs carry a vendor prefix and sometimes a variant suffix —
 * `anthropic/claude-sonnet-5`, `openai/gpt-4o:free`. Both are stripped so one
 * table serves every provider.
 */
export function normaliseModel(model: string): string {
  const withoutVariant = model.split(":")[0] ?? model;
  const parts = withoutVariant.split("/");
  return (parts[parts.length - 1] ?? withoutVariant).trim().toLowerCase();
}

/** True when the slug names a model the provider serves at no charge. */
export function isFreeModel(model: string): boolean {
  return model.trim().toLowerCase().endsWith(":free");
}

export function priceFor(model: string): ModelPrice {
  if (isFreeModel(model)) return { inputPerMTok: 0, outputPerMTok: 0 };
  return PRICES[normaliseModel(model)] ?? UNKNOWN_MODEL;
}

/** Cost of one call, in micro-dollars, rounded up so it is never understated. */
export function estimateCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = priceFor(model);
  const dollars =
    (Math.max(0, inputTokens) / 1e6) * price.inputPerMTok +
    (Math.max(0, outputTokens) / 1e6) * price.outputPerMTok;
  return Math.ceil(dollars * 1e6);
}

/**
 * A token count for text, when the provider did not report one.
 *
 * Roughly four characters per token for English, but Estonian's long agglutinated
 * words tokenise worse than that, so this divides by three. Over-counting is the
 * safe direction: it makes the quota bind sooner, never later. Any real count
 * reported by the provider replaces this.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Formats micro-dollars for a human, e.g. 1234567 → "$1.23". */
export function formatMicros(micros: number): string {
  return `$${(micros / 1e6).toFixed(2)}`;
}
