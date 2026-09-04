import { goalsFor } from "@/lib/progress/assessment";
import { readinessSignals } from "@/lib/progress/exam";
import type { DeckSnapshot } from "@/lib/progress/summary";
import { countdownPhrase, daysUntil, reasonsFor, targetByBand, weeksUntil } from "@/lib/assessment/goals";
import { distanceLine, foundHours, project, type MeasuredPace } from "@/lib/assessment/plan";
import { assessReadiness, type Evidence, type Feedback, type ReadinessSignals } from "@/lib/exam/readiness";
import type { ExamLevel } from "@/lib/exam/spec";
import type { DayClock } from "@/lib/time/day";
import { minutesForCards } from "@/lib/stats/pace";
import { standingFor } from "./plan";

/**
 * THE DATE SOMEBODY GAVE US, AND WHETHER THEY ARE GOING TO MAKE IT.
 *
 * A learner answers two questions in their first five minutes here: what they
 * want to reach and by when. The app then stored both and never mentioned them
 * again on the one screen they open every morning. The exam hub knew, the plan
 * screen knew, and Today, which is where somebody decides whether to do
 * fifteen minutes or nothing, did not.
 *
 * "B1 in 47 days, 62 percent likely" is the most motivating sentence this app
 * is in a position to write, and it is also the easiest one to make up. So the
 * evidence tier travels with the number, everywhere, exactly as it does on the
 * hub: a percentage whose basis is not stated is the one thing this feature
 * must not ship (ADR-022). Both screens read `EVIDENCE_LABEL` and
 * `EVIDENCE_NOTE` from `lib/exam/readiness.ts` rather than phrasing their own,
 * because the moment two screens print one number with two accounts of what it
 * is worth, one of them is lying.
 *
 * NOTHING HERE IS A SECOND CALCULATION. `goalsFor` reads the goal,
 * `readinessSignals` gathers the evidence and `assessReadiness` does the
 * arithmetic, all three of them the same ones the hub uses. This picks the
 * target's row out and shapes it for a card.
 *
 * AND WHERE NOBODY NAMED A LEVEL, THE BAND IS THE APP'S OWN AND SAYS SO. The
 * first version returned null there, on the argument that declining to set a
 * target is an answer and a panel arguing with it is the app talking over the
 * person using it. That argument is about a *deadline*, and it was quietly
 * doing something else: a learner who skipped one screen in first run had no
 * confidence figure anywhere on the page they open every morning, which is the
 * one number that answers "how am I doing" in a unit anybody outside this app
 * recognises. `readiness.next` is the level the climb stopped at, which is
 * derived from the review log rather than chosen for them, so `chosen` travels
 * with it and the card says which it is. Nothing is invented: a band nobody
 * picked is still a band this learner's own answers put them under.
 */

export interface ExamCountdown {
  band: ExamLevel;
  /** "Live in the language", the plain-English name of the band. */
  label: string;
  /** ISO, for a date the reader's own browser formats. Null when none was set. */
  deadline: string | null;
  /** Whole days on the learner's calendar. Negative once the date has gone. */
  daysLeft: number | null;
  /** "47 days", "9 weeks", "that date has gone". Null when no deadline was set. */
  phrase: string | null;
  /** Chance of clearing the pass mark, 1 to 99. */
  confidence: number;
  evidence: Evidence;
  /** True when this rests on a paper the learner actually sat. */
  measured: boolean;
  /**
   * True when the learner named this band themselves.
   *
   * Beside `evidence` rather than folded into it, because they answer
   * different questions: the tier says how much the number rests on, and this
   * says whose level it is about. A card that printed a band the app picked
   * under a heading saying "your exam" would be putting a goal in somebody's
   * mouth, which is the same shape of small dishonesty as a confidence figure
   * with no account of what it rests on.
   */
  chosen: boolean;
  /**
   * The one thing most in the way, in the readiness module's own words.
   *
   * WRITTEN BY HAND FIRST, AND IT WAS WORSE. The card said "speaking is the
   * part standing in the way, predicted at 0 against the 60 a pass needs",
   * which for a learner who has never sat a paper is not a prediction at all:
   * a `Review` row carries no note of which mode wrote it, so the app cannot
   * tell a dictation from a flip of the same card and genuinely has nothing on
   * speaking. Reporting nothing as a zero tells somebody they are failing a
   * part they have not attempted.
   *
   * `assessReadiness` already knows the difference and already ranks its
   * advice, so the card prints the first thing off that list instead of
   * inventing a second opinion beside it.
   */
  gap: Feedback | null;
  /**
   * Whether the pace this learner keeps reaches the target by the date, in
   * the plan's own sentence.
   *
   * The confidence above is "would you pass this morning" and this is "does
   * the road you are on arrive in time", which are different questions with
   * different evidence behind them, and the card used to answer only the
   * first. It is `distanceLine` over the same `project` the level check
   * screen renders, on the same standing, the same week and the same
   * measured pace, so Today and `/assess` cannot give two timelines.
   */
  distance: string;
}

/**
 * The countdown, or null when the log cannot carry one.
 *
 * Null only where `assessReadiness` has no band to speak about at all, which
 * is a learner with nothing behind them rather than one who declined a
 * question. The panel is held to `settled` by `lib/ux/disclosure.ts` for the
 * reason the figure itself gives, so by the time this runs there is a log.
 */
export async function examCountdown(
  ownerId: string,
  now: Date,
  clock: DayClock,
  snapshot?: DeckSnapshot,
  /** The learner's measured pace, when the caller already read it. Null before any review. */
  pace: MeasuredPace | null = null,
  /**
   * The readiness signals, when the caller already gathered them.
   *
   * The exam hub reads them for its own list of levels, and this is eight
   * queries and a scan of the dictionary: asking twice inside one render is
   * the cost of the card and none of its value. Optional rather than
   * required, because nothing else that draws this card has a reason to have
   * them in hand first.
   */
  gathered?: ReadinessSignals,
): Promise<ExamCountdown | null> {
  const goals = await goalsFor(ownerId);

  /*
    Eight queries and a scan of the dictionary, which is why the panel is held
    to `settled` rather than why it is held to a target: a learner who skipped
    the goal screen still opens this page every morning. `standingFor` rides
    alongside because the distance line needs it and neither read needs the
    other.
  */
  const [signals, standing] = await Promise.all([
    gathered ?? readinessSignals(ownerId, snapshot),
    standingFor(ownerId),
  ]);
  const readiness = assessReadiness(signals);

  /*
    Their band if they named one, and otherwise the one the climb stopped at.
    `next` is the first level `assessReadiness` would not bet on, so it is the
    honest thing to aim at; `assessed` is the fallback for somebody the app
    would bet on all the way to C1, where there is nothing left to aim at and
    the number worth printing is the one they have.

    Resolved before the projection rather than after, because `project` is
    asked how far it is to a particular band and a band nobody has chosen yet
    is not one.
  */
  const chosen = targetByBand(goals.target);
  const band = chosen?.band ?? readiness.next ?? readiness.assessed;
  const target = chosen ?? targetByBand(band);
  if (!target) return null;

  const plan = project({
    standing,
    to: target.band,
    minutesPerDay: minutesForCards(goals.dailyGoal),
    daysPerWeek: goals.daysPerWeek,
    weeksAvailable: weeksUntil(goals.deadline, now),
    found: foundHours(reasonsFor(goals.reason)),
    pace,
  });
  const level = readiness.levels.find((l) => l.level === target.band);
  if (!level) return null;

  const daysLeft = daysUntil(goals.deadline, now, clock);

  return {
    band: level.level,
    label: target.label.toLowerCase(),
    deadline: goals.deadline,
    daysLeft,
    phrase: daysLeft === null ? null : countdownPhrase(daysLeft),
    confidence: level.confidence,
    evidence: level.evidence,
    measured: level.measured,
    chosen: chosen !== undefined,
    gap: readiness.gaps[0] ?? null,
    distance: distanceLine(plan),
  };
}
