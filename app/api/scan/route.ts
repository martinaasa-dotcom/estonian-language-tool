import { requireUserId } from "@/lib/auth/session";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import {
  completeWithImage, TutorError, visionProviders,
} from "@/lib/tutor/provider";
import { MAX_ITEMS, SCAN_PROMPT, parseScanReply } from "@/lib/scan/extract";
import {
  ALLOWED_IMAGE_TYPES, decodeImageDataUrl, estimateImageTokens, MAX_IMAGE_BYTES,
} from "@/lib/scan/image";
import { resolveScannedItems } from "@/lib/dict/resolveScan";
import { summarise } from "@/lib/scan/items";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/*
  How many pages one learner may read in a minute.

  A scan is the dearest single call the app makes, and it is also the one a
  double-tapped button repeats most expensively. Four is more than anybody
  photographs by hand in sixty seconds and far fewer than a stuck retry loop
  sends. Charged to the learner rather than to their address, because a class
  photographing the same handout is twenty-five people on one school network.
*/
const SCANS_PER_MINUTE = 4;

/**
 * Reads a photograph of a page and hands back the vocabulary on it.
 *
 * THE ORDER HERE IS THE DESIGN, and it is the same argument as `/api/write`.
 * A model reads the picture, and then the *dictionary* decides which of the
 * words it claims to have seen the app is prepared to vouch for. Nothing the
 * model wrote reaches a flashcard: a word the dictionary recognises brings its
 * own principal parts and retrieved forms with it, and a word it does not is handed
 * back marked as exactly that, for the person holding the paper to confirm or
 * correct. ADR-005 says a model may never supply an Estonian form; reading one
 * off a page is transcription rather than authorship, but a misread and an
 * invention are indistinguishable from here, so both are treated as a guess.
 *
 * The picture is never stored. It is decoded, sent once, and dropped.
 */
export async function POST(request: Request) {
  const ownerId = await requireUserId();

  const limit = checkRateLimit(`scan:${bucketForOwner(ownerId)}`, SCANS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    return rateLimited(limit, "Give the last page a moment to finish before sending another.");
  }

  const chain = visionProviders();
  if (chain.length === 0) {
    return Response.json(
      {
        error:
          "Reading a photo needs an AI key, and this copy of Kodukeel has none yet. " +
          "Everything else (review, the dictionary, typing a word list in by hand) still works.",
      },
      { status: 503 },
    );
  }

  let payload: { image?: unknown };
  try {
    payload = (await request.json()) as { image?: unknown };
  } catch {
    return Response.json({ error: "Something about that request didn't make sense." }, { status: 400 });
  }

  const decoded = decodeImageDataUrl(payload.image);
  if (!decoded.image) {
    return Response.json({ error: imageProblemMessage(decoded.problem) }, { status: 400 });
  }

  // Checked before the call, and it fails closed. A photograph is the most
  // expensive thing this app can ask a provider for.
  const decision = await authoriseCall(ownerId, "SCAN");
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

  let reply;
  try {
    reply = await completeWithImage(chain, SCAN_PROMPT, READ_THIS_PAGE, decoded.image, (usage, config) => {
      void recordUsage({
        ownerId,
        kind: "SCAN",
        provider: config.name,
        model: config.model,
        // A picture is not text. When the provider reported nothing, an
        // estimate over the prompt alone would price the photograph at zero
        // and let a loop of scans run straight past the cap.
        inputTokens: usage.measured ? usage.inputTokens : usage.inputTokens + estimateImageTokens(),
        outputTokens: usage.outputTokens,
        reservation: decision.reservation,
      });
    });
  } catch (error) {
    // No page was read, so the authorisation goes back. A vision model that
    // refuses every image would otherwise spend a learner's scan allowance on
    // photographs they never got a word out of.
    if (decision.reservation) void releaseReservation(decision.reservation);
    if (!(error instanceof TutorError)) {
      reportError(error, { at: "api/scan", ownerId });
    }
    const status = error instanceof TutorError ? error.status : 502;
    const message = error instanceof TutorError
      ? `${error.message} If the model configured here cannot read images, set a vision model ` +
        "in .env (OPENROUTER_VISION_MODEL, ANTHROPIC_VISION_MODEL or OPENAI_VISION_MODEL)."
      : "That photo could not be read just now.";
    return Response.json({ error: message }, { status });
  }

  const scanned = parseScanReply(reply.text);
  const items = await resolveScannedItems(scanned.slice(0, MAX_ITEMS));

  return Response.json(
    { items, summary: summarise(items) },
    {
      headers: {
        "cache-control": "no-store",
        // Which model read the page is a fact about the reading, and the same
        // rule the chat follows: never the head of the chain, always the one
        // that answered.
        "x-model-provider": reply.config.label,
        "x-model-id": reply.config.model,
      },
    },
  );
}

/** The user turn. The instruction itself is the system prompt, so it can be cached. */
const READ_THIS_PAGE = "Read this page and list the Estonian vocabulary on it.";

function imageProblemMessage(problem: string | undefined): string {
  if (problem === "TYPE") {
    return `That file is not a photo this can read. Use ${ALLOWED_IMAGE_TYPES.join(", ")}.`;
  }
  if (problem === "TOO_LARGE") {
    return `That photo is over ${Math.round(MAX_IMAGE_BYTES / 1_000_000)} MB, even after resizing.`;
  }
  return "No photo arrived. Take the picture again.";
}
