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
 * WHAT IT MAY NOT SAY TWICE. What was left undone. A learner reported this
 * screen as unreadable, and the clearest single fault in it was that the same
 * unmet goal was printed three times: ticked off in the objectives, again as a
 * note here, and again under "One thing to work on" with the drill beside it.
 * The list is the record and the drill is the action, so the note in the
 * middle was the copy with nothing of its own to add. A run where nothing at
 * all was said says so in the lead, which is where it belongs.
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
import { plainAsk } from "@/lib/estonian/plainAsk";
import type { CaseKey } from "@/lib/estonian/types";
import type { SceneState } from "./state";
import { diagnose, diagnosePerson, type Hunch } from "./diagnose";
import type { Slip } from "./turn";
import type { SceneSpec } from "./types";

/** One thing worth saying, with the learner's own words under it. */
export interface ReviewNote {
  readonly id: string;
  /**
   * English, a few words, and it leads.
   *
   * A learner reported this screen as unreadable and the heading is most of
   * why: it read the case's Estonian name and its question word, which are a
   * name and a question word to somebody who has met neither yet, over a note
   * about their own sentence. That is the fault `lib/estonian/plainAsk.ts` was
   * written for one screen over, and the answer is its answer: say what the
   * ending is for in words anybody has, and keep the name underneath as the
   * cross-reference it was always meant to be.
   */
  readonly heading: string;
  /**
   * The Estonian name and the question it is taught by, where the note is
   * about a case. Printed quietly under the heading, because a learner sitting
   * a course needs the word their teacher uses and does not need it first.
   */
  readonly term?: string;
  /** English, one or two sentences. What to do about it. */
  readonly body: string;
  /**
   * The learner's own form beside the one the other side used, where there is
   * a pair to show. Both are the dictionary's or the learner's; neither is
   * this module's.
   */
  readonly evidence: readonly { readonly said: string; readonly form: string | null }[];
  /**
   * Why it most likely happened, where the run carries enough to guess and
   * the guess is worth having (`lib/scenes/diagnose.ts`). Absent rather than
   * padded: a screen that says "why" about everything is a screen nobody
   * believes about anything.
   */
  readonly hunch?: Hunch;
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

export function reviewOf(_scene: SceneSpec, state: SceneState): SceneReview {
  /*
    The turns that were turns. A fragment and an echo cost no patience and
    earn no rating (`advance`, `gradesFor`), and counting them here would tell
    a learner they said fourteen things when they said nine.
  */
  const turns = state.turns.filter((t) => t.reading !== "fragment" && t.reading !== "echo");
  /*
    TURNS THAT ANSWERED SOMETHING, NOT TURNS WHOSE WORDS WERE RECOGNISED.

    The first version counted everything that was not the repair phrase, so a
    learner who met no beat at all was told "19 of your 21 turns were
    understood" over a list of six things left undone. Their Estonian was
    read, which is worth saying, and it is not what "understood" means to the
    person reading it: they answered nothing and the sentence told them they
    had. What counts is a turn the beat took something from.
  */
  const landed = turns.filter((t) => t.reading === "complete" || t.met.some(Boolean));
  const read = turns.filter((t) => t.reading !== "unrecognised" && t.reading !== "english");
  const slips = turns.flatMap((t) => t.slips ?? []);

  const notes = [
    ...caseNotes(slips, state),
    ...personNote(slips),
    ...formNote(slips),
    ...spellingNote(slips),
    ...englishNote(turns.filter((t) => t.reading === "english").length),
  ];

  return {
    lead: lead({
      turns: turns.length,
      landed: landed.length,
      read: read.length,
      slips: slips.length,
      spellings: slips.filter((s) => s.kind === "spelling").length,
      notes: notes.length,
    }),
    notes,
  };
}

function lead(n: {
  turns: number; landed: number; read: number; slips: number; spellings: number; notes: number;
}): string {
  if (n.turns === 0) return "Nothing was said this time, which is a fine way to find out what a scene is like.";

  /*
    Nothing landed. Saying what did happen is still worth more than a count
    of nothing, and it is true: the words were Estonian and they were read.
    The way in goes with it, because a learner who got nowhere needs the
    button rather than a figure.
  */
  if (n.landed === 0) {
    const seen = n.read === n.turns
      ? "Your Estonian was read every time. None of it was what was being asked for. "
      : n.read > 0
        ? `${n.read} of your ${n.turns} turns were read as Estonian, and none of them was what was asked for. `
        : "";
    return `${seen}Nothing landed this time. The word button hands you one of the beat's own words, `
      + "and telling them you have not followed gets it handed over too.";
  }

  const all = n.landed === n.turns;
  const opener = all
    ? n.turns === 1
      ? "The one thing you said answered what was asked."
      : `Every one of your ${n.turns} turns answered what was asked.`
    : `${n.landed} of your ${n.turns} turns answered what was asked.`;
  if (n.slips === 0) {
    return n.notes === 0
      ? `${opener} Nothing needed putting right, which is rarer than it sounds.`
      : opener;
  }
  /*
    ENDING OR SPELLING, WHICHEVER IT ACTUALLY WAS. The line said "ending or
    spelling" whatever the run held, which is the app hedging about something
    it knows: a dropped diacritic is a keyboard and a wrong case is a gap, and
    a learner who made one of them should not be told it might have been the
    other.
  */
  const [one, several] = n.spellings === n.slips
    ? ["spelling", "spellings"]
    : n.spellings === 0
      ? ["ending", "endings"]
      : ["ending or spelling", "endings and spellings"];
  return n.slips === 1
    ? `${opener} One ${one} was off, and it did not stop the conversation.`
    : `${opener} ${n.slips} ${several} were off, and not one of them stopped the conversation.`;
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
function caseNotes(_slips: readonly Slip[], state: SceneState): ReviewNote[] {
  const byCase = new Map<CaseKey, Slipped[]>();
  for (const row of caseSlips(state)) {
    byCase.set(row.slip.grammCase!, [...(byCase.get(row.slip.grammCase!) ?? []), row]);
  }
  return [...byCase.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, rows]) => {
      const spec = caseByKey(key);
      const plain = CASE_NOTES.find((n) => n.key === key)?.plain;
      /*
        WHAT THE ENDING IS FOR, AND ONCE.

        The body used to run `plain` and `englishHook` together, and for the
        illative those two are "into" and "into.", so the screen read "It is
        the ending for into. into." Two fields saying one thing is a sentence
        nobody reads past. The clause is `plainAsk`'s, which is the one table
        of what a slot is asking for in the words somebody would use out loud,
        so this review and the card the same learner meets tomorrow explain
        the ending the same way.
      */
      const clause = plainAsk(key);
      const many = rows.length > 1;
      return {
        id: `case:${key}`,
        heading: headingFor(plain, spec?.suffix),
        term: spec ? `${spec.et} ${MIDDOT} ${spec.question}` : undefined,
        body: [
          many
            ? `You reached for a different ending ${rows.length} times.`
            : "You reached for a different ending here.",
          clause ? `This is the one to use ${clause}.` : "",
        ].filter(Boolean).join(" "),
        evidence: rows.slice(0, EVIDENCE_SHOWN).map((r) => ({ said: r.slip.said, form: r.slip.form })),
        ...hunchFor(key, rows),
      };
    });
}

/** The separator this app uses in a label, so no dash reaches a reader. */
const MIDDOT = "\u00b7";

/**
 * The heading, which says what the ending is for rather than what it is called.
 *
 * READ OFF `CASES` RATHER THAN BRANCHED ON A KEY. The three principal parts
 * carry no suffix, so calling one of them an ending would teach something
 * false about the language, and `CaseSpec.suffix` is the one place that fact
 * already lives.
 */
function headingFor(plain: string | undefined, suffix: string | undefined): string {
  if (!plain) return "The form this one wanted";
  return suffix ? `The ending for “${plain}”` : `The form for “${plain}”`;
}

/** One case slip, with the case the question before it wanted. */
interface Slipped {
  readonly slip: Slip;
  readonly before: CaseKey | null;
}

/**
 * Every case slip in the order it happened, each carrying what the question
 * before it wanted.
 *
 * **In turn order rather than keyed on the word**, which is the version this
 * was written as first and is wrong the moment a learner slips on the same
 * spelling twice: the carry-over reading is about the moment it happened,
 * and two turns are two moments. A slip on the first turn has nothing before
 * it and carries null, which `diagnose` reads as no evidence rather than
 * as a no.
 */
function caseSlips(state: SceneState): Slipped[] {
  const out: Slipped[] = [];
  let previous: CaseKey | null = null;
  for (const turn of state.turns) {
    for (const slip of turn.slips ?? []) {
      if (slip.kind === "case" && slip.grammCase) out.push({ slip, before: previous });
    }
    const asked = (turn.slips ?? []).find((s) => s.kind === "case")?.grammCase;
    if (asked) previous = asked;
  }
  return out;
}

/**
 * The hunch for a case, off the first slip that carries one. The first rather
 * than the commonest, because a reason is about the moment it happened and
 * the transcript has that moment.
 */
function hunchFor(wanted: CaseKey, rows: readonly Slipped[]): { hunch?: Hunch } {
  for (const row of rows) {
    const hunch = diagnose(wanted, row.slip.reached, { grammCase: row.before });
    if (hunch) return { hunch };
  }
  return {};
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
    heading: "The verb needed a person on it",
    body: "You used the dictionary form where the sentence wanted a person. "
      + "Estonian builds all six off the first person: take the -n off it, add the ending for who is doing it.",
    evidence: rows.slice(0, EVIDENCE_SHOWN).map((s) => ({ said: s.said, form: s.form })),
    hunch: diagnosePerson(),
  }];
}

/** An ending the word does not have, on a stem that was plainly right. */
function formNote(slips: readonly Slip[]): ReviewNote[] {
  const rows = slips.filter((s) => s.kind === "form");
  if (rows.length === 0) return [];
  return [{
    id: "form",
    heading: "An ending this word does not take",
    body: "The stem was right, so it was understood. Estonian glues its endings onto the genitive, "
      + "which is why that one form is the one worth learning first: eleven cases fall out of it.",
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
    heading: "A letter or two out",
    body: "Understood as it stood. The row of letters under the box types the ones "
      + "an English keyboard has no key for.",
    evidence: rows.slice(0, EVIDENCE_SHOWN).map((s) => ({ said: s.said, form: s.form })),
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
    body: "That happens on the street too. Holding out in Estonian for one more turn is most of what "
      + "this is practice for, and the word button hands you one of the beat's own words when you are stuck.",
    evidence: [],
  }];
}
