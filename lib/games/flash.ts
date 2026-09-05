import { sameSpelling } from "@/lib/copy/values";
import { sentenceContaining, type Example } from "@/lib/dict/examples";
import { checkAnswer } from "@/lib/estonian/answer";
import { CASES, caseByKey } from "@/lib/estonian/cases";
import { caseFits, caseQuestionFor, type CaseSubject } from "@/lib/estonian/caseQuestion";
import { buildCloze, mentions } from "@/lib/estonian/cloze";
import { derivedVerbForms, pres1sgFrom } from "@/lib/estonian/conjugate";
import { caseAnswer, shownForms, stemsFrom } from "@/lib/estonian/derive";
import { gapForms } from "@/lib/estonian/gapForms";
import { caseIndex, tidyForm } from "@/lib/estonian/whichCase";
import { plainAsk } from "@/lib/estonian/plainAsk";
import { looksLikeSentence } from "@/lib/estonian/writing";
import { attestedForms, conjugationAnswer } from "@/lib/srs/cards";
import { CONJUGATION_SLOTS, isFormSlot, slotLabel } from "@/lib/srs/slots";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * FLASH CARDS: THE WORDS YOU HAVE MET, ASKED IN A WAY REVIEW DOES NOT ASK THEM.
 *
 * The round used to render `ReviewSession` over the learner's own cards, which
 * is the same four shapes review already uses: turn a card over, pick one of
 * four, fill a gap, type a form. The learner's report was that it "reverts back
 * to what is in the Review section", and they were right, because it was
 * review, drawn from a different queue. What was asked for instead is a word
 * already met "used in other ways too", including writing a sentence of your
 * own and hearing one and producing the form out of it, across "a huge variety
 * of case endings and grammar", until the app can be confident the word is
 * known.
 *
 * FIVE SHAPES, AND THE POOL WIDENS AS THE WORD SETTLES.
 *
 *   `recall`   English to Estonian, typed. The plainest, and the only shape a
 *              word with no forms to inflect can be asked in at all.
 *   `inflect`  The word and the question a case answers, typed. No options:
 *              producing `toas` is a different memory from picking it out of
 *              four, and picking is what stops telling you anything about a
 *              word that is nearly known.
 *   `gap`      An attested sentence with the form taken out, typed, with the
 *              meaning rather than the lemma beside it, so the sentence is
 *              what tells you which form is wanted.
 *   `heard`    The same sentence spoken and never shown. Type the form you
 *              heard. This is the one shape where the context arrives through
 *              the ear, which is where a case ending is hardest to catch, and
 *              the sentence is revealed afterwards with the form marked in it.
 *   `build`    Write your own sentence putting the word in a named form. The
 *              form is marked by string comparison against what the dictionary
 *              vouches for, never by a model (ADR-005), and where the learner
 *              reached for another form of the same word it is named.
 *
 * `shapeFor` widens the pool as the learner gets the word right: the first ask
 * is the plainest shape available and each correct answer opens the next one,
 * so `tuba` starts at "what is it in the seesütlev" and ends at "write me a
 * sentence with it". A word never gets harder than the dictionary can support:
 * a sentence shape needs an attested sentence carrying that very form, and
 * where there is none the pool simply holds fewer shapes.
 *
 * NOTHING HERE IS WRITTEN AND NOTHING IS GENERATED. Every Estonian character in
 * a task came out of Ekilex or off the app's own derivation from a stored stem,
 * which is the same latitude the cards, the grammar pages and the gap-fill
 * already take (ADR-005 amendment 1), and every task says which. Every mark is
 * a string comparison against a form the dictionary holds.
 *
 * Pure: no React, no Prisma, no clock. The rows come from the page.
 */

export type FlashShape = "recall" | "inflect" | "gap" | "heard" | "build";

/** A dictionary entry, in the shape a round needs it. */
export interface FlashWord {
  lexemeId: string;
  lemma: string;
  translation: string;
  pos: string;
  forms: readonly { formType: string; value: string; morphCode?: string | null }[];
  examples: readonly Example[];
  /**
   * The Institute's semantic type codes, as the dictionary stores them.
   *
   * Required rather than optional, which is the whole of what makes it stick:
   * `null` says the dictionary was asked and holds no classification, and a
   * caller that never asked does not compile. Without it this round asked a
   * horse for its sisseütlev and wanted `hobusesse`, which is not Estonian.
   */
  semanticTypes: string | null;
}

/** One thing a word can be asked, with the answer the dictionary vouches for. */
export interface FlashSlot {
  /** The key `Review.slot` records. A case, a verb form, or `PRODUCTION`. */
  slot: string;
  /** The form to produce. */
  value: string;
  /** The other spelling that is also right, which is only ever the illative. */
  alsoRight: string | null;
  /** Every spelling the marking lets through. Wider than what is shown. */
  accepted: readonly string[];
  provenance: "ekilex" | "derived";
}

export interface FlashTask extends FlashSlot {
  /** Stable per word and slot, so a round can be deduplicated without a counter. */
  id: string;
  /**
   * The card this grades. Every mode grades through the same log (ADR-016), and
   * the flash round asks for forms no card of this learner's may carry, which
   * is why the slot travels beside the card rather than being read off it.
   */
  cardId: string;
  lexemeId: string;
  lemma: string;
  translation: string;
  pos: string;
  shape: FlashShape;
  /** What the slot is called, Estonian name first. */
  label: string;
  /** The sentence a `gap` or `heard` task is built on. Null otherwise. */
  sentence: string | null;
  /**
   * The spelling of the word that sentence actually carries.
   *
   * Not always `value`: the illative has two right answers and a lexicographer
   * writes whichever one the sentence wanted, so a screen marking the form
   * inside the sentence has to look for the one that is in it. Null where
   * there is no sentence.
   */
  sentenceForm: string | null;
  /** The sentence with the form taken out. Null outside `gap`. */
  gapped: string | null;
  /** The pair worth printing when the answer is shown. */
  shown: readonly string[];
  /**
   * Every spelling of this word the marking can name a slot for, so a wrong
   * answer can be told what it *was* rather than only what it was not.
   */
  index: Readonly<Record<string, readonly string[]>>;
}

/** The eleven cases built on the genitive stem. The three principal parts are stored. */
const ASKABLE_CASES: readonly CaseKey[] = CASES.filter((c) => !c.principal).map((c) => c.key);

/**
 * Every slot this word can be asked in, with the form each one wants.
 *
 * A nominal is asked for its cases, a verb for the named parts a course keeps
 * apart, and anything at all can be asked to be produced from its meaning,
 * which is what keeps a phrase and an adverb askable: `Tere hommikust!` has no
 * forms to inflect and is still a thing you either can or cannot say.
 *
 * A case whose form is spelled exactly like the headword is left out, for the
 * reason `generateCards` gives at length: `kallis` in the seesütlev is
 * `kallis`, so the question would print its own answer, nobody could get it
 * wrong, and the scheduler would read every pass as a recall.
 */
export function askableSlots(word: FlashWord): FlashSlot[] {
  const out: FlashSlot[] = [];
  const lemma = word.lemma.trim().toLocaleLowerCase("et");

  /*
    AND NOT A SLOT WHOSE ANSWER IS PRINTED IN THE MEANING BESIDE IT.

    Four of the five shapes put the English gloss on the screen, so a form
    spelled like a word in that gloss is a question with its answer above the
    box. `npm run audit:questions` found fourteen of them over the shipped
    dictionary and none was visible on any one word: the illative of `salv` is
    `salve` and its gloss is "salve"; `pagan` is glossed "pagan, heathen",
    `trend` "trend, tendency", `mink` "American mink". `sameSpelling` is an
    exact comparison and catches only the first kind, which is why this is the
    whole-word test the audit itself uses.
  */
  const shownInGloss = (spellings: readonly string[]) =>
    spellings.some((form) => mentions(word.translation, form));

  /*
    Saying it from the meaning, except where the meaning is the word.

    Thirty entries in the shipped dictionary are spelled the same in both
    languages: `film`, `number`, `park`, `sport`, `minister`. The review card
    for one of those turns over and says so in words, which is the honest thing
    a flip card can do; a typed box under the English `film` is a question
    whose answer is printed above it, and answering it would grade a card and
    stretch its interval on a recall that never happened. The word is still
    asked, in its cases, where there is something to produce.
  */
  if (!sameSpelling(word.lemma, word.translation) && !shownInGloss([word.lemma])) {
    out.push({
      slot: "PRODUCTION",
      value: word.lemma,
      alsoRight: null,
      accepted: [word.lemma],
      provenance: "ekilex",
    });
  }

  if (word.pos === "VERB") {
    for (const slot of CONJUGATION_SLOTS) {
      const values = conjugationAnswer(word, slot);
      if (values.length === 0) continue;

      /*
        Every spelling that is this slot, the way the card builder joins them.
        A verb slot has parallel forms exactly as a case does: the polite
        imperative of `ütlema` is `ütelge` and `öelge`, and `ei ole` contracts
        to `pole`, which is what everybody says and writes. Reading one of them
        would mark the other wrong on the commonest verb in the language.
      */
      const said = values.map((v) => (slot.negative ? `ei ${v}` : v));
      const also = slot.alsoCode ? attestedForms(word, slot.alsoCode) : [];
      const accepted = [...new Set([
        ...said,
        // The negative is two words and `ei loe` is what anybody says, so the
        // bare form is let through too and the pair is what the answer shows.
        ...(slot.negative ? values : []),
        ...also,
      ])];
      if (shownInGloss(accepted)) continue;

      out.push({
        slot: slot.code,
        value: said[0]!,
        alsoRight: said[1] ?? also[0] ?? null,
        accepted,
        provenance: attests(word, slot.code, slot.formType) ? "ekilex" : "derived",
      });
    }
    return out;
  }

  /*
    AND NOT A CASE THIS WORD DOES NOT TAKE.

    Estonian has two sets of local cases and a word takes one: `toas` for a
    room, `hobusel` for a horse, `Saksamaal` for a country. This round shipped
    with the half of that rule a spelling can see, so it stopped asking
    `Venemaa → milles? kus?` and went on asking a horse for its sisseütlev.
    `caseFits` is the one answer, and it refuses a singular of a word that has
    no singular besides.
  */
  const stems = stemsFrom(word.forms);
  for (const key of ASKABLE_CASES) {
    if (!caseFits(key, subjectOf(word))) continue;
    const answer = caseAnswer(stems, key);
    if (!answer) continue;
    if (answer.accepted.some((f) => f.trim().toLocaleLowerCase("et") === lemma)) continue;
    if (shownInGloss(answer.accepted)) continue;
    out.push({
      slot: key,
      value: answer.value,
      alsoRight: answer.alsoRight,
      accepted: answer.accepted,
      provenance: answer.origin === "DERIVED" ? "derived" : "ekilex",
    });
  }
  return out;
}

/** Whether the dictionary itself holds this verb form, rather than a rule reaching it. */
function attests(word: FlashWord, code: string, formType: string | undefined): boolean {
  return word.forms.some(
    (f) =>
      f.morphCode === code ||
      f.formType === `EKILEX:${code}` ||
      (formType !== undefined && f.formType === formType),
  );
}

/**
 * The shapes this word and slot can actually carry, plainest first.
 *
 * A sentence shape is offered only where Ekilex recorded a sentence with that
 * very form in it and the gap builder will take it, which is the same standard
 * a gap-fill card meets. Where there is none, the pool is shorter rather than
 * padded with something invented.
 */
export function shapesFor(
  word: FlashWord, slot: FlashSlot, opts: { canSpeak: boolean } = { canSpeak: true },
): FlashShape[] {
  return shapesFrom(slot, sentenceFor(word, slot), opts.canSpeak);
}

/** The same answer for a caller that has already found the sentence. */
function shapesFrom(
  slot: FlashSlot, sentence: { et: string; form: string } | null, canSpeak: boolean,
): FlashShape[] {
  if (slot.slot === "PRODUCTION") return ["recall"];

  const out: FlashShape[] = ["inflect"];
  if (sentence) {
    out.push("gap");
    if (canSpeak) out.push("heard");
  }
  out.push("build");
  return out;
}

/**
 * The attested sentence a gap can be cut from, or nothing.
 *
 * `gapForms` is what decides whether a form may be hidden at all, which is one
 * answer for the whole app and not this round's to re-derive: it unions the
 * stored forms, the ten cases off the genitive stem and a verb's persons off
 * the stored first person, and a form outside that union is one nothing here
 * vouches for. The slot's own answer comes from the same two derivations, so
 * this agrees in nearly every case; where it does not, the sentence shapes
 * simply are not offered and the round asks the plain way.
 */
function sentenceFor(word: FlashWord, slot: FlashSlot): { et: string; form: string } | null {
  // Nothing to cut a gap out of, so nothing to work out which forms could be
  // cut. Most of the dictionary's entries carry no usage at all.
  if (word.examples.length === 0) return null;
  const hideable = gapForms(word);
  for (const form of [slot.value, slot.alsoRight]) {
    if (!form) continue;
    if (!hideable.has(form.trim().toLowerCase())) continue;
    const example = sentenceContaining([...word.examples], form);
    if (!example) continue;
    /*
      The gap builder is what decides, not a substring: it refuses a sentence
      that says the word twice, because two gaps taking one answer is a
      different exercise and the marker takes one string.
    */
    const cloze = buildCloze(example.et, [form]);
    if (!cloze) continue;

    /*
      AND A GAP MAY NOT LEAVE ANOTHER OF ITS OWN ANSWERS STANDING.

      `buildCloze` refuses a sentence that repeats the word, and it looks for
      the same string; a slot's answers are not one string. Ekilex records
      `Auto jäi porisse/porri kinni.`, which is a lexicographer writing both
      illatives of `pori`, so gapping the short one printed the long one two
      characters away and the marker took it. One sentence in the shipped
      dictionary, found by `npm run audit:questions` and invisible on any word
      but that one.

      Refused here rather than in `flashTask`, so the word falls back to being
      asked the plain way rather than dropping out of the round.
    */
    if (slot.accepted.some((spelling) => mentions(cloze.text, spelling))) continue;
    return { et: example.et, form };
  }
  return null;
}

/**
 * Which shape to ask, given how many times this word has already been right.
 *
 * The pool widens rather than the index simply advancing: at nought correct
 * answers there is one shape, at three there are four, and the rotation inside
 * that pool is what stops the same word arriving as the same question twice
 * running. A learner who has never produced the word gets the plainest ask
 * there is, and one who has had it right five times gets asked to write a
 * sentence with it.
 */
export function shapeFor(available: readonly FlashShape[], step: number): FlashShape {
  if (available.length === 0) return "recall";
  const width = Math.min(Math.max(step, 0) + 1, available.length);
  return available[Math.max(0, step) % width] ?? available[0]!;
}

/**
 * One task, or nothing where the dictionary cannot set it.
 *
 * `step` is how many correct answers this word already has behind it, which is
 * what opens the harder shapes.
 */
export function flashTask(input: {
  word: FlashWord;
  slot: FlashSlot;
  cardId: string;
  step: number;
  canSpeak?: boolean;
}): FlashTask | null {
  const { word, slot, cardId, step } = input;

  /*
    Worked out once. `shapesFor` asks whether a sentence exists and this asked
    again for the sentence itself, so every task cut two case tables and read
    the usages twice over. That is nothing on a page building ten tasks and it
    is half the cost of `npm run audit:questions`, which builds 46,851 of them.
  */
  const sentence = sentenceFor(word, slot);
  const shape = shapeFor(
    shapesFrom(slot, sentence, input.canSpeak ?? true),
    step,
  );

  /*
    The gap text is the `gap` shape's alone. `heard` is the same sentence with
    nothing on screen at all: printing it with a hole in it would turn the one
    shape where the context arrives through the ear into a gap-fill with a
    soundtrack, which is the easier exercise and not the one being asked for.
  */
  const aboutASentence = shape === "gap" || shape === "heard";
  const cloze = sentence ? buildCloze(sentence.et, [sentence.form]) : null;
  if (shape === "gap" && !cloze) return null;

  /*
    A `gap` may not print its own answer either, which is the rule
    `audit:questions` exists for. The gap shows the meaning rather than the
    lemma, so the giveaway here is an English gloss spelled like the Estonian
    form: `film`, `lamp` and `kama` are all real entries where that happens.
  */
  if (shape === "gap" && cloze && mentions(word.translation, cloze.answer)) return null;

  return {
    ...slot,
    id: `${word.lexemeId}:${slot.slot}`,
    cardId,
    lexemeId: word.lexemeId,
    lemma: word.lemma,
    translation: word.translation,
    pos: word.pos,
    shape,
    /*
      The question this word answers, not the case's own name. `kus?` is
      answered by the seesütlev and the alalütlev both, so a card wanting one
      of them that prints the adverb can be answered correctly and marked
      wrong, and a horse is a `kes` rather than a `mis`.
    */
    label: caseLabel(word, slot.slot),
    /*
      The sentence belongs to the two shapes that are about one.

      Working it out once rather than three times is a saving in the audit and
      nothing on a screen, and it must not become a change to what a screen
      shows: an `inflect` task now has a sentence in hand where a usage exists,
      and printing it would put a line under the answer that was not there
      before and, worse, would print the sentence's spelling as the answer.
      `tuppa / toasse` is the pair to show for the sisseütlev of `tuba`,
      whatever spelling a lexicographer happened to reach for.
    */
    sentence: aboutASentence ? sentence?.et ?? null : null,
    sentenceForm: aboutASentence ? sentence?.form ?? null : null,
    gapped: shape === "gap" ? cloze?.text ?? null : null,
    // Where the sentence carries the other spelling of a two-form case, that
    // is the one the learner heard and the one to be marked against first.
    shown: aboutASentence && sentence
      ? shownForms({ singular: sentence.form, alsoRight: null })
      : shownForms({ singular: slot.value, alsoRight: slot.alsoRight }),
    index: formIndex(word),
  };
}

/**
 * Every spelling of one word, and which slots claim each.
 *
 * The inverse of the two derivations, so a wrong answer can be told what it
 * was. Built once per word: a case index over fourteen cases and a verb's
 * thirteen forms are cheap, and asking per keystroke would not be.
 *
 * The strict rule from `lib/estonian/whichCase.ts` carries over unchanged. A
 * slot is named only where it is the only one spelled that way, because `tuba`
 * is its own nimetav and its own osastav and naming either would be a guess.
 */
export function formIndex(word: {
  lemma: string;
  pos: string;
  forms: readonly { formType: string; value: string; morphCode?: string | null }[];
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const claim = (spelling: string | null | undefined, slot: string) => {
    const form = tidyForm(spelling ?? "");
    if (!form) return;
    const held = out[form] ?? [];
    if (!held.includes(slot)) held.push(slot);
    out[form] = held;
  };

  if (word.pos === "VERB") {
    for (const slot of CONJUGATION_SLOTS) {
      const attested = word.forms.find(
        (f) =>
          f.morphCode === slot.code ||
          f.formType === `EKILEX:${slot.code}` ||
          (slot.formType !== undefined && f.formType === slot.formType),
      );
      if (attested) claim(attested.value, slot.code);
    }
    for (const derived of derivedVerbForms({
      lemma: word.lemma, pres1sg: pres1sgFrom(word.forms) ?? undefined,
    })) {
      claim(derived.value, derived.morphCode);
    }
    return out;
  }

  for (const [spelling, keys] of caseIndex(stemsFrom(word.forms))) {
    for (const key of keys) claim(spelling, key);
  }
  return out;
}

/** What one answer was worth, and what to say about it. */
export interface FlashMark {
  right: boolean;
  /** Three, two or one. Never Easy: this is the harder pass, not a victory lap. */
  rating: 1 | 2 | 3;
  /** The spelling of this word the learner actually wrote, where they wrote one. */
  wrote: string | null;
  /** The slot that spelling is, named only where exactly one slot claims it. */
  wroteSlot: string | null;
  /** One line, ready to print. Empty where the answer was simply right. */
  note: string;
}

/**
 * Marking one answer.
 *
 * Everything here is a comparison against a form the dictionary vouches for.
 * The middle rating is real and is why there are three: the right word in the
 * wrong ending is a near miss the learner produced, not a blank, and naming
 * which ending they wrote is the whole difference between this round and a
 * screen that can only say "not the form we asked for".
 */
export function markFlash(task: FlashTask, typed: string): FlashMark {
  const written = typed.trim();
  if (!written) {
    return { right: false, rating: 1, wrote: null, wroteSlot: null, note: "Nothing typed." };
  }

  if (task.shape === "build") return markSentence(task, written);
  return markForm(task, written);
}

/**
 * What a typed form is worth, for any round that asks for one.
 *
 * Split out of `markFlash` rather than copied, because the exceptions round
 * asks the same question about the same words: type this form. A second marker
 * is where two screens start disagreeing about whether `toast` is a slip or the
 * wrong case, and that judgement is the whole value of the paragraph below.
 *
 * `markFlash` keeps the empty answer and the sentence shape, which are its own.
 */
export interface FormAsk {
  /** Every spelling of the wanted form the dictionary vouches for. */
  accepted: readonly string[];
  /** The slot being asked for, in `Review.slot`'s vocabulary. */
  slot: string;
  /** What that slot is called, for the line a wrong answer gets. */
  label: string;
  /** Every spelling of this word, to the slots that claim it. See `formIndex`. */
  index: Readonly<Record<string, readonly string[]>>;
}

export function markForm(task: FormAsk, typed: string): FlashMark {
  const written = typed.trim();
  if (!written) {
    return { right: false, rating: 1, wrote: null, wroteSlot: null, note: "Nothing typed." };
  }

  const check = checkAnswer(written, task.accepted.join(" / "), "et");
  if (check.verdict === "correct") {
    return { right: true, rating: 3, wrote: written, wroteSlot: task.slot, note: "" };
  }

  /*
    ANOTHER ENDING IS NOT A SLIP, AND THE TWO ARE ONE KEYSTROKE APART.

    `checkAnswer` calls anything within one edit of the answer a typo and marks
    it as produced, which is right for `raamt` and wrong for every pair of
    Estonian cases: `toas` and `toast` differ by one letter and so do `toale`
    and `toalt`, `toa` and `toad`. Left in the order the other screens use it,
    this round would have told a learner who chose the seestütlev that they had
    mistyped the seesütlev, which teaches the opposite of the lesson and marks
    the answer as recalled.

    So the word's own forms are asked first. `slotOf` names a spelling only
    where exactly one slot claims it, so `tuba`, which is its own nimetav and
    its own osastav, still falls through to the reading below.
  */
  const named = slotOf(task, written);
  if (named && named !== task.slot) {
    return {
      right: false, rating: 2, wrote: written, wroteSlot: named,
      note: `That is the ${slotLabel(named)}. This one wanted the ${task.label}.`,
    };
  }

  if (check.verdict === "diacritics" || check.verdict === "typo") {
    return {
      right: true, rating: 2, wrote: written, wroteSlot: task.slot,
      note: check.note,
    };
  }

  return { right: false, rating: 1, wrote: null, wroteSlot: null, note: check.note };
}

/** Marking a sentence the learner wrote themselves. */
function markSentence(task: FlashTask, sentence: string): FlashMark {
  const accepted = new Set(task.accepted.map(tidyForm));
  const words = sentence.split(/[^\p{L}\p{M}-]+/u).map(tidyForm).filter(Boolean);
  const used = words.some((w) => accepted.has(w));

  if (used && !looksLikeSentence(sentence)) {
    return {
      right: false, rating: 2, wrote: sentence, wroteSlot: task.slot,
      note: "Right form. This one asks for a whole sentence around it.",
    };
  }
  if (used) {
    return { right: true, rating: 3, wrote: sentence, wroteSlot: task.slot, note: "" };
  }

  for (const written of words) {
    const named = slotOf(task, written);
    if (!named || named === task.slot) continue;
    return {
      right: false, rating: 2, wrote: written, wroteSlot: named,
      note: `You wrote ${written}, which is the ${slotLabel(named)}. This one wanted the ${task.label}.`,
    };
  }
  return {
    right: false, rating: 1, wrote: null, wroteSlot: null,
    note: `No form of ${task.lemma} in that sentence.`,
  };
}

/** Which slot a spelling is, where exactly one slot claims it. */
function slotOf(task: FormAsk, written: string): string | null {
  const claims = task.index[tidyForm(written)];
  return claims && claims.length === 1 ? claims[0]! : null;
}

/** What a task asks, in one line, for a screen with no room for a paragraph. */
export function askLine(task: FlashTask): string {
  switch (task.shape) {
    case "recall": return "Say it in Estonian";
    case "inflect": return "Change the form";
    case "gap": return "Fill the gap";
    case "heard": return "Type the form you hear";
    case "build": return "Write a sentence";
  }
}

/**
 * What the task is asking, said the way somebody would say it out loud.
 *
 * A learner reported the first version of this round and their words were that
 * the ask "was presented so poorly I didn't even know what it wanted me to do":
 * the card read "Put it in the lihtminevik · ma" over `kohtuma`, and the answer
 * was `kohtusin`, which is how you say it about yourself in the past. Every
 * word of that ask was true and none of it was actionable by somebody who had
 * not already met the name.
 *
 * So the name is no longer the ask. `plainAsk` in `lib/estonian/plainAsk.ts` is
 * the one table of what a slot means in plain English, the card leads with it,
 * and the Estonian name sits under it as the cross-reference it always was.
 * Null where the slot is a question about meaning rather than about a form: the
 * `recall` shape asks "how do you say this", which is already the whole
 * question, and a clause under it would be the question twice.
 */
export function plainAskFor(task: Pick<FlashTask, "shape" | "slot">): string | null {
  if (task.shape === "recall") return null;
  const clause = plainAsk(task.slot);
  if (!clause) return null;
  /*
    And nothing for `gap` and `heard`, which is a decision rather than a gap in
    the table. Those two shapes exist because the *sentence* is what says which
    form is wanted, which is the thing a learner has to do in a conversation,
    and a clause naming the form beside the gap answers the question the gap is
    asking. They are already legible: a sentence with a hole in it and a
    meaning beside it is not a screen anybody has to decode.
  */
  if (task.shape === "gap" || task.shape === "heard") return null;
  if (task.shape === "build") return `Write a sentence using it ${clause}.`;
  return `How do you say this ${clause}?`;
}

/** True where the slot is a grammatical form rather than a question about meaning. */
export const isForm = isFormSlot;

/** The English cross-reference for a case slot, where there is one. */
export function englishName(slot: string): string | null {
  return caseByKey(slot)?.en.toLowerCase() ?? null;
}

/** What the case rule needs to know about a word, in the shape it takes it. */
export function subjectOf(word: FlashWord): CaseSubject {
  return {
    lemma: word.lemma,
    semanticTypes: word.semanticTypes,
    nomSg: word.forms.find((f) => f.formType === "NOM_SG")?.value ?? null,
  };
}

/**
 * What a slot is called on this word's card.
 *
 * A case is named by the question *this* word answers, which is
 * `caseQuestionFor`'s job; everything else is the same on every word and comes
 * off the one table in `lib/srs/slots.ts`.
 */
export function caseLabel(word: FlashWord, slot: string): string {
  const spec = caseByKey(slot);
  if (!spec) return slotLabel(slot);
  return `${spec.et} · ${caseQuestionFor(spec, subjectOf(word))}`;
}
