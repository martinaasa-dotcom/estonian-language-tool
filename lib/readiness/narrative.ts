import { EVIDENCE_LABEL } from "@/lib/exam/readiness";
import { RUNG_LABEL, type Reading, type Rung, type Summary } from "./rungs";

/**
 * WHAT A RUNG SAYS, IN WORDS, AND THERE IS ONE COPY OF IT.
 *
 * Two screens print a reading, the list and the detail, and Progress prints
 * the summary, so the sentences live beside the arithmetic rather than in
 * either page. A verdict here is the honest version of the claim, kind where
 * the news is bad and never vague about it: "you would be lost here" is what
 * somebody sitting a real exchange finds out in the first ten seconds, and
 * hearing it from the app first is the kinder order.
 *
 * Nothing here is a hedge dressed as a verdict. The tier is printed as its own
 * words (`EVIDENCE_LABEL`, shared with the exam hub so one word means one
 * thing) and the verdict says what the rung is, so a reader sees both.
 */

const VERDICT: Record<Rung, (r: Reading) => string> = {
  unmet: () => "Nothing yet. This unit has not come up in your reviews.",
  lost: (r) =>
    `You would be lost here for now. ${r.at.follow} of the ${r.total} words you would catch, and the rest are the ones that carry the sentence.`,
  follow: (r) =>
    `You would follow most of this. ${r.at.follow} of the ${r.total} words you know when you see them; answering is the next thing.`,
  takePart: (r) =>
    r.situation.live
      ? `You could take part in this if the other person is patient. ${r.at.takePart} of the ${r.total} words you produce reliably.`
      : `You could do this. ${r.at.takePart} of the ${r.total} words you produce reliably.`,
  lead: (r) =>
    r.situation.live
      ? "You could lead this one: open it, steer it, and recover when it goes sideways."
      : "You could do this well, and it is worth doing for real.",
};

export function verdictFor(reading: Reading): string {
  return VERDICT[reading.rung](reading);
}

/** The rung and its evidence, as one short phrase for a row. */
export function standingLine(reading: Reading): string {
  if (reading.rung === "unmet") return RUNG_LABEL.unmet;
  return `${RUNG_LABEL[reading.rung]} · ${EVIDENCE_LABEL[reading.evidence]}`;
}

/** The one line that stands in the way, for a row that has room for one. */
export function nextStep(reading: Reading): string | null {
  if (reading.rung === "lead") return null;
  const blocker = reading.struggles[0];
  return blocker ? blocker.title : null;
}

/**
 * The headline over a level. Counts, never a percentage, because "80 percent
 * ready" is the sentence this whole screen exists to replace: it averages
 * the situation you could lead with the one you would be lost in and reports
 * a number true of neither.
 */
export function headline(summary: Summary): string {
  const { counts, total, level } = summary;
  if (total === 0) return `Nothing at ${level} yet.`;
  const parts: string[] = [];
  if (counts.lead > 0) parts.push(`${counts.lead} you could lead`);
  if (counts.takePart > 0) parts.push(`${counts.takePart} you could take part in`);
  if (counts.follow > 0) parts.push(`${counts.follow} you would follow`);
  if (counts.lost > 0) parts.push(`${counts.lost} you would be lost in`);
  if (counts.unmet > 0) parts.push(`${counts.unmet} not started`);
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Of the ${total} situations at ${level}: ${list}.`;
}

/** Milliseconds as the seconds a person would say. */
export function paceWords(medianMs: number): string {
  const s = medianMs / 1000;
  return s < 10 ? `${s.toFixed(1)} seconds` : `${Math.round(s)} seconds`;
}
