import { after } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import { resolveProvider, TutorError } from "@/lib/tutor/provider";
import { gradeComposition } from "@/lib/tutor/grader";
import { verifyVerdict } from "@/lib/tutor/verify";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Long enough for a C1 text and its diacritics, short enough to bound the bill. */
const MAX_CHARS = 6000;

/**
 * Anu reading back an examination composition.
 *
 * NOTHING HERE CAN CHANGE A MARK. The composition was scored when the paper was
 * handed in, against the dictionary, on length and on the words the task named.
 * This route is a second opinion the learner asked for, and it is shown beside
 * the mark rather than instead of it.
 *
 * Which is also why the failure modes are all quiet. No provider, no quota, no
 * connection: the result page already has the score and simply says the reading
 * is unavailable. A grader that could take a page down would be a grader that
 * could take a result down.
 *
 * Charged to the learner rather than to their address, like every other paid
 * route here: twenty five students on one school network are one IP.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId();

  const limit = checkRateLimit(`exam-write:${bucketForOwner(ownerId)}`, 6, 60_000);
  if (!limit.ok) {
    return rateLimited(limit, "Anu is still reading the last one.");
  }

  let text: string;
  let level = "B1";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.text !== "string") {
      return Response.json({ error: "Something about that request didn't make sense." }, { status: 400 });
    }
    text = body.text.trim().slice(0, MAX_CHARS);
    if (typeof body.level === "string" && /^[ABC][12]$/.test(body.level)) level = body.level;
  } catch {
    return Response.json({ error: "Something about that request didn't make sense." }, { status: 400 });
  }

  if (text.split(/\s+/).filter(Boolean).length < 5) {
    return Response.json({ error: "There is not enough here to read." }, { status: 400 });
  }

  const config = resolveProvider();
  if (!config) {
    return Response.json({ comment: "", rule: "", aiAvailable: false });
  }

  const decision = await authoriseCall(ownerId, "GRADER");
  if (!decision.allowed) {
    return Response.json({
      comment: "", rule: "", aiAvailable: false, quotaMessage: decision.message,
    });
  }

  // As in /api/write: tells a reader that never ran from one that ran and was
  // then withheld. Only the first is owed its authorization back.
  let settled = false;
  try {
    const { graded, usage } = await gradeComposition(config, text, level);
    after(() => recordUsage({
      ownerId, kind: "GRADER", provider: config.name, model: config.model,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      reservation: decision.reservation,
    }));
    settled = true;

    if (!graded) return Response.json({ comment: "", rule: "", aiAvailable: true });

    /*
      ADR-005, enforced rather than requested. The allowlist is the learner's own
      text and nothing else: there is no target word here and no table of forms to
      quote, so any Estonian form in the reply that the learner did not write is
      a form the model reached for on its own. The note is withheld whole in that
      case, because a correction spelled out of a model's own knowledge is the
      single failure this codebase is organized to prevent.

      That empty allowlist is also why this is the route where the check is most
      likely to withhold over an English word: with no glosses and no forms to
      compare against, any word of five letters or more that the learner did not
      write is caught, and Anu quoting "weather" back at somebody is caught with
      it. Withholding is still the right error. Claiming she wrote Estonian is
      not, so `withheldReason` carries which of the two happened and the result
      screen says the one that is true.
    */
    const verified = verifyVerdict(graded, [], text, []);
    if (verified.reason) {
      reportError(new Error("composition reader introduced an unverified Estonian form"), {
        at: "api/exam/write/verify",
        ownerId,
        extra: { model: config.model, unverified: verified.unverified },
      });
      return Response.json({
        comment: "", rule: "", aiAvailable: true,
        withheld: verified.unverified, withheldReason: verified.reason,
      });
    }

    return Response.json({
      comment: verified.graded.comment, rule: verified.graded.rule, aiAvailable: true,
    });
  } catch (error) {
    const booking = decision.reservation;
    if (!settled && booking) after(() => releaseReservation(booking));
    if (!(error instanceof TutorError)) {
      reportError(error, { at: "api/exam/write", ownerId, extra: { model: config.model } });
    }
    return Response.json({ comment: "", rule: "", aiAvailable: false });
  }
}
