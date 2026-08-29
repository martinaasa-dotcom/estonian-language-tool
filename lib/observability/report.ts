/**
 * Error reporting, without a vendor.
 *
 * The requirement is modest and specific: when something breaks for someone who
 * is not the author, that fact should reach a log with enough context to act on,
 * and it should never itself leak a learner's data or a key. Structured JSON on
 * stderr satisfies that on every host worth deploying to (Vercel, Fly, a plain
 * container), and an optional webhook forwards it somewhere with alerting if a
 * deployment wants that.
 *
 * Deliberately not a Sentry dependency: adding one would put a third-party
 * script in front of a tool whose privacy page promises no third-party
 * trackers.
 */

export interface ErrorContext {
  /** Where it happened, e.g. "api/tutor" or "action/gradeCard". */
  at: string;
  /** Opaque user id. Never an email — those are personal data, an id is not. */
  ownerId?: string | undefined;
  /** Anything else worth knowing. Values are redacted before they are written. */
  extra?: Record<string, unknown> | undefined;
}

/** Keys whose values never belong in a log, however they got into the context. */
const SENSITIVE = /(key|token|secret|password|authorization|cookie|email|dsn)/i;

/**
 * Something that looks like a credential regardless of the key it arrived under —
 * the same shapes CI greps the client bundle for.
 */
const SECRET_SHAPE =
  /\b(sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}|postgres(?:ql)?:\/\/[^\s]+:[^\s@]+@)/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (typeof value === "string") {
    const scrubbed = value.replace(SECRET_SHAPE, "[redacted]");
    return scrubbed.length > 500 ? `${scrubbed.slice(0, 500)}…` : scrubbed;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface ErrorRecord {
  level: "error";
  at: string;
  message: string;
  stack?: string | undefined;
  ownerId?: string | undefined;
  extra?: unknown;
  ts: string;
}

/** Builds the record. Separated from the writing so it can be tested. */
export function buildRecord(error: unknown, context: ErrorContext): ErrorRecord {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    level: "error",
    at: context.at,
    message: String(redact(err.message)),
    stack: err.stack ? String(redact(err.stack)) : undefined,
    ownerId: context.ownerId,
    extra: context.extra ? redact(context.extra) : undefined,
    ts: new Date().toISOString(),
  };
}

/**
 * Reports an error. Never throws and never rejects — a reporter that can break
 * the request it is reporting on is worse than no reporter.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  let record: ErrorRecord;
  try {
    record = buildRecord(error, context);
  } catch {
    return;
  }

  try {
    console.error(JSON.stringify(record));
  } catch {
    console.error(`[${context.at}] error could not be serialised`);
  }

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (!webhook) return;
  void fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    // A reporting channel that is down must not become a second incident.
  });
}
