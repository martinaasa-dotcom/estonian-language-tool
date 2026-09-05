/**
 * The review of a conversation: what to do differently, in English.
 *
 * The debrief already said what happened and what got done. What it never
 * said is the thing a teacher says after a role-play, which is the reason
 * anybody does one: here is the ending that kept coming out wrong, here is
 * what it is for, and here is the shape of it on your own words. A learner
 * who is told "understood" eleven times and nothing else learns that they are
 * understood, which is half the job; this is the other half, and it is
 * deliberately *after* the conversation rather than inside it, because a
 * correction mid-turn is what stops people talking.
 *
 * WHAT IT MAY WRITE. English, and nothing else, which is the standing
 * `lib/estonian/grammar.ts` has and for the same reason: this file explains
 * Estonian at length and holds none. Every Estonian character in a review
 * comes through `evidence`, and every one of those is either a form the
 * learner typed or a form the dictionary supplied as its recast (`Slip`).
 * The case names and the questions they are taught by are read off `CASES`,
 * the one table of what a case is called, so a note names a case the way the
 * learner's own class does. Delete every Estonian word from the comments here
 * and the output is identical.
 *
 * WHAT IT MAY NOT DO. Mark. There is no score, no percentage and no ranking
 * of the learner: a count of things achieved is the debrief's, a claim about
 * somebody's Estonian is the mock exam's alone (ADR-022), and this is advice.
 * It also never invents a fault: every note is derived from a row in the
 * transcript, so a clean run produces the one note that says so.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { caseByKey } from "@/lib/estonian/cases";
import { CASE_NOTES } from "@/lib/estonian/grammar";
import type { CaseKey } from "@/lib/estonian/types";
import type { SceneState } from "./state";
import type { Slip } from "./turn";
import type { SceneSpec } from "./types";

/** One thing worth saying, with the learner's own words under it. */
export interface ReviewNote {
  readonly id: string;
  /** English, a few words. What this note is about. */
  readonly heading: string;
  /** English, one or two sentences. What to do about it. */
  readonly body: string;
  /**
   * The learner's own form beside the one the other side used, where there is
   * a pair to show. Both are the dictionary's or the learner's; neither is
   * this module's.
   */
  readonly evidence: readonly { readonly said: string; readonly form: string | null }[];
}

export interface SceneReview {
  /**
   * The lead, and it leads on being understood.
   *
   * The one sentence a learner takes away from a role-play decides whether
   * they do another one, and "you made four mistakes" and "everything you
   * said was understood" are the same run described two ways. This is the
   * second one, and it is true rather than kind: the count is of turns the
   * other side acted on.
   */
  readonly lead: string;
  /** Ranked, most useful first, and empty on a run with nothing to say about. */
  readonly notes: readonly ReviewNote[];
}

/** How many of the learner's own pairs a note prints before it is a list. */
const EVIDENCE_SHOWN = 3;

export function reviewOf(scene: SceneSpec, state: SceneState): SceneReview {
  /*
    The turns that were turns. A fragment and an echo cost no patience and
    earn no rating (`advance`, `gradesFor`), and counting them here would tell
    a learner they said fourteen things when they said nine.
  */
  const turns = state.turns.filter((t) => t.reading !== "fragment" && t.reading !== "echo");
  const understood = turns.filter((t) => t.reading !== "unrecognised" && t.reading !== "english");
  const slips = turns.flatMap((t) => t.slips ?? []);

  const notes = [
    ...caseNotes(slips),
    ...personNote(slips),
    ...formNote(slips),
    ...spellingNote(slips),
    ...missedNote(scene, state),
    ...englishNote(turns.filter((t) => t.reading === "english").length),
  ];

  return { lead: lead(turns.length, understood.length, slips.length, notes.length), notes };
}

function lead(turns: number, understood: number, slips: number, notes: number): string {
  if (turns === 0) return "Nothing was said this time, which is a fine way to find out what a scene is like.";
  const all = understood === turns;
  const count = turns === 1 ? "The one thing you said" : `${understood} of your ${turns} turns`;
  const opener = all
    ? turns === 1 ? "The one thing you said was understood." : `Every one of your ${turns} turns was understood.`
    : `${count} were understood.`;
  if (slips === 0) {
    return notes === 0
      ? `${opener} Nothing needed putting right, which is rarer than it sounds.`
      : opener;
  }
  const ending = slips === 1 ? "One ending or spelling was off" : `${slips} endings or spellings were off`;
  return `${opener} ${ending}, and not one of them stopped the conversation.`;
}

/**
 * A note per case that came out as something else, commonest first.
 *
 * Per case rather than one note about cases, because the advice is different
 * for each and a learner who mixes up two of them is doing two things: the
 * case a note is about carries its own line from `CASE_NOTES`, which is what
 * the grammar reference prints for it and is therefore the same explanation
 * they will meet if they follow the link.
 */
function caseNotes(slips: readonly Slip[]): ReviewNote[] {
  const byCase = new Map<CaseKey, Slip[]>();
  for (const slip of slips) {
    if (slip.kind !== "case" || !slip.grammCase) continue;
    byCase.set(slip.grammCase, [...(byCase.get(slip.grammCase) ?? []), slip]);
  }
  return [...byCase.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, rows]) => {
      const spec = caseByKey(key);
      const note = CASE_NOTES.find((n) => n.key === key);
      const many = rows.length > 1;
      return {
        id: `case:${key}`,
        heading: spec ? `${spec.et} · ${spec.question}` : key.toLowerCase(),
        body: [
          many
            ? `This came out as another form ${rows.length} times.`
            : "This came out as another form.",
          note ? `It is the ending for ${note.plain}.` : "",
          note?.englishHook ?? note?.watchOut ?? "",
        ].filter(Boolean).join(" "),
        evidence: rows.slice(0, EVIDENCE_SHOWN).map((s) => ({ said: s.said, form: s.form })),
      };
    });
}

/**
 * The dictionary form where a person was due.
 *
 * The rule is worth stating because it is the one piece of Estonian
 * morphology that really is regular for every verb but two, and a learner who
 * has it stops needing to look up five of the six persons: the present is the
 * stored first person with its -n taken off and the person's own ending put
 * on. `lib/estonian/conjugate.ts` is the module that does it, and the four
 * verb topic pages teach it on the learner's own words.
 */
function personNote(slips: readonly Slip[]): ReviewNote[] {
  const rows = slips.filter((s) => s.kind === "person");
  if (rows.length === 0) return [];
  return [{
    id: "person",
    heading: "The verb, in a person",
    body: "You reached for the dictionary form of the verb where the sentence wanted a person. "
      + "Estonian builds all six persons off the first: take the -n off it and add the ending for who is doing it. "
      + "It was clear either way, and it is the one rule that gets you five forms for the price of one.",
    evidence: rows.slice(0, EVIDENCE_SHOWN).map((s) => ({ said: s.said, form: s.form })),
  }];
}

/** An ending the word does not have, on a stem that was plainly right. */
function formNote(slips: readonly Slip[]): ReviewNote[] {
  const rows = slips.filter((s) => s.kind === "form");
  if (rows.length === 0) return [];
  return [{
    id: "form",
    heading: "An ending Estonian does not use here",
    body: "The stem was right and the ending was not one the word takes, which is why it was understood. "
      + "Estonian glues its endings onto the genitive stem, so that one form is worth learning first: "
      + "get it and eleven cases fall out of it.",
    evidence: rows.slice(0, EVIDENCE_SHOWN).map((s) => ({ said: s.said, form: s.form })),
  }];
}

/**
 * The six letters an English keyboard has no key for, and a slipped letter.
 *
 * Last of the four, because it is the least worth a learner's attention: a
 * dropped diacritic is a keyboard rather than a gap in anybody's Estonian,
 * and the letter bar under every field in this app exists for it.
 */
function spellingNote(slips: readonly Slip[]): ReviewNote[] {
  const rows = slips.filter((s) => s.kind === "spelling");
  if (rows.length === 0) return [];
  return [{
    id: "spelling",
    heading: "A letter or two",
    body: "Spelled a little differently, and understood as it stood. "
      + "The row of Estonian letters under the box types the ones an English keyboard has no key for.",
    evidence: rows.slice(0, EVIDENCE_SHOWN).map((s) => ({ said: s.said, form: s.form })),
  }];
}

/** What they came in to do and did not get to. The goal is the beat's own English. */
function missedNote(scene: SceneSpec, state: SceneState): ReviewNote[] {
  const done = new Set(state.done);
  const missed = scene.beats.filter((b) => b.required && !done.has(b.id));
  if (missed.length === 0) return [];
  return [{
    id: "missed",
    heading: missed.length === 1 ? "The one thing left undone" : "What was left undone",
    body: `${missed.map((b) => b.goal).join(" ")} `
      + "Worth going in again for that alone, since the second run of a scene is where most of it sticks.",
    evidence: [],
  }];
}

/**
 * Reaching for English, counted and never scolded.
 *
 * §8's rule, said once at the end rather than in the moment: what is being
 * practised here is not switching, and the honest thing to do about it is to
 * say how often it happened and why it matters, on a screen the conversation
 * is already over on.
 */
function englishNote(count: number): ReviewNote[] {
  if (count === 0) return [];
  return [{
    id: "english",
    heading: count === 1 ? "One turn in English" : `${count} turns in English`,
    body: "That is what happens on the street too, and holding out in Estonian for one more turn is "
      + "most of what this is practice for. The word button hands you one of the beat's own words if you are stuck.",
    evidence: [],
  }];
}
