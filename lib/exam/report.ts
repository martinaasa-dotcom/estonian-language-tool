import { PASS_PCT, RETAKE_WAIT_PCT } from "./spec";
import type { ExamResult, ItemMark, PartResult } from "./score";
import type { Feedback } from "./readiness";
import { SKILL_LABEL, type SkillKey } from "./types";

/**
 * What to tell somebody who has just sat a paper.
 *
 * A score and a pass or fail is the least useful half of a mock examination.
 * The useful half is the list of things that went wrong and what each one is
 * called, which is exactly what a real result slip does not give you: the
 * Board reports four percentages and nothing else, and a candidate who failed
 * on 57 percent is left to guess which part to work on.
 *
 * So this reads the marked paper back and says where the marks went, in the
 * order they are worth acting on. Everything here comes off `ExamResult`, which
 * came off comparisons with the dictionary, so no part of this feedback is a
 * model's opinion.
 *
 * Pure: no React, no Prisma, no clock.
 */

/** Where each part is practiced, so a finding can hand over a destination. */
const PRACTICE: Record<SkillKey, { href: string; cta: string }> = {
  writing: { href: "/review/write", cta: "Practice writing" },
  listening: { href: "/review/dictation", cta: "Practice listening" },
  reading: { href: "/review/cloze", cta: "Practice reading" },
  speaking: { href: "/review/speaking", cta: "Practice speaking" },
};

export interface ExamReport {
  /** One line summing the sitting up. */
  headline: string;
  /** What the result means for a real sitting, in a sentence. */
  consequence: string;
  strengths: Feedback[];
  gaps: Feedback[];
  /** Every item that was wrong, worst part first, for the answers section. */
  missed: ItemMark[];
  /** Words that went wrong more than once across the paper. */
  repeatOffenders: { lemma: string; lexemeId: string; times: number }[];
}

function partsByNeed(parts: readonly PartResult[]): PartResult[] {
  // Parts nothing could be set for sort last: they are not the worst result,
  // they are not a result.
  return [...parts].sort((a, b) => {
    if ((a.rawAvailable === 0) !== (b.rawAvailable === 0)) return a.rawAvailable === 0 ? 1 : -1;
    return a.pct - b.pct;
  });
}

export function buildReport(result: ExamResult): ExamReport {
  const ordered = partsByNeed(result.parts);
  // The best of the parts that were actually set. `ordered` puts the absent
  // ones last, so its tail is not the strongest result, it is the one there is
  // no result for.
  const set = ordered.filter((p) => p.rawAvailable > 0);
  const best = set[set.length - 1];

  const headline = result.passed
    ? `${result.points} of ${result.maxPoints} points, ${result.pct} percent. That is a pass at ${result.level}.`
    : result.zeroPart
      ? `${result.pct} percent overall, but ${SKILL_LABEL[result.zeroPart].toLowerCase()} scored nothing, and a zero in one part fails the paper.`
      : `${result.points} of ${result.maxPoints} points, ${result.pct} percent. A pass is ${PASS_PCT}.`;

  const consequence = result.passed
    ? "On a real sitting this would be a certificate."
    : result.waitBeforeResit
      ? `Under ${RETAKE_WAIT_PCT} percent, a real candidate waits six months before sitting again. Worth knowing before booking one.`
      : `You are ${PASS_PCT - result.pct} points of percentage short. That is one part, not four.`;

  const gaps: Feedback[] = [];
  if (result.absentParts.length > 0) {
    gaps.push({
      id: "absent",
      title: `${result.absentParts.map((s) => SKILL_LABEL[s]).join(" and ")} could not be set`,
      detail:
        "The dictionary had nothing to build those questions from, so they were left out of the " +
        "total rather than scored as nothing. Your percentage is of the parts that were set.",
      href: "/dictionary",
      cta: "Add words to the dictionary",
    });
  }
  for (const part of ordered) {
    if (part.rawAvailable === 0) continue;
    if (part.pct >= 75) continue;
    const where = PRACTICE[part.skill];
    gaps.push({
      id: `part-${part.skill}`,
      title: `${part.label} scored ${part.points} of ${part.maxPoints}`,
      detail: part.points === 0
        ? "Nothing at all, which fails the paper on its own however the rest went."
        : `${part.pct} percent of the marks on offer. ${taskDetail(part)}`,
      href: where.href,
      cta: where.cta,
    });
  }

  const strengths: Feedback[] = [];
  if (best && best.rawAvailable > 0 && best.pct >= 75) {
    strengths.push({
      id: `part-${best.skill}`,
      title: `${best.label} at ${best.pct} percent`,
      detail: `${best.points} of ${best.maxPoints} points. This part is not what is holding you back.`,
    });
  }
  for (const part of result.parts) {
    if (part === best || part.rawAvailable === 0 || part.pct < 75) continue;
    strengths.push({
      id: `part-${part.skill}`,
      title: `${part.label} at ${part.pct} percent`,
      detail: `${part.points} of ${part.maxPoints} points.`,
    });
  }

  const missed = ordered.flatMap((part) =>
    part.tasks.flatMap((task) => task.marks.filter((m) => !m.correct)));

  const counts = new Map<string, { lemma: string; lexemeId: string; times: number }>();
  for (const mark of missed) {
    if (!mark.lexemeId || !mark.lemma) continue;
    const row = counts.get(mark.lexemeId) ?? { lemma: mark.lemma, lexemeId: mark.lexemeId, times: 0 };
    row.times += 1;
    counts.set(mark.lexemeId, row);
  }

  return {
    headline,
    consequence,
    strengths,
    gaps,
    missed,
    repeatOffenders: [...counts.values()]
      .filter((row) => row.times > 1)
      .sort((a, b) => b.times - a.times),
  };
}

/** Which task inside a part did the damage, named. */
function taskDetail(part: PartResult): string {
  const weakest = [...part.tasks]
    .filter((t) => t.rawAvailable > 0)
    .sort((a, b) => a.raw / a.rawAvailable - b.raw / b.rawAvailable)[0];
  if (!weakest) return "";
  const pct = Math.round((weakest.raw / weakest.rawAvailable) * 100);
  return `Most of it went on "${weakest.title}", at ${pct} percent.`;
}
