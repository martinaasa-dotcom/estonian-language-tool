import { prisma } from "@/lib/db";

/** How many past turns to hand back. Anu has no per-topic scoping, so this is the whole recent log. */
const HISTORY_LIMIT = 30;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A learner's most recent turns with Anu, oldest first.
 *
 * Read by both the full `/tutor` page and the floating Anu button, so a
 * conversation started from one looks the same continued from the other:
 * both write through the same `Message` table via `app/api/tutor/route.ts`.
 */
export async function loadRecentMessages(ownerId: string): Promise<HistoryMessage[]> {
  const rows = await prisma.message.findMany({
    where: { ownerId },
    /*
      And the id, because `createdAt` is not unique. The route writes the
      learner's turn and Anu's reply as two inserts once the stream has
      finished, so the pair can land in the same millisecond and come back
      either way round: she is handed her own answer before the question that
      prompted it, and which message falls off the end of the window is the
      planner's choice. Every other truncated read here ends on the primary key
      for exactly this; this one was missed.
    */
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  return rows.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}
