import { after } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { authoriseCall, recordUsage, releaseReservation } from "@/lib/usage/ledger";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";
import { reportError } from "@/lib/observability/report";
import { openWithFallback, resolveProviders } from "@/lib/tutor/provider";
import { MAX_TURNS, MAX_TURN_CHARS, readDraw, replay, sceneContext } from "@/lib/progress/scene";
import { sceneById } from "@/lib/scenes/catalogue";
import { sceneLine, type SpokenLine } from "@/lib/scenes/line";
import { cardInPlay, counterBeat, datumLine, replyFor, stageFor, wantsFreshLine } from "@/lib/scenes/reply";
import { currentBeat, hurdleBeat, hurdleSpec, isOver } from "@/lib/scenes/state";
import { personaById, type PersonaSpec } from "@/lib/scenes/personas";
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
 * ONE BOOKING PER COMPOSED TURN (§16), and the first version of this booked one
 * for the whole run instead. The argument for that was real, that running out
 * of allowance halfway through a conversation is the worst failure available
 * here, and it does not survive the arithmetic: the ledger books a call when it
 * authorises one because two of the three limits count `CALL` rows, so a dozen
 * turns behind one booking is eleven calls the allowance never saw, on the
 * dearest path in the app. What is left of the argument is that the allowance
 * running out mid-scene has to be *survivable*, and it is, because the rung
 * below the model is a real conversational move rather than an error: the
 * other side did not catch that, say it again.
 *
 * The ledger is asked only once the attested rung has failed, because a line
 * the dictionary already had costs nothing and booking for it would ration a
 * learner over a request nobody made. And a booking is handed back where
 * nothing was composed.
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
  const limit = checkRateLimit(`scene:${bucketForOwner(ownerId)}`, PER_MINUTE, 60_000);
  if (!limit.ok) {
    return rateLimited(limit, "That was a lot of turns at once. Give it a moment.");
  }

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
  if (!scene) {
    return Response.json({ error: "That is not a turn in a scene." }, { status: 400 });
  }

  const context = await sceneContext(scene.id);
  if (!context) {
    return Response.json({ error: "That scene could not be built." }, { status: 400 });
  }

  const persona = personaOf(row!.transcript);
  const voice = persona?.voice ?? DEFAULT_VOICE;

  /*
    MARKED HERE, BY THE SAME FUNCTION THAT MARKS IT AT THE END.

    The client sends everything it has typed so far and the server replays the
    lot, which costs nothing at a dozen turns and buys the property that
    matters: the reading a learner sees while they are talking and the reading
    written down when they stop come from one function over one input. The route
    therefore holds no state, and a client that lies about its own turns changes
    only what it shows itself, because `finishRun` runs this again.
  */
  const turns = Array.isArray(body.turns)
    ? body.turns.slice(0, MAX_TURNS).map((turn) => {
        const one = (turn ?? {}) as Record<string, unknown>;
        return {
          beatId: String(one.beatId ?? "").slice(0, 64),
          said: String(one.said ?? "").slice(0, MAX_TURN_CHARS),
          helped: one.helped === true,
          heard: String(one.heard ?? "").slice(0, MAX_TURN_CHARS),
        };
      })
    : [];

  const draw = readDraw(row!.transcript);
  const { state, response } = replay(context, draw, turns);
  const current = currentBeat(scene, state);
  /*
    A curveball in the way is what the other side says next and what the
    learner is asked for, and the beat waits behind it (`raiseHurdle`).
  */
  const standing = state.hurdle ? hurdleBeat(state.hurdle) : null;
  /*
    The offer was turned down and they offer again: the beat is spoken as
    its counter, and from here on every line reads the second offer's values
    off the card, so a time read back later is the one that was accepted.
  */
  const speaking = response === "counter" && current?.counter ? counterBeat(current) : current;
  const card = cardInPlay(draw?.card ?? null, scene.beats, state.countered);
  const last = state.turns[state.turns.length - 1] ?? null;
  const answered = last ? scene.beats.find((b) => b.id === last.beatId) ?? null : null;
  const heard = last?.heard ?? null;

  /*
    WHERE THE CONVERSATION IS, AND EVERY BRANCH RETURNS IT. Three of the four
    used to return the line alone, so the screen was handed something to read
    and never told which beat it was on: `beatId` stayed null, the objectives
    never ticked, and "Say it" was disabled for the whole run. The line is what
    the reader sees and this is what the screen runs on, and a branch that
    answers one without the other has not answered.
  */
  /*
    How fast they talk: the persona's own pace, and a fifth faster once the
    "they speed up" curveball has happened in this run, because a line said
    after that at the old pace is the curveball not having happened.
  */
  const speed = (persona?.speed ?? 1) * (state.hurdles.some((h) => h.id === "faster") ? 1.2 : 1);
  const progress = {
    voice,
    speed,
    response,
    beatId: current?.id ?? null,
    goal: standing?.goal ?? current?.goal ?? null,
    done: state.done,
    over: isOver(scene, state),
    /*
      What the last turn was read as, so the screen can answer in character
      rather than with a verdict. Five readings, not two (§8).
    */
    reading: state.turns[state.turns.length - 1]?.reading ?? null,
  };

  /*
    THE REPLY IS A REACTION AND THEN A MOVE (`lib/scenes/reply.ts`), and this
    route's job is to hand `replyFor` the one thing it cannot work out for
    itself: what Estonian the ladder could build for the next move. It walks
    the ladder only where a fresh line is wanted at all. A turn nobody
    understood is answered with the line the learner already heard, said
    again, so a booking for a fresh one would be a booking for a line that is
    not wanted (§16).
  */
  const reply = (line: SpokenLine | null) => replyFor({
    beat: speaking,
    hurdle: standing
      ? { beat: standing, line: standing === spokenFor ? line : null, said: hurdleSpec(state)?.said }
      : null,
    answered: turns.length > 0 ? answered : null,
    response: turns.length > 0 ? response : null,
    reading: progress.reading,
    line,
    heard,
    card,
    translates: persona?.translates ?? false,
    acknowledges: persona?.acknowledges ?? true,
    echo: last?.matched?.[0] ?? null,
    met: state.done.length,
  });
  const answer = (lines: readonly SpokenLine[], extra: Record<string, unknown> = {}) =>
    Response.json({ ...progress, lines, ...extra }, { headers: NO_STORE });

  /*
    Which beat the ladder is asked for: the hurdle where one stands, and once
    the scene is over, the farewell, since somebody who said goodbye first is
    still owed one back.
  */
  const spokenFor = standing ?? speaking ?? (answered?.move === "close" ? answered : undefined);
  if (!spokenFor) return answer(reply(null));
  if (!wantsFreshLine(turns.length > 0 ? response : null, heard)) return answer(reply(null));
  const beat = spokenFor;

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
    scripted: context.scripted.get(beat.id) ?? [],
    used,
  };

  /*
    Two rungs cost a comparison and are tried together here: a phrase the
    course teaches, then a line drafted in advance and gated then (ADR-025
    amendment 1). Either answers without a booking, which is what lets a
    keyless deployment hold a conversation on a beat retrieval cannot fill.
    Booking a call for a line the dictionary already had would ration a
    learner over a request nobody made.
  */
  const cheap = await sceneLine({ ...shared, pool: context.pool.get(beat.id) ?? [] });
  if (cheap.provenance !== "fallback") return answer(reply(cheap));
  // A line the beat can say out of course words and the card's own values: `Teisipäeval kell 13:30?`.
  const dealt = datumLine(beat, card, context.lexicon);
  if (dealt) return answer(reply(dealt));

  /*
    THE BOOKING IS PER TURN, because a call is what the ledger counts. Booking
    once when the run opened was the first version of this and it is the burst
    limiter's own arithmetic broken: a conversation is a dozen turns, and one
    `CALL` row in front of twelve settlements is eleven calls the allowance
    never saw.
  */
  const chain = resolveProviders();
  const decision = chain.length > 0
    ? await authoriseCall(ownerId, "SCENE")
    : null;

  if (!decision?.allowed || !decision.reservation) {
    /*
      A keyless deployment and a spent allowance take the same path, and that is
      the design rather than a shortcut: §16 says a deployment with no key runs
      this module, marked identically, with the beats retrieval can fill. The
      difference between them is a sentence, and it is the ledger's own, since
      only the ledger knows which of the three limits was reached.
    */
    return answer(reply(cheap), { composed: false, note: decision?.message ?? null });
  }

  const line = await sceneLine({
    ...shared,
    // The attested and scripted rungs were already tried and did not answer.
    pool: [],
    scripted: [],
    compose: (avoid) => compose(chain, {
      ownerId,
      move: beat.move,
      they: stageFor(beat, card),
      register: scene.register,
      words: [...context.lexicon.byLemma.keys()],
      /*
        The scene's own banked lines, for tone: a model shown six sentences
        this receptionist has said writes a seventh in the same register and
        length, where one shown a word list alone writes a paragraph. They are
        examples of the voice and never of the answer, since none is for this
        beat.
      */
      examples: [...context.scripted.entries()]
        .filter(([id]) => id !== beat.id)
        .flatMap(([, lines]) => lines.slice(0, 1))
        .slice(0, 6),
      said,
      avoid,
    }),
  });

  /*
    A booking is handed back where nothing was composed, which is the rule
    `releaseReservation` states about itself: a release gives back the call and
    not only the money, and two of the three limits count calls. The ladder
    walking past the model to the fallback rung is exactly the case, and it is
    an ordinary one here rather than an error.
  */
  if (line.provenance !== "composed") {
    after(() => releaseReservation(decision.reservation!));
  }

  return answer(reply(line));
}

/** Who is behind the desk, off the run's own row rather than out of a request. */
function personaOf(transcript: string): PersonaSpec | undefined {
  try {
    const parsed = JSON.parse(transcript) as { persona?: unknown };
    return typeof parsed.persona === "string" ? personaById(parsed.persona) : undefined;
  } catch {
    return undefined;
  }
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
    /** What they are doing, in English, from their side: the beat's `they`. */
    they: string;
    register: string;
    words: readonly string[];
    /** Lines this character has said on other beats, for tone. Never for this beat. */
    examples: readonly string[];
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
    `What you are doing, in English: ${input.they}`,
    `Address them as "${input.register}".`,
    input.examples.length > 0
      ? `Lines this character has said at other moments, for tone and length: ${input.examples.join(" | ")}`
      : "",
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
