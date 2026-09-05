/**
 * What the dictionary found in a learner's turn, and nothing else.
 *
 * This is the half of a scene with no model in it (`docs/19-situations.md` §8),
 * and the type system is what keeps it that way: `readTurn` is the only
 * producer of `Evidence` and `advance` is its only consumer, so a caller
 * holding a model's opinion about whether somebody was understood cannot
 * satisfy the type. That is `buildOptions` taking a parsed `Government` rather
 * than a case key, pointed at a conversation.
 *
 * Every requirement is decided by a string comparison against something the
 * dictionary vouches for, assembled once into a `TurnContext` by the caller:
 * a form of a word, a case of a word through `caseAnswer`, a value off the
 * role card, a question word, the negator, a pronoun of the expected register.
 * None of that needs a network, a database or a clock.
 *
 * FIVE READINGS RATHER THAN TWO, which is most of what makes this a
 * conversation instead of a marker. "Understood, and you left out the bit I
 * asked for" is what a receptionist actually says and no drill in this app has
 * ever imitated it; "several words I know, none of them the point" is a
 * learner who said something real that the scene did not anticipate, and it
 * gets a narrower re-ask and a report button rather than "say again"; and a
 * turn written in English is recognized as English, because telling somebody
 * "I did not understand" when they wrote a clear English sentence is a lie.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { looksLikeSentence } from "@/lib/estonian/writing";
import { LOST } from "./catalogue";
import { fold } from "@/lib/estonian/fold";
import type { CaseKey } from "@/lib/estonian/types";
import { words, type Lexicon } from "./lexicon";
import { caseKeyFor, caseOfForm } from "./lexicon";
import { foldedOnly, nearlyInflected, nearlySpelled, personAsked } from "./nearly";
import type { BeatSpec, Requirement } from "./types";

/**
 * How a turn was read. The order below is the order they are tested in, and
 * three of them are decided before any requirement is looked at.
 */
export type TurnReading =
  /** Every requirement met. The scene advances and the other side answers. */
  | "complete"
  /** Some met. They answer, and ask again for the part that was missing. */
  | "incomplete"
  /** Nothing met, and most of the words vouched: real Estonian, wrong target. */
  | "offtarget"
  /** Nothing met and little vouched. The repair move: they did not catch it. */
  | "unrecognised"
  /** Written in English. Counted, answered in character, never scolded. */
  | "english"
  /** Their own line handed back. Answered once, and advances nothing. */
  | "echo"
  /** One word where a person would have said a sentence. A look, and a wait. */
  | "fragment"
  /**
   * They said they are not following. Answered with the word they need, and
   * never with the same question a third time.
   */
  | "lost"
  /**
   * A no, on a beat that has something else to offer. Not a miss and not the
   * beat met: the other side counters, once, and only a second no is the
   * learner saying it will not do. Read only where the beat carries a
   * `counter`, so a no anywhere else is whatever the requirements make it.
   */
  | "declined";

/** One word of a turn, and whether the scene's own list could vouch for it. */
export interface TurnWord {
  readonly word: string;
  readonly vouched: boolean;
}

/**
 * A right thought in a slightly wrong shape, understood anyway.
 *
 * `lib/scenes/nearly.ts` says what qualifies. `said` is what the learner
 * wrote and `form` is what the other side says back, read off the dictionary
 * and never made here; null where the dictionary holds no form to say, and
 * then the slip is understood and not recast. A case slip carries the case
 * so the review log can file it beside the same case missed on a card.
 */
export interface Slip {
  readonly kind: "spelling" | "case" | "form" | "person";
  readonly said: string;
  readonly form: string | null;
  readonly lemma: string;
  /** The case the beat wanted, on a case slip. */
  readonly grammCase?: CaseKey;
  /**
   * The case the learner actually reached for, where exactly one case of
   * this word is spelled that way (`caseOfForm`). Absent where the spelling
   * is shared, or invented, and then the review says which case was wanted
   * and nothing about why. It is what `diagnose` reads, and what the review
   * log files as the confusion it is.
   */
  readonly reached?: CaseKey;
}

/**
 * What the dictionary found. The only thing that can advance a scene.
 *
 * `met` is parallel to the beat's `needs` rather than a set of ids, because a
 * beat can ask for two things of the same kind and the re-ask has to be able
 * to name which one is missing.
 */
export interface Evidence {
  readonly reading: TurnReading;
  /** One per requirement, in the order the beat asked them. */
  readonly met: readonly boolean[];
  /** The indices of the requirements not met, for a narrow re-ask. */
  readonly missing: readonly number[];
  /** Every word of the turn, marked. The debrief prints this. */
  readonly words: readonly TurnWord[];
  /**
   * The words that satisfied a requirement, in the order the beat asked, and
   * only where a requirement is about a word: a form of a lemma, a case, a
   * value off the card. What the other side repeats back ("Poodi.") is one of
   * these, which is what keeps the repeat the learner's own word rather than
   * anything this module chose.
   */
  readonly matched: readonly string[];
  /**
   * Every word that satisfied a requirement, unfiltered.
   *
   * `matched` is the same list narrowed to what is worth saying back, which is
   * the right question for an echo and the wrong one for evidence: `maksta` out
   * of `Ma tahan maksta` is not a thing a waiter repeats and it is still the
   * word that met the beat. This is what `addsEvidence` weighs, so a turn is
   * credited with a second beat on the strength of a word rather than on the
   * strength of a word somebody would repeat.
   *
   * A requirement met by something that is not a word (a question mark, small
   * talk, the negator, the register) contributes nothing here, which is the
   * whole of why the cascade cannot run on one.
   */
  readonly satisfiedBy: readonly string[];
  /**
   * What was understood despite itself, one per requirement met that way.
   * Empty on a turn that was right, and on one that was not understood at
   * all: a slip is only ever recorded on a requirement that was met.
   */
  readonly slips: readonly Slip[];
  /**
   * A question the learner asked: the question word they used, or `?` where
   * there was only the mark. Null where the turn asked nothing. What
   * `asideFor` reads to give the other side something to say about it
   * before their own move, whether the beat asked for the question (then
   * the answer is the beat's own, banked) or not (then it is whatever the
   * other side can say).
   */
  readonly asked: string | null;
}

/**
 * Everything the marker needs, resolved from the dictionary by the caller.
 *
 * A struct rather than a pile of parameters because the caller assembles all
 * of it in one query and because the alternative is this module resolving a
 * lemma to its forms, which would put a database inside the one function that
 * may never have one.
 */
export interface TurnContext {
  readonly lexicon: Lexicon;
  /** Every form of the question words the course teaches. */
  readonly questionWords: ReadonlySet<string>;
  /** Every form of the negator. */
  readonly negators: ReadonlySet<string>;
  /** Every form of the pronoun this scene's register expects. */
  readonly registerForms: ReadonlySet<string>;
  /** Prop slot to every spelling that counts as that value, off the role card. */
  readonly data: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Prop slot to the lemmas behind a drawn word, so a datum that names a case
   * can be read through the case table. Absent on a caller that deals no
   * words, and then a cased datum reads like a plain one.
   */
  readonly dataLemmas?: ReadonlyMap<string, readonly string[]>;
  /** The line the other side just said, for the echo rule. */
  readonly previous: string;
  /**
   * Whether a word is a finite verb the scene knows, for the shape rule.
   * `Pea valutab.` is two words and a sentence, and `looksLikeSentence` alone
   * wants three: it was written for the writing exercise, to refuse a bare
   * form before a call is spent, and it read a subject with its verb as a
   * fragment here. The same function retrieval uses to tell a clause from a
   * label under a headword.
   */
  readonly hasFiniteVerb: (word: string) => boolean;
}

/**
 * English function words, for telling English from unreadable Estonian.
 *
 * §8 says a turn with no Estonian in it is recognized as English rather than
 * as Estonian nobody could read, because those are different things. Nothing
 * else in this module can tell them apart: an unvouched word is unvouched
 * whichever language it is in.
 *
 * A closed list of function words rather than a guess about spelling, and
 * function words rather than content words, because "appointment" is a word a
 * learner might be reaching for and "I don't" is not. English is the one
 * language this project may write (ADR-005), which is what makes a list here
 * allowed at all; the same latitude `lib/copy/voice.ts` takes.
 *
 * Two of them, so a single loan word inside an Estonian sentence is not read
 * as a turn in English.
 */
const ENGLISH = new Set([
  "a", "an", "and", "are", "at", "but", "can", "cannot", "did", "do", "does",
  "dont", "for", "from", "have", "how", "i", "in", "is", "it", "me", "my",
  "not", "of", "on", "or", "please", "she", "sorry", "that", "the", "there",
  "they", "this", "to", "was", "we", "what", "when", "where", "who", "why",
  "will", "with", "would", "you", "your",
]);
const ENGLISH_FLOOR = 2;

/**
 * Half the words vouched is the line between "real Estonian, wrong target" and
 * "I did not catch that".
 *
 * Drawn at a half rather than at a threshold with more decimal places in it
 * because the two readings differ in what the other side *says* rather than in
 * anything scored: one asks a narrower question and the other asks again. A
 * turn on the boundary gets a re-ask either way and neither is a mark.
 */
const VOUCHED_SHARE = 0.5;

/**
 * Reads one turn. The only producer of `Evidence`.
 *
 * The three readings that are decided before any requirement is looked at are
 * decided in this order, and each ordering is a decision.
 *
 * English leads, because a turn in English satisfies no requirement and would
 * otherwise be reported as Estonian nobody could read.
 *
 * The echo comes next and it closes a real hole: the other side's line is full
 * of vouched words, so handing it straight back would satisfy several
 * requirements at once. A turn whose words are all in the line above it is
 * answered in character, once, and advances nothing.
 *
 * The fragment comes last of the three and *before* the requirements, which is
 * the half that matters: on a beat that wants a sentence, the one required word
 * on its own would otherwise be a complete turn, and a learner could finish a
 * scene without ever building one. It is not marked wrong. It gets the response
 * a person gives, which is a look and a wait.
 */
export function readTurn(
  text: string,
  beat: BeatSpec,
  context: TurnContext,
): Evidence {
  const spoken = words(text);
  /*
    Vouched exactly, or vouched with the diacritics folded away: `koik` is a
    word the scene knows, typed on a keyboard with no õ, and counting it as
    unknown is what tipped a clear turn into "I did not catch that".
  */
  const marked = spoken.map((word) => ({
    word,
    vouched: context.lexicon.forms.has(word) || context.lexicon.folded.has(fold(word)),
  }));

  const found = beat.needs.map((need) => satisfies(need, text, spoken, context));
  const met = found.map((hit) => hit !== null);
  const missing = met.flatMap((ok, i) => (ok ? [] : [i]));
  /*
    What is worth repeating back: a case form, a value off the card, and a
    word that answered a one-word question. A word out of a sentence is not,
    since `Ma tahan maksta` met the bill beat on `maksta` and "Maksta." is
    not a thing a waiter says. Where the word came with a slip, what is
    repeated is the recast, the word the way the other side would say it,
    which is the one correction a conversation can make without stopping.
  */
  const matched = found.flatMap((hit, i) => {
    const need = beat.needs[i];
    if (!hit || hit === YES || !need) return [];
    if ((need.kind === "lemma" || need.kind === "anyOf") && beat.shape !== "word") return [];
    return [hit.slip?.form ?? hit.word];
  });
  /*
    Every word a requirement was met by. Unfiltered, because this answers
    "what did this turn actually supply" rather than "what is worth saying
    back", and `addsEvidence` needs the first.
  */
  const satisfiedBy = found.flatMap((hit) => (hit && hit !== YES ? [hit.word] : []));
  const slips = found.flatMap((hit) => (hit && hit !== YES && hit.slip ? [hit.slip] : []));
  /*
    A question the beat did not ask for. A person caught off guard by one
    still answers it before going on, and this is what tells the reply that
    one was asked and with which word. Not on a beat that wanted a question,
    because there the question is the turn.
  */
  const questionWord = spoken.find((word) => context.questionWords.has(word)) ?? null;
  const asked = questionWord ?? (text.includes("?") ? "?" : null);
  const shape = (reading: TurnReading): Evidence =>
    ({ reading, met, missing, words: marked, matched, satisfiedBy, slips, asked });

  /*
    No letters at all is nothing anybody could read, unless the beat wanted a
    value and got one: `14:30` on its own is how people answer "what time",
    `words()` returns letters, and the datum rule above already found it.
  */
  if (spoken.length === 0) return shape(missing.length === 0 ? "complete" : "unrecognised");
  if (isEnglish(spoken, marked)) return shape("english");
  /*
    Not on a beat whose answer *is* the other side's line. `Tere!` is answered
    with `Tere!` and `Head aega!` with `Head aega!`, and reading either as
    parroting told a learner who had said goodbye perfectly that they had not
    been understood. Found the day the echo rule was first handed the other
    side's line rather than the learner's own previous turn, which is what it
    had been comparing against all along.
  */
  const phraseBeat = beat.move === "greet" || beat.move === "close";
  if (!phraseBeat && isEcho(spoken, context.previous)) return shape("echo");
  /*
    A NO ON AN OFFER IS A NO, WHATEVER ELSE IS IN THE TURN. `Ei sobi` holds a
    form of `sobima`, which is the word that accepts the offer, so read by the
    requirements alone it would accept it. Before them, on a beat that has a
    counter to make, and with nothing marked met, because a turn that
    declined is not evidence the learner produced the word the beat wanted.
  */
  if (beat.counter && spoken.some((word) => context.negators.has(word))) {
    return {
      reading: "declined", met: beat.needs.map(() => false),
      missing: beat.needs.map((_, i) => i), words: marked, matched: [], satisfiedBy: [], slips: [], asked: null,
    };
  }
  /*
    THEY SAID THEY ARE NOT FOLLOWING, AND THAT IS NOT A FAILED TURN.

    It is the moment somebody decides whether they are stupid or simply
    learning, and answering it with the same question again is a machine
    telling them the problem is them. Read before the fragment, because
    `Ma ei saa aru` is a sentence and `ei tea` is two words, and after
    everything the beat could have been met by, since a turn that answered
    the question is an answer whatever else is in it.

    Not on a beat that wanted a no: there `ei` is the answer, and reading
    the answer as a cry for help would be the opposite of understanding it.
  */
  const wantsNo = beat.needs.some((need) =>
    need.kind === "negation" || (need.kind === "anyOf" && need.of.some((o) => o.kind === "negation")));
  if (missing.length === beat.needs.length && !wantsNo && isLost(spoken, context)) {
    return shape("lost");
  }

  /*
    A fragment is Estonian the scene knows, cut short. Two words it cannot
    vouch for at all are not a short answer, they are a turn nobody could
    read, and answering `xyzzy blorp` with "Jah?" as though the rest of the
    sentence were coming is the look-and-wait printed at the wrong person.

    AND A PHRASE THAT ANSWERS THE QUESTION IS NOT A FRAGMENT. The rule exists
    so that the one required word on its own cannot finish a beat that wanted
    a sentence, and it was written as "no finite verb", which read `Neljal
    korrusel` as a learner who had not finished talking. Asked which floor,
    that is the whole answer, and anybody on the phone would take it: a
    landlord who says "Jah?" and waits after it is waiting for a verb nobody
    was going to supply. So a turn of two or more words that meets everything
    the beat asked for is an answer, and a single word, or a phrase that
    misses the point, is still what it was.
  */
  const anyVouched = marked.some((w) => w.vouched);
  const sentence = looksLikeSentence(text)
    || (spoken.length >= 2 && spoken.some((word) => context.hasFiniteVerb(word)))
    // `Kui kaua?` is a whole question, and a question is a whole turn.
    || text.trim().endsWith("?")
    || (spoken.length >= 2 && missing.length === 0);
  if (beat.shape === "sentence" && anyVouched && !sentence) return shape("fragment");

  if (missing.length === 0) return shape("complete");
  if (missing.length < beat.needs.length) return shape("incomplete");

  const vouched = marked.filter((w) => w.vouched).length;
  return shape(vouched >= marked.length * VOUCHED_SHARE ? "offtarget" : "unrecognised");
}

/** A requirement met by something other than a word: a question mark, small talk. */
const YES = "\u0001";

/** A requirement met by a word: the word, and what slipped on the way, if anything. */
interface Hit {
  readonly word: string;
  readonly slip?: Slip;
}

/**
 * Whether one requirement is met, and by which word. Every branch is a
 * comparison against the dictionary. Null is not met; `YES` is met by
 * something that is not a word to repeat back.
 *
 * UNDERSTOOD BEFORE CORRECT. Each word-shaped branch asks three questions in
 * order: is the form here exactly; is it here with a slip of the pen
 * (`nearlySpelled`); and, for a case, is the *word* here in some other case.
 * Every yes is the requirement met, because every one of them is a turn a
 * person would understand, and the slip travels with the hit so the other
 * side can say the word back properly and the debrief can list it. What
 * stays a no is a different word, which is not a slip but a miss.
 */
function satisfies(
  need: Requirement,
  text: string,
  spoken: readonly string[],
  context: TurnContext,
): Hit | typeof YES | null {
  const exact = (forms: ReadonlySet<string> | undefined): string | null =>
    forms === undefined ? null : spoken.find((word) => forms.has(word)) ?? null;
  const nearly = (forms: ReadonlySet<string> | undefined): { said: string; form: string } | null => {
    if (forms === undefined) return null;
    for (const said of spoken) {
      const form = nearlySpelled(said, forms);
      if (form) return { said, form };
    }
    return null;
  };
  /*
    A diacritic folded away, and nothing looser. What the case branch asks
    for, since there a wrong ending is a case rather than a slip of the pen.
  */
  const folded = (forms: ReadonlySet<string> | undefined): { said: string; form: string } | null => {
    if (forms === undefined) return null;
    for (const said of spoken) {
      const form = foldedOnly(said, forms);
      if (form) return { said, form };
    }
    return null;
  };
  /*
    An ending the word does not have, on a stem that is plainly its own.
    Asked last, and only of words the scene's whole list cannot vouch for,
    which is what keeps a real word from being read as a mangled other one.
  */
  const vouched = (word: string) =>
    context.lexicon.forms.has(word) || context.lexicon.folded.has(fold(word));
  const inflected = (forms: ReadonlySet<string> | undefined): { said: string; form: string } | null => {
    if (forms === undefined) return null;
    for (const said of spoken) {
      const form = nearlyInflected(said, forms, vouched);
      if (form) return { said, form };
    }
    return null;
  };

  switch (need.kind) {
    case "any":
      return YES;
    case "lemma": {
      for (const lemma of need.oneOf) {
        const forms = context.lexicon.byLemma.get(lemma);
        const hit = exact(forms);
        if (hit) return { word: hit, ...personSlip(hit, lemma, spoken, context) };
        const near = nearly(forms);
        if (near) return { word: near.form, slip: { kind: "spelling", said: near.said, form: near.form, lemma } };
      }
      /*
        A pass of its own after every candidate has been tried exactly,
        because a stem match is the weakest evidence here and a word one
        candidate holds outright beats a stem the next one shares.
      */
      for (const lemma of need.oneOf) {
        const built = inflected(context.lexicon.byLemma.get(lemma));
        if (built) return { word: built.form, slip: { kind: "form", said: built.said, form: built.form, lemma } };
      }
      return null;
    }
    case "case": {
      const key = caseKeyFor(need.lemma, need.grammCase);
      const accepted = context.lexicon.byCase.get(key);
      const forms = context.lexicon.byLemma.get(need.lemma);
      const hit = exact(accepted);
      if (hit) return { word: hit };
      /*
        THE RIGHT WORD IN THE WRONG CASE IS UNDERSTOOD. `Ma lähen pood` is
        not Estonian and nobody who hears it wonders where the person is
        going. The beat is met, the case it wanted is written down as the
        slip, and the other side says `poodi` back, off the same table every
        case card reads. Nothing is derived here: a case the table holds no
        form for is understood and not recast.

        **Before the typo rung**, because a real form of the word is a case
        rather than a slip of the pen even where the two spellings are one
        edit apart: `kõrvat` is the osastav and is one letter from `kõrvas`,
        and calling it a typo would hand the review a note about spelling
        where the learner needs one about the case.
      */
      const otherForm = exact(forms);
      const cased = (said: string) => {
        const reached = caseOfForm(context.lexicon, need.lemma, said);
        return {
          word: said,
          slip: {
            kind: "case" as const, said, form: context.lexicon.caseForm.get(key) ?? null,
            lemma: need.lemma, grammCase: need.grammCase,
            ...(reached && reached !== need.grammCase ? { reached } : {}),
          },
        };
      };
      if (otherForm) return cased(otherForm);
      const near = folded(accepted);
      if (near) {
        return { word: near.form, slip: { kind: "spelling", said: near.said, form: near.form, lemma: need.lemma } };
      }
      /*
        A form of the word in another case, a stem with an ending it does not
        have, or a spelling one letter out: all three are the word, and in a
        slot that wants a case all three are the case being wrong.
      */
      const other = folded(forms)?.said ?? inflected(forms)?.said ?? nearly(forms)?.said ?? null;
      if (other) return cased(other);
      return null;
    }
    /*
      A time is digits, and `words()` returns letters, so `11:30` never reached
      `spoken` and the offer beat could not be met by writing the time on the
      card: it was measured in a browser as three tries and the receptionist
      giving up. A spelling with a digit in it is looked for in the text itself;
      a spelling made of words, `pool kaksteist` among them, the same way, and
      a single word through the forms as before.
    */
    case "datum": {
      const accepted = context.data.get(need.slot);
      if (!accepted) return null;
      /*
        A drawn word in a named case reads exactly as a `case` requirement
        does: the case form is the answer, any other form of the word is the
        word understood in the wrong case, and the recast is the table's.
      */
      const lemmas = need.grammCase ? context.dataLemmas?.get(need.slot) ?? [] : [];
      for (const lemma of lemmas) {
        const key = caseKeyFor(lemma, need.grammCase!);
        const forms = context.lexicon.byLemma.get(lemma);
        const cased = (said: string) => {
          const reached = caseOfForm(context.lexicon, lemma, said);
          return {
            word: said,
            slip: {
              kind: "case" as const, said, form: context.lexicon.caseForm.get(key) ?? null,
              lemma, grammCase: need.grammCase!,
              ...(reached && reached !== need.grammCase ? { reached } : {}),
            },
          };
        };
        const inCase = exact(context.lexicon.byCase.get(key));
        if (inCase) return { word: inCase };
        // A real form of the word before a slip of the pen, for the reason the `case` branch gives.
        const otherForm = exact(forms);
        if (otherForm) return cased(otherForm);
        const nearCase = folded(context.lexicon.byCase.get(key));
        if (nearCase) return { word: nearCase.form, slip: { kind: "spelling", said: nearCase.said, form: nearCase.form, lemma } };
        const other = folded(forms)?.said ?? inflected(forms)?.said ?? nearly(forms)?.said ?? null;
        if (other) return cased(other);
      }
      const hit = exact(accepted);
      if (hit) return { word: hit };
      const lower = text.toLowerCase().replace(/\s+/g, " ");
      const literal = [...accepted].find((value) => (/\d|\s/.test(value)) && lower.includes(value));
      if (literal) return { word: literal };
      const near = nearly(accepted);
      if (near) return { word: near.form, slip: { kind: "spelling", said: near.said, form: near.form, lemma: near.form } };
      return null;
    }
    /*
      A question mark or a question word, and the mark counts on its own,
      because `Homme?` is a question anybody asks and has no question word in
      it. The words come from `kusisonad`, which is one of the units the
      seventeenth pass added for the words between the words: before it, "did
      they ask a question" was not a question the dictionary could answer.
    */
    case "question":
      return text.includes("?") || exact(context.questionWords) ? YES : null;
    case "negation":
      return exact(context.negators) ? YES : null;
    case "register":
      return exact(context.registerForms) ? YES : null;
    /*
      The first option that is met, and the word that met it, so the other
      side can repeat `Sobib.` back the way it repeats `Poodi.`
    */
    case "anyOf": {
      for (const option of need.of) {
        const hit = satisfies(option, text, spoken, context);
        if (hit) return hit;
      }
      return null;
    }
  }
}

/**
 * `ma tulema` for `ma tulen`: the ma-infinitive straight after a subject
 * pronoun is the dictionary form where a person was due. Understood, and
 * recast to the person the pronoun names, off the derived present, which is
 * the stored first person and a regular ending (ADR-005 amendment 1). Only
 * where the two stand together, because `ma tahan minna` is right and a
 * pronoun anywhere in the sentence says nothing about a verb elsewhere in
 * it; and only the ma-form, since the da-form after another verb is what
 * Estonian does.
 */
function personSlip(
  hit: string, lemma: string, spoken: readonly string[], context: TurnContext,
): { slip: Slip } | Record<string, never> {
  const inf = context.lexicon.infinitives.get(lemma);
  if (!inf?.has(hit)) return {};
  const at = spoken.indexOf(hit);
  if (at < 1) return {};
  const person = personAsked([spoken[at - 1]!]);
  if (!person) return {};
  const form = context.lexicon.persons.get(lemma)?.get(person) ?? null;
  if (form === hit) return {};
  return { slip: { kind: "person", said: hit, form, lemma } };
}

/**
 * Whether the turn says "I am not following".
 *
 * Two rules, both against the course's own words (`LOST`). A phrase is
 * matched whole, because a phrase is not a bag of words and `ma` on its own
 * says nothing; a verb is matched **negated**, the negator beside the form
 * the rule gives after `ei`, so `ei tea` and `ei saa aru` are caught and
 * `ma tean` is not.
 *
 * What it deliberately over-reaches on is `ei saa` without `aru`, which is
 * "I cannot" rather than "I do not understand". Both are a learner in
 * trouble on a beat where nothing else was met, and the cost of reading one
 * as the other is that they are offered the word they needed anyway.
 */
function isLost(spoken: readonly string[], context: TurnContext): boolean {
  const said = new Set(spoken);
  for (const phrase of LOST.phrases) {
    const parts = words(phrase);
    if (parts.length > 0 && parts.every((word) => said.has(word))) return true;
  }
  if (!spoken.some((word) => context.negators.has(word))) return false;
  return LOST.verbs.some((lemma) => {
    const negated = context.lexicon.persons.get(lemma)?.get("IndPrPs_");
    return negated !== undefined && said.has(negated);
  });
}

/** Two English function words and nothing the scene's list could vouch for. */
function isEnglish(spoken: readonly string[], marked: readonly TurnWord[]): boolean {
  if (marked.some((w) => w.vouched)) return false;
  return spoken.filter((word) => ENGLISH.has(word)).length >= ENGLISH_FLOOR;
}

/**
 * Whether the turn is the line above it handed back.
 *
 * Every word of the turn is in that line, and there are at least two of them:
 * a one-word turn repeating one of their words is an ordinary answer, since
 * `Neljapäev?` after they said `neljapäev` is what a person says.
 */
const ECHO_FLOOR = 2;
function isEcho(spoken: readonly string[], previous: string): boolean {
  if (spoken.length < ECHO_FLOOR || !previous) return false;
  const said = new Set(words(previous));
  return spoken.every((word) => said.has(word));
}

/** Whether this reading lets the scene move to the next beat. */
export function advances(reading: TurnReading): boolean {
  return reading === "complete";
}

/**
 * WHETHER ONE TURN MAY BE CREDITED WITH A SECOND BEAT, WHICH NEEDS SOMETHING
 * NEW IN IT.
 *
 * `replay` reads a turn that landed against the next beat too, because "Tere,
 * ma lähen poodi" greets and says where you are going and a friend who heard
 * it does not then ask where you are going. That rule was written with no
 * test of whether the turn had said two things, and a requirement can be met
 * by something that is not a word: `{ kind: "question" }` is satisfied by a
 * question mark anywhere in the text, and `{ kind: "any" }` by anything at
 * all. So any turn ending in `?` walked past every question-shaped beat
 * downstream of the one it answered, in silence, on the strength of its own
 * punctuation.
 *
 * A learner reported it from the street corner scene. They were told `Minge
 * otse edasi.`, wrote `okei, otse, ja kuhu siis?`, and were answered `Head
 * aega!`. The `otse` met the beat; the question mark then met `far`, whose
 * goal is to ask whether it is near; the scene arrived at the farewell two
 * beats later with the learner's own question never answered, and said
 * goodbye to somebody who had just asked where to go next.
 *
 * So a second beat is credited only where the turn met it with a **word the
 * beats already credited to this turn did not use**. A word rather than a
 * requirement, because that is what "they said two things" means and because
 * a mark cannot be said twice; a word not already spent, because `poodi`
 * meeting two beats is one thing said, not two.
 *
 * What it costs is a beat whose only requirement is a question or an `any`
 * being met by the same breath as the beat before it, which is the case it
 * exists to refuse. A beat that wants a question *and* something else still
 * cascades on the something else: `Tere, kus on pank?` greets and asks.
 */
export function addsEvidence(next: Evidence, spent: ReadonlySet<string>): boolean {
  return next.satisfiedBy.some((word) => !spent.has(word));
}
