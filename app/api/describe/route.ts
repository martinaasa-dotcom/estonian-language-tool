import { after } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { CASES } from "@/lib/estonian/cases";
import { caseQuestionFor } from "@/lib/estonian/caseQuestion";
import { grammarTerm } from "@/lib/estonian/terms";
import { markDescription } from "@/lib/games/describe";
import { MAX_SENTENCE_CHARS, looksLikeSentence } from "@/lib/estonian/writing";
import { reportError } from "@/lib/observability/report";
import { taskById } from "@/lib/progress/describe";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import { gradeDescription } from "@/lib/tutor/grader";
import { resolveProvider, TutorError } from "@/lib/tutor/provider";
import { verifyComment, type WithholdReason } from "@/lib/tutor/verify";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";
import { courseLevelFor } from "@/lib/progress/level";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Marks one sentence a learner wrote about a scene.
 *
 * `/api/write` with a picture in front of it, and deliberately the same order,
 * which is the whole design of both: the dictionary decides what it can decide
 * before any model is asked, so a learner who used the right case is told so
 * with the AI off, a model that hallucinates cannot mark a right form wrong,
 * and an answer that is not a sentence never costs a call.
 *
 * THE PAPER IS REBUILT HERE (ADR-022). The browser posts a scene id, a case
 * and what it wrote, never a mark and never the forms it was marked against.
 * `taskById` assembles the task out of the dictionary again, so the marking is
 * over what the server believes rather than over what the client claimed.
 *
 * The learner's level is read off their own log rather than taken from the
 * request, which is the fix `/api/tutor` needed: a level typed into a client
 * is a level anybody can type.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId();

  // The ceiling its twin has, and for the same reason: a grader that costs a
  // call is exactly the shape that gets looped. Six a minute is one every ten
  // seconds, which nobody writing a sentence and reading the marking meets.
  const limit = checkRateLimit(`describe:${bucketForOwner(ownerId)}`, 6, 60_000);
  if (!limit.ok) return rateLimited(limit, "Anu is still reading the last one.");

  let sceneId: string;
  let caseKey: string;
  let askLemma: string;
  let sentence: string;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.sceneId !== "string" || typeof body.caseKey !== "string" ||
        typeof body.askLemma !== "string" || typeof body.sentence !== "string") {
      return Response.json({ error: "Something about that request didn't make sense." }, { status: 400 });
    }
    sceneId = body.sceneId;
    caseKey = body.caseKey;
    askLemma = body.askLemma;
    sentence = body.sentence.trim().slice(0, MAX_SENTENCE_CHARS);
  } catch {
    return Response.json({ error: "Something about that request didn't make sense." }, { status: 400 });
  }

  if (!looksLikeSentence(sentence)) {
    return Response.json(
      { error: "Write a whole sentence, at least three words." },
      { status: 400 },
    );
  }

  const rebuilt = await taskById(sceneId, caseKey, askLemma);
  if (!rebuilt) {
    return Response.json({ error: "That picture is no longer available." }, { status: 404 });
  }
  const { task, answer } = rebuilt;

  // The part that is never in doubt, computed before anything can fail.
  const mark = markDescription(task, sentence);
  const spec = CASES.find((c) => c.key === task.caseKey)!;
  const asked = task.words[task.askIndex]!;

  /*
    Everything the model is allowed to spell: every form of every word in the
    scene, plus the forms of the case that was asked for. The derived ones
    matter and are not rows in `Form` (ADR-009), so an allowlist built from the
    table alone would withhold a comment for correctly quoting the very form
    the task asked for.
  */
  const vouchedForms = [
    ...task.words.flatMap((w) => [w.lemma, ...w.forms.map((f) => f.value)]),
    ...task.accepted,
  ];

  /*
    What the screen may show now that the sentence has been marked: the three
    words with their glosses, and the form or forms that would have been right.
    None of it is sent before the answer, because naming the other two things
    in the picture is most of the exercise and printing the target form is all
    of it. `shown` rather than `accepted`, since accepted is deliberately wider
    and holds a suffix guess sitting beside a form Ekilex retrieved: printing
    that pair would assert the guess is a word.
  */
  const reveal = {
    words: task.words.map((w) => ({ emoji: w.emoji, lemma: w.lemma, translation: w.translation })),
    wanted: task.shown,
    // A sentence to compare against, and where it came from, because "a native
    // wrote this about this picture" and "a lexicographer wrote this to
    // illustrate this word" are two different claims and only one of them is
    // about the picture.
    answer,
  };

  const config = resolveProvider();
  if (!config) return Response.json({ mark, reveal, graded: null, aiAvailable: false });

  const decision = await authoriseCall(ownerId, "GRADER");
  if (!decision.allowed) {
    // The mechanical verdict stands, so this is a partial answer rather than a
    // failure: the learner is still told whether the case was right.
    return Response.json(
      { mark, reveal, graded: null, aiAvailable: false, quotaMessage: decision.message },
      { status: 200 },
    );
  }

  // Set the moment the reservation is settled, so the catch below can tell a
  // grader that never ran from one that ran and then tripped over its own
  // verification. Only the first is owed its authorization back.
  let settled = false;
  try {
    const level = await courseLevelFor(ownerId);
    const { graded, usage } = await gradeDescription(config, {
      situation: task.situation,
      things: task.words.map((w) => ({ emoji: w.emoji, lemma: w.lemma, translation: w.translation })),
      asked: {
        lemma: asked.lemma,
        caseEt: grammarTerm(spec.key)?.et ?? spec.et,
        // What Anu is told the learner was asked, which has to be what the
        // screen printed: see lib/estonian/caseQuestion.ts.
        caseQuestion: caseQuestionFor(spec, {
        lemma: asked.lemma,
        semanticTypes: asked.semanticTypes,
        nomSg: asked.forms.find((f) => f.formType === "NOM_SG")?.value ?? null,
      }),
      },
      rightCase: mark.rightCase,
      knownForms: task.words.flatMap((w) => [
        { label: w.lemma, value: w.lemma },
        ...w.forms.map((f) => ({ label: `${w.lemma} (${f.formType})`, value: f.value })),
      ]).concat(task.shown.map((v) => ({ label: `${asked.lemma} (${spec.et})`, value: v }))),
      sentence,
      level,
    });

    after(() => recordUsage({
      ownerId, kind: "GRADER", provider: config.name, model: config.model,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      reservation: decision.reservation,
    }));
    settled = true;

    // ADR-005, enforced rather than requested. The verdict above came from the
    // dictionary and stands whatever happens here; what is withheld is only
    // what the model said about the rest of the sentence.
    let withheld: string[] = [];
    let withheldReason: WithholdReason | null = null;
    if (graded) {
      const verified = verifyComment(
        graded.comment, vouchedForms, sentence, task.words.map((w) => w.translation),
      );
      if (verified.comment === null && graded.comment.trim()) {
        withheld = verified.unverified;
        withheldReason = verified.reason;
        reportError(new Error("grader introduced an unverified Estonian form"), {
          at: "api/describe/verify",
          ownerId,
          extra: { model: config.model, unverified: verified.unverified, scene: task.sceneId },
        });
      }
      graded.comment = verified.comment ?? "";
    }

    return Response.json({ mark, reveal, graded, aiAvailable: true, withheld, withheldReason });
  } catch (error) {
    const booking = decision.reservation;
    if (!settled && booking) after(() => releaseReservation(booking));
    if (!(error instanceof TutorError)) {
      reportError(error, { at: "api/describe", ownerId, extra: { model: config.model } });
    }
    // Degrades to the mechanical result, which is the important half anyway.
    return Response.json({ mark, reveal, graded: null, aiAvailable: false });
  }
}
