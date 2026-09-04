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
 * Three are the ones `docs/21-situations.md` §19 names, chosen because the
 * course already promises all three in as many words, and a fourth at A1 is
 * the door a beginner walks in through:
 *
 *   ostmine          "Buy something, ask the price, and find your way to a
 *                     place in town."
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
*/
const COMMON = [
  "tervitused", "kusisonad", "asesonad", "aeg", "arvud", "korraldused", "pohiverbid",
  "sidesonad", "vastused", "maaramine", "millal", "ilm",
] as const;

/**
 * The same list for a scene at A1, which may not lean on an A2 unit.
 *
 * `korraldused` is the polite request and is A2; a beginner's shop does
 * without it. `ilm` is in both, because small talk about the weather is the
 * one curveball every counter in the country shares.
 */
const COMMON_A1 = COMMON.filter((id) => id !== "korraldused");

/**
 * Who might be behind a desk. The voice is the name (see `personas.ts`), and
 * no two personas in one scene share one, so a second speaker sounds like a
 * second person.
 */
const DESK: SceneSpec["personas"] = [
  { voice: "mari", agenda: "thorough" },
  { voice: "tambet", agenda: "brisk" },
  { voice: "liivika", agenda: "new" },
  { voice: "kalev", agenda: "script" },
];

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
  */
  units: [...COMMON, "keha-ja-tervis", "inimesed"],
  register: "teie",
  personas: DESK,
  props: [
    { id: "since", kind: "weekday", label: "It started on" },
    { id: "time", kind: "clock", label: "The time you would like" },
    { id: "time2", kind: "clock", label: "Another time they might offer" },
  ],
  curveballs: ["gone", "english", "smalltalk", "speed", "queue", "notPossible"],
  role: {
    who: "A patient at the health centre, without an appointment yet.",
    wants: "An appointment with the doctor this week.",
    facts: [
      "Your throat has hurt since {since}.",
      "You would like to come at {time}.",
      "You can manage another time if you have to.",
    ],
  },
  outcomes: [
    {
      id: "booked",
      when: ["reason", "where", "since", "offer"],
      says: "You have an appointment. It is at the time you agreed on, which may not be the one you asked for.",
    },
    {
      id: "vague",
      when: ["reason", "offer"],
      says: "You have an appointment, and they are not quite sure what it is for.",
    },
    {
      id: "none",
      when: [],
      says: "You left without an appointment. The receptionist was not being difficult; the words were not there yet.",
    },
  ],
  beats: [
    {
      id: "greet",
      goal: "Greet them back.",
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
      move: "ask",
      topic: ["pea", "kõrv", "käsi", "jalg", "selg", "silm", "nina", "suu", "keha"],
      needs: [{ kind: "lemma", oneOf: ["pea", "kõrv", "käsi", "jalg", "selg", "silm", "nina", "suu", "süda", "keha"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "since",
      goal: "Say how long it has been going on.",
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
      move: "offer",
      topic: ["aeg", "kell", "tund", "päev"],
      needs: [{ kind: "datum", slot: "time" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "confirm",
      goal: "Check they have it right.",
      move: "confirm",
      topic: ["aeg", "kell", "päev"],
      needs: [{ kind: "any" }],
      required: false,
      patience: 1,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
};

const LANDLORD: SceneSpec = {
  id: "uuri-remont",
  title: "Telling a landlord something is broken",
  place: "A phone call to the person you rent from",
  level: "B1",
  tests: "eluase",
  // `eluase` is the vocabulary of renting; `kodu` is the vocabulary of the flat
  // itself, and a scene about something broken in one needs both.
  units: [...COMMON, "eluase", "kodu"],
  register: "teie",
  personas: [
    { voice: "peeter", agenda: "brisk" },
    { voice: "kylli", agenda: "thorough" },
    { voice: "meelis", agenda: "script" },
  ],
  props: [
    { id: "floor", kind: "number", label: "Your floor" },
    { id: "since", kind: "weekday", label: "It has been broken since" },
    { id: "time", kind: "clock", label: "When you can be at home" },
    { id: "time2", kind: "clock", label: "Another time you could manage" },
  ],
  curveballs: ["gone", "english", "smalltalk", "speed", "notPossible"],
  role: {
    who: "A tenant, on the phone to the person you rent from.",
    wants: "Somebody to come and look at it, this week.",
    facts: [
      "The heating in your flat stopped working on {since}.",
      "You live on floor {floor}.",
      "You can be at home at {time}.",
    ],
  },
  outcomes: [
    {
      id: "coming",
      when: ["problem", "where", "since", "agree"],
      says: "Somebody is coming to look at it, on the day and at the time you agreed.",
    },
    {
      id: "noted",
      when: ["problem", "agree"],
      says: "They know something is wrong and will come round, though they are not sure what to bring.",
    },
    {
      id: "none",
      when: [],
      says: "The call ended and nothing is arranged. It is still broken, and it is still worth calling again.",
    },
  ],
  beats: [
    {
      id: "greet",
      goal: "Say who you are.",
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
      move: "ask",
      topic: ["ruum", "kord", "naaber"],
      needs: [{ kind: "lemma", oneOf: ["ruum", "kord"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "since",
      goal: "Say since when.",
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
      move: "offer",
      topic: ["aeg", "päev", "kell", "üürima"],
      needs: [{ kind: "datum", slot: "time" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "close",
      goal: "Say goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
};

const COUNTER: SceneSpec = {
  id: "ametiasutus",
  title: "Handing in a form at a counter",
  place: "The desk at an office that wants your paperwork",
  level: "A2",
  tests: "linn-ja-teenused",
  // `suhtlemine` teaches `aadress`, `kiri`, `teatama` and `helistama`, which is
  // what a counter asks you for and what it tells you it will do next.
  units: [...COMMON, "linn-ja-teenused", "suhtlemine"],
  register: "teie",
  personas: [
    { voice: "vesta", agenda: "script" },
    { voice: "albert", agenda: "brisk" },
    { voice: "indrek", agenda: "new" },
    { voice: "lee", agenda: "thorough" },
  ],
  props: [
    { id: "code", kind: "code", label: "The reference number on your letter" },
    { id: "time", kind: "clock", label: "When you could come back" },
  ],
  curveballs: ["missing", "english", "smalltalk", "speed", "queue", "notPossible"],
  role: {
    who: "Somebody with a letter that says to come in with a form.",
    wants: "To hand the form in and be told when it will be dealt with.",
    facts: [
      "Your letter carries the reference {code}.",
      "You have the form, filled in, and your ID.",
      "You do not have a photograph with you.",
    ],
  },
  outcomes: [
    {
      id: "handed",
      when: ["purpose", "document", "fill", "confirm"],
      says: "The form is in, and you know when to expect an answer.",
    },
    {
      id: "partial",
      when: ["purpose", "document"],
      says: "The form is in. Nobody said when you would hear, so you will be back.",
    },
    {
      id: "none",
      when: [],
      says: "You still have the form. The person at the desk was not unhelpful; you two did not find the words between you yet.",
    },
  ],
  beats: [
    {
      id: "greet",
      goal: "Greet them back.",
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
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
};


/**
 * The A1 scene, so the empty state is a door rather than an explanation:
 * somebody who has done the first three units can walk into this one.
 */
const SHOP: SceneSpec = {
  id: "pood",
  title: "Buying something in a shop",
  place: "The counter of a small shop",
  level: "A1",
  tests: "ostmine",
  units: [...COMMON_A1, "ostmine", "sook-ja-jook"],
  register: "teie",
  personas: [
    { voice: "luukas", agenda: "brisk" },
    { voice: "mari", agenda: "new" },
    { voice: "kalev", agenda: "thorough" },
  ],
  props: [
    { id: "count", kind: "number", label: "How many you want" },
  ],
  curveballs: ["english", "smalltalk", "speed", "queue", "notPossible"],
  role: {
    who: "A customer, at the counter, with a short list.",
    wants: "Bread, and to know what it costs.",
    facts: [
      "You want {count} of them.",
      "You are paying by card.",
    ],
  },
  outcomes: [
    { id: "bought", when: ["want", "howmany", "price"], says: "You bought what you came for, and you know what it cost." },
    { id: "some", when: ["want"], says: "You got something, though not quite what you asked for or in the amount you meant." },
    { id: "none", when: [], says: "You left with nothing. Shops are patient; try the same one tomorrow." },
  ],
  beats: [
    {
      id: "greet",
      goal: "Greet them back.",
      move: "greet",
      topic: [...HELLOS],
      needs: [{ kind: "lemma", oneOf: [...HELLOS] }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "want",
      goal: "Say what you would like.",
      move: "ask",
      topic: ["leib", "sai", "kohv", "piim", "juust", "toit"],
      needs: [{ kind: "lemma", oneOf: ["leib", "sai", "kohv", "piim", "mahl", "juust", "õun", "kartul", "liha", "kala", "muna", "või"] }],
      required: true,
      patience: 3,
      shape: "sentence",
    },
    {
      id: "howmany",
      goal: "Say how many.",
      move: "ask",
      topic: ["mitu", "palju", "number"],
      needs: [{ kind: "datum", slot: "count" }],
      required: true,
      patience: 2,
      shape: "word",
    },
    {
      id: "price",
      goal: "Ask what it costs, or say you will pay.",
      move: "confirm",
      topic: ["hind", "raha", "maksma"],
      needs: [{ kind: "lemma", oneOf: ["maksma", "hind", "raha"] }],
      required: true,
      patience: 2,
      shape: "sentence",
    },
    {
      id: "close",
      goal: "Say thank you, and goodbye.",
      move: "close",
      topic: [...FAREWELLS],
      needs: [{ kind: "lemma", oneOf: [...FAREWELLS] }],
      required: true,
      patience: 1,
      shape: "word",
    },
  ],
};

export const SCENES: readonly SceneSpec[] = [SHOP, DOCTOR, LANDLORD, COUNTER];

export function sceneById(id: string): SceneSpec | undefined {
  return SCENES.find((s) => s.id === id);
}
