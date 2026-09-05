import { round2 } from "./facts";
import { billFor } from "./model";
import { SERVICES } from "./services";
import type { Bill, Line, Shape } from "./types";

/**
 * WHAT HAPPENS TO THIS WHEN THE MONEY STOPS.
 *
 * The page next door says what the app costs and where every figure came
 * from, which answers the question a funder asks first. It does not answer the
 * one they score: what becomes of the thing they paid for once they stop
 * paying for it. A project that can only answer "it stops" is asking for a
 * subscription rather than a grant, and a project that answers "it will be
 * self-sustaining" without arithmetic is guessing at somebody else's expense.
 *
 * So this is the arithmetic, and it is read off the same registry as
 * everything else. `services.ts` already records, per service, what a learner
 * loses when it goes: that field was written for the infrastructure page and
 * is exactly the raw material for this one. A retrenchment stage names service
 * ids, the bill is recomputed by the same `billFor` that draws the cost
 * explorer, and what is lost at each step is quoted from the service itself.
 * There is still one list.
 *
 * THE SHAPE OF THE ANSWER, WHICH IS UNUSUAL AND IS WHY IT IS WORTH WRITING
 * DOWN. Most of what this app is made of is given rather than bought. The
 * dictionary is Ekilex, the speech is TartuNLP, the English glosses are
 * Wiktionary, and all three are public institutions that have decided this
 * work should be available. The scheduler, the exams, the games, the grammar
 * and the whole course run on nothing but a server and a database. What money
 * buys here is the tutor, the tooling that writes the app, and the polish. So
 * the floor is low and the fall is gradual, and the honest claim is not that
 * the project becomes profitable but that it becomes cheap enough to keep
 * alive without anybody being paid.
 *
 * Pure: no React, no Next, no Prisma, no environment. Like the rest of the
 * directory.
 */

/**
 * One step down, cumulative with every step above it.
 *
 * `drops` names service ids rather than describing them, so a service that is
 * renamed or removed cannot leave a stage quietly claiming a saving it no
 * longer makes. An invariant checks every id names a real service.
 */
export interface Stage {
  readonly id: string;
  /** What this state of the project is called, for a heading. */
  readonly name: string;
  /** Service ids that are no longer paid for at this step and below. */
  readonly drops: readonly string[];
  /** Shape changes at this step, folded onto the reader's own shape. */
  readonly shape?: Partial<Shape>;
  /** Why anybody would take this step, in the order somebody actually would. */
  readonly why: string;
}

/**
 * The order things are given up in, and it is deliberate rather than
 * cheapest-first.
 *
 * What goes first is what a learner opening the app tomorrow does not notice:
 * the tooling that writes the software, then the reporting that only the
 * operator reads. What goes last is the pair without which there is no app at
 * all. The tutor sits in the middle because it is the one expensive thing a
 * learner can see, and because the app was built so that losing it costs the
 * review path, the dictionary, the drills and the exams nothing.
 */
export const STAGES: readonly Stage[] = [
  {
    id: "running",
    name: "Funded",
    drops: [],
    why: "Somebody is paid to work on it, and every part of it is switched on.",
  },
  {
    id: "unstaffed",
    name: "Unstaffed",
    drops: ["devtools"],
    why:
      "The grant ends and nobody is working on it. This is the step that costs a "
      + "reader nothing: the software does not stop when the developer does.",
  },
  {
    id: "quiet",
    name: "Quiet",
    drops: ["devtools", "errors", "news", "email"],
    why:
      "The reporting the operator reads and the mail that sends a sign-in link "
      + "both go. Google sign-in still works, so nobody already using it is shut out.",
  },
  {
    id: "floor",
    name: "Lights on",
    drops: ["devtools", "errors", "news", "email", "domain", "model"],
    shape: { tutor: "off" },
    why:
      "A server and a database, at whatever address the host gives it. Everything "
      + "the course is made of still works, because none of it was ever bought.",
  },
];

export interface StageBill {
  readonly stage: Stage;
  /** What a month costs in this state. */
  readonly usd: number;
  /** What is given up, quoted from each dropped service rather than restated. */
  readonly lost: readonly { readonly name: string; readonly cost: string }[];
}

/** The charged lines still being paid for once a stage's drops are applied. */
function survivingLines(bill: Bill, drops: readonly string[]): Line[] {
  return bill.lines.filter((line) => !drops.includes(line.service.id));
}

function chargedTotal(lines: readonly Line[]): number {
  return round2(
    lines.reduce((sum, line) => sum + (line.cost.kind === "charged" ? line.cost.usd : 0), 0),
  );
}

/**
 * The ladder, priced, at the size the reader is looking at.
 *
 * Recomputed rather than scaled, because a stage can change the shape as well
 * as the list: switching the tutor off is a different bill and not a
 * subtraction, since the model line prices its own absence.
 */
export function retrenchment(shape: Shape): readonly StageBill[] {
  return STAGES.map((stage) => {
    const bill = billFor({ ...shape, ...stage.shape });
    return {
      stage,
      usd: chargedTotal(survivingLines(bill, stage.drops)),
      lost: stage.drops
        .map((id) => SERVICES.find((service) => service.id === id))
        .filter((service): service is NonNullable<typeof service> => service !== undefined)
        .map((service) => ({ name: service.name, cost: service.whenItIsGone })),
    };
  });
}

/** The last stage: what it costs to keep this alive with nobody paid. */
export function floorUsd(shape: Shape): number {
  const stages = retrenchment(shape);
  return stages[stages.length - 1]?.usd ?? 0;
}

/**
 * WHAT SURVIVES EVEN THAT, WHICH IS THE PART THAT IS NOT ABOUT MONEY.
 *
 * Every claim here is checkable against the repository rather than a promise
 * about intent, which is the only kind of continuity commitment worth making
 * on behalf of a project this small. An invariant holds each of them to
 * something real.
 */
export interface Continuity {
  readonly id: string;
  readonly claim: string;
  /** Where a reader checks it. A path in this repository, or a public document. */
  readonly checkableAt: string;
}

export const CONTINUITY: readonly Continuity[] = [
  {
    id: "licence",
    claim:
      "The code is MIT and the built dictionary carries the licences of the sources "
      + "it was made from. Anybody may run their own copy, including the institutions "
      + "whose data it was built on, and nobody needs permission to.",
    checkableAt: "LICENSE",
  },
  {
    id: "no-lock-in",
    claim:
      "There is no proprietary service in the middle of it. Postgres, a Next.js app "
      + "and two public APIs, so a copy runs on a laptop, in a university's own "
      + "cluster, or on any host that runs Node.",
    checkableAt: "README.md",
  },
  {
    id: "data-is-rebuildable",
    claim:
      "The dictionary is built by a script from Ekilex and Wiktionary rather than "
      + "typed, so it can be rebuilt from scratch by somebody who has neither this "
      + "database nor this deployment.",
    checkableAt: "scripts/expand-seed.ts",
  },
  {
    id: "learners-keep-theirs",
    claim:
      "Every learner can take their whole record out of it at any time, in one file, "
      + "and put it back into another copy. That is a right on the privacy page and a "
      + "route rather than an intention.",
    checkableAt: "app/api/export/route.ts",
  },
  {
    id: "works-shut",
    claim:
      "The pages a learner has already opened keep opening with no network at all, "
      + "and grades taken offline are held and replayed. A day of downtime is not a "
      + "day of lost study.",
    checkableAt: "lib/offline/db.ts",
  },
  {
    id: "no-model-required",
    claim:
      "Nothing a learner is taught comes from a model. The course, the dictionary, "
      + "the exercises and the exams are assembled from attested sources, so the app "
      + "keeps teaching with every AI key removed.",
    checkableAt: "docs/03-architecture.md",
  },
];
