import { after } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { recordUsage } from "@/lib/usage/ledger";
import { bucketForOwner, checkRateLimit } from "@/lib/security/rateLimit";
import { reportError } from "@/lib/observability/report";
import { openWithFallback, resolveProviders } from "@/lib/tutor/provider";
import { sceneContext } from "@/lib/progress/scene";
import { sceneById } from "@/lib/scenes/catalogue";
import { sceneLine } from "@/lib/scenes/line";
import { personaById } from "@/lib/scenes/personas";
import { DEFAULT_VOICE } from "@/lib/audio/voice";
import { MAX_WORDS } from "@/lib/scenes/retrieval";

/**
 * One line of one turn, walked up the ladder.
 *
 * `sceneLine` decides which rung answers and `lib/scenes/gate.ts` decides
 * whether a composed line is shown at all. This route is the part of that which
 * needs a socket; everything else it hands over is data the pure modules asked
 * for.
 *
 * WHAT THE MODEL IS ASKED FOR, AND WHAT IT IS NOT (§6). One line, for one move,
 * inside a closed word list. It never sees the plot, never decides what happens
 * next, never marks anything, and never sees the learner's deck beyond the words
 * lent to the list. Its only output is one line, which is then checked for
 * shape, vouched word by word against that list, checked for register and
 * checked for government. A line that tries to be anything other than a short
 * Estonian sentence fails the shape check; a line reaching outside the list
 * fails vouching; and either way what the learner gets is the fallback, which
 * is somebody asking them to repeat. The worst available outcome is a wasted
 * call and a withheld line.
 *
 * THE LEARNER'S TEXT REACHES A MODEL, SO IT IS DATA (§17). The last two turns
 * go in as conversation, the way the tutor's do, and are never concatenated
 * into an instruction.
 *
 * ONE BOOKING FOR THE WHOLE SCENE, CHECKED HERE AND MADE IN `beginScene`
 * (§16). Running out of allowance halfway through a conversation is the worst
 * failure available to this module, because the other side simply stops talking
 * and there is nothing honest to put on the screen. So a turn inside a scene
 * that was authorised does not ask the ledger again; it proves the booking
 * exists. The proof arrives in a request body, so it is *verified* rather than
 * believed: this owner's, of this kind, and a `CALL` row rather than anything
 * else. A forged one buys nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A bound on a body rather than on a scene. */
const MAX_CONTEXT_CHARS = 600;
/** Per instance, and not the thing that bounds cost: the ledger is (§16). */
const PER_MINUTE = 30;
const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const ownerId = await requireUserId();

  /*
    CHARGED TO THE LEARNER, NEVER TO THEIR ADDRESS. Twenty-five students on one
    school network are one IP, and a class starting the same scene together is
    exactly the shape that would refuse in its first few seconds. There is
    always an owner here, because `requireUserId` threw if there was not.
  */
  const limited = checkRateLimit(bucketForOwner(ownerId), PER_MINUTE, 60_000);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const runId = String(body.runId ?? "").slice(0, 64);

  /*
    THE RUN IS READ, NOT REBUILT, AND NOT SENT. Which scene this is, who is
    behind the desk and what is on the card were all decided once when the run
    was opened and written down (`beginRun`), because a run is a function of its
    seed *and its recency* and recency moves. Re-planning here would deal a
    different persona from the one the learner is talking to.
  */
  const row = runId
    ? await prisma.sceneRun.findFirst({
        where: { id: runId, ownerId, endedAt: null },
        select: { sceneId: true, transcript: true },
      })
    : null;
  const scene = row ? sceneById(row.sceneId) : null;
  const beat = scene?.beats[Number(body.beat)];

  if (!scene || !beat) {
    return Response.json({ error: "That is not a turn in a scene." }, { status: 400 });
  }

  const context = await sceneContext(scene.id);
  if (!context) {
    return Response.json({ error: "That scene could not be built." }, { status: 400 });
  }

  const voice = personaVoice(row!.transcript);

  const used = new Set(
    Array.isArray(body.used) ? body.used.filter((v): v is string => typeof v === "string") : [],
  );
  const said = Array.isArray(body.said)
    ? body.said
        .filter((v): v is string => typeof v === "string")
        .slice(-2)
        .map((v) => v.slice(0, MAX_CONTEXT_CHARS))
    : [];

  const shared = {
    beat,
    lexicon: context.lexicon,
    gate: context.gate,
    topic: context.topic.get(beat.id) ?? new Set<string>(),
    hasFiniteVerb: context.hasFiniteVerb,
    fallback: context.fallback,
    used,
  };

  /*
    THE ATTESTED RUNG COSTS NOTHING, SO IT IS TRIED BEFORE THE LEDGER IS ASKED.
    Booking a call for a line the dictionary already had would ration a learner
    over a request nobody made, which is what `releaseReservation` exists to
    undo one layer down. Here it is cheaper not to make it.
  */
  const attested = await sceneLine({ ...shared, pool: context.pool.get(beat.id) ?? [] });
  if (attested.provenance === "attested") {
    return Response.json({ ...attested, voice: voice }, { headers: NO_STORE });
  }

  const chain = resolveProviders();
  const booked = await bookingFor(ownerId, String(body.reservation ?? ""));
  if (chain.length === 0 || !booked) {
    /*
      A keyless deployment and an unbooked turn take the same path, and that is
      the design rather than a shortcut: §16 says a deployment with no key runs
      this module, marked identically, with the beats retrieval can fill.
    */
    return Response.json(
      { ...attested, voice: voice, composed: false },
      { headers: NO_STORE },
    );
  }

  const line = await sceneLine({
    ...shared,
    // The attested rung was already tried and did not answer.
    pool: [],
    compose: (avoid) => compose(chain, {
      ownerId,
      move: beat.move,
      goal: beat.goal,
      register: scene.register,
      words: [...context.lexicon.byLemma.keys()],
      said,
      avoid,
    }),
  });

  return Response.json({ ...line, voice: voice }, { headers: NO_STORE });
}

/** Who is behind the desk, off the run's own row rather than out of a request. */
function personaVoice(transcript: string): string {
  try {
    const parsed = JSON.parse(transcript) as { persona?: unknown };
    const persona = typeof parsed.persona === "string" ? personaById(parsed.persona) : undefined;
    return persona?.voice ?? DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

/** The scene's own booking, verified rather than believed. */
async function bookingFor(ownerId: string, reservation: string) {
  if (!reservation) return null;
  return prisma.usageEvent.findFirst({
    where: { id: reservation, ownerId, kind: "SCENE", entry: "CALL" },
    select: { id: true },
  });
}

/**
 * Asks a model for one line, inside the list.
 *
 * The static half of the prompt is identical on every turn of every scene, so
 * on Anthropic it sits behind the `cache_control` breakpoint the tutor already
 * uses, and on an OpenAI-compatible provider it is the cached prefix. What
 * changes per turn goes in the `live` block after it, which is the same shape
 * `learnerNote` takes.
 */
async function compose(
  chain: ReturnType<typeof resolveProviders>,
  input: {
    ownerId: string;
    move: string;
    goal: string;
    register: string;
    words: readonly string[];
    said: readonly string[];
    avoid: readonly string[];
  },
): Promise<string | null> {
  const system = [
    "You are one side of a short conversation in Estonian, in a role-play for a learner.",
    "Reply with exactly ONE short Estonian sentence and nothing else: no translation,",
    "no explanation, no quotation marks, no markdown, no list.",
    `Use at most ${MAX_WORDS} words.`,
    "Use only the words you are given, in any grammatical form. If you cannot say it",
    "with those words, say the shortest thing you can with them.",
  ].join(" ");

  const live = [
    `Your move: ${input.move}.`,
    `The learner has been asked to: ${input.goal}`,
    `Address them as "${input.register}".`,
    input.avoid.length > 0
      ? `Your last attempt used words that are not allowed here: ${input.avoid.join(", ")}.`
      : "",
    `Words you may use: ${input.words.join(" ")}`,
  ].filter(Boolean).join("\n");

  try {
    const open = await openWithFallback(
      chain,
      system,
      /*
        The turns as conversation, never interpolated into an instruction (§17).
        A learner can type anything into these and the blast radius is one
        withheld line: the model cannot call anything, cannot see the deck,
        cannot mark, and cannot advance the scene.
      */
      [
        ...input.said.map((text) => ({ role: "user" as const, content: text })),
        { role: "user" as const, content: "Your line:" },
      ],
      (usage, config) => {
        /*
          The settlement, charged to the provider that actually answered.
          `after` because the deployment target suspends a function once its
          response is sent and does not guarantee a pending promise runs, and a
          settlement that never lands leaves the scene's reservation standing.
        */
        after(() => recordUsage({
          ownerId: input.ownerId,
          kind: "SCENE",
          provider: config.name,
          model: config.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        }));
      },
      live,
    );

    let text = "";
    for await (const chunk of open.chunks) text += chunk;
    return text.trim() || null;
  } catch (error) {
    /*
      A provider having a bad minute is an ordinary case here rather than an
      error a learner should see: the ladder's next rung is somebody who did not
      catch what they said, which is the truest thing that can happen in a
      conversation.
    */
    reportError(error, { at: "api/scene", ownerId: input.ownerId });
    return null;
  }
}
