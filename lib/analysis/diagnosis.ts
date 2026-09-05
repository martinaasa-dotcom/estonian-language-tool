import { CASES } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * What the learner is actually bad at.
 *
 * The existing weak-case heatmap answers "which case do you fail most", which is
 * the obvious question and the less useful one. Estonian errors do not cluster
 * by case; they cluster by *case interacting with stem shape*. Someone can be
 * perfectly comfortable with the partitive of `raamat` and fail it every time on
 * a gradating word like `tuba`, because the difficulty was never the case ending
 * — it was the stem it attaches to.
 *
 * So the finding this produces is not "you are weak at the partitive" but "you
 * are fine at the partitive except on gradating stems", which names something a
 * learner can go and study. Nothing else on the market can say it, and this app
 * can only say it because `lib/estonian/gradation` already classifies stems and
 * `Review` already records `targetCase` — the join was always available.
 *
 * Pure. The caller does the query; this does the thinking.
 */

export interface ReviewFact {
  targetCase: string | null;
  rating: number;
  /** NONE | QUALITATIVE | QUANTITATIVE, from the lexeme the card was built on. */
  gradation: string;
  /** Whether the word's plural stem is irregular enough to be stored rather than derived. */
  hasIrregularPlural: boolean;
  lemma: string;
}

export interface Finding {
  /** A stable key, so the UI can link to the right drill. */
  caseKey: CaseKey | null;
  /** One sentence, written to be acted on. */
  headline: string;
  detail: string;
  /** Accuracy within the difficult group, 0–100. */
  weakPct: number;
  /** Accuracy outside it, for the contrast that makes the finding meaningful. */
  strongPct: number;
  /** How many reviews the finding rests on. */
  sample: number;
  /** Where to go and fix it. */
  href: string;
}

/** Below this, a difference is noise rather than a pattern. */
const MIN_SAMPLE = 8;
/** A gap smaller than this is not worth telling someone about. */
const MIN_GAP_PCT = 20;

const pct = (ok: number, total: number) => (total === 0 ? 0 : Math.round((ok / total) * 100));

interface Tally { ok: number; total: number }
const empty = (): Tally => ({ ok: 0, total: 0 });

function add(tally: Tally, rating: number): void {
  tally.total++;
  // 3 (Good) and 4 (Easy) are recall; 1 and 2 are not.
  if (rating >= 3) tally.ok++;
}

/**
 * A finding is named the way a class names a case, with the Latin name after
 * it. A learner told their `seesütlev` is weak can carry that sentence into a
 * lesson; one told about their "inessive" cannot.
 */
const caseName = (key: string) => CASES.find((c) => c.key === key)?.et ?? key.toLowerCase();

const caseNameEn = (key: string) =>
  CASES.find((c) => c.key === key)?.en.toLowerCase() ?? key.toLowerCase();

/**
 * The headline finding: a case the learner handles well in general but fails on
 * gradating stems.
 *
 * This is the one that surprises people, and it is only visible if you cut the
 * data two ways at once.
 */
function gradationFindings(facts: ReviewFact[]): Finding[] {
  const byCase = new Map<string, { grading: Tally; plain: Tally }>();

  for (const fact of facts) {
    if (!fact.targetCase) continue;
    let entry = byCase.get(fact.targetCase);
    if (!entry) {
      entry = { grading: empty(), plain: empty() };
      byCase.set(fact.targetCase, entry);
    }
    add(fact.gradation === "NONE" ? entry.plain : entry.grading, fact.rating);
  }

  const findings: Finding[] = [];
  for (const [key, { grading, plain }] of byCase) {
    if (grading.total < MIN_SAMPLE || plain.total < MIN_SAMPLE) continue;
    const weak = pct(grading.ok, grading.total);
    const strong = pct(plain.ok, plain.total);
    if (strong - weak < MIN_GAP_PCT) continue;

    findings.push({
      caseKey: key as CaseKey,
      headline: `Your ${caseName(key)} is fine until the stem changes`,
      detail:
        `You recall the ${caseName(key)} (${caseNameEn(key)}) ${strong}% of the time on words with a ` +
        `stable stem, but only ${weak}% on words with consonant gradation. The ending is not the ` +
        `problem; the stem it attaches to is. Drill astmevaheldus rather than the case.`,
      weakPct: weak,
      strongPct: strong,
      sample: grading.total + plain.total,
      href: `/review?case=${key}`,
    });
  }
  return findings;
}

/** A case that is weak across the board, which is the plainer kind of problem. */
function caseFindings(facts: ReviewFact[]): Finding[] {
  const byCase = new Map<string, Tally>();
  const overall = empty();

  for (const fact of facts) {
    if (!fact.targetCase) continue;
    const tally = byCase.get(fact.targetCase) ?? empty();
    add(tally, fact.rating);
    byCase.set(fact.targetCase, tally);
    add(overall, fact.rating);
  }

  const overallPct = pct(overall.ok, overall.total);
  const findings: Finding[] = [];

  for (const [key, tally] of byCase) {
    if (tally.total < MIN_SAMPLE) continue;
    const weak = pct(tally.ok, tally.total);
    if (overallPct - weak < MIN_GAP_PCT) continue;

    findings.push({
      caseKey: key as CaseKey,
      headline: `The ${caseName(key)} is your weakest case`,
      detail:
        `${weak}% recall on the ${caseName(key)} (${caseNameEn(key)}), against ${overallPct}% across ` +
        `every other case. This one is worth a focused drill.`,
      weakPct: weak,
      strongPct: overallPct,
      sample: tally.total,
      href: `/review?case=${key}`,
    });
  }
  return findings;
}

/**
 * Whether the trouble is plural rather than case — a distinct problem, because
 * the plural stem is the part Estonian does not let you derive.
 */
function pluralFindings(facts: ReviewFact[]): Finding[] {
  const irregular = empty();
  const regular = empty();

  for (const fact of facts) {
    if (!fact.targetCase) continue;
    add(fact.hasIrregularPlural ? irregular : regular, fact.rating);
  }

  if (irregular.total < MIN_SAMPLE || regular.total < MIN_SAMPLE) return [];
  const weak = pct(irregular.ok, irregular.total);
  const strong = pct(regular.ok, regular.total);
  if (strong - weak < MIN_GAP_PCT) return [];

  return [{
    caseKey: null,
    headline: "The plural stem is where you lose it",
    detail:
      `${strong}% recall on words whose plural follows the regular pattern, ${weak}% on words that ` +
      `carry their own genitive plural. Those have to be memorized, because the app cannot derive them ` +
      `and neither can you.`,
    weakPct: weak,
    strongPct: strong,
    sample: irregular.total + regular.total,
    href: "/words",
  }];
}

/**
 * Everything the review log will support, strongest signal first.
 *
 * Returns an empty list rather than a weak claim: with too little data the
 * honest output is nothing at all, and the UI says how many more reviews it
 * needs instead of guessing.
 */
export function diagnose(facts: ReviewFact[]): Finding[] {
  return [...gradationFindings(facts), ...pluralFindings(facts), ...caseFindings(facts)]
    .sort((a, b) => (b.strongPct - b.weakPct) - (a.strongPct - a.weakPct))
    .slice(0, 4);
}

/** How many case-form reviews are still needed before anything can be said. */
export function reviewsNeeded(facts: ReviewFact[]): number {
  const withCase = facts.filter((f) => f.targetCase).length;
  return Math.max(0, MIN_SAMPLE * 2 - withCase);
}
