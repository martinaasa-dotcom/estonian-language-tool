import { after } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report";
import { drawPlan } from "@/lib/scenes/draw";
import { composeLine } from "@/lib/scenes/compose";
import { difficultyFrom } from "@/lib/scenes/curveballs";
import type { TurnOutcome } from "@/lib/scenes/turn";
import { gateData, recentDraws, sceneMaterial } from "@/lib/progress/scenes";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import { resolveProviders, TutorError } from "@/lib/tutor/provider";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Built out of one learner's own turns, so never kept by anything between us and them. */
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const OUTCOMES = new Set<TurnOutcome>(["complete", "incomplete", "unrecognised", "offTarget", "english", "repeat", "tooShort"]);

/**
 * One line of the other side of a conversation, composed and gated.
 *
 * The browser plays the scene: it holds the state machine, reads every turn
 * against the dictionary, and speaks the recorded lines the page shipped. It
 * comes here only for a beat no recorded sentence fits, and what it gets back
 * is a sentence every word of which resolves against the scene's own word
 * list, or nothing. It never gets a mark, a verdict, or a line that failed a
 * check with a caveat on it (design §2).
 *
 * THE PLAN IS REBUILT HERE, never trusted. The client sends the scene, the
 * seed and the beat id; the server draws the same plan from the same seed and
 * composes for the beat it finds there. A beat id the plan does not hold is a
 * 400. The last two turns go in as conversation (§17).
 *
 * Metered per line under `SCENE`, booked before the provider is opened and
 * settled or released after, exactly as `/api/describe` does. A deployment
 * with no key answers `aiAvailable: false` and the browser narrates the turn.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId();

  const limit = checkRateLimit(`scene:${bucketForOwner(ownerId)}`, 12, 60_000);
  if (!limit.ok) return rateLimited(limit, "They are thinking. Give it a moment.");

  let sceneId: string, seed: string, beatId: string, repair: TurnOutcome | null;
  let difficulty: number;
  let recent: { role: "other" | "learner"; text: string }[];
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.sceneId !== "string" || typeof body.seed !== "string" || typeof body.beatId !== "string") {
      return json({ error: "Something about that request didn't make sense." }, 400);
    }
    sceneId = body.sceneId;
    seed = body.seed.slice(0, 40);
    beatId = body.beatId;
    difficulty = difficultyFrom(body.difficulty);
    repair = typeof body.repair === "string" && OUTCOMES.has(body.repair as TurnOutcome) ? (body.repair as TurnOutcome) : null;
    recent = Array.isArray(body.recent)
      ? body.recent
        .filter((t): t is { role: string; text: string } =>
          typeof t === "object" && t !== null && typeof (t as { text?: unknown }).text === "string")
        .slice(-2)
        .map((t) => ({ role: t.role === "other" ? "other" as const : "learner" as const, text: t.text.slice(0, 300) }))
      : [];
  } catch {
    return json({ error: "Something about that request didn't make sense." }, 400);
  }

  const material = await sceneMaterial(sceneId);
  if (!material) return json({ error: "That situation is no longer available." }, 404);
  const drawn = await recentDraws(ownerId, sceneId);
  const plan = drawPlan({
    scene: material.scene, seed, difficulty, glossOf: material.glossOf,
    recentProps: drawn.props, recentCurveballs: drawn.curveballs,
  });
  const beat = plan.beats.find((b) => b.id === beatId);
  if (!beat) return json({ error: "That is not a turn in this conversation." }, 400);

  const chain = resolveProviders();
  if (chain.length === 0) return json({ text: null, aiAvailable: false });

  const decision = await authoriseCall(ownerId, "SCENE");
  if (!decision.allowed) {
    return json({ text: null, aiAvailable: false, quotaMessage: decision.message });
  }

  let settled = false;
  try {
    const data = await gateData();
    const composed = await composeLine({
      scene: material.scene, beat, lemmas: material.lemmas, forms: material.lexicon.forms,
      wrongRegister: material.wrongRegister, data, recent, repair,
    }, chain);
    const provider = composed.provider;
    if (provider) {
      after(() => recordUsage({
        ownerId, kind: "SCENE", provider: provider.name, model: provider.model,
        inputTokens: composed.usage.inputTokens, outputTokens: composed.usage.outputTokens,
        reservation: decision.reservation,
      }));
      settled = true;
    }
    return json({ text: composed.text, withheld: composed.withheld, aiAvailable: true });
  } catch (error) {
    const booking = decision.reservation;
    if (!settled && booking) after(() => releaseReservation(booking));
    if (!(error instanceof TutorError)) reportError(error, { at: "api/scene/line", ownerId });
    return json({ text: null, aiAvailable: true, withheld: ["unavailable"] });
  }
}
