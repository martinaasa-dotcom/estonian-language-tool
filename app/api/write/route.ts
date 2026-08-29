import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider, TutorError } from "@/lib/tutor/provider";
import { gradeSentence } from "@/lib/tutor/grader";
import {
  MAX_SENTENCE_CHARS, checkForm, looksLikeSentence, writingTasksFor,
} from "@/lib/estonian/writing";
import { authoriseCall, recordUsage } from "@/lib/usage/ledger";
import { reportError } from "@/lib/observability/report";
import type { CaseKey } from "@/lib/estonian/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Marks one sentence the learner wrote.
 *
 * The order here is the whole design. The required form is checked against the
 * dictionary *first*, without a model and without a network call, so:
 *   - a learner who wrote the right form is told so even if the AI is down,
 *   - a model that hallucinates cannot mark a correct form wrong,
 *   - and an answer that is not a sentence never costs a call at all.
 * Only then is the model asked about the parts it is actually good at.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId();

  let lexemeId: string;
  let caseKey: CaseKey;
  let sentence: string;
  let level = "B1";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.lexemeId !== "string" || typeof body.caseKey !== "string" ||
        typeof body.sentence !== "string") {
      return Response.json({ error: "Malformed request." }, { status: 400 });
    }
    lexemeId = body.lexemeId;
    caseKey = body.caseKey as CaseKey;
    sentence = body.sentence.trim().slice(0, MAX_SENTENCE_CHARS);
    if (typeof body.level === "string" && /^[ABC][12]$/.test(body.level)) level = body.level;
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!looksLikeSentence(sentence)) {
    return Response.json(
      { error: "Write a whole sentence — at least three words." },
      { status: 400 },
    );
  }

  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    include: { forms: true },
  });
  if (!lexeme) return Response.json({ error: "That word no longer exists." }, { status: 404 });

  const task = writingTasksFor(lexeme).find((t) => t.caseKey === caseKey);
  if (!task) {
    return Response.json({ error: "No exercise for that case." }, { status: 400 });
  }

  // The part that is never in doubt, computed before anything can fail.
  const formCheck = checkForm(sentence, task, lexeme.forms.map((f) => f.value));

  const config = resolveProvider();
  if (!config) {
    return Response.json({ formCheck, graded: null, aiAvailable: false });
  }

  const decision = await authoriseCall(ownerId, "GRADER");
  if (!decision.allowed) {
    // The mechanical verdict still stands, so this is a partial answer rather
    // than a failure — the learner is told whether the form was right.
    return Response.json(
      { formCheck, graded: null, aiAvailable: false, quotaMessage: decision.message },
      { status: 200 },
    );
  }

  try {
    const { graded, usage } = await gradeSentence(config, {
      task,
      sentence,
      level,
      knownForms: lexeme.forms.map((f) => ({
        label: f.morphName ?? f.formType.replace(/^EKILEX:/, ""),
        value: f.value,
      })),
    }, formCheck.used);

    void recordUsage({
      ownerId, kind: "GRADER", provider: config.name, model: config.model,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    });

    return Response.json({ formCheck, graded, aiAvailable: true });
  } catch (error) {
    if (!(error instanceof TutorError)) {
      reportError(error, { at: "api/write", ownerId, extra: { model: config.model } });
    }
    // Degrades to the mechanical result, which is the important half anyway.
    return Response.json({ formCheck, graded: null, aiAvailable: false });
  }
}
