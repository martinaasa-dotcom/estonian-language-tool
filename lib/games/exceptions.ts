import { buildCloze, mentions } from "@/lib/estonian/cloze";
import { gapForms } from "@/lib/estonian/gapForms";
import {
  KIND_NOTES, type ExceptionKind, type WordException,
} from "@/lib/estonian/exceptions";
import { slotLabel } from "@/lib/srs/slots";

/**
 * THE ROUND THAT DRILLS THE WORDS THE PATTERN DOES NOT REACH.
 *
 * `/grammar/exceptions` is the list; this is what to do with it, which is the
 * same split `/dictionary/common` and `/review/common` already make. Reading a
 * list of unpredictable forms teaches nobody one.
 *
 * THREE RUNGS, AND THEY ARE THE LADDER `lib/learn/ladder.ts` ALREADY ARGUES FOR
 * rather than a second progression: meet it, produce it, use it. A learner is
 * shown the form and what it departs from, then asked to type it cold, then
 * asked for it inside a sentence a lexicographer wrote. The last rung is where
 * the form stops being a fact and becomes a word, and it is offered only where
 * the dictionary holds a sentence carrying that very form: a gap this app made
 * up would be this app writing Estonian (ADR-005), and a rung that is sometimes
 * absent is better than one that is sometimes invented.
 *
 * A PASS AT A TIME, so the rungs space themselves. Every word is met, then
 * every word is produced, then every word is used, which puts the gap between
 * meeting a form and being asked for it at the size of the round rather than at
 * one card. That is `requeue`'s argument in `lib/srs/queue.ts` and the reason
 * the learn ladder waits five words: an answer given four seconds after the
 * answer was shown is reading, not retrieval.
 *
 * MEETING WRITES NOTHING. A card you have never seen cannot be recalled, only
 * met, so the first rung grades nothing at all, exactly as the first sight of a
 * word in review does. What the other two write goes through `gradeCard` like
 * every other mode (ADR-016), carrying the slot that was actually asked, so the
 * illative somebody cannot produce here lands in the same weakest-case chart as
 * the illative they cannot produce on a card.
 *
 * Pure: no React, no Prisma, no clock. What word to ask about is a database
 * question and it is the page's.
 */

export type ExceptionRung = "meet" | "produce" | "use";

/** One word with one of its exceptions, and everything a screen needs for it. */
export interface ExceptionWord {
  readonly lexemeId: string;
  readonly lemma: string;
  readonly translation: string;
  readonly pos: string;
  readonly exception: WordException;
  /**
   * The card this grades, where the learner holds one.
   *
   * Null is an ordinary answer rather than a gap: the round draws from the
   * dictionary, so it will often ask about a word nobody has a card for, and
   * `/review/emoji` gives the same answer about the same situation. Nothing is
   * written for those, which is honest, since there is no schedule to move.
   */
  readonly cardId: string | null;
  /** Every spelling of this word, to the slots that claim it. `formIndex`. */
  readonly index: Readonly<Record<string, readonly string[]>>;
  /**
   * The word's own form rows, for `gapForms`.
   *
   * What a gap may hide is one answer for the whole app and it is not this
   * module's to decide (`lib/estonian/gapForms.ts`). This narrows that answer
   * to the exception being asked about; it may not widen it.
   */
  readonly forms: readonly { formType: string; value: string; morphCode?: string | null }[];
  /** Sentences a lexicographer wrote that hold the wanted form. */
  readonly sentences: readonly string[];
}

export interface ExceptionTask {
  /** Stable per word, slot and rung, so a round can be deduplicated. */
  readonly id: string;
  readonly rung: ExceptionRung;
  readonly lexemeId: string;
  readonly cardId: string | null;
  readonly lemma: string;
  /**
   * The English gloss, or null where printing it would hand the answer over.
   *
   * Thirty-odd entries are glossed with a word the answer is spelled like:
   * `saun` is "sauna" and its short illative is `sauna`, so the meaning printed
   * beside the word answered the question. `npm run audit:questions` is what
   * found it, which is what that check exists for. The produce rung drops the
   * line and keeps the word; the gap rung has no rung left, since the meaning
   * is the only cue it has.
   */
  readonly translation: string | null;
  readonly kind: ExceptionKind;
  readonly slot: string;
  /** What the slot is called, Estonian name first, as everywhere. */
  readonly label: string;
  /** Every spelling that counts as right, the one to print first. */
  readonly accepted: readonly string[];
  /** The alternation, where the dictionary shows one. */
  readonly note: string | null;
  /** The other form that is also right, where there genuinely is one. */
  readonly alsoRight: string | null;
  readonly index: Readonly<Record<string, readonly string[]>>;
  /** The sentence with the form taken out. `use` only. */
  readonly gapped: string | null;
  /** The spelling that sentence carries, which is what the gap wants. */
  readonly gapForm: string | null;
}

/**
 * What the round calls the thing it is asking for.
 *
 * The slot's own name wherever the slot is a real one, which is the rule
 * everywhere else in the app: the Estonian name and the question a class asks
 * it with. The `da`-infinitive and the `tud` participle have no code of their
 * own in `CONJUGATION_SLOTS`, so `slotLabel` calls both of them "a named form",
 * which is true of every verb form there is. They take the kind's own name
 * instead, with its article off, because `markForm` prints it inside "this one
 * wanted the ...".
 */
function askLabel(exception: WordException): string {
  if (exception.slot !== "CONJUGATION") return slotLabel(exception.slot);
  return KIND_NOTES[exception.kind].title.replace(/^The /, "");
}

/** How many words one round is built from. */
export const ROUND_WORDS = 6;

/**
 * The spellings a gap may hide for this exception.
 *
 * `gapForms` decides what a gap may hide at all, because that is one answer for
 * the whole app and a second list is where two screens start disagreeing. This
 * only narrows it, to the forms this exception is about: a round about the
 * short illative may not gap the inessive out of the sentence it happened to
 * find and then file the answer under the illative.
 */
function wanted(word: ExceptionWord): string[] {
  const allowed = gapForms({ lemma: word.lemma, pos: word.pos, forms: word.forms });
  return word.exception.forms
    .map((form) => form.trim().toLowerCase())
    .filter((form) => allowed.has(form));
}

/**
 * Whether this exception is worth *asking* about, as opposed to showing.
 *
 * A card may not print its own answer, and the short illative is where that
 * happens: 1,937 of the 2,700 in the shipped dictionary are spelled like the
 * nominative, the genitive or the partitive, because that is what this case
 * does. `Euroopa` goes to `Euroopa`, so a round that asked for it would put the
 * answer at the top of its own screen, mark every learner right, and let the
 * scheduler read that as a recall. `lib/srs/cards.ts` refuses a case card on
 * exactly this test and `npm run audit:questions` is what found it here too.
 *
 * SHOWING IT IS STILL RIGHT, which is why this is a rule about the round rather
 * than about the module. The reference page prints `Euroopa · sisseütlev`
 * because a learner needs to know the short form is the plain word, and
 * `derive.ts` argues at length that suppressing it prints `Euroopasse` and
 * marks `Euroopa` wrong. Showing a form and asking for it are two decisions.
 */
export function drillable(word: ExceptionWord): boolean {
  const lemma = word.lemma.trim().toLowerCase();
  return word.exception.forms.length > 0
    && word.exception.forms.every((form) => form.trim().toLowerCase() !== lemma);
}

/** One word's tasks, in rung order. `use` is absent where no sentence carries the form. */
export function tasksFor(word: ExceptionWord): ExceptionTask[] {
  const ex = word.exception;
  /** The gloss, unless it says the answer. `mentions` is the whole-word test. */
  const meaningFor = (answers: readonly string[]): string | null =>
    answers.some((answer) => mentions(word.translation, answer)) ? null : word.translation;

  const base = {
    lexemeId: word.lexemeId,
    cardId: word.cardId,
    lemma: word.lemma,
    translation: meaningFor(ex.forms),
    kind: ex.kind,
    slot: ex.slot,
    label: askLabel(ex),
    accepted: ex.forms,
    note: ex.note,
    alsoRight: ex.ruleFormIsAlsoRight ? ex.ruleForm : null,
    index: word.index,
  };
  const key = `${word.lexemeId}:${ex.kind}`;

  const out: ExceptionTask[] = [
    { ...base, id: `${key}:meet`, rung: "meet", gapped: null, gapForm: null },
  ];

  // Nothing to type where the dictionary holds no form, which is the word with
  // no plural: there is a fact to meet and no answer to produce.
  if (ex.forms.length > 0) {
    out.push({ ...base, id: `${key}:produce`, rung: "produce", gapped: null, gapForm: null });

    for (const sentence of word.sentences) {
      const cloze = buildCloze(sentence, wanted(word));
      if (!cloze) continue;
      /*
        THE SENTENCE HAS TO NAME THE FORM ON ITS OWN.

        `arsti` is the short illative of `arst` and it is also the genitive and
        the partitive, so `Läksin ____ juurde.` gapped for the illative asks a
        learner to fill in a genitive and then tells them it was the
        sisseütlev. Two thirds of the short illatives in this dictionary are
        spelled like a principal part, because that is what the case does, so
        this is the common case rather than the odd one.

        The rule is `readCase`'s, which `lib/srs/cards.ts` applies to exactly
        this question: exactly one slot claims the spelling, or no card. The
        index is the word's own (`formIndex`), and an empty one refuses the
        rung rather than guessing, since a caller that did not build it knows
        nothing about the word rather than nothing being ambiguous.

        The produce rung is untouched, and deliberately: there the question
        names the case and the answer is a form, which is what every case card
        in the app asks. It is the gap that has to be readable on its own.
      */
      const claims = word.index[cloze.answer.trim().toLowerCase()] ?? [];
      if (claims.length !== 1 || claims[0] !== ex.slot) continue;
      /*
        The meaning is the gap's only cue, so a word whose gloss says the
        answer has no gap rung rather than a gap with no cue: "which word goes
        here" over a sentence and nothing else is a memory test of what the
        round was about a moment ago.
      */
      const meaning = meaningFor([cloze.answer]);
      if (!meaning) continue;
      out.push({
        ...base, id: `${key}:use`, rung: "use", translation: meaning,
        gapped: cloze.text, gapForm: cloze.answer,
        // The gap wants the spelling the sentence actually carries, which for
        // the illative is whichever of the two the writer chose.
        accepted: [cloze.answer],
      });
      break;
    }
  }

  return out;
}

/**
 * A whole round: every word met, then every word produced, then every word used.
 *
 * The order is the spacing, and it is the only thing this function decides.
 */
export function exceptionRound(words: readonly ExceptionWord[]): ExceptionTask[] {
  const byWord = words.map(tasksFor);
  const rungs: ExceptionRung[] = ["meet", "produce", "use"];
  return rungs.flatMap((rung) =>
    byWord.map((tasks) => tasks.find((t) => t.rung === rung)).filter((t): t is ExceptionTask => !!t),
  );
}

/** What a rung is asking, in the words somebody would say out loud. */
export function rungLine(task: ExceptionTask): string {
  switch (task.rung) {
    case "meet": return "This one is not what the ending would give you";
    case "produce": return "Now type it";
    case "use": return "Put it back in the sentence";
  }
}

/** The one line under a met form, saying what pattern it departs from. */
export function departureLine(task: ExceptionTask): string {
  return KIND_NOTES[task.kind].what;
}

/** Which words a round is built from, given more of them than it needs. */
export function pickWords(
  pool: readonly ExceptionWord[], size = ROUND_WORDS,
): ExceptionWord[] {
  const usable = pool.filter(drillable);
  const seen = new Set<string>();
  const taken = new Map<ExceptionKind, number>();
  const out: ExceptionWord[] = [];

  /*
    A KIND AT A TIME, RATHER THAN WHATEVER THE POOL OFFERS FIRST.

    Half the dictionary has a short illative, so taking each word's first
    exception gave a round of five illatives and one verb, three of them country
    names. That is a true sample of the area and a poor round: the value of
    meeting the exceptions is meeting the *kinds*, and one shape six times over
    is the fault the flash round had when it asked for the sisseütlev seven
    times in ten.

    Greedy on the least-used kind, and stable within it, so a caller that has
    already narrowed to one kind (which is what each kind's own page sends) gets
    exactly the pool order back.
  */
  while (out.length < size) {
    let best: ExceptionWord | undefined;
    for (const word of usable) {
      // One exception per word per round. A word with four of them would
      // otherwise be the whole round, and the second rung of the second one is
      // the first one's answer sitting on the screen.
      if (seen.has(word.lexemeId)) continue;
      if (!best || (taken.get(word.exception.kind) ?? 0) < (taken.get(best.exception.kind) ?? 0)) {
        best = word;
      }
    }
    if (!best) break;
    seen.add(best.lexemeId);
    taken.set(best.exception.kind, (taken.get(best.exception.kind) ?? 0) + 1);
    out.push(best);
  }
  return out;
}
