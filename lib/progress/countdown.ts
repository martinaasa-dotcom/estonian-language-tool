import { goalsFor } from "@/lib/progress/assessment";
import { readinessSignals } from "@/lib/progress/exam";
import type { DeckSnapshot } from "@/lib/progress/summary";
import { countdownPhrase, daysUntil, targetByBand } from "@/lib/assessment/goals";
import { assessReadiness, type Evidence, type Feedback } from "@/lib/exam/readiness";
import type { ExamLevel } from "@/lib/exam/spec";
import type { DayClock } from "@/lib/time/day";

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
}

/**
 * The countdown, or null when there is nothing to count down to.
 *
 * Null rather than a card saying "you have set no target", because first run
 * asks for one and Settings can change it: somebody who has genuinely declined
 * to name a level is telling us they do not want this panel, and a screen that
 * argues with that is the app talking over the person using it.
 */
export async function examCountdown(
  ownerId: string,
  now: Date,
  clock: DayClock,
  snapshot?: DeckSnapshot,
): Promise<ExamCountdown | null> {
  const goals = await goalsFor(ownerId);
  const target = targetByBand(goals.target);
  if (!target) return null;

  // Only now, once there is a target to spend it on. This is eight queries and
  // a scan of the dictionary, and running it for a learner who never named a
  // level would be the cost of the panel without the panel.
  const signals = await readinessSignals(ownerId, snapshot);
  const readiness = assessReadiness(signals);
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
    gap: readiness.gaps[0] ?? null,
  };
}
