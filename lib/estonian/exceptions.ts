import { caseByKey } from "./cases";
import { classifyGradation } from "./gradation";

/**
 * WHERE THE PATTERN STOPS BEING TRUE.
 *
 * This app teaches Estonian the way a class does: three principal parts, then
 * eleven endings on the genitive stem. That is the single most motivating fact
 * a beginner is given, and `lib/estonian/derive.ts` is built on it. It is also
 * the thing a learner gets burned by, because the app never said where it stops
 * holding. `caseAnswer` quietly prefers an attested form over the rule, so the
 * screen is right and the *model in the learner's head* is wrong: they see
 * `tuppa` printed under a heading that told them the ending is `sse`, and
 * nothing on the page says which of those two facts to trust next time.
 *
 * There are two places it stops.
 *
 * FIRST, GETTING TO THE STEM. `tuba : toa`, `aeg : aja`, `aken : akna`,
 * `asi : asja`. No rule in the language reaches the genitive from the
 * nominative: the consonant centre grades, or a vowel drops out of the middle,
 * or the stem is simply another word. Everything else in the table is built on
 * that stem, so a learner who guesses it wrong gets all eleven cases wrong at
 * once. This is the exception that costs the most and it is the one the
 * dictionary was least willing to talk about, since the entry printed
 * `astmevaheldus mm : mb` as a chip and left it there.
 *
 * SECOND, THE SLOTS THE ENDING RULE DOES NOT REACH. The short illative
 * (`tuppa`, not `toasse`), the partitive singular, the genitive plural, the
 * short partitive plural, a suppletive or absent nominative plural, and on the
 * verb the present stem, the simple past, the `da`-infinitive, the `tud`
 * participle and the polite imperative.
 *
 * NOTHING HERE IS A LIST OF WORDS. A hand-written table of exceptions would be
 * this app writing Estonian, and the first misspelling in it would ship in
 * silence and be drilled (ADR-005). So this module states, for each slot, the
 * pattern a course actually teaches, and reports every word whose stored form
 * disagrees with it. Delete every Estonian word from the comments in this file
 * and its output is identical: what it holds is suffixes, which is the same
 * latitude `cases.ts` and `conjugate.ts` already take, and the illative's is
 * read off `CASES` rather than typed, because an ending spelled twice is two
 * endings waiting to disagree.
 *
 * AND THE COPY IS HELD TO THE SAME RULE, WHICH IT WAS NOT. `KIND_NOTES` named
 * three verbs by their first person and one of the three was wrong: the
 * everyday verb for must governs the *other* infinitive, which is the one
 * thing `TOPIC_NOTES.infinitives` puts under "watch out". Nothing re-checked
 * them, because the header above was about the rules and the notes are copy,
 * so the fault shipped and was then taught to everybody who met the kind. The
 * notes name endings and nothing else now: a governing verb is described by
 * meaning and named once on the page `KindNote.topic` points at, and
 * `exceptions.test.ts` fails on a note carrying a stored first person out of
 * the shipped dictionary, which is what would have caught it.
 *
 * SILENCE IS NOT EVIDENCE, which is the rule `lib/srs/retire.ts` was corrected
 * for. A word the dictionary holds no form for is unknown, never regular: every
 * test below runs only where the stored form is actually there, so a thin entry
 * reports nothing rather than reporting that it behaves.
 *
 * AND NO SCREEN PRINTS WHAT THE PATTERN WOULD HAVE GIVEN, except where that is
 * also a real word. `toasse` is correct Estonian and is accepted everywhere the
 * short illative is shown, so it can be shown as the other half of a pair. The
 * partitive the ending rule would build for `aeg` is not a word at all, and
 * putting it on a screen with a line through it is this app writing Estonian
 * and hoping nobody memorises it. `ruleForm` carries it for the audit, which is
 * read by whoever maintains the rules; `ruleFormIsAlsoRight` is what a screen
 * asks before printing one.
 *
 * Pure: no React, no Next, no Prisma.
 */

/** The vowels, for the one place a rule drops a final one. Shared with `gradation.ts`. */
const VOWELS = "aeiouõäöüy";

const dropFinalVowel = (word: string): string =>
  word.length > 1 && VOWELS.includes(word[word.length - 1]!) ? word.slice(0, -1) : word;

/**
 * The families a learner meets them in, which is also how they are drilled.
 *
 * `STEM` is deliberately its own family and leads, because it is upstream of
 * every other row in the table: get `toa` wrong and eleven cases are wrong.
 */
export type ExceptionKind =
  // The stem the whole singular table is built on.
  | "STEM"
  // The singular, where the ending rule does not reach the form.
  | "PART_SG"
  | "SHORT_ILLATIVE"
  // The plural, which is built on its own stem.
  | "PLURAL_STEM"
  | "PART_PL"
  | "NOM_PL"
  | "NO_PLURAL"
  // The verb.
  | "PRESENT_STEM"
  | "PAST_STEM"
  | "PAST_3SG"
  | "DA_INFINITIVE"
  | "TUD_PARTICIPLE"
  | "IMPERATIVE_PL";

export interface WordException {
  readonly kind: ExceptionKind;
  /**
   * The slot this is about, in the vocabulary `Review.slot` uses.
   *
   * A case key or an Ekilex morph code wherever `isKnownSlot` has one, so a
   * drill of this exception lands in the same weakest-case chart as the card
   * that asks the same thing. The `da`-infinitive and the `tud` participle have
   * no code of their own in `CONJUGATION_SLOTS`, and adding one would generate
   * a conjugation card for a form no card asks about, so they take
   * `CONJUGATION`, which is a slot the app already writes and whose label is
   * "a named form".
   */
  readonly slot: string;
  /** Every spelling the dictionary vouches for, the one to lead with first. */
  readonly forms: readonly string[];
  /** What the pattern would have given, or null where it gives nothing at all. */
  readonly ruleForm: string | null;
  /** True where the pattern's own answer is also right, so a screen may print it. */
  readonly ruleFormIsAlsoRight: boolean;
  /** The alternation, where one is visible: `b : ∅`. Read off the two stems. */
  readonly note: string | null;
}

export interface ExceptionInput {
  readonly lemma: string;
  readonly pos: string;
  readonly forms: readonly {
    formType?: string | null;
    morphCode?: string | null;
    value: string;
  }[];
}

/** One reader for both shapes a form row comes in. Mirrors `stemsFrom`. */
function reader(word: ExceptionInput) {
  const byType = (t: string) => word.forms.find((f) => f.formType === t)?.value;
  const byCode = (code: string) =>
    word.forms.find((f) => f.morphCode === code || f.formType === `EKILEX:${code}`)?.value;
  return { byType, byCode };
}

/** The exceptions of one word, in the order a learner meets them. */
export function exceptionsFor(word: ExceptionInput): WordException[] {
  return word.pos === "VERB" ? verbExceptions(word) : nominalExceptions(word);
}

/** Whether the dictionary has anything to say about this word breaking a pattern. */
export function hasExceptions(word: ExceptionInput): boolean {
  return exceptionsFor(word).length > 0;
}

function nominalExceptions(word: ExceptionInput): WordException[] {
  const { byType, byCode } = reader(word);
  const nom = byType("NOM_SG");
  const gen = byType("GEN_SG");
  const part = byType("PART_SG");
  const ill = byType("ILL_SG_SHORT") ?? byCode("SgAdt");
  const nomPl = byType("NOM_PL") ?? byCode("PlN");
  const genPl = byType("GEN_PL");
  const partPl = byType("PART_PL");

  const out: WordException[] = [];
  if (!nom || !gen) return out;

  /*
    THE STEM, WHICH IS UPSTREAM OF EVERYTHING ELSE.

    Regular is the genitive being the nominative with an ending on it, plus the
    two declension types a course teaches as classes rather than as
    irregularities: `inimene : inimese` and `kapsas : kapsa`, where the
    consonant centre does not move at all. `gradation.ts` already draws exactly
    that line for exactly that reason, and the note is read off it, so the chip
    on the entry and this cannot disagree about what alternates.
  */
  const regularStem =
    gen.startsWith(nom) ||
    (nom.endsWith("ne") && gen === `${nom.slice(0, -2)}se`) ||
    (nom.endsWith("s") && gen === nom.slice(0, -1));
  if (!regularStem) {
    out.push({
      kind: "STEM",
      slot: "GENITIVE",
      forms: [gen],
      // The pattern gives nothing here: it does not predict a stem, it assumes
      // one. Saying "the rule would give `tuba`" would be inventing a claim the
      // rule never made.
      ruleForm: null,
      ruleFormIsAlsoRight: false,
      note: classifyGradation(nom, gen).note ?? null,
    });
  }

  /*
    THE PARTITIVE SINGULAR. What a course teaches is the genitive stem with `t`
    or `d` on it, the genitive unchanged, or the nominative unchanged, and for
    the `-ne` and `-s` types the stem's final vowel goes before the `t`.
    Anything else is a form to be learned: `aeg : aja : aega` goes back to the
    strong grade, which nothing about `aja` predicts.
  */
  if (part) {
    const regular = [gen, `${gen}t`, `${gen}d`, `${dropFinalVowel(gen)}t`, nom, `${nom}t`];
    if (!regular.includes(part)) {
      out.push({
        kind: "PART_SG", slot: "PARTITIVE", forms: [part],
        ruleForm: `${gen}t`, ruleFormIsAlsoRight: false,
        /*
          No alternation note here, deliberately. Reading the two stems the
          other way round prints `j : g` on a word whose entry already says
          `g : j`, which is the same fact upside down and reads as a
          contradiction. What is going on is the strong grade coming back, and
          the kind's own copy says that in English once rather than in a chip
          on every word.
        */
        note: null,
      });
    }
  }

  /*
    THE SHORT ILLATIVE, the flagship of the whole area. See `derive.ts`: both
    forms are Estonian, a course teaches them as a pair, and the app accepts
    both, so this is the one exception where the pattern's own answer may be
    printed beside the real one.
  */
  const illSuffix = caseByKey("ILLATIVE")?.suffix ?? "";
  if (ill && ill !== gen + illSuffix) {
    out.push({
      kind: "SHORT_ILLATIVE", slot: "ILLATIVE", forms: [ill],
      ruleForm: gen + illSuffix, ruleFormIsAlsoRight: true, note: null,
    });
  }

  /*
    THE PLURAL STEM, which is the plural's answer to the stem problem above and
    was measured into this shape rather than reasoned into it.

    The first version of this file asked whether the genitive plural is the
    partitive singular plus `de`, and flagged 340 words; the partitive plural
    was asked whether it is the plural stem plus `sid`, and flagged 3,253, which
    is 61% of the dictionary. A kind that covers most of the language is not an
    exception, it is a rule written down badly, and the ranked list said which:
    `aadresse`, `aedu`, `aegu`, `asju`. Those are the ordinary short partitive
    plural, which every one of those words has, and none of them is a surprise
    to anybody except the rule.

    What is actually worth flagging is one thing rather than two: **the plural
    is built on a different stem from the singular**. `tuba : toa : tubade`
    pluralises on the strong grade the singular lost, and `aken : akna : akende`
    puts the vowel back that the singular dropped, so a learner who has the
    genitive singular and reaches for the plural with it lands nowhere. Where
    the two stems agree, every plural form falls out of the endings a course
    teaches and there is nothing to drill.
  */
  const plStem = genPl ? genPl.replace(/[td]e$/, "") : null;
  if (plStem && plStem !== gen && plStem !== dropFinalVowel(gen) && plStem !== nom) {
    out.push({
      kind: "PLURAL_STEM", slot: "GENITIVE", forms: [genPl!],
      // No note, for the reason the partitive gives above: the grade coming
      // back is the kind's own story rather than a chip per word.
      ruleForm: `${gen}de`, ruleFormIsAlsoRight: false, note: null,
    });
  }

  /*
    THE PARTITIVE PLURAL, once the stem is granted. What a learner is taught to
    reach for is one of the two stems with a vowel and `id` or `sid` on it, and
    that reaches the short form and the long one alike: `aadresse`, `aegu`,
    `asju`, `hambaid`, `aeglasi`. What is left after that really is a word to
    learn, and `hea : häid` is the shape of it.
  */
  if (partPl && (plStem || gen)) {
    const stems = [plStem, gen, dropFinalVowel(plStem ?? ""), dropFinalVowel(gen)].filter(
      (s): s is string => !!s,
    );
    const endings = ["sid", "id", "e", "u", "i", "a"];
    const regular = stems.some((s) => endings.some((e) => partPl === s + e));
    if (!regular) {
      out.push({
        kind: "PART_PL", slot: "PARTITIVE", forms: [partPl],
        ruleForm: `${plStem ?? gen}sid`, ruleFormIsAlsoRight: false, note: null,
      });
    }
  }

  /*
    THE NOMINATIVE PLURAL, which is the genitive singular plus `d` for every
    noun in the language and for no pronoun: `see` goes to `need` and `too` to
    `nood`. `derive.ts` learned this from `audit:cases` and stopped deriving it.
  */
  if (nomPl && nomPl !== `${gen}d`) {
    out.push({
      kind: "NOM_PL", slot: "NOMINATIVE", forms: [nomPl],
      ruleForm: `${gen}d`, ruleFormIsAlsoRight: false, note: null,
    });
  }

  /*
    NO PLURAL AT ALL. A mass noun has none for a lexicographer to record, and
    the app used to offer `sularahad`.

    Reported only where the singular is complete and all three plural parts are
    missing together. One missing form is a thin entry; three missing beside a
    partitive singular is a word that does not do plurals. The partitive is
    what tells those apart, and it is load-bearing rather than tidy: a word
    somebody confirmed off a photograph carries a nominative and nothing else,
    and reading that as "this word has no plural" is silence taken as evidence,
    which is exactly what the header above forbids.
  */
  if (part && !nomPl && !genPl && !partPl) {
    out.push({
      kind: "NO_PLURAL", slot: "NOMINATIVE", forms: [],
      ruleForm: `${gen}d`, ruleFormIsAlsoRight: false, note: null,
    });
  }

  return out;
}

function verbExceptions(word: ExceptionInput): WordException[] {
  const { byType, byCode } = reader(word);
  const ma = byType("INF_MA") ?? word.lemma;
  const da = byType("INF_DA");
  const pres = byType("PRES_1SG");
  const past = byType("PAST_1SG");
  const tud = byType("PART_TUD");
  const past3 = byCode("IndIpfSg3");
  const impPl = byCode("ImpPrPl2");

  const out: WordException[] = [];
  if (!ma.endsWith("ma")) return out;
  const maStem = ma.slice(0, -2);

  /*
    THE PRESENT STEM. Regular is the `ma`-stem with a person ending on it, and a
    consonant stem taking a vowel first: `elan`, `laulan`, `jooksen`. What is
    left is the verb whose present runs on another stem entirely, which is where
    `andma : annan` and `lugema : loen` live, and it is the verb's half of the
    stem problem above: every person, the negative, the conditional and the
    singular imperative are built off `pres1sg` by `conjugate.ts`, so a learner
    who guesses this wrong gets the whole present wrong at once.
  */
  if (pres) {
    const regular = [`${maStem}n`, `${maStem}an`, `${maStem}en`];
    if (!regular.includes(pres)) {
      out.push({
        kind: "PRESENT_STEM", slot: "IndPrSg1", forms: [pres],
        ruleForm: `${maStem}n`, ruleFormIsAlsoRight: false,
        note: classifyGradation(maStem, pres.replace(/n$/, "")).note ?? null,
      });
    }
  }

  /*
    THE SIMPLE PAST, which is the `ma`-stem plus `sin` for most verbs and is
    another word for `jooma : jõin` and `saama : sain`.
  */
  if (past) {
    const presStem = pres?.replace(/n$/, "");
    const regular = [`${maStem}sin`, ...(presStem ? [`${presStem}sin`] : [])];
    if (!regular.includes(past)) {
      out.push({
        kind: "PAST_STEM", slot: "IndIpfSg1", forms: [past],
        ruleForm: `${maStem}sin`, ruleFormIsAlsoRight: false, note: null,
      });
    }
  }

  /*
    THE THIRD PERSON OF THE SIMPLE PAST, which `conjugate.ts` says at length is
    the one slot no rule reaches for any verb in the language: `lugesin` goes to
    `luges` and `tahtsin` to `tahtis`. The pattern a learner will reach for is
    the first person without its `n`, and this is every verb where that is not
    the answer. Only the course words carry the form, since the harvest stores
    what the rules cannot reach and the Wiktionary expansion holds none.
  */
  if (past3 && past) {
    if (past3 !== past.replace(/in$/, "")) {
      out.push({
        kind: "PAST_3SG", slot: "IndIpfSg3", forms: [past3],
        ruleForm: past.replace(/in$/, ""), ruleFormIsAlsoRight: false, note: null,
      });
    }
  }

  /*
    THE `da`-INFINITIVE, the other principal part a learner has to hold in their
    head, and the one every modal and every "I want to" sentence needs.
  */
  if (da && da !== `${maStem}da`) {
    out.push({
      kind: "DA_INFINITIVE", slot: "CONJUGATION", forms: [da],
      ruleForm: `${maStem}da`, ruleFormIsAlsoRight: false,
      note: classifyGradation(maStem, da.replace(/(da|ta|a)$/, "")).note ?? null,
    });
  }

  /* THE `tud` PARTICIPLE, which the whole perfect and the passive are built on. */
  if (tud && tud !== `${maStem}tud` && tud !== `${maStem}dud`) {
    out.push({
      kind: "TUD_PARTICIPLE", slot: "CONJUGATION", forms: [tud],
      ruleForm: `${maStem}tud`, ruleFormIsAlsoRight: false, note: null,
    });
  }

  /*
    THE POLITE IMPERATIVE, which is the form a learner is addressed with by
    every counter and every official in the country. `eval:scene` is what found
    it missing from the dictionary; this is the same form asked from the other
    side. The pattern a learner reaches for is the present stem plus `ge`.
  */
  if (impPl && pres) {
    const presStem = pres.replace(/n$/, "");
    if (impPl !== `${presStem}ge` && impPl !== `${presStem}ke`) {
      out.push({
        kind: "IMPERATIVE_PL", slot: "ImpPrPl2", forms: [impPl],
        ruleForm: `${presStem}ge`, ruleFormIsAlsoRight: false, note: null,
      });
    }
  }

  return out;
}

/**
 * WHAT EACH KIND IS, IN ENGLISH, ONCE RATHER THAN PER WORD.
 *
 * English is the one language this project writes, and this is the only place
 * an exception is described in words: the chip beside a word says which kind it
 * is and this says what the kind means. A sentence per word would be a sentence
 * per word to keep true.
 *
 * `family` is how they are grouped on a screen and in a round, and the order
 * below is the order a learner meets them: the stem first, because it is
 * upstream of the whole singular table, then the singular, then the plural,
 * which is built on a stem of its own, then the verb.
 */
export type ExceptionFamily = "STEM" | "SINGULAR" | "PLURAL" | "VERB";

export interface KindNote {
  readonly family: ExceptionFamily;
  /** What it is called, on a chip and as a heading. */
  readonly title: string;
  /** What the pattern would have you do, and what these words do instead. */
  readonly what: string;
  /**
   * The grammar topic that says when a learner actually needs this form, or
   * null where there is no page about it.
   *
   * A learner drove this round and reported that it was not clear why they
   * were being shown `vihata`: the round says what the form departs from and
   * said nothing about what the form is *for*, which for the `da`-infinitive
   * is the whole point of it. That fact belongs on one page rather than in a
   * sentence per exception kind, and `lib/estonian/grammar.ts` already has it
   * (`infinitives`, `imperative`, `present-tense`), so the kind names the
   * topic and the screens link to it. `exceptions.test.ts` checks every id
   * against `grammarTopic`, because a dead link here is a dead end on the one
   * screen this area exists to stop being one.
   */
  readonly topic: string | null;
}

export const KIND_NOTES: Record<ExceptionKind, KindNote> = {
  STEM: {
    family: "STEM",
    title: "The stem changes",
    what: "The genitive is usually the word with an ending added. In these it is not: a consonant grades, a vowel drops out of the middle, or the stem is another word again. Every other case in the singular is built on it, so this is the one to learn first.",
    topic: "gradation",
  },
  PART_SG: {
    family: "SINGULAR",
    title: "The partitive goes its own way",
    what: "The partitive is usually the genitive stem with t or d on it, or the plain word. In these it goes back to the strong grade the genitive lost, or takes an ending nothing predicts, so it is held in your head rather than worked out.",
    topic: "object",
  },
  SHORT_ILLATIVE: {
    family: "SINGULAR",
    title: "Two ways into it",
    /*
      BOTH FORMS ARE NAMED, BECAUSE THE FIRST VERSION OF THIS NAMED NEITHER.

      It read "half the words in the dictionary also have a short form, and the
      short one is what you will hear in a shop", which is true, is about the
      dictionary rather than about the word on the screen, and was reported by
      somebody using it as telling them a shorter form exists and never saying
      what it is. Both spellings were on the card the whole time and nothing
      said which was which, so the sentence read as a riddle. The screens label
      the pair now (`AlsoRight`), and this says what the two are for.
    */
    what: "This word has two ways in. The long one is the stem with sse on it and is always right. The short one is what you will hear said, and no rule reaches it. Both are named here, and both are accepted.",
    topic: null,
  },
  PLURAL_STEM: {
    family: "PLURAL",
    title: "The plural is built on another stem",
    what: "The whole plural sits on the genitive plural, and in these words that is not the singular stem with an ending on it. Get this one and every plural case follows.",
    topic: null,
  },
  PART_PL: {
    family: "PLURAL",
    title: "The partitive plural is a word to learn",
    what: "Most partitive plurals are one of the two stems with a vowel and id or sid. These are not, so this is a form to hold in your head rather than work out.",
    topic: null,
  },
  NOM_PL: {
    family: "PLURAL",
    title: "The plural is another word",
    what: "The plural is the genitive plus d for nearly every word in the language. Here it is not, so the plural is a second word to learn beside the singular.",
    topic: null,
  },
  NO_PLURAL: {
    family: "PLURAL",
    title: "No plural",
    what: "Nobody counts these, so there is no plural to learn. The dictionary records none and neither should you.",
    topic: null,
  },
  PRESENT_STEM: {
    family: "VERB",
    title: "The present runs on another stem",
    what: "Every person, the negative, the conditional and the imperative are built on the I form. In these verbs that form is not the ma-infinitive with an ending, so getting it wrong gets the whole present wrong at once.",
    topic: "present-tense",
  },
  PAST_STEM: {
    family: "VERB",
    title: "The past is another word",
    what: "The simple past is usually the ma-stem with sin on it. These verbs take a different vowel or a different stem entirely, and they are the commonest verbs in the language.",
    topic: "imperfect",
  },
  PAST_3SG: {
    family: "VERB",
    title: "He, she and it in the past",
    what: "There is no rule that turns the I form of the past into the she form: some drop the ending and some add a vowel. This is the one slot in the verb nothing predicts, for any verb.",
    topic: "imperfect",
  },
  DA_INFINITIVE: {
    family: "VERB",
    title: "The da-infinitive",
    /*
      THE VERBS THAT TAKE IT ARE DESCRIBED, NOT NAMED, AND THAT IS THE FIX.

      This read "the form after tahan, saan and pean", and the last of those
      three is wrong: the everyday verb for must takes the *other* infinitive,
      which is exactly what `TOPIC_NOTES.infinitives` warns about under
      "watch out". Three Estonian words were typed into this table, nothing
      ever re-checked them, and one of them taught the opposite of the truth
      to everybody who met the kind. That is the failure this whole module's
      header is about, one directory in from where it was looking: a list of
      Estonian somebody typed ships in silence and is then drilled.

      So the governing verbs are given by meaning here and named, once, on the
      page `topic` points at, where `lib/estonian/grammar.ts` already had them
      right and holds no Estonian either. `exceptions.test.ts` checks these
      notes against the dictionary's own stored first persons, so the next verb
      typed in fails rather than ships.
    */
    what: "The form you need after wanting, being able and knowing how. It is usually the ma-stem with da on it. In these verbs it is not: the word changes underneath the ending, so this one is memorised rather than worked out.",
    topic: "infinitives",
  },
  TUD_PARTICIPLE: {
    family: "VERB",
    title: "The tud form",
    what: "What the perfect and the passive are built on. Usually the ma-stem with tud or dud, and in these the stem moves first, so the whole form is one to learn.",
    topic: "past-participle",
  },
  IMPERATIVE_PL: {
    family: "VERB",
    title: "Telling somebody politely",
    what: "The form every counter and every official will use on you. It is not built on the present stem, so a verb whose present grades takes the other grade here.",
    topic: "imperative",
  },
};

export const FAMILY_TITLES: Record<ExceptionFamily, string> = {
  STEM: "The stem",
  SINGULAR: "The singular",
  PLURAL: "The plural",
  VERB: "The verb",
};

/** Every kind, in the order a learner meets them. */
export const EXCEPTION_KINDS = Object.keys(KIND_NOTES) as readonly ExceptionKind[];
