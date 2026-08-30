import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider, TutorError } from "@/lib/tutor/provider";
import { gradeSentence } from "@/lib/tutor/grader";
import { verifyComment, type WithholdReason } from "@/lib/tutor/verify";
import {
  MAX_SENTENCE_CHARS, checkForm, looksLikeSentence, writingTasksFor,
} from "@/lib/estonian/writing";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";
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
      { error: "Write a whole sentence, at least three words." },
      { status: 400 },
    );
  }

  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    include: { forms: true },
  });
  if (!lexeme) return Response.json({ error: "That word no longer exists." }, { status: 404 });

  const tasks = writingTasksFor(lexeme);
  const task = tasks.find((t) => t.caseKey === caseKey);
  if (!task) {
    return Response.json({ error: "No exercise for that case." }, { status: 400 });
  }

  /**
   * Every form the app itself vouches for: the stored principal parts and any
   * Ekilex paradigm, plus the cases derived from the genitive stem.
   *
   * The derived ones matter. They are not rows in `Form` — that is ADR-009,
   * derived forms are never persisted — so an allowlist built from the table
   * alone would reject the model for correctly quoting the very form the
   * exercise asked for. A live test caught exactly that.
   */
  const vouchedForms = [
    ...lexeme.forms.map((f) => f.value),
    ...tasks.map((t) => t.targetForm),
    lexeme.lemma,
  ];

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

  // Set the moment the reservation is settled, so the catch below can tell a
  // grader that never ran from one that ran and then tripped over its own
  // verification. Only the first is owed its authorisation back.
  let settled = false;
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
      reservation: decision.reservation,
    });
    settled = true;

    // ADR-005, enforced rather than requested. The prompt tells the model it may
    // only mention forms it was given; this checks. A comment that introduces an
    // Estonian form from the model's own knowledge is withheld — the verdict
    // stands, because that came from the mechanical check.
    let withheld: string[] = [];
    // Which of the two guards fired, because the screen says so in words and
    // "it used an Estonian form" is a claim rather than a hedge. See
    // `WithholdReason`.
    let withheldReason: WithholdReason | null = null;
    if (graded) {
      const verified = verifyComment(graded.comment, vouchedForms, sentence, [lexeme.translation]);
      if (verified.comment === null && graded.comment.trim()) {
        withheld = verified.unverified;
        withheldReason = verified.reason;
        reportError(new Error("grader introduced an unverified Estonian form"), {
          at: "api/write/verify",
          ownerId,
          extra: { model: config.model, unverified: verified.unverified, lemma: lexeme.lemma },
        });
      }
      graded.comment = verified.comment ?? "";
    }

    return Response.json({ formCheck, graded, aiAvailable: true, withheld, withheldReason });
  } catch (error) {
    if (!settled && decision.reservation) void releaseReservation(decision.reservation);
    if (!(error instanceof TutorError)) {
      reportError(error, { at: "api/write", ownerId, extra: { model: config.model } });
    }
    // Degrades to the mechanical result, which is the important half anyway.
    return Response.json({ formCheck, graded: null, aiAvailable: false });
  }
}
