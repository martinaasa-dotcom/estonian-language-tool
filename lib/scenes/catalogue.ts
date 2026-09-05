/**
 * The three scenes Phase 1 would build, and the input Phase 0 measures.
 *
 * Every lemma below is a word one of the scene's declared units already
 * teaches, which `catalogue.test.ts` asserts word by word. That is the only
 * rule about Estonian this file has to obey and it is a strong one: a scene
 * cannot introduce vocabulary, it can only point at vocabulary the Ekilex
 * harvest brought back. Nothing here is a sentence, and no line anybody reads
 * comes from this file.
 *
 * The three are the ones `docs/21-situations.md` §19 names, chosen because the
 * course already promises all three in as many words:
 *
 *   keha-ja-tervis   "Describe a symptom to a doctor and understand the
 *                     advice you are given."
 *   eluase           "Rent a flat, describe a problem with it and deal with a
 *                     landlord."
 *   linn-ja-teenused "Deal with a bank, a post office and an official form
 *                     without switching to English."
 *
 * The shared units are the same four every time and they are the ones the
 * seventeenth pass added for the words between the words: greetings, question
 * words, pronouns, and the clock. A conversation is mostly those.
 */
import type { SaysPart, SceneSpec } from "./types";

/** Greetings, question words, pronouns, time and number. Every scene needs them. */
/*
  The units every scene declares, whatever it is about.

  The test for being here is that a unit teaches the machinery a conversation
  is made of rather than the subject of one, and four were added after
  `eval:scene` measured what leaving them out cost. Each absence was an
  oversight rather than a decision, and each was invisible until the ranked
  list of words the model reached for named it.

  `pohiverbid` teaches `olema`, and no Estonian sentence is built without the
  verb "to be". `sidesonad`, `vastused` and `maaramine` are the words between
  the words, and the two commonest things the gate withheld a line over were
  `ja` and `või`: a scene that cannot say "and" or "or" cannot say much.
  `millal` carries `praegu` and `juba`, which is how anybody says when.

  The last two arrived with the vocabulary pass and are the same argument once
  more. `kohasonad` is the postpositions, which is one of the eight units the
  seventeenth pass added for exactly this reason and the only one that was left
  out here; `alates` and `kaasas` were both in the ranked list. And
  `kus-ja-kuhu` is the adverbs of place, `siin`, `siia`, `mujal` and `asuma`,
  which stands beside `millal`'s adverbs of time for the same reason: every one
  of these scenes asks where something is before it asks anything else.
*/
const COMMON = [
  "tervitused", "kusisonad", "asesonad", "aeg", "arvud", "korraldused", "pohiverbid",
  "sidesonad", "vastused", "maaramine", "millal", "kohasonad", "kus-ja-kuhu",
  /*
    Two more once the curveballs were played rather than drawn. `ilm` is the
    weather, which is what small talk is about in every scene; `iga-paev`
    carries `rääkima` and `ütlema`, which is how anybody asks somebody to
    speak slower or says what they heard. Both A1.
  */
  "ilm", "iga-paev",
] as const;

/**
 * What the other side says when they did not catch the learner's turn.
 *
 * A course phrase rather than a sentence written here, which is the rule this
 * file lives under: a lemma is a request against the dictionary, so a
 * misspelled one fails to arrive and `catalogue.test.ts` says so. `tervitused`
 * teaches it and every scene declares that unit through `COMMON`.
 *
 * It is a reaction and never a way out. For a while it was both, and the
 * second job was a lie: it was printed at a learner whose turn had landed
 * perfectly because the ladder had nothing to build the *next* line with.
 * `lib/scenes/reply.ts` says it only where `readTurn` read nothing, and then
 * asks the question again, which is what a person who missed something does.
 */
export const FALLBACK_PHRASE = "Ma ei saa aru";

/**
 * The words the other side reacts with, before they make their next move.
 *
 * A conversation is not a list of questions. Somebody who has just been told
 * where it hurts says "hästi" or "aitäh" before they ask how long, and a
 * screen that skipped straight to the next question read as a form being
 * filled in by a machine, which is what a learner reported it as. Every entry
 * is a lemma from `vastused` or `maaramine`, both in `COMMON`, so the same
 * rule holds here as for a beat's topic: a word the harvest did not bring back
 * fails the catalog test rather than reaching a screen. Capitalizing one and
 * putting a full stop or a question mark after it is presentation and not
 * composition, the way the app already prints `Tere!` as a line; the word is
 * the dictionary's and the mark is the move.
 *
 * `acknowledge` rotates, because the same "Hästi." six times running is the
 * machine showing through again. `waiting` is one word with a question mark,
 * and it is the whole reply to a one-word turn where a sentence was due: a
 * person who has heard "palavik" and is waiting for the rest says "Jah?".
 */
export const REACTIONS = {
  acknowledge: ["hästi", "aitäh", "jah"],
  waiting: ["jah"],
  /*
    EVERY FAILURE USED TO LOOK LIKE A SUCCESS, which is the single reason a
    learner reported a whole conversation as broken. A turn that landed got a
    word and then the next question; a turn that missed got nothing and then a
    question, and where the ladder had a fresh line for the same beat it got a
    *differently worded* question. So `kool` answered "where are you going?"
    with silence and "Kuhu te sõidate?", and there was no way on the screen to
    tell that apart from having been understood and asked something new.

    A person says so. This is what they say: the one word in the course for
    "that was not what I asked", said before the question is put again, and
    said only on a turn that was real Estonian off the point, since a turn
    nobody could read already has the repair phrase and a turn that half
    landed already gets its own word back.
  */
  missed: ["Vabandust!"],
  /*
    And running out of patience is not agreement. It drew from `acknowledge`,
    so giving up on getting an answer could come out as `Aitäh.` or `Jah.`:
    the other side thanking somebody for an answer they never gave, which is
    the machine showing through at the exact moment the learner most needed
    to know they had not been understood. One word, and never the two that
    read as taking something.
  */
  letGo: ["hästi"],
} as const;

/**
 * What the other side says about a question the scene did not anticipate,
 * before going on with their own move (`lib/scenes/aside.ts`).
 *
 * A person caught off guard still answers: "how are you" gets "fine,
 * thanks", and a question they have no answer to gets "don't know", said
 * the way a stranger on a street corner says it. Both are parts, in the
 * shape a beat's `says` takes, so every word is a lemma one of the common
 * units teaches and the one verb form is read off the derived table rather
 * than typed. `ei tea` is `ei` and the negative of `teadma`, which is the
 * stored first person with its ending taken off.
 */
/**
 * How a learner says they are not following, so the other side can help
 * rather than ask the same thing again.
 *
 * The single most important thing to recognise in this module, because it is
 * the moment somebody decides whether they are stupid or simply learning.
 * A learner who writes "I do not understand" and is answered with the same
 * question a third time has been told by a machine that the problem is them.
 * A person offers the word.
 *
 * Lemmas and a course phrase, so nothing here is Estonian this file wrote,
 * and all of them are taught by units every scene declares: the phrase by
 * `tervitused`, `saama` by `pohiverbid`, `teadma` by `iga-paev`. The verbs
 * are read *negated*, which is `ei` beside the form `derivedVerbForms` gives
 * after it, so `ei tea` and `ei saa aru` are caught and `ma tean` is not.
 */
export const LOST = {
  /** Matched whole: every word of it in the turn. A phrase is not a bag of words. */
  phrases: ["Ma ei saa aru"],
  /** The negator beside a form of one of these. */
  verbs: ["teadma", "saama"],
} as const;

export const ASIDES = {
  /** `Hästi, aitäh.` */
  howAreYou: [{ lemma: "hästi" }, { lemma: "aitäh" }],
  /** `Ei tea.` */
  unknown: [{ lemma: "ei" }, { lemma: "teadma", verb: "IndPrPs_" }],
} as const satisfies Record<string, readonly SaysPart[]>;

/** The closing phrases, which are the same wherever you are leaving. */
const FAREWELLS = ["Head aega!", "Nägemist!", "Aitäh!"] as const;

const HELLOS = ["Tere!", "Tere hommikust!"] as const;

const DOCTOR: SceneSpec = {
  id: "arsti-aeg",
  title: "Booking a doctor's appointment",
  place: "The reception desk at a health center",
  level: "A2",
  tests: "keha-ja-tervis",
  /*
    `inimesed` teaches `arst`, and a scene at a health center whose word list
    could not vouch for the word "doctor" is the shape of specification bug
    that only a measurement finds: nothing about the scene looked wrong, and
    the gate withheld every line the model wrote about one.

    `plaanid` because the last two beats are agreeing a time, and `sobima` is
    the verb Estonian agrees one with: it was the single commonest word the
    gate withheld a line over. `minevik` because the `since` beat asks how long
    this has been going on, which is a past tense. `omadussonad` because saying
    what is wrong with you is a sentence with an adjective in it.
  */
  units: [...COMMON, "keha-ja-tervis", "inimesed", "plaanid", "minevik", "omadussonad", "linn-ja-teenused"],
  register: "teie",
  /*
    THE LEARNER NEVER PLAYS THEMSELVES (§3), and at a health center that is a
    legal rule as much as a marking one: a scene where somebody types about
    their own symptoms is a database holding health data about an identified
    person. Everything on this card is fiction, and nothing in a transcript is
    true about whoever wrote it.
  */
  role: "You are a patient. Something has been wrong since earlier this week and you would like to be seen.",
  props: [
    {
      kind: "word", slot: "symptom", oneOf: ["valu", "palavik", "haigus", "haige", "väsinud"],
      says: "What is wrong. Say it in your own sentence.",
    },
    {
      kind: "weekday", slot: "since",
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "It started earlier this week, on this day.",
    },
    { kind: "time", slot: "time", from: 9, to: 16 },
    // The second slot they offer when the first will not do, and never the same one.
    { kind: "time", slot: "time2", from: 8, to: 16, differentFrom: "time" },
  ],
  /*
    `misheard` because a symptom is the one prop here a receptionist could
    hear as its neighbor, and `contradiction` because a desk that says the
    slot is gone and then offers it is a thing that happens at desks. It is
    drawn only at B2 and above, which the curveball itself says; admitting it
    here is what lets a B2 learner meet it on an A2 scene.
  */
  curveballs: [
    "slot-gone", "small-talk", "faster", "queue", "not-possible",
    "other-register", "english", "missing-document", "place-instruction", "misheard", "contradiction",
  ],
  beats: [
    {
      id: "greet",
      goal: "Greet them back.",
      they: "The receptionist looks up and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "reason",
      goal: "Say what is wrong with you.",
      they: "They ask what brings you in.",
      move: "ask",
      topic: ["valu", "haigus", "tervis", "haige", "palavik"],
      /*
        `valutama` beside `valu`, because "my head hurts" is how anybody
        answers this and the noun alone refused it. §29 of the design doc
        found the same shape across the course: it teaches the nouns of a
        situation and not the verbs that do things with them.
      */
      needs: [{ kind: "lemma", oneOf: ["valu", "valutama", "haigus", "haige", "palavik", "väsinud"] }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "where",
      goal: "Say where it hurts.",
      they: "They ask where it hurts.",
      move: "ask",
      topic: ["pea", "kõrv", "käsi", "jalg", "selg", "silm", "nina", "suu", "keha"],
      needs: [{ kind: "lemma", oneOf: ["pea", "kõrv", "käsi", "jalg", "selg", "silm", "nina", "suu", "süda", "keha"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "since",
      goal: "Say since when. Your card says which day.",
      they: "They ask how long it has been going on.",
      move: "ask",
      topic: ["päev", "nädal", "hommik", "aeg", "esmaspäev", "teisipäev", "kolmapäev"],
      needs: [{ kind: "datum", slot: "since" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "offer",
      goal: "Take the time offered, or ask for another.",
      they: "They offer you an appointment at {time}.",
      move: "offer",
      topic: ["aeg", "kell", "tund", "päev"],
      says: [{ lemma: "kell" }, { slot: "time" }],
      /*
        The time back, or a yes, or a no. "Does 14:30 suit you?" is answered
        `Sobib` far more often than `14:30`, and the first version took the
        time alone, so the one word a receptionist is waiting for was read as
        Estonian off the point and the time was offered again.
      */
      /*
        And a no gets another time rather than the end of the conversation:
        a receptionist who hears "ei sobi" looks for the next free slot.
      */
      counter: {
        they: "They offer {time2} instead and ask whether that one works.",
        says: [{ lemma: "kell" }, { slot: "time2" }],
        replaces: [["time", "time2"]],
      },
      needs: [{ kind: "anyOf", of: [
        { kind: "datum", slot: "time" },
        { kind: "datum", slot: "time2" },
        { kind: "lemma", oneOf: ["sobima", "jah"] },
      ] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "confirm",
      goal: "Check they have it right.",
      they: "They read the time back to check: {time}.",
      move: "confirm",
      topic: ["aeg", "kell", "päev"],
      says: [{ lemma: "kell" }, { slot: "time" }],
      needs: [{ kind: "any" }],
      required: false,
      patience: 1,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    {
      id: "booked",
      when: ["greet", "reason", "where", "since", "offer", "close"],
      says: "You have an appointment, and they know what it is for.",
    },
    {
      id: "booked-thin",
      when: ["greet", "reason", "offer"],
      says: "You have an appointment. They did not get the whole story, so bring it with you.",
    },
    /*
      A failure that is not the learner's fault, which every scene needs one of
      (§3). The receptionist cannot book what she cannot write down, and a
      learner who said everything except when it started has met a real wall
      rather than a marking rule.
    */
    {
      id: "sent-away",
      when: ["greet"],
      says: "No appointment today. They ask you to call back when you can say how long it has been.",
    },
    { id: "left", when: [], says: "You left the desk. That is a thing people do, and you can come back." },
  ],
};

const LANDLORD: SceneSpec = {
  id: "uuri-remont",
  title: "Telling a landlord something is broken",
  place: "A phone call to the person you rent from",
  level: "B1",
  tests: "eluase",
  /*
    `eluase` is the vocabulary of renting; `kodu` is the vocabulary of the flat
    itself, and a scene about something broken in one needs both. `kodutood`
    carries `katki`, which is the word this whole scene is about. `plaanid` for
    the beat that agrees a time and `minevik` for the one that says since when,
    the same two the health center needs, and `omadussonad` for the same reason.
  */
  units: [...COMMON, "eluase", "kodu", "kodutood", "plaanid", "minevik", "omadussonad", "linn-ja-teenused", "ostmine"],
  register: "teie",
  role: "You rent a flat. Something in it stopped working earlier this week and you are ringing the person you rent from.",
  props: [
    {
      kind: "word", slot: "problem", oneOf: ["küte", "elekter", "remont", "mööbel", "aken", "uks"],
      says: "What has gone wrong. The sentence is yours.",
    },
    {
      kind: "weekday", slot: "since",
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "It has been like this since this day.",
    },
    { kind: "time", slot: "time", from: 8, to: 18 },
    { kind: "number", slot: "floor", min: 1, max: 5, says: "You live on floor" },
    /*
      The day the landlord offers, drawn per run so a reload offers the same
      one, and the other side's rather than the learner's: it is not printed
      on the card, because a card that says what the landlord is about to
      propose is a script. Without it the offer was `Kell 14:00?`, a clock
      time with no day, after the learner had just asked when anybody could
      come, and it read as agreeing to nothing in particular.
    */
    {
      kind: "weekday", slot: "day", theirs: true,
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "The day they can come.",
    },
    // The second offer, for a tenant who says the first will not do: another day, another time.
    {
      kind: "weekday", slot: "day2", theirs: true, differentFrom: "day",
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "The other day they can come.",
    },
    { kind: "time", slot: "time2", from: 8, to: 18, differentFrom: "time" },
  ],
  /*
    No queue: this one is a telephone call, so the only curveball in the
    catalog with no words in it has nowhere to happen. A scene admits what
    could actually occur in it, which is the same discipline as declaring the
    units its words come from.
  */
  curveballs: [
    "slot-gone", "not-possible", "faster", "small-talk", "interrupted",
    "english", "wrong-price", "other-register", "missing-document", "contradiction",
  ],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "The landlord picks up and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "problem",
      goal: "Say what has gone wrong.",
      they: "They ask what has gone wrong.",
      move: "ask",
      topic: ["küte", "elekter", "remont", "lekkima", "mööbel"],
      /*
        Every word the card can deal, and the two the beat is about beside
        them. `aken` and `uks` were dealt and refused, so a third of runs
        handed somebody a card whose problem the landlord would not hear.
      */
      needs: [{
        kind: "lemma",
        oneOf: ["küte", "elekter", "remont", "mööbel", "aken", "uks", "lekkima", "ruum"],
      }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "where",
      goal: "Say which room, and which floor.",
      they: "They ask which room it is in, and which floor.",
      move: "ask",
      /*
        `korrus` is the floor of a building and `kord` is not: it is an
        occasion or an order, and the beat used to accept it in the floor's
        place while refusing `Neljal korrusel`, which is the answer. The rooms
        are the ones the `kodu` unit teaches, since somebody ringing about a
        flat says which room by its name.
      */
      topic: ["ruum", "korrus", "tuba", "köök"],
      needs: [{ kind: "lemma", oneOf: ["korrus", "ruum", "tuba", "köök", "kord"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "since",
      goal: "Say since when. Your card says which day.",
      they: "They ask since when.",
      move: "ask",
      topic: ["päev", "nädal", "aeg", "õhtu"],
      needs: [{ kind: "datum", slot: "since" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "refuse",
      goal: "They cannot come this week. Ask when they can.",
      they: "They say nobody can come this week.",
      move: "refuse",
      topic: ["remont", "aeg", "nädal", "üür"],
      needs: [{ kind: "question" }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "agree",
      goal: "Agree a time, or say it will not do.",
      they: "They offer {day} next week at {time} and ask whether that works.",
      move: "offer",
      topic: ["aeg", "päev", "kell", "üürima"],
      /*
        `Teisipäeval kell 14:00?`: the day in the case a day is said in, read
        off the dictionary's own table, then the time. An answer to "when can
        anybody come" names a day or it has not answered.
      */
      says: [{ slot: "day", grammCase: "ADESSIVE" }, { lemma: "kell" }, { slot: "time" }],
      /*
        "Ei sobi" is not the end of the call. A landlord who hears it offers
        another day, and only a second no is the tenant saying it will not
        do, which is what the goal allows.
      */
      counter: {
        they: "They offer {day2} at {time2} instead and ask whether that works.",
        says: [{ slot: "day2", grammCase: "ADESSIVE" }, { lemma: "kell" }, { slot: "time2" }],
        replaces: [["day", "day2"], ["time", "time2"]],
      },
      needs: [{ kind: "anyOf", of: [
        { kind: "datum", slot: "time" },
        { kind: "datum", slot: "day" },
        { kind: "datum", slot: "time2" },
        { kind: "datum", slot: "day2" },
        { kind: "lemma", oneOf: ["sobima", "jah"] },
      ] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    {
      id: "fixed",
      when: ["greet", "problem", "where", "since", "refuse", "agree", "close"],
      says: "They know what is broken, where and since when, and you talked through when somebody comes.",
    },
    {
      id: "logged",
      when: ["greet", "problem", "agree"],
      says: "They know something is broken and roughly when. No day agreed yet.",
    },
    {
      id: "no-slot",
      when: ["greet", "problem"],
      says: "They have your report and no free day this week. Nothing you said changed that.",
    },
    { id: "left", when: [], says: "You hung up. The heating is still broken, and you can ring again." },
  ],
};

const COUNTER: SceneSpec = {
  id: "ametiasutus",
  title: "Handing in a form at a counter",
  place: "The desk at an office that wants your paperwork",
  level: "A2",
  tests: "linn-ja-teenused",
  /*
    `suhtlemine` teaches `aadress`, `kiri`, `teatama` and `helistama`, which is
    what a counter asks you for and what it tells you it will do next.
    `plaanid` for the beat that asks when it will be ready, and `omadussonad`
    for `valmis`, which is the word the answer to that beat is made of. No
    `minevik`: nothing at this counter happened in the past, which is what says
    these three are declared per scene rather than added to `COMMON`.
  */
  units: [...COMMON, "linn-ja-teenused", "suhtlemine", "plaanid", "omadussonad", "inimesed", "minevik", "ostmine"],
  register: "teie",
  role: "You have a form to hand in. You were given a reference number for it, and you are at the desk where forms are handed in.",
  props: [
    {
      kind: "word", slot: "paper", oneOf: ["avaldus", "dokument", "luba", "arve", "allkiri"],
      says: "What you have come to hand in.",
    },
    /*
      A fictional reference, supplied rather than asked for. An identity code
      typed into a practice app is the one thing this module could collect that
      nobody could ever take back (§3), so no scene invites one.
    */
    { kind: "code", slot: "ref", says: "The reference you were given:" },
    { kind: "number", slot: "floor", min: 1, max: 4, says: "The desk you were sent to is on floor" },
  ],
  curveballs: [
    "missing-document", "their-order", "place-instruction", "queue", "faster",
    "not-possible", "english", "small-talk", "other-register", "wrong-price", "contradiction",
  ],
  beats: [
    {
      id: "greet",
      goal: "Greet them back.",
      they: "The clerk at the desk says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "purpose",
      goal: "Say what you have come for.",
      they: "They ask what you have come for.",
      move: "ask",
      topic: ["avaldus", "dokument", "luba", "teenus", "amet"],
      needs: [{ kind: "lemma", oneOf: ["avaldus", "dokument", "luba", "teenus"] }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "document",
      goal: "Give them the paper they ask for, or say you do not have it.",
      they: "They ask for the paper that goes with it.",
      move: "ask",
      topic: ["dokument", "allkiri", "arve", "konto", "number"],
      needs: [{ kind: "lemma", oneOf: ["dokument", "allkiri", "arve", "konto"] }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "wait",
      goal: "They send you to the queue. Ask how long.",
      they: "They point you to the queue.",
      move: "instruct",
      topic: ["järjekord", "aeg", "klient"],
      needs: [{ kind: "question" }],
      required: false,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "fill",
      goal: "Give them the details in the order they ask for them.",
      meanwhile: "Twenty minutes in the queue. Your number comes up and you are back at the desk.",
      they: "They tell you what to fill in, and in what order.",
      move: "instruct",
      topic: ["täitma", "avaldus", "allkiri"],
      needs: [{ kind: "lemma", oneOf: ["täitma", "allkiri", "avaldus"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "confirm",
      goal: "Check when it will be ready.",
      they: "They say the form has been taken and read the details back.",
      move: "confirm",
      topic: ["aeg", "päev", "nädal", "avaldus"],
      needs: [{ kind: "question" }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    {
      id: "accepted",
      when: ["greet", "purpose", "document", "fill", "confirm", "close"],
      says: "Your form is in, filled in the way they wanted it.",
    },
    {
      id: "partial",
      when: ["greet", "purpose", "document"],
      says: "They took the form. Something on it still has to be filled in before it can be read.",
    },
    {
      id: "turned-away",
      when: ["greet", "purpose"],
      says: "They cannot take it without the paper you do not have. That is their rule, not your Estonian.",
    },
    { id: "left", when: [], says: "You left the counter. The form is still in your bag." },
  ],
};

/*
  THE FIRST MISSION, AND THE DOCUMENT'S OWN EXAMPLE.

  The MVP brief argued for one screen per situation and every question tied to
  the errand, and its worked example was a trip to the shop for milk: going
  *to* it, being *in* it, coming back *from* it, which is the one word `pood`
  in the three local cases, and asking for the milk, which is the partitive. A
  learner who has those four has the half of Estonian grammar every course
  spends its first month on, met once each in the order an errand meets them.

  `sina` rather than `teie`, because the other side is a friend on the phone
  and not a counter, and that is what puts this at A1: a scene where the
  learner is never asked to manage the polite register on top of the cases.
  `kus-ja-kuhu` because the friend asks where three times, `iga-paev` because
  it teaches `tahtma`, and `sook-ja-jook` because it teaches the milk.
*/
const SHOP: SceneSpec = {
  id: "poodi-piima",
  title: "Going to the shop for milk",
  place: "Your kitchen, then the corner shop, with a friend on the phone",
  level: "A1",
  tests: "ostmine",
  units: [...COMMON, "ostmine", "sook-ja-jook", "pohiverbid", "kodu", "kus-ja-kuhu", "omadussonad"],
  register: "sina",
  role: "You have run out of milk, so you are walking to the corner shop to buy some. A friend rings you a few times along the way to ask how you are getting on.",
  props: [],
  curveballs: ["small-talk", "misheard", "interrupted", "faster", "english"],
  beats: [
    {
      id: "greet",
      goal: "Say hello back.",
      they: "Your friend rings and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "going",
      goal: "Tell them you are going to the shop.",
      they: "Your friend asks where you are going.",
      move: "ask",
      topic: ["pood", "minema", "kuhu"],
      lines: ["Kuhu sa lähed?"],
      needs: [{ kind: "case", lemma: "pood", grammCase: "ILLATIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "inside",
      goal: "Tell them you are at the shop now.",
      meanwhile: "Five minutes later. You have walked to the shop and you are inside it.",
      they: "A little later they ring again and ask where you are.",
      move: "ask",
      topic: ["pood", "olema", "kus"],
      needs: [{ kind: "case", lemma: "pood", grammCase: "INESSIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "item",
      goal: "Tell them you want milk.",
      they: "They ask what you are buying.",
      move: "ask",
      topic: ["piim", "tahtma", "ostma", "mis"],
      needs: [{ kind: "case", lemma: "piim", grammCase: "PARTITIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "back",
      goal: "Tell them you are on your way back from the shop.",
      meanwhile: "You have paid, and you are walking home with the milk.",
      they: "They ring once more on your way home and ask where you are coming from.",
      move: "ask",
      topic: ["pood", "tulema", "kust"],
      needs: [{ kind: "case", lemma: "pood", grammCase: "ELATIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    {
      id: "milk",
      when: ["greet", "going", "inside", "item", "back", "close"],
      says: "You are home with the milk, and your friend knew where you were the whole way.",
    },
    {
      id: "milk-quiet",
      when: ["going", "item", "back"],
      says: "You are home with the milk. Your friend lost track of you for a while.",
    },
    {
      id: "no-milk",
      when: ["greet", "going"],
      says: "The shop had no milk today. That happens, and it was nobody's fault.",
    },
    { id: "left", when: [], says: "You put the phone down and went on your own. That is also a way to get milk." },
  ],
};

/*
  THREE MORE, AND WHAT THEY HAVE IN COMMON. Each is a counter a learner in
  Estonia meets in their first month, each is a claim a unit already makes,
  and each was written after the reply module rather than before it, so its
  beats are shaped by what the other side can now do: repeat a word back, say
  a price or a time off the card, and stand a curveball in the way. The words
  are requests against the units, as everywhere in this file.
*/
const CAFE: SceneSpec = {
  id: "kohvikus",
  title: "Ordering a coffee",
  place: "The counter of a small café",
  level: "A1",
  tests: "sook-ja-jook",
  /*
    `restoranis` for `arve` and `tellima`, which is how the bill is asked for
    and the order taken; `kus-ja-kuhu` for the café itself; `omadussonad` for
    "large" and "hot".
  */
  units: [...COMMON, "sook-ja-jook", "ostmine", "kus-ja-kuhu", "restoranis", "omadussonad"],
  register: "teie",
  role: "You have ten minutes before a bus and you would like something to drink. The card says what.",
  props: [
    {
      kind: "word", slot: "drink", oneOf: ["kohv", "tee", "vesi", "mahl"],
      says: "What you would like. Ask for it in Estonian.",
    },
  ],
  curveballs: ["not-possible", "wrong-price", "small-talk", "faster", "queue", "english", "interrupted", "misheard"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "The person behind the counter says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "order",
      goal: "Say what you would like. Your card says what.",
      they: "They ask what you would like.",
      move: "ask",
      topic: ["kohv", "tee", "jook", "soovima", "tellima"],
      needs: [{ kind: "datum", slot: "drink", grammCase: "PARTITIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "milk",
      goal: "Say whether you want milk in it.",
      they: "They ask whether you want milk in it.",
      move: "ask",
      topic: ["piim", "suhkur", "kohv"],
      needs: [{ kind: "lemma", oneOf: ["jah", "ei", "piim", "suhkur"] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "bill",
      goal: "Ask to pay.",
      meanwhile: "A couple of minutes later. Your drink is on the counter in front of you.",
      they: "They set it down and ask whether that is everything.",
      move: "ask",
      topic: ["arve", "maksma", "raha", "hind"],
      needs: [{ kind: "lemma", oneOf: ["arve", "maksma", "raha"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "served", when: ["greet", "order", "milk", "bill", "close"], says: "You have your drink, you paid, and you made the bus." },
    { id: "served-quiet", when: ["order", "bill"], says: "You have your drink and you paid. Not much was said, and that is fine in a café." },
    { id: "out", when: ["greet", "order"], says: "They were out of it today. You said what you wanted, and that was the part that was yours." },
    { id: "left", when: [], says: "You left without ordering. The bus was coming anyway." },
  ],
};

const DIRECTIONS: SceneSpec = {
  id: "tee-kusimine",
  title: "Asking the way",
  place: "A street corner, with somebody who looks local",
  level: "A2",
  tests: "kus-ja-kuhu",
  /*
    `kohasonad` for `lähedal` and `kõrval`, `korraldused` for `aitama`, which
    is how a stranger offers to help, and `reisimine` for `leidma` and
    `kõndima`. The place on the card is a `word` prop, so the learner has to
    produce it, in the case the question wants.
  */
  units: [...COMMON, "kus-ja-kuhu", "ostmine", "kohasonad", "korraldused", "reisimine", "linn-ja-teenused", "omadussonad"],
  register: "teie",
  role: "You are new in town and looking for somewhere. The card says where. You stop somebody on the street.",
  props: [
    {
      kind: "word", slot: "place", oneOf: ["kohvik", "pank", "haigla", "jaam", "hotell", "turg"],
      says: "Where you are trying to get to.",
    },
  ],
  curveballs: ["faster", "small-talk", "english", "place-instruction", "not-possible", "interrupted"],
  beats: [
    {
      id: "greet",
      goal: "Say hello, or excuse yourself.",
      they: "They stop, and say hello.",
      move: "greet",
      topic: [...HELLOS, "Vabandust!"],
      needs: [{ kind: "lemma", oneOf: [...HELLOS, "Vabandust!"] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "where",
      goal: "Ask where the place on your card is.",
      they: "They wait for your question.",
      move: "ask",
      topic: ["aitama", "otsima", "koht"],
      needs: [{ kind: "question" }, { kind: "datum", slot: "place" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "way",
      goal: "Say the directions back, or say thank you.",
      they: "They tell you the way: straight on, then left.",
      move: "instruct",
      topic: ["otse", "vasak", "vasakul", "paremal", "edasi", "kõrval"],
      needs: [{ kind: "lemma", oneOf: ["otse", "vasak", "vasakul", "paremal", "edasi", "Aitäh!", "aitäh"] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "far",
      goal: "Ask whether it is near.",
      they: "They wait in case you have another question.",
      move: "confirm",
      awaits: true,
      topic: ["lähedal", "kõndima", "minut"],
      needs: [{ kind: "question" }],
      required: false,
      patience: 1,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They wish you luck and go on their way.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "found", when: ["greet", "where", "way", "close"], says: "You know the way, and you thanked them for it." },
    { id: "half", when: ["greet", "where"], says: "They told you the way. Whether you caught it is another matter." },
    { id: "lost", when: ["greet"], says: "They did not know the place either. That happens, and it was not your Estonian." },
    { id: "left", when: [], says: "You walked on. Somebody else will know." },
  ],
};

const TICKET: SceneSpec = {
  id: "bussipilet",
  title: "Buying a bus ticket",
  place: "The ticket window at the bus station",
  level: "A1",
  tests: "reisimine",
  units: [...COMMON, "ostmine", "reisimine", "kus-ja-kuhu", "omadussonad"],
  register: "teie",
  role: "You need a bus ticket. The card says where to and when. You are at the window.",
  props: [
    {
      kind: "word", slot: "to", oneOf: ["kesklinn", "jaam", "haigla", "ülikool", "rand"],
      says: "Where you are going.",
    },
    { kind: "time", slot: "time", from: 8, to: 20 },
  ],
  curveballs: ["wrong-price", "queue", "faster", "english", "not-possible", "slot-gone", "small-talk"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "The person at the window says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "want",
      goal: "Say you want a ticket.",
      they: "They ask what you need.",
      move: "ask",
      topic: ["pilet", "soovima", "ostma"],
      needs: [{ kind: "lemma", oneOf: ["pilet"] }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "to",
      goal: "Say where you are going. Your card says where.",
      they: "They ask where you are going.",
      move: "ask",
      topic: ["kuhu", "sõitma", "buss"],
      needs: [{ kind: "datum", slot: "to", grammCase: "ILLATIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "when",
      goal: "Say what time. Your card has it.",
      they: "They ask what time.",
      move: "ask",
      topic: ["kell", "aeg", "buss"],
      needs: [{ kind: "datum", slot: "time" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "pay",
      goal: "Say how you will pay, or just say yes.",
      they: "They ask whether you are paying by card.",
      move: "ask",
      topic: ["maksma", "kaart", "raha"],
      needs: [{
        kind: "anyOf",
        of: [
          /*
            "By card" is `kaardiga`, and `kaart` on its own is the word in
            the wrong case: understood, and said back as a person at a
            window says it. A yes or a no is the beat met as it was.
          */
          { kind: "case", lemma: "kaart", grammCase: "COMITATIVE" },
          { kind: "case", lemma: "raha", grammCase: "COMITATIVE" },
          { kind: "lemma", oneOf: ["jah", "ei", "maksma"] },
        ],
      }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They hand you the ticket and say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "ticket", when: ["greet", "want", "to", "when", "pay", "close"], says: "You have a ticket, for the right bus, and you paid for it." },
    { id: "ticket-thin", when: ["want", "to", "pay"], says: "You have a ticket. They guessed the time, so check it before you board." },
    { id: "no-bus", when: ["greet", "want", "to"], says: "There is no bus there today. That is the timetable, not your Estonian." },
    { id: "left", when: [], says: "You stepped away from the window. The next bus is in an hour." },
  ],
};

/*
  SEVEN MORE, FOR THE SITUATIONS PEOPLE ACTUALLY MEET.

  The first seven were the counters a learner meets in their first month.
  These are the ones the purpose doc (`docs/22-real-life.md`) is measured on
  and that had no scene: forty-five of the course's claims are live exchanges
  and seven had a rehearsal. A pharmacy, a restaurant table, a shop you ring
  before you go, the neighbor on the stairs, the first evening of a language
  course, a job interview and taking something back to a shop. Each tests a
  unit that already made the claim, each names only words its declared units
  teach, and each has an errand in `lib/collections/errands.ts` for the day
  after the rehearsal.
*/
const RESTAURANT: SceneSpec = {
  id: "restoranis-tellimine",
  title: "Ordering a meal",
  place: "A table in a restaurant, with the menu in front of you",
  level: "A2",
  tests: "restoranis",
  units: [...COMMON, "restoranis", "sook-ja-jook", "ostmine", "omadussonad", "inimesed"],
  register: "teie",
  role: "You are eating out on your own tonight. The card says what you would like to eat and drink, and the waiter has questions.",
  props: [
    {
      kind: "word", slot: "dish", oneOf: ["supp", "kala", "liha", "salat", "kartul"],
      says: "What you would like to eat.",
    },
    {
      kind: "word", slot: "drink", oneOf: ["vesi", "mahl", "kohv", "tee"],
      says: "What you would like to drink.",
    },
  ],
  curveballs: ["not-possible", "wrong-price", "small-talk", "faster", "english", "interrupted", "their-order", "queue"],
  beats: [
    {
      id: "greet",
      goal: "Say good evening.",
      they: "The waiter comes over and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "how-many",
      goal: "Say how many of you there are.",
      they: "They ask how many you are.",
      move: "ask",
      topic: ["mitu", "inimene", "üks", "kaks"],
      needs: [{ kind: "lemma", oneOf: ["üks", "kaks", "kolm", "mina", "ise"] }],
      required: false,
      patience: 2,
      shape: "word",
    },
    {
      id: "order",
      goal: "Say what you would like to eat. The card says what.",
      they: "They ask what you would like to eat.",
      move: "ask",
      topic: ["roog", "menüü", "soovima", "tellima", "sööma"],
      needs: [{ kind: "datum", slot: "dish" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "contents",
      goal: "Ask what is in it.",
      they: "They recommend a dish and wait.",
      move: "offer",
      topic: ["soovitama", "roog", "maitse", "hea"],
      needs: [{ kind: "question" }, { kind: "lemma", oneOf: ["roog", "liha", "kala", "köögivili", "salat", "supp", "maitse", "sees"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "drink",
      goal: "Say what you would like to drink. The card says what.",
      they: "They ask what you would like to drink.",
      move: "ask",
      topic: ["jook", "jooma", "vesi", "mahl"],
      needs: [{ kind: "datum", slot: "drink" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "bill",
      goal: "Ask for the bill.",
      meanwhile: "You have eaten. The waiter comes back to clear the table.",
      they: "They ask whether it was good.",
      move: "ask",
      topic: ["maitse", "hea", "arve", "maksma"],
      needs: [{ kind: "lemma", oneOf: ["arve", "maksma", "raha"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "fed", when: ["greet", "order", "contents", "drink", "bill", "close"], says: "You ate, you knew what was in it, and you paid. That is a whole evening out in Estonian." },
    { id: "fed-quiet", when: ["order", "drink", "bill"], says: "You ate and you paid. You never found out what was in it, and it was fine." },
    { id: "kitchen-closed", when: ["greet", "order"], says: "The kitchen had stopped serving hot food. You ordered like somebody who eats here, and that was the part that was yours." },
    { id: "left", when: [], says: "You left before ordering. There is a place round the corner, and you can come back." },
  ],
};

const PHONE: SceneSpec = {
  id: "helistamine",
  title: "Ringing a shop before you go",
  place: "Your kitchen, on the phone to a shop across town",
  level: "A2",
  tests: "suhtlemine",
  /*
    `kodu` for the thing you are after, `plaanid` for `sobima`, `ostmine` for
    the shop and the money. `linn-ja-teenused` because a shop that has a thing
    is a shop that has it in stock, which is `kaup`.
  */
  // `kodutood` for `avama` and `sulgema`, which is what a shop's opening
  // hours are said with and the one thing this call is about.
  units: [...COMMON, "suhtlemine", "kodu", "ostmine", "linn-ja-teenused", "plaanid", "omadussonad", "kodutood"],
  register: "teie",
  role: "You need something from a shop across town before the weekend, and you ring first rather than go and find it shut. The card says what you are after.",
  props: [
    {
      kind: "word", slot: "thing", oneOf: ["telefon", "arvuti", "raamat", "võti", "laud"],
      says: "What you are after.",
    },
    { kind: "time", slot: "open", from: 9, to: 11 },
  ],
  curveballs: ["faster", "english", "interrupted", "not-possible", "small-talk", "misheard"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "Somebody answers the phone and says the name of the shop.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "why",
      goal: "Say why you are ringing.",
      they: "They ask what it is about.",
      move: "ask",
      topic: ["helistama", "küsima", "aitama", "soovima"],
      needs: [{ kind: "lemma", oneOf: ["helistama", "küsima", "soovima", "tahtma", "ostma"] }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "have",
      goal: "Ask whether they have it. The card says what.",
      they: "They ask what you are looking for.",
      move: "ask",
      topic: ["kaup", "soovima", "tahtma", "ostma", "müüma"],
      needs: [{ kind: "datum", slot: "thing" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "hours",
      goal: "Ask when they are open.",
      they: "They say they have it, and wait.",
      move: "confirm",
      topic: ["kaup", "jah", "olema", "siin"],
      needs: [{ kind: "question" }, { kind: "lemma", oneOf: ["kell", "millal", "aeg", "homme", "päev", "täna"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "confirm",
      goal: "Say the time back, to check you heard it.",
      they: "They say when they open tomorrow: {open}.",
      move: "offer",
      topic: ["kell", "aeg", "homme"],
      says: [{ lemma: "homme" }, { lemma: "kell" }, { slot: "open" }],
      needs: [{ kind: "datum", slot: "open" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "sorted", when: ["greet", "why", "have", "hours", "confirm", "close"], says: "They have it, you know when they open, and you said the time back. Tomorrow is a trip and not a gamble." },
    { id: "sorted-thin", when: ["why", "have", "hours"], says: "They have it and they told you when. You did not check the time, so check it before you set off." },
    { id: "no-stock", when: ["greet", "why", "have"], says: "They are out of it until next week. You asked properly, and a phone call in Estonian is the hard one." },
    { id: "left", when: [], says: "You hung up. Shops have websites too, and you can ring again." },
  ],
};

const NEIGHBOR: SceneSpec = {
  id: "trepikoda",
  title: "The neighbor on the stairs",
  place: "The stairwell of your building, on your way up",
  level: "A1",
  tests: "inimesed",
  /*
    `riigid` for where you are from, which is the second question anybody in
    a stairwell asks, and `kodu` for the flat and the floor. `teie`, because
    a neighbor you met last week is not yet a friend on the phone.
  */
  units: [...COMMON, "inimesed", "kodu", "riigid", "omadussonad"],
  register: "teie",
  role: "You moved into the building last week. On the stairs you meet the person from the flat opposite, who stops to say hello. The card says where you are from and who lives with you.",
  props: [
    { kind: "number", slot: "floor", min: 1, max: 5, says: "You live on floor" },
    {
      kind: "word", slot: "from", oneOf: ["Soome", "Läti", "Saksamaa", "Inglismaa", "Ameerika", "Rootsi", "Venemaa"],
      says: "Where you are from.",
    },
    {
      kind: "word", slot: "with", oneOf: ["naine", "mees", "laps", "sõber", "ema", "vend", "õde"],
      says: "Who lives with you.",
    },
  ],
  curveballs: ["small-talk", "faster", "english", "interrupted", "misheard"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "Your neighbor stops on the landing and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "new",
      goal: "Say you are new here.",
      they: "They ask whether you have just moved in.",
      move: "ask",
      topic: ["uus", "korter", "maja", "elama"],
      needs: [{ kind: "lemma", oneOf: ["uus", "jah", "elama", "korter", "nüüd"] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "floor",
      goal: "Say which floor you live on. Your card says which.",
      they: "They ask which floor you are on.",
      move: "ask",
      topic: ["korrus", "korter", "kus", "elama"],
      needs: [{ kind: "datum", slot: "floor" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "from",
      goal: "Say where you are from. Your card says where.",
      they: "They ask where you are from.",
      move: "ask",
      topic: ["kust", "kodumaa", "välismaalane", "Eesti"],
      needs: [{ kind: "datum", slot: "from" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "with",
      goal: "Say who lives with you. Your card says who.",
      they: "They ask whether you live alone.",
      move: "ask",
      topic: ["pere", "inimene", "elama", "ise"],
      needs: [{ kind: "datum", slot: "with" }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "weather",
      goal: "Say something about the weather.",
      they: "They say something about the weather.",
      move: "offer",
      topic: ["ilm", "vihm", "lumi", "tuul", "päike", "ilus"],
      needs: [{ kind: "any" }],
      required: false,
      patience: 1,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      they: "They say goodbye and go on down.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "neighbors", when: ["greet", "new", "floor", "from", "with", "close"], says: "You have a neighbor now, and they know your floor. That is how a building starts to know you." },
    { id: "neighbors-thin", when: ["new", "from", "with"], says: "They know you are new and where you are from. The rest can wait for the next flight of stairs." },
    { id: "rushed", when: ["greet", "new"], says: "They had a bus to catch. You said hello, and there are more stairs tomorrow." },
    { id: "left", when: [], says: "You went on up. The stairs will be there tomorrow, and so will they." },
  ],
};

const PHARMACY: SceneSpec = {
  id: "apteek",
  title: "At the pharmacy counter",
  place: "The counter of a pharmacy, with a queue behind you",
  level: "A2",
  tests: "keha-ja-tervis",
  /*
    `restoranis` for `soovitama`, since a pharmacist recommends; `plaanid` for
    `sobima` and `kestma`; `ostmine` for the price and the paying. The doctor
    scene tests the same claim, and this is the half of it people meet more
    often: most of what hurts never reaches a doctor.
  */
  // `minevik` for `ootama`: a pharmacist says "one moment, wait here", and
  // the eval withheld a line over the polite imperative of it.
  units: [...COMMON, "keha-ja-tervis", "restoranis", "plaanid", "ostmine", "omadussonad", "linn-ja-teenused", "minevik"],
  register: "teie",
  role: "Something has been hurting since earlier in the week and you would rather not see a doctor for it. You are at the pharmacy counter. The card says what hurts and since when.",
  props: [
    {
      kind: "word", slot: "hurts", oneOf: ["pea", "kõrv", "selg", "jalg", "käsi", "silm"],
      says: "What hurts.",
    },
    {
      kind: "weekday", slot: "since",
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "It started on this day.",
    },
  ],
  curveballs: ["not-possible", "wrong-price", "queue", "faster", "english", "small-talk", "misheard", "place-instruction", "missing-document"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "The pharmacist looks up and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "what",
      goal: "Say what hurts. Your card says what.",
      they: "They ask what they can help with.",
      move: "ask",
      topic: ["aitama", "valu", "valutama", "tervis", "haige"],
      needs: [{ kind: "datum", slot: "hurts" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "since",
      goal: "Say since when. Your card says which day.",
      they: "They ask how long it has hurt.",
      move: "ask",
      topic: ["kaua", "päev", "aeg", "kestma", "eile"],
      needs: [{ kind: "datum", slot: "since" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "medicine",
      goal: "Ask what they recommend.",
      they: "They think for a moment.",
      move: "confirm",
      topic: ["ravim", "hea", "aitama", "soovitama"],
      needs: [{ kind: "question" }, { kind: "lemma", oneOf: ["ravim", "soovitama", "hea", "aitama", "mis"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "how",
      goal: "Ask how often to take it.",
      they: "They put a box on the counter and say what it is.",
      move: "offer",
      topic: ["ravim", "hea", "valu", "aitama"],
      needs: [{ kind: "question" }, { kind: "lemma", oneOf: ["päev", "mitu", "kuidas", "millal", "hommik", "õhtu", "võtma"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "pay",
      goal: "Pay.",
      they: "They say how to take it, and the price.",
      move: "instruct",
      topic: ["hommik", "õhtu", "päev", "hind", "maksma"],
      needs: [{ kind: "lemma", oneOf: ["maksma", "raha", "jah", "aitäh"] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They say goodbye and look past you at the queue.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "sorted", when: ["greet", "what", "since", "medicine", "how", "pay", "close"], says: "You have something for it and you know how to take it. Nobody switched, and the queue survived." },
    { id: "sorted-thin", when: ["what", "medicine", "pay"], says: "You have something for it. You did not ask how often, so read the box before you take one." },
    { id: "see-doctor", when: ["greet", "what", "since"], says: "They said this one needs a doctor rather than a pharmacy. You explained it well enough for them to say so." },
    { id: "left", when: [], says: "You stepped out of the queue. Pharmacies are open late, and you can come back." },
  ],
};

const COURSE: SceneSpec = {
  id: "keeletund",
  title: "The first evening of a language course",
  place: "A classroom, the teacher going round the room",
  level: "A2",
  tests: "kool-ja-keel",
  /*
    `riigid` for where you are from and `inimesed` for the people you are
    learning it for. The teacher is `teie`, on the first evening at least.
  */
  units: [...COMMON, "kool-ja-keel", "riigid", "inimesed", "omadussonad"],
  register: "teie",
  role: "It is the first evening of an Estonian course and the teacher is going round the room. The card says where you are from and why you are learning. Any name will do; you are not yourself today.",
  props: [
    {
      kind: "word", slot: "from", oneOf: ["Soome", "Saksamaa", "Inglismaa", "Ameerika", "Läti", "Rootsi"],
      says: "Where you are from.",
    },
    {
      kind: "word", slot: "why", oneOf: ["töö", "pere", "kool", "sõber"],
      says: "Why you are learning Estonian: because of this.",
    },
  ],
  curveballs: ["faster", "english", "small-talk", "interrupted", "other-register", "misheard"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "The teacher turns to you and says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "name",
      goal: "Say your name. Any name.",
      they: "They ask your name.",
      move: "ask",
      topic: ["nimi", "kes", "olema"],
      needs: [{ kind: "lemma", oneOf: ["nimi", "olema", "mina"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "from",
      goal: "Say where you are from. Your card says where.",
      they: "They ask where you are from.",
      move: "ask",
      topic: ["kust", "kodumaa", "Eesti", "välismaalane"],
      needs: [{ kind: "datum", slot: "from" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "why",
      goal: "Say why you are learning Estonian. Your card says why.",
      they: "They ask why you are learning Estonian.",
      move: "ask",
      topic: ["miks", "õppima", "keel", "sest"],
      needs: [{ kind: "datum", slot: "why" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "word",
      goal: "Ask what a word means, or ask them to say it again.",
      they: "They use a word you do not know, and carry on.",
      move: "instruct",
      topic: ["sõna", "lause", "harjutus", "näide", "kordama"],
      needs: [{ kind: "question" }, { kind: "lemma", oneOf: ["sõna", "kordama", "seletama", "uuesti", "aeglane", "tõlkima"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "howlong",
      goal: "Say how long you have been learning.",
      they: "They ask how long you have studied Estonian.",
      move: "ask",
      topic: ["kaua", "õppima", "aasta", "kuu", "nädal"],
      needs: [{ kind: "lemma", oneOf: ["aasta", "kuu", "nädal", "päev", "kaua", "juba", "veel", "alati", "ammu"] }],
      required: false,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say thank you.",
      they: "They thank you and turn to the next person.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "introduced", when: ["greet", "name", "from", "why", "word", "close"], says: "The room knows who you are and why you are here, and you asked about a word instead of nodding. That is the whole of a first evening." },
    { id: "introduced-thin", when: ["name", "why", "word"], says: "They know your name and why you are here. You asked about the word, which is the part most people skip." },
    { id: "moved-on", when: ["greet", "name"], says: "The teacher moved on to the next person before you got going. There are twelve more Tuesdays." },
    { id: "left", when: [], says: "You slipped out at the break. The course is still there on Thursday." },
  ],
};

const INTERVIEW: SceneSpec = {
  id: "toovestlus",
  title: "A job interview",
  place: "A small meeting room, across the table from the person hiring",
  level: "B1",
  tests: "too-ja-raha",
  /*
    `kus-ja-kuhu` and `ostmine` for the places you worked before, `kodu` for
    the computer, `kool-ja-keel` for the language, `minevik` for saying what
    you did, `plaanid` for when you could start and `haridus` for the
    course you did.
  */
  units: [...COMMON, "too-ja-raha", "haridus", "kool-ja-keel", "kus-ja-kuhu", "ostmine", "kodu", "minevik", "plaanid", "omadussonad", "inimesed"],
  register: "teie",
  role: "You are being interviewed for a job. The card says where you worked before, what you are good at and when you could start. None of it is about your real life.",
  props: [
    {
      kind: "word", slot: "before", oneOf: ["kool", "ülikool", "kohvik", "haigla", "pood", "hotell"],
      says: "Where you worked before.",
    },
    {
      kind: "word", slot: "skill", oneOf: ["keel", "arvuti", "projekt", "inimene"],
      says: "What you are good at: this.",
    },
    {
      kind: "weekday", slot: "start",
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "When you could start.",
    },
  ],
  curveballs: ["faster", "english", "small-talk", "interrupted", "other-register", "not-possible", "contradiction", "their-order"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "They stand up, shake your hand and say hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "before",
      goal: "Say where you worked before. Your card says where.",
      they: "They ask what you did before.",
      move: "ask",
      topic: ["töö", "töötama", "varem", "kogemus", "ettevõte"],
      needs: [{ kind: "datum", slot: "before" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "skill",
      goal: "Say what you are good at. Your card says what.",
      they: "They ask what you are good at.",
      move: "ask",
      topic: ["oskus", "hästi", "teadma", "kogemus"],
      needs: [{ kind: "datum", slot: "skill" }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "why",
      goal: "Say why you want this job.",
      they: "They ask why you want this job.",
      move: "ask",
      topic: ["miks", "tahtma", "töö", "ettevõte"],
      needs: [{ kind: "lemma", oneOf: ["sest", "tahtma", "hea", "töö", "ettevõte", "kogemus", "uus"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "pay",
      goal: "Ask about the pay.",
      they: "They ask whether you have any questions.",
      move: "ask",
      topic: ["küsimus", "küsima", "palk", "leping"],
      needs: [{ kind: "question" }, { kind: "lemma", oneOf: ["palk", "raha", "maksma", "leping"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "start",
      goal: "Say when you could start. Your card says which day.",
      they: "They ask when you could start.",
      move: "ask",
      topic: ["millal", "alustama", "algama", "päev"],
      needs: [{ kind: "datum", slot: "start" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They thank you for coming and say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "offered", when: ["greet", "before", "skill", "why", "pay", "start", "close"], says: "They will be in touch, and this time they meant it. You said what you did, what you can do and what you want, in Estonian." },
    { id: "offered-thin", when: ["before", "skill", "start"], says: "They know what you did and when you could start. You never asked about the money, and you should have." },
    { id: "no-decision", when: ["greet", "before", "skill"], says: "They will let you know. They always say that, and you got through the hard half in Estonian." },
    { id: "left", when: [], says: "You ended it early. There are other jobs, and this one was a rehearsal." },
  ],
};

const COMPLAINT: SceneSpec = {
  id: "kaebus",
  title: "Taking something back to the shop",
  place: "The service desk of the shop you bought it from",
  level: "B1",
  tests: "probleemid",
  /*
    `kodu` for the thing you bought, `linn-ja-teenused` for the receipt and
    the customer, `kodutood` for `parandama`, `minevik` for saying when.
  */
  units: [...COMMON, "probleemid", "ostmine", "kodu", "linn-ja-teenused", "kodutood", "minevik", "plaanid", "omadussonad"],
  register: "teie",
  role: "Something you bought last week stopped working. You are back at the shop with it. The card says what it is and when you bought it.",
  props: [
    {
      kind: "word", slot: "item", oneOf: ["telefon", "arvuti", "tool", "laud", "klaas"],
      says: "What you bought.",
    },
    {
      kind: "weekday", slot: "bought",
      oneOf: ["esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede"],
      says: "When you bought it.",
    },
  ],
  curveballs: ["not-possible", "contradiction", "their-order", "missing-document", "queue", "english", "faster", "wrong-price", "small-talk"],
  beats: [
    {
      id: "greet",
      goal: "Say hello.",
      they: "The person at the desk says hello.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "problem",
      goal: "Say what you bought and that there is a problem with it. The card says what.",
      they: "They ask what the matter is.",
      move: "ask",
      topic: ["probleem", "viga", "kaebus", "aitama"],
      needs: [{ kind: "datum", slot: "item" }, { kind: "lemma", oneOf: ["probleem", "viga", "halb", "kahju", "töötama", "vana"] }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "when",
      goal: "Say when you bought it. Your card says which day.",
      they: "They ask when you bought it.",
      move: "ask",
      topic: ["millal", "ostma", "päev", "eile"],
      needs: [{ kind: "datum", slot: "bought" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "receipt",
      goal: "Say whether you have the receipt.",
      they: "They ask whether you have the receipt.",
      move: "ask",
      topic: ["dokument", "arve", "kaasas"],
      needs: [{ kind: "lemma", oneOf: ["jah", "ei", "arve", "dokument", "kaasas"] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "want",
      goal: "Say what you want done about it: your money back, or it repaired.",
      they: "They ask what you would like them to do.",
      move: "ask",
      topic: ["raha", "parandama", "lahendus", "uus", "hüvitis"],
      needs: [{ kind: "lemma", oneOf: ["raha", "parandama", "uus", "lahendus", "hüvitis"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "insist",
      goal: "Hold your ground, politely.",
      they: "They say that is not possible.",
      move: "refuse",
      topic: ["saama", "võimalus", "lahendus", "kaebus"],
      needs: [{ kind: "lemma", oneOf: ["kaebus", "kaebama", "lahendus", "hüvitis", "probleem", "klient"] }],
      required: false,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      they: "They say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
  outcomes: [
    { id: "fixed", when: ["greet", "problem", "when", "receipt", "want", "close"], says: "They are taking it back. You said what was wrong, when, and what you wanted, and you did not switch." },
    { id: "sent-on", when: ["greet", "problem", "when"], says: "They sent you to the maker rather than dealing with it here. That is the shop, not your Estonian, and you have it in writing." },
    { id: "fixed-thin", when: ["problem", "want"], says: "They know what is wrong and what you want. The paperwork is theirs now." },
    { id: "left", when: [], says: "You took it home again. It still does not work, and you can come back." },
  ],
};

export const SCENES: readonly SceneSpec[] = [
  SHOP, DOCTOR, LANDLORD, COUNTER, CAFE, DIRECTIONS, TICKET,
  RESTAURANT, PHONE, NEIGHBOR, PHARMACY, COURSE, INTERVIEW, COMPLAINT,
];

export function sceneById(id: string): SceneSpec | undefined {
  return SCENES.find((s) => s.id === id);
}

/**
 * The scene that tests a unit's own "you can do this" claim, if one does.
 *
 * Read by the unit page and by Progress's list of claims, so a unit is linked
 * to the conversation that tests it from the two places somebody would look.
 */
export function sceneTesting(unitId: string): SceneSpec | undefined {
  return SCENES.find((s) => s.tests === unitId);
}
