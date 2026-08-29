import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { buildSystemPrompt } from "@/lib/tutor/prompt";
import { resolveProvider, streamReply, TutorError, type ChatMessage } from "@/lib/tutor/provider";
import { authoriseCall, recordUsage } from "@/lib/usage/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_HISTORY = 20;

export async function POST(request: Request) {
  const ownerId = await requireUserId();
  const config = resolveProvider();
  if (!config) {
    return Response.json(
      { error: "No AI key configured yet. Add one in .env — see Settings for the two-minute version." },
      { status: 503 },
    );
  }

  // Checked before a single token is spent. Everything else in the app keeps
  // working when this refuses; only the tutor stops.
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

  let messages: ChatMessage[];
  let level = "B1";
  try {
    const body = (await request.json()) as { messages?: unknown; level?: unknown };
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
    if (typeof body.level === "string" && /^[ABC][12]$/.test(body.level)) level = body.level;
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  // The learner's text is user content, never spliced into the system prompt.
  // The importer exists to paste text from elsewhere, so that boundary matters.
  const system = buildSystemPrompt(level);
  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const onUsage = (usage: { inputTokens: number; outputTokens: number }) => {
          // Deliberately not awaited inside the stream: the learner has their
          // answer, and the ledger write must not hold the response open.
          void recordUsage({
            ownerId, kind: "TUTOR", provider: config.name, model: config.model,
            inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
          });
        };

        for await (const chunk of streamReply(config, system, messages, onUsage)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        const message = error instanceof TutorError ? error.message : "Anu could not be reached.";
        controller.enqueue(encoder.encode(`\n\n⚠ ${message}`));
      } finally {
        controller.close();
        void persist(ownerId, messages, full);
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
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
