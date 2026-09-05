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
import type { SceneSpec } from "./types";

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
 * fails the catalogue test rather than reaching a screen. Capitalising one and
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
} as const;

/** The closing phrases, which are the same wherever you are leaving. */
const FAREWELLS = ["Head aega!", "Nägemist!", "Aitäh!"] as const;

const HELLOS = ["Tere!", "Tere hommikust!"] as const;

const DOCTOR: SceneSpec = {
  id: "arsti-aeg",
  title: "Booking a doctor's appointment",
  place: "The reception desk at a health centre",
  level: "A2",
  tests: "keha-ja-tervis",
  /*
    `inimesed` teaches `arst`, and a scene at a health centre whose word list
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
    THE LEARNER NEVER PLAYS THEMSELVES (§3), and at a health centre that is a
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
  ],
  curveballs: [
    "slot-gone", "small-talk", "faster", "queue", "not-possible",
    "other-register", "english", "missing-document", "place-instruction",
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
      needs: [{ kind: "lemma", oneOf: ["valu", "haigus", "haige", "palavik", "väsinud"] }],
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
      needs: [{ kind: "anyOf", of: [
        { kind: "datum", slot: "time" },
        { kind: "lemma", oneOf: ["sobima", "hea", "jah"] },
        { kind: "negation" },
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
    the same two the health centre needs, and `omadussonad` for the same reason.
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
  ],
  /*
    No queue: this one is a telephone call, so the only curveball in the
    catalogue with no words in it has nowhere to happen. A scene admits what
    could actually occur in it, which is the same discipline as declaring the
    units its words come from.
  */
  curveballs: [
    "slot-gone", "not-possible", "faster", "small-talk", "interrupted",
    "english", "wrong-price", "other-register", "missing-document",
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
      needs: [{ kind: "lemma", oneOf: ["küte", "elekter", "remont", "lekkima", "mööbel", "ruum"] }],
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
      goal: "Say since when.",
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
      needs: [{ kind: "anyOf", of: [
        { kind: "datum", slot: "time" },
        { kind: "datum", slot: "day" },
        { kind: "lemma", oneOf: ["sobima", "hea", "jah"] },
        { kind: "negation" },
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
      says: "They know what is broken, where, and since when, and you settled between you when somebody comes.",
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
  role: "You have a form to hand in. You were given a reference for it and you are at the desk that takes them.",
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
    "not-possible", "english", "small-talk", "other-register", "wrong-price",
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
      goal: "Fill it in as they ask, not as you planned.",
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
  role: "You are at home and there is no milk. You are going to the corner shop for some, and a friend keeps ringing to ask where you have got to.",
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
      goal: "Say where you are going.",
      they: "Your friend asks where you are off to.",
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
      goal: "Say where you are now.",
      they: "A little later they ring again and ask where you are now.",
      move: "ask",
      topic: ["pood", "olema", "kus"],
      needs: [{ kind: "case", lemma: "pood", grammCase: "INESSIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "item",
      goal: "Say what you want.",
      they: "They ask what you are getting.",
      move: "ask",
      topic: ["piim", "tahtma", "ostma", "mis"],
      needs: [{ kind: "case", lemma: "piim", grammCase: "PARTITIVE" }],
      required: true,
      patience: 3,
      shape: "word",
    },
    {
      id: "back",
      goal: "Say where you are coming from.",
      they: "On the way home they ring once more and ask where you are coming from.",
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
  curveballs: ["not-possible", "wrong-price", "small-talk", "faster", "queue", "english", "interrupted"],
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
      goal: "Say what you would like.",
      they: "They ask what you would like.",
      move: "ask",
      topic: ["kohv", "tee", "jook", "soovima", "tellima"],
      needs: [{ kind: "datum", slot: "drink" }],
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
      goal: "Say where to.",
      they: "They ask where you are going.",
      move: "ask",
      topic: ["kuhu", "sõitma", "buss"],
      needs: [{ kind: "datum", slot: "to" }],
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
      needs: [{ kind: "lemma", oneOf: ["kaart", "raha", "jah", "ei", "maksma"] }],
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

export const SCENES: readonly SceneSpec[] = [SHOP, DOCTOR, LANDLORD, COUNTER, CAFE, DIRECTIONS, TICKET];

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
