/**
 * Leeches: the handful of cards a learner keeps failing.
 *
 * Every SRS accumulates them, and the standard answer — bury the card once it
 * has lapsed N times — is a dodge dressed as a feature. It removes the symptom
 * and learns nothing, and the learner is left with a word they still cannot use.
 *
 * The failure history is data nobody was reading. A card that has been failed
 * six times has six timestamps, six ratings and, for a case-form card, the case
 * it was asked about — enough to say *how* it is failing, which is the thing a
 * teacher would ask before offering advice.
 *
 * Pure: the caller queries, this decides what counts as a leech and what shape
 * the failure has.
 */

export interface LeechCandidate {
  cardId: string;
  front: string;
  back: string;
  cardType: string;
  targetCase: string | null;
  lemma: string | null;
  translation: string | null;
  lapses: number;
  reps: number;
  /** Ratings in the order they happened, oldest first. */
  history: { rating: number; at: Date }[];
}

export type LeechShape =
  /** Failed from the start and never held. */
  | "never-stuck"
  /** Was reliable, then started failing — usually interference from a new word. */
  | "regressed"
  /** Alternates: recalled one day, gone the next. */
  | "unstable"
  /** Recently failing but too few reviews to say more. */
  | "early";

export interface Leech extends LeechCandidate {
  shape: LeechShape;
  /** Failures divided by attempts, as a percentage. */
  failRate: number;
  /** A one-line description of the pattern, for the learner and for the prompt. */
  pattern: string;
}

/** Cards below this have not earned the attention; noise, not a leech. */
export const LEECH_LAPSES = 4;

const isFail = (rating: number) => rating <= 2;

/**
 * Names the shape of the failure.
 *
 * The distinction matters because the remedies differ: a card that never stuck
 * needs a different approach to the word, while one that regressed usually means
 * a similar word was learned recently and the two are now colliding.
 */
export function classifyShape(history: { rating: number }[]): LeechShape {
  if (history.length < 4) return "early";

  const third = Math.max(1, Math.floor(history.length / 3));
  const early = history.slice(0, third);
  const late = history.slice(-third);

  const earlyOk = early.filter((h) => !isFail(h.rating)).length / early.length;
  const lateOk = late.filter((h) => !isFail(h.rating)).length / late.length;

  if (earlyOk >= 0.7 && lateOk < 0.5) return "regressed";
  if (earlyOk < 0.4 && lateOk < 0.5) return "never-stuck";

  // Count how often the outcome flips between consecutive reviews. A card that
  // alternates is a different problem from one that is simply hard.
  let flips = 0;
  for (let i = 1; i < history.length; i++) {
    if (isFail(history[i]!.rating) !== isFail(history[i - 1]!.rating)) flips++;
  }
  if (flips / (history.length - 1) >= 0.5) return "unstable";

  return "never-stuck";
}

const PATTERNS: Record<LeechShape, string> = {
  "never-stuck": "has never held — failed consistently from the first review",
  regressed: "was reliable and then started failing, which usually means a similar word is interfering",
  unstable: "alternates between recalled and forgotten from one review to the next",
  early: "has been failing recently, on only a few reviews so far",
};

export function toLeech(candidate: LeechCandidate): Leech {
  const attempts = candidate.history.length;
  const failures = candidate.history.filter((h) => isFail(h.rating)).length;
  const shape = classifyShape(candidate.history);
  return {
    ...candidate,
    shape,
    failRate: attempts === 0 ? 0 : Math.round((failures / attempts) * 100),
    pattern: PATTERNS[shape],
  };
}

/**
 * The cards worth taking apart, worst first.
 *
 * Ranked by lapses rather than fail rate: a card failed eight times out of
 * twenty is costing more than one failed twice out of two.
 */
export function rankLeeches(candidates: LeechCandidate[], limit = 8): Leech[] {
  return candidates
    .filter((c) => c.lapses >= LEECH_LAPSES)
    .map(toLeech)
    .sort((a, b) => b.lapses - a.lapses || b.failRate - a.failRate)
    .slice(0, limit);
}

/**
 * The question put to Anu about one leech.
 *
 * Deliberately specific. "Explain this word" produces a dictionary entry the
 * learner has already read and already failed to remember; naming the failure
 * pattern and asking for a distinguishing strategy produces something new.
 * Nothing here asks for an Estonian form — the forms are supplied, and the
 * request is for a way to tell them apart.
 */
export function buildClinicQuestion(leech: Leech, confusable: string[]): string {
  const parts = [
    `I keep failing this card and I do not know why.`,
    ``,
    `Card: ${leech.front} → ${leech.back}`,
    leech.lemma ? `Word: ${leech.lemma}${leech.translation ? ` (${leech.translation})` : ""}` : "",
    leech.targetCase ? `It asks for the ${leech.targetCase.toLowerCase()}.` : "",
    `I have reviewed it ${leech.history.length} times and got it wrong ${leech.failRate}% of the time.`,
    `The pattern: it ${leech.pattern}.`,
    confusable.length
      ? `Words already in my deck that look or sound similar: ${confusable.join(", ")}.`
      : "",
    ``,
    leech.shape === "regressed"
      ? `Which of those similar words is most likely interfering, and how do I tell them apart?`
      : `Give me one concrete way to remember this specific word — a cognate, a sound association, or a contrast with something I already know. Not general advice about studying.`,
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Words in the deck that could plausibly be confused with this one.
 *
 * Cheap orthographic similarity: a shared prefix of three or more characters, or
 * the same length with at most one differing character. Good enough to give the
 * tutor something to work with, and it never claims more than "these look alike".
 */
export function findConfusable(target: string, deck: string[], limit = 5): string[] {
  const t = target.toLowerCase();
  const scored: { word: string; score: number }[] = [];

  for (const raw of deck) {
    const w = raw.toLowerCase();
    if (w === t) continue;

    let shared = 0;
    while (shared < w.length && shared < t.length && w[shared] === t[shared]) shared++;

    let score = 0;
    if (shared >= 3) score = shared;
    else if (w.length === t.length) {
      let diff = 0;
      for (let i = 0; i < w.length; i++) if (w[i] !== t[i]) diff++;
      if (diff <= 1) score = w.length;
    }

    if (score > 0) scored.push({ word: raw, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.word);
}
