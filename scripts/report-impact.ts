/**
 * THE IMPACT SUMMARY AS TEXT SOMEBODY CAN PASTE INTO AN APPLICATION.
 *
 * A grant form asks how many people, how much study, whether they come back,
 * and what the thing is measured by. `/api/metrics` answers all four as JSON
 * behind a token, which is the right shape for a machine and the wrong shape
 * for a person with a form open and twenty minutes. This prints the same
 * figures, from the same reader (`lib/progress/impact.ts`) and under the same
 * floors (`lib/research/impact.ts`), as sentences.
 *
 * EVERY FIGURE CARRIES WHAT IT WAS MEASURED OVER AND THE DATE, because a
 * number quoted without either is a number nobody can check, and a later run
 * will not reproduce it: the log grows and the report grows with it.
 *
 * A COMMAND RATHER THAN A SCREEN. Nobody in the app needs this, it reads the
 * whole deployment rather than one learner, and an operator running it has the
 * database password already. `docs/23-impact.md` is what to read before
 * quoting any of it.
 */
import { prisma } from "../lib/db";
import { gatherImpact, IMPACT_WINDOW_DAYS } from "../lib/progress/impact";
import { MAX_LEARNER_SHARE, MIN_LEARNERS, MIN_REVIEWS } from "../lib/research/corpus";
import {
  isWithheld, withheldBecause, type Figure, type Headcount, type Impact, type Reported,
} from "../lib/research/impact";

/** A count with thousands separated, which is how a form wants to read it. */
function number(n: number): string {
  return n.toLocaleString("en-GB");
}

/** A published quantity, or the one sentence saying why there is none. */
function quantity(reported: Reported<Figure>, over: string): string {
  if (isWithheld(reported)) return `not reported (${withheldBecause(reported)})`;
  return `about ${number(reported.value)} ${reported.unit}, ${over}, from ${reported.learners} people`;
}

function people(reported: Reported<Headcount>, over: string): string {
  if (isWithheld(reported)) return `not reported (${withheldBecause(reported)})`;
  return `${reported.learners} people, ${over}`;
}

function lines(impact: Impact): string[] {
  const day = impact.generatedAt.slice(0, 10);
  const out: string[] = [
    "Kodukeel: what this installation has done.",
    `Measured on ${day}, from the app's own review log and the reports learners wrote themselves.`,
    "",
  ];

  if (!impact.anyActivity) {
    out.push(
      "Nobody has answered a card on this installation yet, so there is nothing to report.",
      "This is a real answer rather than a failure. Every figure below would be zero, and a",
      "row of zeros in an application reads as a measurement of something.",
      "",
      "Run this again once people have been using it for a few weeks.",
    );
    return out;
  }

  out.push(
    "PEOPLE",
    `  Reached: ${people(impact.learnersReached, "counted over every answer ever given here")}`,
    `  Active: ${people(impact.activeLearners, `counted over the last ${impact.windowDays} days`)}`,
    "",
    "STUDY",
    `  Answers: ${quantity(impact.reviewsAnswered, "every exercise answered here")}`,
    `  Time: ${quantity(impact.studyTime, "counted as sittings rather than as time on a card")}`,
    `  Words learned: ${quantity(impact.wordsLearned, "words the scheduler treats as known")}`,
    "",
    "COMING BACK",
  );

  for (const reading of impact.retention) {
    const window =
      reading.windowDays === 1
        ? `on day ${reading.offsetDays}`
        : `in the ${reading.windowDays} days from day ${reading.offsetDays}`;
    out.push(
      reading.pct === null
        ? `  ${reading.key}: not reported (too few people, or too little time has passed)`
        : `  ${reading.key}: ${reading.pct}% came back ${window}, from ${reading.learners} people`,
    );
  }

  out.push(
    "",
    "ESTONIAN SPOKEN OUTSIDE THE APP",
    "  This is the number the app says it is measured by, and it is what learners told us.",
    `  Conversations: ${quantity(impact.conversationsReported, "as reported, day by day")}`,
    `  Reported by: ${people(impact.learnersWithConversation, "people who reported at least one")}`,
    "",
    "HOW TO READ IT",
    `  Every figure rests on at least ${MIN_LEARNERS} people and at least ${MIN_REVIEWS} records,`,
    `  and no one person is more than ${Math.round(MAX_LEARNER_SHARE * 100)}% of any of them.`,
    "  Anything under that says so instead of showing a small number.",
    "  People are counted in bands, so two runs of this cannot be compared to work out who",
    "  arrived in between. Counts are rounded.",
    "  Nothing was collected to produce this. There is no analytics vendor and no tracker:",
    "  every figure is derived from rows the app keeps in order to schedule revision, and",
    "  anybody can keep their own rows out of it from Settings.",
    `  The active window is ${IMPACT_WINDOW_DAYS} days. Quote the date above with any figure.`,
  );
  return out;
}

async function main() {
  const impact = await gatherImpact(new Date());
  console.log(lines(impact).join("\n"));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
