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
 * The three are the ones `docs/19-situations.md` §19 names, chosen because the
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
*/
const COMMON = [
  "tervitused", "kusisonad", "asesonad", "aeg", "arvud", "korraldused", "pohiverbid",
  "sidesonad", "vastused", "maaramine", "millal",
] as const;

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

export const SCENES: readonly SceneSpec[] = [DOCTOR, LANDLORD, COUNTER];

export function sceneById(id: string): SceneSpec | undefined {
  return SCENES.find((s) => s.id === id);
}
