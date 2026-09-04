import type { DayClock } from "@/lib/time/day";
import { BANDS, type Band, type HourRange } from "./types";

/**
 * Why somebody is learning Estonian, and by when.
 *
 * Asked once, at the start, and asked properly. "Which level do you want" on
 * its own is a question most learners cannot answer, because CEFR letters mean
 * nothing until somebody tells you that B1 is the exam naturalisation asks for
 * and that B2 is where you stop translating in your head. So the reason comes
 * first, each reason carries the level it usually implies, and the level is
 * described by what a person can do at it rather than by its letter.
 *
 * The deadline matters more than it looks. It is the only input that turns a
 * projection from a fact about languages into a fact about this person's year,
 * and it is what lets the plan screen say "not by then, and here is what would
 * have to change" instead of a number nobody can act on.
 *
 * Pure: constants, and arithmetic on dates.
 */

export interface Reason {
  id: string;
  /** A lucide icon name. components/icons.tsx is the only place that resolves one. */
  icon: string;
  label: string;
  detail: string;
  /** The level this reason usually needs. Offered, never imposed. */
  implies: Band;
  /**
   * Hours a week of Estonian this situation puts within reach on its own,
   * before anybody opens an app or books a class.
   *
   * The plan used to assume the same five found hours a week for everybody,
   * which described somebody abroad with a textbook and nobody living in
   * Tartu with an Estonian partner. Where a life already has the language in
   * it, the study the plan asks the learner to find is partly already there,
   * and a plan that cannot see that tells the person best placed to make
   * their date that they will not. These are hours the situation *offers*,
   * not hours it guarantees: plenty of people live here for years inside an
   * English or Russian bubble, so every figure is a range with a low end that
   * assumes little of it is used. `lib/assessment/plan.ts` turns the chosen
   * set into one figure and says on screen where it came from.
   */
  exposure: HourRange;
}

export const REASONS: readonly Reason[] = [
  {
    id: "living",
    icon: "House",
    label: "I live in Estonia",
    detail: "Shops, doctors, the bus, neighbours, forms. Everyday life in the language around you.",
    implies: "B1",
    // Errands, forms, the bus: real and shallow, and easy to live beside without using.
    exposure: { low: 1, high: 3 },
  },
  {
    id: "citizenship",
    icon: "Stamp",
    label: "Citizenship or residence",
    detail: "There is a state exam at the end of this one, and it sets the level rather than you.",
    implies: "B1",
    // A goal, not a situation. It puts no Estonian in anybody's week by itself.
    exposure: { low: 0, high: 0 },
  },
  {
    id: "work",
    icon: "Briefcase",
    label: "Work",
    detail: "Meetings, email, colleagues talking at full speed. Precision matters more than politeness.",
    implies: "B2",
    // Meetings and colleagues at full speed are the most exposure a week can hold.
    exposure: { low: 3, high: 8 },
  },
  {
    id: "study",
    icon: "GraduationCap",
    label: "School or university",
    detail: "A course with a syllabus, homework and a mark at the end of the term.",
    implies: "B2",
    // Class plus homework. A course with a syllabus is guided learning hours by definition.
    exposure: { low: 2, high: 5 },
  },
  {
    id: "family",
    icon: "Heart",
    label: "Family or a partner",
    detail: "The people you want to understand are not going to slow down for long.",
    implies: "B1",
    // The people at home, if the home runs in Estonian. Many couples default to English.
    exposure: { low: 2, high: 8 },
  },
  {
    id: "roots",
    icon: "Trees",
    label: "Roots and heritage",
    detail: "A language your family spoke, or a country you keep going back to.",
    implies: "A2",
    // Visits and relatives. Occasional, so the range barely leaves zero.
    exposure: { low: 0, high: 1 },
  },
  {
    id: "travel",
    icon: "Plane",
    label: "Travel",
    detail: "Enough to order, ask, thank and read a sign without reaching for a phone.",
    implies: "A2",
    // Nothing until the trip, and a trip is not a week.
    exposure: { low: 0, high: 0 },
  },
  {
    id: "curiosity",
    icon: "Sparkles",
    label: "Curiosity",
    detail: "Fourteen cases and a stem that changes when you look at it. Reason enough.",
    implies: "A2",
    // Nothing in the week beyond what the learner goes and finds.
    exposure: { low: 0, high: 0 },
  },
];

export function reasonById(id: string | null | undefined): Reason | undefined {
  return REASONS.find((r) => r.id === id);
}

/**
 * More than one reason, because almost nobody has one.
 *
 * Somebody living in Estonia with an Estonian partner and a job where the
 * meetings are in Estonian was being asked to pick which of those three was
 * the real one, and whichever they picked, the app then implied a target from
 * it and got the answer a third right. The stored value is still one string,
 * space separated, so nothing downstream had to learn a new shape and every
 * row written before this reads back as the single reason it holds.
 *
 * Unknown ids are dropped rather than kept, and the order is the table's
 * rather than the order somebody happened to press them in, so two learners
 * who chose the same three reasons store the same string.
 */
export function reasonsFor(stored: string | null | undefined): Reason[] {
  if (!stored) return [];
  const chosen = new Set(stored.split(/[\s,]+/).filter(Boolean));
  return REASONS.filter((r) => chosen.has(r.id));
}

/** The chosen reasons back as a stored value, or null for none. */
export function reasonsToStored(ids: readonly string[]): string | null {
  const chosen = new Set(ids);
  const kept = REASONS.filter((r) => chosen.has(r.id)).map((r) => r.id);
  return kept.length > 0 ? kept.join(" ") : null;
}

/**
 * The level a set of reasons usually needs, which is the highest of them.
 *
 * Offered rather than imposed, exactly as one reason's `implies` was: somebody
 * who is here for travel and for work needs the work level, because the
 * smaller goal is inside the bigger one and a plan built on the smaller one
 * would tell them they were finished when they were not.
 */
export function impliedTarget(ids: readonly string[]): Band | null {
  const bands = reasonsFor(ids.join(" ")).map((r) => r.implies);
  if (bands.length === 0) return null;
  return bands.reduce((a, b) => (BANDS.indexOf(b) > BANDS.indexOf(a) ? b : a));
}

export interface TargetLevel {
  band: Band;
  label: string;
  /** What a person can actually do at this level, in plain words. */
  can: string;
  /** What is still out of reach at it, which is the half nobody tells you. */
  cannot: string;
}

/**
 * The levels, described by what they let you do.
 *
 * Paraphrased from the CEFR global descriptors, with the second half added: a
 * level is as much about what you still cannot do as what you can, and a
 * learner choosing a target with only the flattering half in front of them
 * chooses the wrong one.
 */
export const TARGETS: readonly TargetLevel[] = [
  {
    band: "A1",
    label: "Get by",
    can: "Greet people, introduce yourself, ask for things by name, read a sign or a menu.",
    cannot: "Follow a conversation between two Estonians. It will sound like one long word.",
  },
  {
    band: "A2",
    label: "Handle everyday life",
    can: "Shop, order, book, describe your day, ask directions and understand the answer if it is slow.",
    cannot: "Hold your side of a conversation that moves, or read the news without a dictionary.",
  },
  {
    band: "B1",
    label: "Live in the language",
    can: "Manage most situations that come up, follow a clear conversation, write a straightforward letter. This is the level the naturalisation exam asks for.",
    cannot: "Keep up with fast speech between natives, or write anything that has to be exactly right.",
  },
  {
    band: "B2",
    label: "Work in it",
    can: "Take part in a meeting, argue a point, read an article without stopping, write clear prose.",
    cannot: "Pass unnoticed. Idiom, register and jokes are still further on.",
  },
  {
    band: "C1",
    label: "Use it like your own",
    can: "Follow anything, say what you mean with the shade you meant, write for a real audience.",
    cannot: "Get here in a year. This is where the hours stop being countable in months.",
  },
];

export function targetByBand(band: string | null | undefined): TargetLevel | undefined {
  return TARGETS.find((t) => t.band === band);
}

export interface DeadlinePreset {
  id: string;
  label: string;
  months: number | null;
}

export const DEADLINES: readonly DeadlinePreset[] = [
  { id: "3m", label: "In three months", months: 3 },
  { id: "6m", label: "In six months", months: 6 },
  { id: "1y", label: "In a year", months: 12 },
  { id: "2y", label: "In two years", months: 24 },
  { id: "none", label: "No deadline, I am in no hurry", months: null },
];

/**
 * The date a preset lands on, so a stored deadline is always a real date.
 *
 * `setMonth` overflows rather than clamping, so on the 31st of a month "in six
 * months" landed three days into the month after the one it named: from 31
 * August it gave 3 March, not 28 February. The day is pinned to the end of the
 * shorter month instead, which is what somebody choosing a preset means.
 */
export function deadlineFrom(preset: DeadlinePreset, now: Date): string | null {
  if (preset.months === null) return null;
  const date = new Date(now.getTime());
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + preset.months);
  const lastOfMonth = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0)).getUTCDate();
  date.setDate(Math.min(day, lastOfMonth));
  return date.toISOString();
}

/**
 * Whole weeks from now until a deadline.
 *
 * Null for no deadline, zero for one already passed. Zero rather than a
 * negative number because a plan screen has nothing useful to say about
 * negative time, and the copy handles "no weeks left" honestly.
 */
/**
 * Whole days until a deadline, on the learner's own calendar.
 *
 * Weeks are the right unit for a plan and the wrong one for a countdown. "Seven
 * weeks" and "47 days" are the same fact and only one of them makes anybody
 * open the app, which is why Today counts in days and the plan screen does not.
 *
 * It takes a clock and `weeksUntil` does not, and that is a difference in what
 * they are for rather than an oversight: a week's granularity swallows a
 * midnight, a day's does not, and a countdown that reads 47 in Tallinn and 48
 * in Lisbon for the same deadline is the fault `lib/time/day.ts` exists to
 * prevent. Negative when the date has gone, because a countdown has something
 * to say about that and `weeksUntil` deliberately clamps.
 */
export function daysUntil(
  deadline: string | null | undefined,
  now: Date,
  clock: DayClock,
): number | null {
  if (!deadline) return null;
  const then = new Date(deadline);
  if (Number.isNaN(then.getTime())) return null;
  return clock.daysBetween(now, then);
}

/**
 * How long that is, said the way somebody would say it.
 *
 * Days close in and larger units further out, because "312 days" is a number
 * nobody holds in their head and "ten months" is a feeling. Sixty is the
 * changeover: two months out, a day still means something to a candidate; six
 * months out it does not. The exact date is printed beside this wherever it
 * appears, so precision is never actually lost, only spent where it is worth
 * something.
 */
export function countdownPhrase(days: number): string {
  if (days < 0) return "that date has gone";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 60) return `${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks <= 26) return `${weeks} weeks`;
  const months = Math.round(days / 30.44);
  return months >= 12 && months % 12 === 0
    ? `${months / 12} ${months === 12 ? "year" : "years"}`
    : `${months} months`;
}

export function weeksUntil(deadline: string | null | undefined, now: Date): number | null {
  if (!deadline) return null;
  const then = new Date(deadline);
  if (Number.isNaN(then.getTime())) return null;
  const days = (then.getTime() - now.getTime()) / 86_400_000;
  return Math.max(0, Math.round(days / 7));
}

export interface Goals {
  /**
   * Why they are learning: the chosen reason ids, space separated.
   *
   * One column rather than a table, because it is read in three places and
   * written in two and none of them wants a join for a set of at most eight
   * flags. `reasonsFor` is the one parser.
   */
  reason: string | null;
  /** What the learner wants to reach. */
  target: Band | null;
  /** ISO date, or null for no deadline. */
  deadline: string | null;
  /** Days a week they expect to practise. */
  daysPerWeek: number;
  /** Their own words, kept verbatim and shown back to them. */
  note: string;
}

export const DEFAULT_DAYS_PER_WEEK = 5;

export function normaliseGoals(input: Partial<Goals>): Goals {
  const target = BANDS.includes(input.target as Band) ? (input.target as Band) : null;
  const days = Number(input.daysPerWeek);
  return {
    reason: reasonsToStored(reasonsFor(input.reason).map((r) => r.id)),
    target,
    deadline: input.deadline && !Number.isNaN(new Date(input.deadline).getTime()) ? input.deadline : null,
    daysPerWeek: Number.isFinite(days) ? Math.min(7, Math.max(1, Math.round(days))) : DEFAULT_DAYS_PER_WEEK,
    note: (input.note ?? "").trim().slice(0, 280),
  };
}
