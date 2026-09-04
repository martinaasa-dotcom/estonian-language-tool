import type { Level } from "@/lib/collections/syllabus";
import { CASES, caseByKey } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";
import { type Evidence } from "@/lib/exam/readiness";
import { MACHINERY_UNITS, situationById, type Machinery, type Situation } from "./situations";
import type { WordEvidence } from "./evidence";

/**
 * THREE RUNGS, AND WHAT EACH ONE COSTS TO CLAIM.
 *
 * A situation is read on three rungs, in order, and a learner is placed on the
 * highest one the log will actually support:
 *
 *   follow      You would understand most of what is said to you. This is the
 *               rung a vocabulary percentage measures, and it is the lowest.
 *   take part   You could answer when spoken to, with the words and the
 *               endings the encounter needs, without a long silence first.
 *   lead        You could open it, steer it and recover when it goes wrong.
 *
 * Under those, `lost` is a situation the learner has met and is not yet able
 * to follow, and `unmet` is one whose words the log has never seen at all,
 * which is a fact about the course rather than about the learner and is
 * printed as one.
 *
 * WHAT EACH RUNG READS. Follow is recognition: the word came at you and you
 * knew it. Take part is production: the meaning, the case or the person was
 * asked for and you gave it, more than once, and got it right the last time.
 * Lead is production with variety and at pace, plus everything the encounter
 * leans on that is not its own vocabulary: the cases it turns on, the
 * machinery it runs on (numbers, question words, the clock), and, for a live
 * exchange, some evidence that the learner can follow *speech*, which is the
 * one thing the review log cannot supply on its own.
 *
 * THE ONE PROMISE. Recognition alone never clears the second rung. A learner
 * who has turned over every card in a unit and never produced a word of it is
 * at `follow`, whatever the percentage, because that is what they can do. The
 * invariant suite asserts it, and `rungs.test.ts` was made to fail on it.
 *
 * THE BARS ARE SHARES OF WORDS, NOT AVERAGES OF SCORES. A situation is read
 * word by word and then asks how many of its words stand at each rung, since
 * an average lets three words you know cold cover four you have never met,
 * and an encounter does not: the one word you are missing is the one the
 * other person says. Three quarters to follow, six in ten to take part, six
 * in ten at lead with eight in ten at take part underneath it. Round figures
 * rather than fitted ones, and they are meant to be: what they encode is
 * that "most" is the bar for understanding and "most, reliably" is the bar
 * for speaking, and the tier printed beside every reading is what keeps the
 * exact boundary honest.
 *
 * THIN EVIDENCE CAPS THE RUNG. The exam model caps a *confidence* at what the
 * log has earned (`lib/exam/readiness.ts`); here there is no percentage to
 * cap, so the rung itself is capped. Under a dozen answers on a situation's
 * words the app will say follow and no more, whatever they were; under forty
 * it will say take part and no more. The reading names the cap when it bites,
 * because "take part" that means "take part, on eleven answers" is a
 * different sentence from the same words on two hundred.
 *
 * Pure. No React, no Prisma, no clock beyond what the caller passes in.
 */

export type Rung = "unmet" | "lost" | "follow" | "takePart" | "lead";

export const RUNG_ORDER: readonly Rung[] = ["unmet", "lost", "follow", "takePart", "lead"];

export const rungRank = (rung: Rung): number => RUNG_ORDER.indexOf(rung);

/** The three claims, in the words a screen prints. */
export const RUNG_LABEL: Record<Rung, string> = {
  unmet: "Not started",
  lost: "Not yet",
  follow: "Follow it",
  takePart: "Take part",
  lead: "Lead it",
};

// ── Per word ────────────────────────────────────────────────────────────────

export type WordStanding = "unmet" | "met" | "follow" | "takePart" | "lead";

const STANDING_RANK: Record<WordStanding, number> = { unmet: 0, met: 1, follow: 2, takePart: 3, lead: 4 };

/** How often an answer has to be right to count. Seven in ten is the scheduler's own idea of stuck. */
export const RIGHT_RATE = 0.7;
export const LEAD_RATE = 0.8;

const rate = (t: { asked: number; right: number }) => (t.asked === 0 ? 0 : t.right / t.asked);

/**
 * Where one word stands.
 *
 * Producing a word is evidence you recognise it, so a word produced right
 * once is at least at `follow` even with no recognition card behind it: a
 * word added from the frequency page has no recognition card at all, and
 * reading that as "never understood" would be wrong about the learner.
 */
export function wordStanding(e: WordEvidence | undefined): WordStanding {
  if (!e) return "unmet";
  const { recognise, produce } = e;
  const follows =
    (recognise.asked >= 1 && rate(recognise) >= RIGHT_RATE && recognise.lastRight === true) ||
    produce.right >= 1;
  const takesPart = produce.asked >= 2 && rate(produce) >= RIGHT_RATE && produce.lastRight === true;
  const leads =
    takesPart && produce.asked >= 3 && rate(produce) >= LEAD_RATE &&
    // Variety, where the word has any: a form answered right, or for a word
    // with no forms to ask for, simply more of the same.
    (e.formsRight >= 1 || produce.right >= 4);
  if (leads) return "lead";
  if (takesPart) return "takePart";
  if (follows) return "follow";
  return "met";
}

// ── Per situation ───────────────────────────────────────────────────────────

export interface CaseStanding {
  pct: number;
  reviews: number;
}

export interface ListeningEvidence {
  /** The level the placement check put listening at, if one has been sat. */
  placed: string | null;
  /** Mock papers sat whose listening part was recorded. */
  sittings: number;
}

export interface Context {
  /** Evidence per lemma, over the whole deck. Absent means never asked. */
  evidence: ReadonlyMap<string, WordEvidence>;
  /** Lemmas the dictionary holds. A word Ekilex never returned is not held against anybody. */
  available: ReadonlySet<string>;
  /** Accuracy per case over the shared window. Keyed on `CaseKey`. */
  cases: ReadonlyMap<string, CaseStanding>;
  listening: ListeningEvidence;
}

export interface Struggle {
  id: string;
  title: string;
  detail: string;
  /** The rung this stands in the way of. */
  blocks: Rung;
  href?: string;
  cta?: string;
}

export interface Pace {
  /** Median time to a correct production answer over the situation's words. */
  medianMs: number | null;
  /** Words with enough timed answers to say. */
  timedWords: number;
  label: "quick" | "steady" | "slow" | null;
}

export interface Reading {
  situation: Situation;
  rung: Rung;
  /** What the evidence supported before the tier cap. Equal to `rung` unless the cap bit. */
  uncapped: Rung;
  evidence: Evidence;
  /** Answers behind the reading, over the situation's own words. */
  answers: number;
  /** Words in the dictionary for this situation. */
  total: number;
  /** Words at or above each standing. `lead <= takePart <= follow <= met <= total`. */
  at: Record<Exclude<WordStanding, "unmet">, number>;
  pace: Pace;
  struggles: Struggle[];
  /** The learner has enough here to try the real thing. */
  tryThis: string | null;
}

/** The share of words a rung asks for. */
export const FOLLOW_SHARE = 0.75;
export const TAKE_PART_SHARE = 0.6;
export const LEAD_SHARE = 0.6;
export const LEAD_TAKE_PART_SHARE = 0.8;

/** Answers on a situation's words before a rung may be claimed. */
export const ANSWERS_FAIR = 12;
export const ANSWERS_GOOD = 40;

/**
 * Pace, in the time a typed answer takes.
 *
 * Both are assumptions and are printed as such. Four seconds is a typed word
 * with a short pause before it, which is about what a patient person at a
 * counter will wait before filling the silence in English. Eight is a word
 * being searched for. A typed answer includes the typing, so these are
 * generous rather than tight, and the screen prints the seconds beside the
 * label so a reader can disagree with the line rather than with a word.
 */
export const CONVERSATIONAL_MS = 4_000;
export const SLOW_MS = 8_000;

/** A case needs this many reviews before its percentage may block a rung. */
export const MIN_CASE_REVIEWS = 6;
export const CASE_OK_PCT = 70;

/** A word not seen for this long is worth mentioning. */
export const STALE_DAYS = 30;

const LEVEL_RANK: Record<string, number> = { "pre-A1": -1, A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

function evidenceFrom(answers: number): Evidence {
  if (answers < ANSWERS_FAIR) return "thin";
  if (answers < ANSWERS_GOOD) return "fair";
  return "good";
}

const CAP: Record<Evidence, Rung> = { thin: "follow", fair: "takePart", good: "lead" };

function paceOf(words: readonly WordEvidence[]): Pace {
  const medians = words.map((w) => w.produce.medianMs).filter((m): m is number => m !== null);
  if (medians.length === 0) return { medianMs: null, timedWords: 0, label: null };
  const sorted = [...medians].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const label = medianMs <= CONVERSATIONAL_MS ? "quick" : medianMs <= SLOW_MS ? "steady" : "slow";
  return { medianMs, timedWords: medians.length, label };
}

/** The share of a unit's words that stand at or above a standing. */
function shareAt(lemmas: readonly string[], ctx: Context, standing: WordStanding): number {
  const held = lemmas.filter((l) => ctx.available.has(l));
  if (held.length === 0) return 0;
  const n = held.filter((l) => STANDING_RANK[wordStanding(ctx.evidence.get(l))] >= STANDING_RANK[standing]).length;
  return n / held.length;
}

/** Whether one piece of machinery is there to lean on: its units at take part. */
function machineryHolds(kind: Machinery, ctx: Context): boolean {
  const lemmas = MACHINERY_UNITS[kind].flatMap((id) => situationById(id)?.lemmas ?? []);
  return shareAt(lemmas, ctx, "takePart") >= TAKE_PART_SHARE;
}

const MACHINERY_LABEL: Record<Machinery, { what: string; unit: string }> = {
  greetings: { what: "the greetings", unit: "tervitused" },
  questions: { what: "the question words", unit: "kusisonad" },
  numbers: { what: "numbers", unit: "arvud" },
  time: { what: "the clock and the days", unit: "aeg" },
  replies: { what: "the short replies, yes, no and the words around them", unit: "vastused" },
  pronouns: { what: "the pronouns", unit: "asesonad" },
};

const seconds = (ms: number) => (ms / 1000).toFixed(ms < 10_000 ? 1 : 0);

export function readSituation(situation: Situation, ctx: Context): Reading {
  const held = situation.lemmas.filter((l) => ctx.available.has(l));
  const total = held.length;
  const evidences = held.map((l) => ctx.evidence.get(l));
  const standings = evidences.map(wordStanding);
  const countAt = (s: WordStanding) => standings.filter((x) => STANDING_RANK[x] >= STANDING_RANK[s]).length;
  const at = { met: countAt("met"), follow: countAt("follow"), takePart: countAt("takePart"), lead: countAt("lead") };
  const answers = evidences.reduce((sum, e) => sum + (e ? e.recognise.asked + e.produce.asked : 0), 0);
  const evidence = evidenceFrom(answers);
  const pace = paceOf(evidences.filter((e): e is WordEvidence => e !== undefined));
  const struggles: Struggle[] = [];

  const share = (n: number) => (total === 0 ? 0 : n / total);

  // ── Follow ────────────────────────────────────────────────────────────
  const unmet = total - at.met;
  if (unmet > 0) {
    struggles.push({
      id: "unmet",
      title: unmet === total ? "None of these words has come up yet" : `${unmet} of the ${total} words have not come up yet`,
      detail: unmet === total
        ? "The log has nothing on this situation, which is a fact about the course, not about you."
        : "A word you have never met is the one the other person will use.",
      blocks: at.met === 0 ? "follow" : share(at.follow) >= FOLLOW_SHARE ? "takePart" : "follow",
      href: `/learn/${situation.id}`,
      cta: "Open the unit",
    });
  }

  const follows = total > 0 && share(at.follow) >= FOLLOW_SHARE;

  // ── Take part ─────────────────────────────────────────────────────────
  const takesPart = follows && share(at.takePart) >= TAKE_PART_SHARE;
  if (follows && !takesPart) {
    // The gap this whole screen exists to name: recognised, not produced.
    struggles.push({
      id: "freeze",
      title: "You would follow this, and freeze when it is your turn",
      detail: `${at.follow} of the ${total} words you know when you see them. ${at.takePart} you have produced reliably, and answering is producing.`,
      blocks: "takePart",
      href: "/review/flashcards",
      cta: "Produce them, typed",
    });
  }

  // ── Lead ──────────────────────────────────────────────────────────────
  let leads = takesPart && share(at.lead) >= LEAD_SHARE && share(at.takePart) >= LEAD_TAKE_PART_SHARE;
  if (takesPart && !leads) {
    struggles.push({
      id: "variety",
      title: "You can answer with these; leading takes more of them, in more forms",
      detail: `${at.lead} of the ${total} words are solid in more than one form. Leading an exchange means reaching for a word in whichever form the sentence wants.`,
      blocks: "lead",
      href: "/review/flashcards",
      cta: "Ask them in five ways",
    });
  }

  if (takesPart && situation.live) {
    if (pace.label === "slow" || pace.label === "steady") {
      leads = false;
      struggles.push({
        id: "pace",
        title: pace.label === "slow"
          ? `These words take you about ${seconds(pace.medianMs!)} seconds each`
          : `These words take you about ${seconds(pace.medianMs!)} seconds each, which is a pause somebody notices`,
        detail: pace.label === "slow"
          ? "In a real exchange you get about two before the other person fills the silence, usually in English. Speed is a separate skill from knowing, and it is drilled separately."
          : "Fast enough to answer a patient person. Leading means reaching for the next word while they are still finishing the last one.",
        blocks: "lead",
        href: "/review/sprint",
        cta: "Sixty seconds against the clock",
      });
    } else if (pace.label === null) {
      leads = false;
      struggles.push({
        id: "untimed",
        title: "Nothing here says how fast these words come to you",
        detail: "Pace is read off typed answers, and there are not enough of those yet to say. Knowing a word and reaching it in two seconds are different things.",
        blocks: "lead",
        href: "/review/flashcards",
        cta: "Answer some, typed",
      });
    }
  }

  if (takesPart) {
    for (const key of situation.cases) {
      const standing = ctx.cases.get(key);
      const spec = caseByKey(key);
      if (!spec) continue;
      if (!standing || standing.reviews < MIN_CASE_REVIEWS) {
        leads = false;
        struggles.push({
          id: `case-${key}`,
          title: `The ${spec.et} has hardly been asked of you`,
          detail: `This turns on the ${spec.et}, the ${spec.en.toLowerCase()}, ${spec.gloss}. ${standing?.reviews ?? 0} answers is not enough to know whether it is there.`,
          blocks: "lead",
          href: `/grammar/${key.toLowerCase()}`,
          cta: "Read the rule",
        });
      } else if (standing.pct < CASE_OK_PCT) {
        leads = false;
        struggles.push({
          id: `case-${key}`,
          title: `The ${spec.et} is at ${standing.pct} percent`,
          detail: `This turns on the ${spec.et}, the ${spec.en.toLowerCase()}, ${spec.gloss}, and it is still going wrong across ${standing.reviews} answers.`,
          blocks: "lead",
          href: `/grammar/${key.toLowerCase()}`,
          cta: "Read the rule",
        });
      }
    }

    for (const kind of situation.needs) {
      if (machineryHolds(kind, ctx)) continue;
      leads = false;
      const { what, unit } = MACHINERY_LABEL[kind];
      struggles.push({
        id: `needs-${kind}`,
        title: `This runs on ${what}, and those are not there yet`,
        detail: kind === "numbers"
          ? "A price, a time or a platform is said once and fast. The words of the situation do not help if the number in the middle of it is lost."
          : kind === "questions"
            ? "Leading means asking. The question words are what let you steer rather than answer."
            : "It is the machinery every exchange runs on, whatever the exchange is about.",
        blocks: "lead",
        href: `/learn/${unit}`,
        cta: "Open the unit",
      });
    }

    if (situation.live) {
      const { placed, sittings } = ctx.listening;
      const placedRank = placed === null ? null : LEVEL_RANK[placed] ?? null;
      const needRank = LEVEL_RANK[situation.level] ?? 0;
      if (placed === null && sittings === 0) {
        leads = false;
        struggles.push({
          id: "ear",
          title: "Nothing here has tested your ear",
          detail: "Every answer above was typed or read. Spoken Estonian arrives faster than a card and once, and the level check is the one thing in this app that measures whether you can follow it.",
          blocks: "lead",
          href: "/assess",
          cta: "Take the level check",
        });
      } else if (placedRank !== null && placedRank < needRank) {
        leads = false;
        struggles.push({
          id: "ear",
          title: `The level check put your listening at ${placed}, and this is ${situation.level}`,
          detail: "You may well have the words. Following them when somebody else says them, at their pace, is what that check measured, and it is the half of a conversation you do not control.",
          blocks: "lead",
          href: "/review/dictation",
          cta: "Take a dictation",
        });
      }
    }
  }

  // ── Worth knowing at any rung ─────────────────────────────────────────
  const shaky = held.filter((l) => ctx.evidence.get(l)?.produce.lastRight === false);
  if (shaky.length >= 3) {
    struggles.push({
      id: "shaky",
      title: `${shaky.length} words went wrong the last time you produced them`,
      detail: "A word you got wrong this week is the one that will not be there on the day.",
      blocks: follows ? "takePart" : "follow",
      href: "/review",
      cta: "Review what is due",
    });
  }
  const stale = evidences.filter((e) => e && e.daysSince !== null && e.daysSince > STALE_DAYS).length;
  if (at.met > 0 && stale / at.met >= 0.5) {
    struggles.push({
      id: "stale",
      title: `It has been over a month since you saw most of these`,
      detail: `${stale} of the ${at.met} words you have met were last answered more than ${STALE_DAYS} days ago. What this reading says is what was true then.`,
      blocks: follows ? "takePart" : "follow",
      href: "/review",
      cta: "Review what is due",
    });
  }

  const uncapped: Rung = total === 0 || at.met === 0
    ? "unmet"
    : leads ? "lead" : takesPart ? "takePart" : follows ? "follow" : "lost";
  const cap = CAP[evidence];
  const rung: Rung = rungRank(uncapped) > rungRank(cap) ? cap : uncapped;

  if (rung !== uncapped) {
    struggles.unshift({
      id: "evidence",
      title: `Only ${answers} answers behind this, so it is held at "${RUNG_LABEL[rung].toLowerCase()}"`,
      detail: "The evidence would say more and the app will not, because a claim on a dozen answers is a guess wearing a verdict. Another week of review here and it can say what it sees.",
      blocks: RUNG_ORDER[rungRank(rung) + 1] ?? "lead",
      href: `/learn/${situation.id}`,
      cta: "Open the unit",
    });
  }

  return {
    situation,
    rung,
    uncapped,
    evidence,
    answers,
    total,
    at,
    pace,
    struggles: orderStruggles(struggles),
    tryThis: rungRank(rung) >= rungRank("takePart") ? situation.tryThis : null,
  };
}

/** What stands in the way of the next rung first, then everything else. */
function orderStruggles(struggles: Struggle[]): Struggle[] {
  return [...struggles].sort((a, b) => rungRank(a.blocks) - rungRank(b.blocks));
}

// ── The whole picture ───────────────────────────────────────────────────────

export interface Summary {
  level: Level;
  counts: Record<Rung, number>;
  total: number;
  /** Situations at take part or above, the strongest first. */
  couldTry: Reading[];
  /** The struggle named most often across the level's situations, if any. */
  commonest: { id: string; title: string; times: number; href?: string; cta?: string } | null;
}

export function summarise(readings: readonly Reading[], level: Level): Summary {
  const atLevel = readings.filter((r) => r.situation.level === level);
  const counts: Record<Rung, number> = { unmet: 0, lost: 0, follow: 0, takePart: 0, lead: 0 };
  for (const r of atLevel) counts[r.rung]++;

  const couldTry = readings
    .filter((r) => r.tryThis !== null)
    .sort((a, b) => rungRank(b.rung) - rungRank(a.rung) || b.answers - a.answers);

  /*
    The struggle that comes up most, counted by kind rather than by wording:
    "the osastav is at 55 percent" on nine situations is one thing to fix,
    not nine. Named only when it recurs, because a struggle on one situation
    is that situation's business and is printed there.
  */
  const tally = new Map<string, { title: string; times: number; href?: string; cta?: string }>();
  for (const r of atLevel) {
    for (const s of r.struggles) {
      if (s.id === "unmet" || s.id === "evidence") continue;
      const held = tally.get(s.id) ?? { title: s.title, times: 0, href: s.href, cta: s.cta };
      held.times++;
      tally.set(s.id, held);
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1].times - a[1].times)[0];
  const commonest = top && top[1].times >= 2 ? { id: top[0], ...top[1] } : null;

  return { level, counts, total: atLevel.length, couldTry, commonest };
}

/** The Estonian name of a case, for a screen that has only the key. */
export function caseName(key: CaseKey): string {
  return CASES.find((c) => c.key === key)?.et ?? key.toLowerCase();
}
