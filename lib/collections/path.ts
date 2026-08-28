/**
 * The learning path: the built-in dictionary, arranged into units you can work
 * through in order.
 *
 * Duolingo's real insight is not the owl — it is that "here are 360 words, good
 * luck" is not a course, and that a learner needs a next thing rather than a
 * search box. So the same vocabulary the dictionary already holds is grouped
 * into themed units, ordered roughly by CEFR, each small enough (8–20 words) to
 * finish in a sitting.
 *
 * Units are **references, not copies**: a unit lists lemmas, and everything
 * about a word — its principal parts, its gradation, its audio — still comes
 * from the one Lexeme row. Nothing is duplicated, so correcting a word corrects
 * it everywhere, and a unit can never drift out of step with the dictionary.
 * A unit lemma that is missing from the dictionary is simply skipped at render
 * time; `path.test.ts` asserts the seed data actually carries all of them.
 *
 * Framework-free on purpose (same rule as lib/estonian/): plain data plus pure
 * functions, so it can be unit-tested without a database.
 */

import type { CardType } from "@/lib/srs/cards";

export interface PathUnit {
  id: string;
  /** Estonian title — this is a course in Estonian, the titles should be too. */
  title: string;
  /** English subtitle, so a beginner is never blocked by the title itself. */
  subtitle: string;
  /** Lucide icon name, mapped to a component in the UI. */
  icon: string;
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  /** One line on why this unit is worth doing now. */
  blurb: string;
  /** Card types added when the whole unit goes into the deck. */
  cardTypes: CardType[];
  lemmas: string[];
}

const RECALL: CardType[] = ["RECOGNITION", "PRODUCTION"];
const RECALL_AND_CASES: CardType[] = ["RECOGNITION", "PRODUCTION", "CASE_FORM"];
const RECALL_AND_GOVERNMENT: CardType[] = ["RECOGNITION", "PRODUCTION", "GOVERNMENT"];

export const PATH: readonly PathUnit[] = [
  {
    id: "tervitused",
    title: "Tervitused",
    subtitle: "Greetings and getting by",
    icon: "Hand",
    cefr: "A1",
    blurb: "The twenty phrases that get you through a first conversation without grammar.",
    cardTypes: RECALL,
    lemmas: [
      "Tere!", "Tere hommikust!", "Head aega!", "Nägemist!", "Aitäh!", "Palun", "Vabandust!",
      "Kuidas läheb?", "Ma ei saa aru", "Kas sa räägid inglise keelt?", "Ma õpin eesti keelt",
      "Mis kell on?", "Kui palju see maksab?", "Mulle meeldib see", "Head isu!", "Palju õnne!",
      "Mul on hea meel", "Kas ma võin küsida?", "Ma ei tea veel", "See on väga hea mõte",
    ],
  },
  {
    id: "inimesed",
    title: "Inimesed",
    subtitle: "People and family",
    icon: "Users",
    cefr: "A1",
    blurb: "Who is in the room. Also your first gradation: sõber : sõbra.",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["inimene", "naine", "mees", "laps", "sõber", "ema", "isa", "pere", "õpetaja", "õpilane", "arst"],
  },
  {
    id: "kodu",
    title: "Kodu",
    subtitle: "Home and everyday objects",
    icon: "House",
    cefr: "A1",
    blurb: "Things you can point at — the easiest place to meet the inessive (toas, köögis).",
    cardTypes: RECALL_AND_CASES,
    lemmas: [
      "maja", "tuba", "köök", "korter", "uks", "aken", "laud", "tool", "voodi",
      "raamat", "arvuti", "telefon", "võti", "klaas", "tass", "pilt",
    ],
  },
  {
    id: "sook-ja-jook",
    title: "Söök ja jook",
    subtitle: "Food and drink",
    icon: "Utensils",
    cefr: "A1",
    blurb: "Enough to order, shop and read a menu. The partitive lives here (ma joon kohvi).",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["toit", "leib", "kohv", "vesi", "liha", "kala", "õun", "kartul", "juust", "sool", "söök", "jook"],
  },
  {
    id: "aeg",
    title: "Aeg",
    subtitle: "Days, hours and when things happen",
    icon: "Clock",
    cefr: "A1",
    blurb: "Time words carry the adessive and elative constantly — hommikul, esmaspäevast.",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["aeg", "päev", "öö", "hommik", "õhtu", "nädal", "kuu", "aasta", "tund"],
  },
  {
    id: "pohiverbid",
    title: "Põhiverbid",
    subtitle: "The irregular core",
    icon: "Zap",
    cefr: "A1",
    blurb: "Ten verbs that break the rules and are used constantly. Learn these as forms, not patterns.",
    cardTypes: RECALL,
    lemmas: ["olema", "minema", "tulema", "tegema", "saama", "pidama", "sööma", "jooma", "tooma", "viima"],
  },
  {
    id: "iga-paev",
    title: "Iga päev",
    subtitle: "Everyday actions",
    icon: "Footprints",
    cefr: "A1",
    blurb: "What you do all day, in the two infinitives Estonian actually uses.",
    cardTypes: RECALL,
    lemmas: [
      "tahtma", "teadma", "tundma", "nägema", "kuulma", "rääkima", "ütlema", "küsima", "vastama",
      "lugema", "kirjutama", "õppima", "töötama", "elama", "magama",
    ],
  },
  {
    id: "ostmine",
    title: "Poes ja tänaval",
    subtitle: "Shopping and getting around",
    icon: "ShoppingBag",
    cefr: "A1",
    blurb: "Buying, paying, going. Verbs and places together, because that is how they turn up.",
    cardTypes: RECALL,
    lemmas: [
      "pood", "turg", "raha", "hind", "pilet", "ostma", "müüma", "maksma", "andma", "võtma",
      "linn", "tänav", "tee", "buss", "rong", "auto",
    ],
  },
  {
    id: "omadussonad",
    title: "Omadussõnad",
    subtitle: "Describing things",
    icon: "Palette",
    cefr: "A1",
    blurb: "Adjectives agree with their noun in Estonian, so every one you learn pays for itself.",
    cardTypes: RECALL_AND_CASES,
    lemmas: [
      "suur", "väike", "hea", "halb", "uus", "vana", "noor", "pikk", "lühike", "kiire", "aeglane",
      "kallis", "odav", "ilus", "tore", "raske", "kerge", "lihtne", "külm", "soe",
    ],
  },
  {
    id: "rektsioon",
    title: "Rektsioon",
    subtitle: "Verbs that demand a case",
    icon: "Target",
    cefr: "A1",
    blurb:
      "The unit English speakers get wrong for years: aitan sind, helistan sulle, mulle meeldib. " +
      "Each card asks which case the verb takes.",
    cardTypes: RECALL_AND_GOVERNMENT,
    lemmas: ["aitama", "helistama", "meeldima", "mõtlema", "ootama", "armastama", "uskuma", "kartma", "vajama"],
  },
  {
    id: "loodus",
    title: "Loodus",
    subtitle: "Nature and animals",
    icon: "Trees",
    cefr: "A2",
    blurb: "Forest, sea and weather — half of Estonian small talk, and a pile of gradation.",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["mets", "meri", "järv", "jõgi", "mägi", "maa", "puu", "lill", "loom", "koer", "kass", "lind", "tuul", "vihm"],
  },
  {
    id: "keha-ja-tervis",
    title: "Keha ja tervis",
    subtitle: "Body and health",
    icon: "HeartPulse",
    cefr: "A2",
    blurb: "For the doctor's appointment you would rather not improvise. käsi : käe is worth the trip alone.",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["käsi", "jalg", "silm", "pea", "keha", "tervis", "haigus", "ravim", "arst", "haigla"],
  },
  {
    id: "kool-ja-keel",
    title: "Kool ja keel",
    subtitle: "School and language",
    icon: "GraduationCap",
    cefr: "A2",
    blurb: "The words your Estonian class uses about Estonian class.",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["sõna", "keel", "kool", "töö", "küsimus", "vastus", "raamatukogu", "lugu", "ajaleht", "uudis", "õpetama"],
  },
  {
    id: "reisimine",
    title: "Reisimine",
    subtitle: "Travel and time off",
    icon: "Plane",
    cefr: "A2",
    blurb: "Going somewhere: the illative and allative earn their keep here (Tallinnasse, rongile).",
    cardTypes: RECALL_AND_CASES,
    lemmas: ["reis", "puhkus", "riik", "lennuk", "jalgratas", "sõitma", "kõndima", "jooksma", "otsima", "leidma"],
  },
  {
    id: "tunded",
    title: "Tunded ja mõtted",
    subtitle: "Feelings and thoughts",
    icon: "Heart",
    cefr: "B1",
    blurb: "Saying what you think and how you feel, without falling back to English.",
    cardTypes: RECALL_AND_CASES,
    lemmas: [
      "elu", "mõte", "tunne", "rõõm", "mure", "armastus", "meel", "arvamus", "harjumus",
      "arvama", "tunduma", "lootma", "mäletama", "unustama",
    ],
  },
  {
    id: "too-ja-raha",
    title: "Töö ja raha",
    subtitle: "Work, money and decisions",
    icon: "Briefcase",
    cefr: "B1",
    blurb: "Meetings, wages and contracts — B1 vocabulary you meet the week you start a job.",
    cardTypes: RECALL_AND_CASES,
    lemmas: [
      "palk", "koosolek", "leping", "teenus", "toode", "klient", "ettevõte", "ülesanne",
      "otsus", "võimalus", "eesmärk", "otsustama", "kasutama", "korraldama",
    ],
  },
  {
    id: "uhiskond",
    title: "Ühiskond",
    subtitle: "Society and public life",
    icon: "Landmark",
    cefr: "B2",
    blurb: "The vocabulary of the news: government, law, economy, rights.",
    cardTypes: RECALL,
    lemmas: [
      "ühiskond", "valitsus", "seadus", "õigus", "kohustus", "kodanik", "rahvas", "vabadus",
      "poliitika", "majandus", "keskkond", "haridus", "kultuur", "ajalugu",
    ],
  },
  {
    id: "akadeemiline",
    title: "Akadeemiline eesti keel",
    subtitle: "Arguing a point",
    icon: "ScrollText",
    cefr: "C1",
    blurb: "Verbs and nouns for writing an essay or holding a position: väitma, tuginema, veenev.",
    cardTypes: RECALL_AND_GOVERNMENT,
    lemmas: [
      "väitma", "rõhutama", "tuginema", "viitama", "eristama", "kirjeldama", "hindama",
      "põhjus", "tagajärg", "erinevus", "tõenäoline", "veenev", "põhjalik", "vastuoluline",
    ],
  },
] as const;

export function unitById(id: string): PathUnit | undefined {
  return PATH.find((u) => u.id === id);
}

export interface UnitProgress {
  /** Unit words that exist in the dictionary at all. */
  available: number;
  /** Unit words with at least one card in the deck. */
  started: number;
  /** Unit words whose cards have all reached the FSRS Review state. */
  known: number;
  /** 0–100, weighting a known word fully and a started one half. */
  pct: number;
  state: "locked" | "new" | "learning" | "done";
}

/**
 * How far through a unit the learner is.
 *
 * "Known" means every card made from the word has graduated to FSRS Review
 * state — not "was answered right once". A unit only reads as finished when the
 * scheduler agrees the words are actually retained.
 */
export function unitProgress(input: {
  availableLemmas: string[];
  startedLemmas: string[];
  knownLemmas: string[];
}): UnitProgress {
  const available = input.availableLemmas.length;
  const startedSet = new Set(input.startedLemmas);
  const knownSet = new Set(input.knownLemmas);
  const started = input.availableLemmas.filter((l) => startedSet.has(l)).length;
  const known = input.availableLemmas.filter((l) => knownSet.has(l)).length;

  if (available === 0) return { available, started: 0, known: 0, pct: 0, state: "locked" };

  const pct = Math.min(100, Math.round(((known + (started - known) * 0.5) / available) * 100));
  const state: UnitProgress["state"] =
    known === available ? "done" : started > 0 ? "learning" : "new";

  return { available, started, known, pct, state };
}
