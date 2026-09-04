import { prisma } from "@/lib/db";
import { reportError } from "@/lib/observability/report";
import { type UsageKind, estimateCostMicros, reserveMicros } from "./pricing";
import {
  type QuotaDecision, type UsageSnapshot, checkQuota, readLimits, utcDay,
} from "./quota";

/*
  Declared next to the token profile it keys, in `pricing.ts`, and re-exported
  here because this is the module a caller reaches for when they mean "a
  metered call". The profile had to move: `lib/funding` prices a hypothetical
  month of traffic off the same numbers this reserves against, and it may not
  import a module that opens a database. Moved rather than copied, for the
  reason `PROVIDER_KEY_ENV` gives about itself.
*/
export type { UsageKind };

/** A request that was authorised. Counted against the burst and daily limits. */
const CALL = "CALL";
/** The correction that follows one, once the provider has said what it cost. */
const SETTLEMENT = "SETTLEMENT";
/**
 * A booking handed back because its call never happened.
 *
 * `releaseReservation` used to write this as an ordinary settlement at minus
 * the reserve, which returns the *spend* to zero and leaves the `CALL` row
 * standing. The counts read `CALL` rows, so a deployment whose key had been
 * rejected still rationed its learners by how many refusals they had
 * collected: eight in a minute and the burst limit closed, thirty in a day and
 * the daily one did, over answers nobody received. That is the exact failure
 * `releaseReservation`'s own header says it exists to prevent, met for one of
 * the three limits and not the other two.
 *
 * A third kind rather than a delete, because `UsageEvent` is append-only for
 * the reason `Review` is: the authorisation happened and stays in the log.
 * What the row says is that it came to nothing.
 */
const RELEASE = "RELEASE";

/**
 * What a reservation carries where the provider and model will go.
 *
 * Neither is known until the chain has opened, and writing the head of the
 * chain there would name the wrong model exactly as often as the fallback
 * fires. A word that is obviously not a model name is more use than a plausible
 * one that is wrong.
 */
const PENDING = "pending";

/**
 * The advisory lock the ledger's read-and-reserve runs under.
 *
 * An arbitrary constant, and deployment-wide rather than per-user, because the
 * global daily budget is a deployment-wide number. Two users are not each
 * other's concern until the shared budget is, and then they are entirely.
 */
const LEDGER_LOCK = 4_820_311_907n;

/**
 * The metered side of the app: what has been spent, and whether the next call
 * may go ahead.
 *
 * The counters live in Postgres rather than in memory because the app runs on
 * serverless functions — an in-process counter is per-instance, resets on every
 * cold start, and so caps nothing. Three indexed aggregates per call is a price
 * worth paying for a limit that is actually a limit.
 */

/**
 * What each kind of call is allowed, as a multiple of the configured base.
 *
 * One number for all three was wrong in both directions at once. The base is
 * the tutor's allowance, ten conversations a day, and applying it unchanged to
 * the other two would have made the app worse at the things that cost almost
 * nothing:
 *
 *   TUTOR   the expensive one, and the one worth rationing. A full answer over
 *           a long conversation, at the base allowance.
 *   GRADER  a few hundred tokens about one sentence. The verdict a learner
 *           acts on is decided by string comparison against the dictionary
 *           before any of this runs, so what is rationed here is only the note
 *           that comes after it. Thirty of those is a real practice session.
 *   TTS     free, cached on disk and in Supabase Storage, and joined when two
 *           requests for the same clip are in flight. Only a miss reaches
 *           here at all. A listening round legitimately meets a dozen new
 *           words in a minute, so a tight cap would break a real session to
 *           solve a problem that does not exist.
 *   SCAN     one photograph read once. It is the dearest single call in the
 *           app, because a picture is a few thousand input tokens where a
 *           question is a few hundred, but it is also the least repeated: a
 *           page is scanned once and then studied for weeks. Twice the base
 *           covers a whole workbook chapter in a sitting.
 *
 * Everything stays free at every one of these numbers. They exist so that one
 * enthusiastic person cannot spend the day's budget before anyone else arrives.
 */
const ALLOWANCE: Record<UsageKind, { burst: number; daily: number }> = {
  TUTOR: { burst: 1, daily: 1 },
  GRADER: { burst: 1, daily: 3 },
  TTS: { burst: 6, daily: 30 },
  SCAN: { burst: 1, daily: 2 },
  /*
    A conversation is several lines and a line is one call, so the allowance
    is counted in lines: sixty a day is about eight scenes when retrieval
    fills none of the beats and more when it does. The burst is a whole scene
    in a minute, which a brisk run of turns can reach.
  */
  SCENE: { burst: 2, daily: 6 },
};

/**
 * An authorised call, before it has happened.
 *
 * Handed back by `authoriseCall` and handed to `recordUsage`, which is what
 * lets the second write a correction rather than a whole new charge.
 */
export interface Reservation {
  id: string;
  ownerId: string;
  kind: UsageKind;
  /** Micro-dollars already charged for this call, awaiting settlement. */
  micros: number;
}

/**
 * What this user and the site as a whole have used, for `checkQuota`.
 *
 * The two counts read `CALL` rows only. A settlement is the same call arriving
 * a second time with better numbers, and counting it would quietly halve every
 * allowance in the app. Spend sums both, because a settlement is where most of
 * the real money is recorded.
 */
export async function snapshotUsage(
  ownerId: string,
  kind: UsageKind,
  now = new Date(),
  client: Pick<typeof prisma, "$queryRaw"> = prisma,
): Promise<UsageSnapshot> {
  const limits = readLimits();
  const day = utcDay(now);
  const burstSince = new Date(now.getTime() - limits.burstWindowSeconds * 1000);

  /*
    TWO STATEMENTS, BECAUSE THIS RUNS INSIDE THE LOCK.

    `authoriseCall` holds a deployment-wide advisory lock across this, and
    Prisma queues every query of an interactive transaction on that
    transaction's single connection: a `Promise.all` there is sequential round
    trips, not concurrent ones. So each count is lock-held latency multiplied
    by every AI call the whole deployment is making, and this was four of them
    before a release had to be counted and would have been eight after.

    Postgres does the counting instead. Seven of the eight numbers are over one
    owner's rows for one day, which is one index scan and a handful of `FILTER`
    clauses; the eighth is everybody's spend and is a different `where`, so it
    stays its own statement. Two, where it was four before any of this.

    A call that was handed back is not a call, which is why each kind is
    counted rather than filtered out: `CALL` minus `RELEASE` keeps both numbers
    something a person can look up in the table by hand when a limit surprises
    somebody.
  */
  const [row] = await client.$queryRaw<{
    burstCalls: bigint; burstReleased: bigint;
    dailyCalls: bigint; dailyReleased: bigint;
    allCalls: bigint; allReleased: bigint;
    userMicros: bigint | null;
  }[]>`
    SELECT
      count(*) FILTER (
        WHERE "entry" = ${CALL} AND "kind" = ${kind} AND "createdAt" >= ${burstSince}
      ) AS "burstCalls",
      count(*) FILTER (
        WHERE "entry" = ${RELEASE} AND "kind" = ${kind} AND "createdAt" >= ${burstSince}
      ) AS "burstReleased",
      count(*) FILTER (WHERE "entry" = ${CALL} AND "kind" = ${kind}) AS "dailyCalls",
      count(*) FILTER (WHERE "entry" = ${RELEASE} AND "kind" = ${kind}) AS "dailyReleased",
      count(*) FILTER (WHERE "entry" = ${CALL}) AS "allCalls",
      count(*) FILTER (WHERE "entry" = ${RELEASE}) AS "allReleased",
      coalesce(sum("costMicros"), 0) AS "userMicros"
    FROM "UsageEvent"
    WHERE "ownerId" = ${ownerId} AND "day" = ${day}
  `;

  const [global] = await client.$queryRaw<{ globalMicros: bigint | null }[]>`
    SELECT coalesce(sum("costMicros"), 0) AS "globalMicros"
    FROM "UsageEvent" WHERE "day" = ${day}
  `;

  // `count(*)` and `sum()` come back as bigint, which is not a number until it
  // is made one: every reader of this compares it against a plain limit.
  const n = (value: bigint | null | undefined) => Number(value ?? 0);

  return {
    burstCalls: Math.max(0, n(row?.burstCalls) - n(row?.burstReleased)),
    dailyCalls: Math.max(0, n(row?.dailyCalls) - n(row?.dailyReleased)),
    dailyCallsAllKinds: Math.max(0, n(row?.allCalls) - n(row?.allReleased)),
    dailyMicros: n(row?.userMicros),
    globalMicros: n(global?.globalMicros),
  };
}

/**
 * Whether this call may proceed, and the reservation that says it did.
 *
 * Fails *closed*: if the ledger cannot be read, the call is refused. The whole
 * point of the cap is the case where something is wrong, and "the database
 * hiccuped" is not a reason to start spending without a limit.
 *
 * THE READ AND THE WRITE ARE ONE OPERATION, WHICH THEY WERE NOT.
 *
 * This used to read four aggregates, return a verdict, and leave the actual
 * ledger row to be written when the call finished. For a streamed answer on a
 * route allowed two minutes, that gap is the length of the answer. Ten tabs,
 * a retry loop or a script all read the same "under the limit" inside it and
 * all went ahead, and the limit that was supposed to be the hard backstop on
 * the whole deployment's bill was the one with the widest window of the three.
 *
 * So the call is written down at the moment it is authorised, at an estimate,
 * inside the same transaction that read the counters — and that transaction
 * takes an advisory lock first, because two transactions reading before either
 * writes is the same race with a smaller window rather than none. The lock is
 * held across two aggregates and one insert, which is milliseconds, and never
 * across the model call itself. It is deployment-wide on purpose: the global
 * budget is a deployment-wide number, and a per-user lock would leave exactly
 * the limit that matters most unprotected.
 *
 * A *transaction* advisory lock rather than a session one, which is what makes
 * it safe behind a connection pooler: it is released when the transaction ends,
 * whichever backend served it, so a pooler handing the next statement to a
 * different session cannot strand it. The blocking form, because the
 * non-blocking one serialises nothing — that was tried first and twelve
 * concurrent authorisations all sailed through it, which is the bug this is
 * here to fix wearing a lock as a hat.
 *
 * `lock_timeout` is set so waiting has a floor under it. If the lock cannot be
 * had in three seconds something is badly wrong upstream, and the right answer
 * then is the fail-closed path below — a refusal a learner can retry — rather
 * than a request that hangs until the platform kills it.
 */
export async function authoriseCall(
  ownerId: string,
  kind: UsageKind,
  now = new Date(),
): Promise<QuotaDecision & { reservation?: Reservation }> {
  try {
    const limits = readLimits();
    const allowance = ALLOWANCE[kind];
    const scaled = {
      ...limits,
      burstCalls: limits.burstCalls * allowance.burst,
      dailyCallsPerUser: limits.dailyCallsPerUser * allowance.daily,
      // The reserve is counted in the same currency as the daily allowance, so
      // it scales with it. Otherwise three TTS misses would look like a heavy
      // user and mute a listening round on a busy day.
      reserveCallsPerUser: limits.reserveCallsPerUser * allowance.daily,
    };
    const micros = reserveMicros(kind);

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      // `$executeRaw`, not `$queryRaw`: this function returns void, and asking
      // Prisma to read a row out of it fails at the driver with a message
      // about deserialising a column, which reads as a schema problem and is
      // not one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK})`;

      const decision = checkQuota(await snapshotUsage(ownerId, kind, now, tx), scaled, now);
      if (!decision.allowed) return decision;

      const row = await tx.usageEvent.create({
        data: {
          ownerId,
          kind,
          entry: CALL,
          // Filled in by the settlement, which is the first moment either is
          // known: the chain may walk past its head, and a reservation that
          // named the head would name the wrong model about as often as the
          // fallback fires.
          provider: PENDING,
          model: PENDING,
          costMicros: micros,
          day: utcDay(now),
          createdAt: now,
        },
        select: { id: true },
      });

      return { ...decision, reservation: { id: row.id, ownerId, kind, micros } };
    });
  } catch (error) {
    reportError(error, { at: "usage/authoriseCall", ownerId, extra: { kind } });
    return {
      allowed: false,
      reason: "GLOBAL_SPEND",
      message: "Anu is unavailable for a moment. The usage ledger could not be read.",
      retryAfterSeconds: 30,
    };
  }
}

/**
 * Files a completed call.
 *
 * Never throws: the call already happened and the learner already has their
 * answer, so a failed ledger write must not turn a good response into an error.
 * It is logged loudly instead, because a silent one would mean the cap is
 * quietly measuring less than it should.
 *
 * With a `reservation` this writes a *settlement*: a second row carrying the
 * difference between what the call was booked at and what it turned out to
 * cost, which is negative whenever the estimate was generous. Two rows rather
 * than an edit, because this table is append-only for the same reason `Review`
 * is. Adding up either way gives the same number; only one of the two can be
 * rewritten after the fact, and it is not this one.
 *
 * Without a reservation it behaves as it always did, writing the whole charge
 * as one row. Nothing in the app takes that path any more and an invariant
 * says so, but a caller that reached a provider and then could not find its
 * reservation must still record what it spent. A charge that goes missing
 * because its paperwork did is the failure the loud logging below exists for.
 */
export async function recordUsage(input: {
  ownerId: string;
  kind: UsageKind;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** The authorisation this call is settling, from `authoriseCall`. */
  reservation?: Reservation;
  /**
   * Overrides the price table. Pass 0 for a service that genuinely costs
   * nothing — without it, TartuNLP's speaker name ("mari") looks like an
   * unknown model and gets charged at the deliberately punitive unknown rate,
   * which would exhaust the global cap on free speech synthesis.
   */
  costMicros?: number;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const actual = input.costMicros ??
    estimateCostMicros(input.model, input.inputTokens, input.outputTokens);
  try {
    await prisma.usageEvent.create({
      data: {
        ownerId: input.ownerId,
        kind: input.kind,
        entry: input.reservation ? SETTLEMENT : CALL,
        provider: input.provider,
        model: input.model,
        inputTokens: Math.max(0, Math.round(input.inputTokens)),
        outputTokens: Math.max(0, Math.round(input.outputTokens)),
        // The difference, so the two rows together come to what was spent.
        // Negative is the ordinary case on a free model, and it has to be
        // allowed to be: a reservation held against a call that cost nothing
        // would otherwise ration a free deployment against an imaginary bill.
        costMicros: input.reservation ? actual - input.reservation.micros : actual,
        day: utcDay(now),
      },
    });
  } catch (error) {
    // Loud on purpose: a lost row means the spend cap is measuring less than
    // was actually spent, which is the one failure mode the cap exists to stop.
    reportError(error, {
      at: "usage/recordUsage",
      ownerId: input.ownerId,
      extra: { kind: input.kind, model: input.model },
    });
  }
}

/**
 * Gives back an authorisation whose call never happened.
 *
 * A reservation is a charge, so a request that is refused by the provider, or
 * that throws before a single token is spent, has to hand it back. Otherwise
 * a deployment with a rejected key would ration its learners down to nothing
 * over calls none of them ever received.
 *
 * It is a settlement at zero rather than a delete, for the same reason a
 * settlement is not an update: the fact that a call was authorised is true and
 * stays in the log. What changes is what it cost, which is nothing.
 */
export async function releaseReservation(
  reservation: Reservation,
  now = new Date(),
): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        ownerId: reservation.ownerId,
        kind: reservation.kind,
        entry: RELEASE,
        provider: PENDING,
        model: PENDING,
        inputTokens: 0,
        outputTokens: 0,
        // Minus the whole reserve, so the pair comes to nothing spent, and
        // marked `RELEASE` so the counts can leave the pair out as well.
        costMicros: -reservation.micros,
        day: utcDay(now),
      },
    });
  } catch (error) {
    // A release that does not land leaves a learner rationed for a call they
    // never received, which is quieter than a lost charge and just as wrong.
    reportError(error, {
      at: "usage/releaseReservation",
      ownerId: reservation.ownerId,
      extra: { kind: reservation.kind, micros: reservation.micros },
    });
  }
}

/** Today's spend and call count for one user, for the Settings meter. */
export async function usageToday(ownerId: string, now = new Date()) {
  const day = utcDay(now);
  const [calls, released, spend] = await Promise.all([
    // `CALL` only: a settlement is the same request coming back with its real
    // numbers, and the meter would otherwise tell somebody they had asked
    // twice as many questions as they had. A release is the opposite case, a
    // question that reached nobody, and it comes back off the count the same
    // way the limits take it off theirs.
    prisma.usageEvent.count({
      where: { ownerId, day, entry: CALL, kind: { in: ["TUTOR", "GRADER"] } },
    }),
    prisma.usageEvent.count({
      where: { ownerId, day, entry: RELEASE, kind: { in: ["TUTOR", "GRADER"] } },
    }),
    prisma.usageEvent.aggregate({ where: { ownerId, day }, _sum: { costMicros: true } }),
  ]);
  return {
    calls: Math.max(0, calls - released),
    micros: spend._sum.costMicros ?? 0,
    limits: readLimits(),
  };
}
