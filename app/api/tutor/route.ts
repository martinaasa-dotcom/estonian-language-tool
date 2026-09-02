import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import { candidatesFor } from "@/lib/dict/resolveScan";
import { matchEstonianForm } from "@/lib/dict/search";
import { ProseStream } from "@/lib/tutor/humanize";
import { buildSystemPrompt, learnerNote, type LearnerNote } from "@/lib/tutor/prompt";
import { learnerContextFor } from "@/lib/progress/tutorContext";
import { chatEstonianTokens } from "@/lib/tutor/verify";
import {
  openWithFallback,
  resolveProviders,
  TutorError,
  type ChatMessage,
} from "@/lib/tutor/provider";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_HISTORY = 20;

/*
  How many questions one learner may ask in a minute.

  Anu costs either money or a free model's daily allowance, and both are
  spent by whoever asks. Twelve is far more than a person types and far less
  than a loop sends. Charged to the learner rather than to their address, so
  a classroom on one school network is one allowance each.
*/
const QUESTIONS_PER_MINUTE = 12;

/** What Anu is told when the learner's own log could not be read: the middle of the scale, and nothing else. */
const UNKNOWN_LEARNER: LearnerNote = { level: "B1", weakestCase: null, unit: null };

export async function POST(request: Request) {
  const ownerId = await requireUserId();

  const limit = checkRateLimit(`tutor:${bucketForOwner(ownerId)}`, QUESTIONS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    return rateLimited(limit, "Anu is still catching up with your last few questions.");
  }

  /*
    Two limits, because they stop different things. The per-minute bucket above
    stops a runaway client; this stops a bill. It is durable rather than
    in-memory — a per-instance counter on serverless caps nothing across a cold
    start — and it fails closed, because "the database hiccuped" is not a reason
    to start spending without a ceiling.
  */
  /*
    Started before the ledger is asked so the reads ride beside it, and
    settled to null on failure rather than thrown: a pooler hiccup on one of
    these reads must neither 500 a question nor escape the try below, where
    the reservation is handed back. Anu then knows only the level she knew
    before any of this existed.
  */
  const learnerPromise = learnerContextFor(ownerId).catch(() => null);
  const decision = await authoriseCall(ownerId, "TUTOR");
  if (!decision.allowed) {
    return Response.json(
      { error: decision.message, reason: decision.reason },
      {
        status: 429,
        headers: decision.retryAfterSeconds
          ? { "retry-after": String(decision.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  const chain = resolveProviders();
  if (chain.length === 0) {
    return Response.json(
      { error: "No AI key set up yet. Add one in .env, or Settings has a two-minute walkthrough." },
      { status: 503 },
    );
  }

  let messages: ChatMessage[];
  try {
    const body = (await request.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "Nothing to ask." }, { status: 400 });
    }
    messages = body.messages
      .slice(-MAX_HISTORY)
      .filter((m): m is ChatMessage =>
        typeof m === "object" && m !== null &&
        (("role" in m && (m.role === "user" || m.role === "assistant"))) &&
        "content" in m && typeof (m as ChatMessage).content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  } catch {
    return Response.json({ error: "Something about that request didn't make sense." }, { status: 400 });
  }

  // The learner's text is user content, never spliced into the system prompt.
  // The importer exists to paste text from elsewhere, so that boundary matters.
  /*
    Who is asking is the server's to know. The client used to post a level and
    the route believed it, which made every learner B1. What she is told now
    is read off this learner's own log, started beside the ledger's own
    transaction above rather than after it: three round trips that do not
    depend on the answer cost nothing extra when they are in flight together.
  */
  const learner = (await learnerPromise) ?? UNKNOWN_LEARNER;
  const system = buildSystemPrompt(learner.level);
  const live = learnerNote(learner);
  const encoder = new TextEncoder();
  let full = "";

  /*
    WHICH MODEL ANSWERED IS A FACT ABOUT THE ANSWER, SO IT TRAVELS WITH IT.

    Not the head of the chain: `openWithFallback` walks past a provider that
    is throttled, so the model configured first may not have written a word of
    what the learner is reading, and a screen naming the wrong model is worse
    than one naming none. The handshake finishes here, before the response
    head is written, which is what lets the name go in a header at all. Every
    reason to fall back arrives in the upstream response head, so nothing is
    lost by settling it this early, and the alternative was a trailer no
    browser exposes.
  */
  let open;
  try {
    open = await openWithFallback(chain, system, messages, (usage, config) => {
      // Charged to the provider that actually answered, not the head of the
      // chain: falling back to a dearer model must not go unmetered.
      void recordUsage({
        ownerId, kind: "TUTOR", provider: config.name, model: config.model,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        // Settles the reservation `authoriseCall` already booked, rather than
        // charging a second time. The call was written down before the chain
        // was opened, which is what stops ten tabs reading the same "under the
        // limit" while none of them has been recorded yet.
        reservation: decision.reservation,
      });
    }, live);
  } catch (error) {
    // Nothing was spent and nothing was answered, so the authorisation is
    // handed back: a deployment with a bad key must not ration its learners
    // over calls none of them received.
    if (decision.reservation) void releaseReservation(decision.reservation);
    const message = error instanceof TutorError ? error.message : "Anu could not be reached.";
    const status = error instanceof TutorError ? error.status : 502;
    return Response.json({ error: message }, { status });
  }

  const stream = new ReadableStream({
    async start(controller) {
      /*
        Anu's English is cleaned on its way past: no dashes used as clause
        breaks, no stock openers. `ProseStream` holds text back only where a
        rule could still change it, so this costs the learner nothing they
        would notice, and it never touches a word of Estonian. See
        lib/tutor/humanize.ts.
      */
      const prose = new ProseStream();
      const say = (text: string) => {
        if (!text) return;
        full += text;
        controller.enqueue(encoder.encode(text));
      };

      try {
        for await (const chunk of open.chunks) say(prose.push(chunk));
        say(prose.end());
        await flagUnverifiedEstonian(say, full);
      } catch (error) {
        // A TutorError is an upstream condition already explained to the learner
        // (a bad key, a 429, an unknown model). Anything else is ours.
        if (!(error instanceof TutorError)) {
          reportError(error, { at: "api/tutor", ownerId, extra: { model: open.config.model } });
        }
        // Whatever was held back still belongs to the learner: losing the last
        // few words of an answer to report an error is losing both.
        say(prose.end());
        const message = error instanceof TutorError ? error.message : "Anu could not be reached.";
        say(`\n\n\u26a0 ${message}`);
      } finally {
        controller.close();
        void persist(ownerId, messages, full);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-model-provider": open.config.label,
      "x-model-id": open.config.model,
    },
  });
}

/**
 * A last, best-effort check over Anu's finished reply.
 *
 * `verifyComment` withholds a graded comment before it is ever shown, which
 * only a non-streaming answer can afford. This chat streams, on purpose, and
 * by the time a reply is complete most of it is already on the learner's
 * screen; there is no way to un-show it. So the check moves to after the
 * fact: any Estonian-looking word in Anu's own prose (never a FIX: or VOCAB:
 * line, both already boxed and tagged in the UI, so `chatEstonianTokens`
 * skips them) is looked up the dictionary the same way a word read off a
 * scanned page is (ADR-021), and anything it does not recognise gets named
 * in a trailing line the learner actually sees, rather than trusted in
 * silence.
 *
 * Best-effort in the literal sense: a lookup failure here must not turn an
 * answer the learner already has into an error. The reply already arrived.
 */
async function flagUnverifiedEstonian(say: (text: string) => void, reply: string) {
  const tokens = chatEstonianTokens(reply);
  if (tokens.length === 0) return;
  try {
    const candidates = await candidatesFor(tokens);
    const unverified = tokens.filter((token) => !matchEstonianForm(candidates, token));
    if (unverified.length > 0) say(`\nUNVERIFIED: ${unverified.join(", ")}`);
  } catch {
    // Anu already answered. A second opinion that could not be reached is not
    // a reason to put an error under an answer that worked.
  }
}

async function persist(ownerId: string, messages: ChatMessage[], reply: string) {
  const last = messages[messages.length - 1];
  try {
    if (last?.role === "user") {
      await prisma.message.create({ data: { ownerId, role: "user", content: last.content } });
    }
    if (reply.trim()) {
      await prisma.message.create({ data: { ownerId, role: "assistant", content: reply } });
    }
  } catch {
    // Chat history is a convenience, not the irreplaceable data. Losing a row
    // must never break the conversation the learner is having.
  }
}
