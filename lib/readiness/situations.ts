import { SYLLABUS, type Level, type SyllabusUnit } from "@/lib/collections/syllabus";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * THE SITUATIONS A LEARNER IS ASKED HOW READY THEY ARE FOR.
 *
 * "You would understand 81 percent of everyday situations" is the number a
 * vocabulary app can compute and it answers the least useful question. Knowing
 * the words for a health center is what lets you follow the receptionist. It
 * is not what lets you answer her, and it is nothing like what lets you open
 * the exchange, steer it and recover when she says one sentence too fast. Most
 * apps sell the first as the third, and the person who believed them finds out
 * at the counter.
 *
 * So the unit of readiness here is the **situation**, and each one is read on
 * three rungs: could you follow it, could you take part in it, could you lead
 * it (`rungs.ts`). The situations are the course's own promises. Every unit in
 * `lib/collections/syllabus/` carries a `canDo` claim, phrased the way the
 * CEFR phrases one, and not one of the 82 had ever been checked against what
 * the learner has actually done. This table is what turns each claim into a
 * question the review log can answer.
 *
 * WHAT IS AUTHORED HERE AND WHAT IS NOT. Everything in this file is English,
 * which is the one language this project may write (ADR-005), and it holds
 * no Estonian at all: a situation names a **unit id**, never a word, exactly
 * as `lib/collections/topical.ts` names units rather than words for the
 * seasonal row. The words come out of the course, where a lemma is already a
 * request the Ekilex harvest either honored or reported. The cases a
 * situation turns on are keys of `CASES`, so a typo fails a test rather than
 * silently asking about nothing. `situations.test.ts` checks both.
 *
 * WHAT THE FACTS ARE FOR. `live` says whether this is an exchange with another
 * person in real time, which is where pace and the ear matter, or something
 * done at your own speed with a dictionary open, where they do not; a reading
 * unit is never told its listening is untested. `needs` names the machinery
 * every conversation runs on, question words, numbers, the clock, the words
 * for yes and no, and a situation that hinges on one of them is held to it on
 * the top rung: nobody leads a shop encounter who cannot follow a price said
 * once. `cases` are the endings the encounter actually turns on, so the
 * struggle list can say "the alalütlev, which is how you say something hurts"
 * rather than "grammar". `tryThis` is the encouraging half and the point of
 * the whole screen: a real thing to go and do, offered only once the log says
 * the learner could take part. `expect` is what will come back at you, so the
 * first fast reply is not the first time anybody mentioned it.
 *
 * Pure. No React, no Prisma, no clock.
 */

export type Machinery = "greetings" | "questions" | "numbers" | "time" | "replies" | "pronouns";

/** Which units carry each piece of machinery. Ids, never words. */
export const MACHINERY_UNITS: Record<Machinery, readonly string[]> = {
  greetings: ["tervitused"],
  questions: ["kusisonad"],
  numbers: ["arvud"],
  time: ["aeg", "millal"],
  replies: ["vastused"],
  pronouns: ["asesonad"],
};

export interface SituationFacts {
  /** An exchange with somebody else, in real time. */
  live: boolean;
  /** The machinery this encounter runs on, held to on the top rung. */
  needs: readonly Machinery[];
  /** The cases the encounter turns on. Keys of `CASES`. */
  cases: readonly CaseKey[];
  /** Something real to go and do, offered once the learner could take part. English. */
  tryThis: string;
  /** What will come back at you. English, and only for a live exchange. */
  expect?: string;
}

/*
  Keyed on the unit id. Every unit has an entry and the test says so, because a
  unit with no facts would fall through to a default that is wrong in one
  direction or the other, and "we forgot to think about this one" should not
  read as "this one has no cases".
*/
export const SITUATION_FACTS: Record<string, SituationFacts> = {
  // ── A1 ──────────────────────────────────────────────────────────────────
  tervitused: {
    live: true, needs: ["replies"], cases: [],
    tryThis: "Greet the person at the till in Estonian and answer their greeting before you switch.",
    expect: "A greeting back, said fast, and then a question about a bag or a card.",
  },
  inimesed: {
    live: true, needs: ["greetings", "questions"], cases: ["GENITIVE", "NOMINATIVE"],
    tryThis: "Introduce somebody you are with, by name and by who they are to you.",
    expect: "The same question back about you: who is this, and where are you from.",
  },
  arvud: {
    live: true, needs: ["replies"], cases: ["PARTITIVE"],
    tryThis: "Give your phone number out loud, in Estonian, to somebody who writes it down.",
    expect: "The number read back to you, quickly, for you to confirm or correct.",
  },
  kodu: {
    live: false, needs: [], cases: ["INESSIVE", "ADESSIVE", "GENITIVE"],
    tryThis: "Describe your own flat, room by room, saying where three things are in it.",
  },
  "sook-ja-jook": {
    live: true, needs: ["greetings", "numbers", "replies"], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Order a coffee and something to eat, and stay in Estonian when they answer.",
    expect: "A question you did not plan for: here or to take away, with milk, anything else.",
  },
  aeg: {
    live: true, needs: ["numbers", "questions"], cases: ["ADESSIVE", "PARTITIVE"],
    tryThis: "Ask a stranger what time it is and understand the answer without looking at your phone.",
    expect: "A time said the way people say it, with half and quarter, not the way a clock shows it.",
  },
  pohiverbid: {
    live: false, needs: ["pronouns"], cases: [],
    tryThis: "Say five true sentences about what you do, each with a different verb.",
  },
  "iga-paev": {
    live: true, needs: ["time", "pronouns"], cases: ["INESSIVE", "ELATIVE"],
    tryThis: "Tell a colleague what your morning was like, from waking up to arriving.",
    expect: "A follow-up about one detail, usually the one you said least about.",
  },
  omadussonad: {
    live: false, needs: [], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Describe three things on your desk, with the adjective agreeing with each.",
  },
  varvid: {
    live: true, needs: ["questions"], cases: ["GENITIVE", "PARTITIVE"],
    tryThis: "Ask for something in a particular color in a shop and understand which one they offer.",
    expect: "A color you did not ask for, offered instead, and a question about size.",
  },
  riided: {
    live: true, needs: ["numbers", "questions", "replies"], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Ask for a size in a clothes shop and say whether it fits when you come out.",
    expect: "Your size said as a number, and a question about whether you want to try it on.",
  },
  ilm: {
    live: true, needs: ["replies"], cases: ["ADESSIVE", "PARTITIVE"],
    tryThis: "Start a conversation about the weather with somebody waiting beside you, and keep it going for two turns.",
    expect: "Agreement, a complaint, and then whatever they actually wanted to talk about.",
  },
  ostmine: {
    live: true, needs: ["numbers", "questions", "replies"], cases: ["PARTITIVE", "GENITIVE", "ILLATIVE"],
    tryThis: "Ask how much something costs and pay for it without switching to English.",
    expect: "A price said once, fast, and a question about a card, a bag or a receipt.",
  },
  "kus-ja-kuhu": {
    live: true, needs: ["questions", "numbers"], cases: ["INESSIVE", "ILLATIVE", "ELATIVE", "ADESSIVE", "ALLATIVE"],
    tryThis: "Ask somebody the way to a place you already know, and follow the directions they give.",
    expect: "Left, right, straight on and a landmark, said quickly and pointed at.",
  },
  kusisonad: {
    live: true, needs: ["replies"], cases: ["GENITIVE", "PARTITIVE"],
    tryThis: "Ask three questions of somebody at work and understand the answers well enough to ask a fourth.",
    expect: "An answer, and the same question turned back on you.",
  },
  asesonad: {
    live: false, needs: [], cases: ["GENITIVE", "PARTITIVE", "ALLATIVE", "ADESSIVE"],
    tryThis: "Write about your day using only pronouns for the people in it, each in the right case.",
  },
  millal: {
    live: true, needs: ["time"], cases: ["ADESSIVE"],
    tryThis: "Tell somebody when you usually do something, and how often.",
    expect: "A question about whether that is always, or just today.",
  },
  kohasonad: {
    live: false, needs: [], cases: ["GENITIVE"],
    tryThis: "Describe a photograph of a room, saying what is next to, under and behind what.",
  },
  kuud: {
    live: true, needs: ["numbers", "questions"], cases: ["ADESSIVE", "GENITIVE"],
    tryThis: "Book something for a date next month and say the date the way Estonians say it.",
    expect: "The date repeated back with the weekday, and a question about the time.",
  },
  riigid: {
    live: true, needs: ["questions", "greetings"], cases: ["ELATIVE", "ADESSIVE", "PARTITIVE"],
    tryThis: "Say where you are from and which languages you speak, and ask the same back.",
    expect: "Interest, a question about how long you have been here, and a compliment on your Estonian.",
  },
  sidesonad: {
    live: false, needs: [], cases: [],
    tryThis: "Write four sentences about your week, each joined to the next with a different connective.",
  },
  vastused: {
    live: true, needs: [], cases: [],
    tryThis: "Answer a yes or no question in Estonian with more than yes or no.",
    expect: "A second question, because a full answer invites one.",
  },
  maaramine: {
    live: false, needs: [], cases: ["PARTITIVE"],
    tryThis: "Say how much you like three things, with a different degree word for each.",
  },

  // ── A2 ──────────────────────────────────────────────────────────────────
  minevik: {
    live: true, needs: ["time", "pronouns"], cases: ["PARTITIVE", "INESSIVE", "ADESSIVE"],
    tryThis: "Tell somebody what you did at the weekend, in the past tense, and ask about theirs.",
    expect: "A story back, told faster than you told yours, with a question at the end of it.",
  },
  loodus: {
    live: false, needs: [], cases: ["INESSIVE", "ADESSIVE", "PARTITIVE"],
    tryThis: "Describe a walk you took: the weather, the ground, one animal and one tree.",
  },
  "keha-ja-tervis": {
    live: true, needs: ["time", "questions", "replies"], cases: ["ADESSIVE", "PARTITIVE", "ELATIVE"],
    tryThis: "Book a doctor's appointment by phone, saying what is wrong and since when.",
    expect: "Questions about since when, how bad, and which afternoon you can come.",
  },
  "kool-ja-keel": {
    live: true, needs: ["questions"], cases: ["PARTITIVE", "INESSIVE"],
    tryThis: "Ask somebody what a word means, in Estonian, and understand the explanation.",
    expect: "An explanation using words you may not know, and an offer to say it in English.",
  },
  reisimine: {
    live: true, needs: ["numbers", "time", "questions"], cases: ["ILLATIVE", "ELATIVE", "ALLATIVE", "ABLATIVE"],
    tryThis: "Buy a bus ticket to another town at the counter and ask which platform it leaves from.",
    expect: "A platform number, a time, and a question about a return.",
  },
  kodutood: {
    live: true, needs: ["pronouns", "replies"], cases: ["GENITIVE", "PARTITIVE", "ALLATIVE"],
    tryThis: "Agree with somebody you live with who does which chore this week.",
    expect: "Pushback on one of them, and a counter-offer.",
  },
  "linn-ja-teenused": {
    live: true, needs: ["numbers", "questions", "replies"], cases: ["GENITIVE", "PARTITIVE", "ALLATIVE", "ELATIVE"],
    tryThis: "Post a parcel at a post office and answer every question at the counter in Estonian.",
    expect: "Which country, how heavy, which service, and a form to fill in.",
  },
  suhtlemine: {
    live: true, needs: ["time", "greetings", "replies"], cases: ["ALLATIVE", "COMITATIVE", "ADESSIVE"],
    tryThis: "Ring somebody to arrange a time to meet, and confirm it by message afterwards.",
    expect: "A voice with no face to read, a time you did not suggest, and a quick goodbye.",
  },
  "vaba-aeg": {
    live: true, needs: ["time", "replies"], cases: ["PARTITIVE", "ILLATIVE", "COMITATIVE"],
    tryThis: "Suggest something to do at the weekend and accept or turn down what comes back.",
    expect: "A different suggestion, and a question about when you are free.",
  },
  restoranis: {
    live: true, needs: ["numbers", "questions", "replies"], cases: ["PARTITIVE", "GENITIVE", "COMITATIVE"],
    tryThis: "Order a whole meal for two and ask what is in one of the dishes.",
    expect: "A recommendation you did not ask for, and the bill brought before you asked.",
  },
  korraldused: {
    live: true, needs: ["pronouns", "replies"], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Ask somebody to do something for you, politely, and offer to help with something in return.",
    expect: "The polite imperative used on you, which every counter in the country uses.",
  },
  vordlemine: {
    live: false, needs: [], cases: ["ELATIVE", "PARTITIVE"],
    tryThis: "Compare two places you have lived and say which was better and why.",
  },
  tunded: {
    live: true, needs: ["replies"], cases: ["ADESSIVE", "PARTITIVE", "ELATIVE"],
    tryThis: "Tell a friend how you actually are, not just fine, and ask them the same.",
    expect: "An honest answer, and then a longer one than you expected.",
  },
  plaanid: {
    live: true, needs: ["time", "pronouns"], cases: ["ILLATIVE", "ALLATIVE", "PARTITIVE"],
    tryThis: "Tell somebody your plans for next month and arrange to do one of them together.",
    expect: "A clash with their plans, and a proposal to move yours.",
  },

  // ── B1 ──────────────────────────────────────────────────────────────────
  objekt: {
    live: false, needs: [], cases: ["PARTITIVE", "GENITIVE", "NOMINATIVE"],
    tryThis: "Write six sentences about yesterday and mark in each whether the object is whole or partial.",
  },
  rektsioon: {
    live: false, needs: [], cases: ["PARTITIVE", "ELATIVE", "ALLATIVE", "COMITATIVE"],
    tryThis: "Write one sentence for each of ten verbs you use daily, with the case each one takes.",
  },
  tingiv: {
    live: true, needs: ["replies"], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Ask for something at work the polite way, with the conditional, and give somebody advice the same way.",
    expect: "A conditional back, softening a no.",
  },
  kesksonad: {
    live: false, needs: [], cases: ["GENITIVE", "PARTITIVE"],
    tryThis: "Describe what you have done so far today using the perfect, then something finished before it.",
  },
  "too-ja-raha": {
    live: true, needs: ["numbers", "questions"], cases: ["PARTITIVE", "ELATIVE", "ALLATIVE", "ESSIVE"],
    tryThis: "Say something in a meeting at work in Estonian, and then answer the question it gets.",
    expect: "Interruption, jargon, and somebody speaking at full speed because you started it.",
  },
  eluase: {
    live: true, needs: ["time", "numbers", "replies"], cases: ["INESSIVE", "ADESSIVE", "GENITIVE", "PARTITIVE"],
    tryThis: "Tell your landlord something is broken, where it is and since when, and agree a time.",
    expect: "A refusal of the first time you offer, and a question about what exactly is wrong.",
  },
  meedia: {
    live: false, needs: [], cases: ["ELATIVE", "PARTITIVE", "INESSIVE"],
    tryThis: "Read one news story on ERR and tell somebody what happened in four sentences.",
  },
  tehnoloogia: {
    live: true, needs: ["numbers", "questions"], cases: ["INESSIVE", "ELATIVE", "ILLATIVE"],
    tryThis: "Ring a helpline about an account that does not work and get through the security questions.",
    expect: "A code read out, a question about which device, and instructions to press something.",
  },
  keskkond: {
    live: false, needs: [], cases: ["PARTITIVE", "ELATIVE", "TRANSLATIVE"],
    tryThis: "Say what you think should be done about one environmental problem, and why.",
  },
  haridus: {
    live: true, needs: ["questions", "numbers"], cases: ["INESSIVE", "ELATIVE", "ILLATIVE", "PARTITIVE"],
    tryThis: "Describe your education to somebody at an office that needs to know it.",
    expect: "Questions about which year, which country, and whether you have the certificate with you.",
  },
  inimsuhted: {
    live: true, needs: ["pronouns", "replies"], cases: ["COMITATIVE", "ELATIVE", "PARTITIVE"],
    tryThis: "Tell a friend about a disagreement you had and what happened afterwards.",
    expect: "Their side of a similar story, and an opinion on yours.",
  },
  iseloom: {
    live: false, needs: [], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Describe somebody you know well in six sentences without using the word nice.",
  },
  arvamus: {
    live: true, needs: ["replies"], cases: ["ELATIVE", "PARTITIVE", "COMITATIVE"],
    tryThis: "Disagree with somebody politely about something small and give one reason.",
    expect: "A reason back, and the conversation getting faster.",
  },
  probleemid: {
    live: true, needs: ["time", "replies", "questions"], cases: ["GENITIVE", "PARTITIVE", "ELATIVE"],
    tryThis: "Take something faulty back to a shop and ask for it to be replaced or repaired.",
    expect: "A request for the receipt, an explanation of policy, and an offer that is not the one you asked for.",
  },
  liitverbid: {
    live: false, needs: [], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Write five sentences whose meaning changes when you take the particle off the verb.",
  },

  // ── B2 ──────────────────────────────────────────────────────────────────
  umbisikuline: {
    live: false, needs: [], cases: ["PARTITIVE", "INESSIVE"],
    tryThis: "Read a notice in a stairwell and rewrite it saying who is meant to do what.",
  },
  kaudne: {
    live: false, needs: [], cases: ["PARTITIVE"],
    tryThis: "Report something you were told but did not see, in the mood Estonian keeps for it.",
  },
  "des-vorm": {
    live: false, needs: [], cases: ["PARTITIVE", "GENITIVE"],
    tryThis: "Take a paragraph you wrote and join three pairs of sentences into one each.",
  },
  sonamoodustus: {
    live: false, needs: [], cases: [],
    tryThis: "Take a newspaper paragraph and work out five unfamiliar words from their suffixes before looking any up.",
  },
  uhiskond: {
    live: true, needs: ["replies"], cases: ["ELATIVE", "PARTITIVE", "TRANSLATIVE"],
    tryThis: "Follow one public debate on the radio and say afterwards where you stand and why.",
    expect: "Two people talking over each other, and idiom neither of them notices using.",
  },
  poliitika: {
    live: false, needs: [], cases: ["ELATIVE", "PARTITIVE", "GENITIVE"],
    tryThis: "Read the election coverage for a week and explain one result to somebody who missed it.",
  },
  majandus: {
    live: false, needs: ["numbers"], cases: ["ELATIVE", "PARTITIVE", "TRANSLATIVE"],
    tryThis: "Read a business page and explain one trend in it with two figures.",
  },
  oigus: {
    live: false, needs: [], cases: ["GENITIVE", "PARTITIVE", "ELATIVE"],
    tryThis: "Read a contract or a notice you have actually been sent and say what it obliges you to do.",
  },
  teadus: {
    live: false, needs: [], cases: ["ELATIVE", "PARTITIVE", "INESSIVE"],
    tryThis: "Read a popular science article and describe how the study was done and what it found.",
  },
  ajalugu: {
    live: false, needs: ["time"], cases: ["INESSIVE", "ADESSIVE", "PARTITIVE"],
    tryThis: "Tell the story of one event from your own country's history and say why it mattered.",
  },
  kunst: {
    live: true, needs: ["replies"], cases: ["ELATIVE", "PARTITIVE"],
    tryThis: "Review a film you saw this week to somebody who is deciding whether to see it.",
    expect: "Disagreement, and a review of something you have not seen.",
  },
  psuhholoogia: {
    live: false, needs: [], cases: ["PARTITIVE", "ELATIVE"],
    tryThis: "Explain a habit of yours in the abstract: what drives it and what would change it.",
  },
  tervishoid: {
    live: true, needs: ["numbers", "questions"], cases: ["GENITIVE", "PARTITIVE", "ELATIVE", "ILLATIVE"],
    tryThis: "Sort out a referral or a prescription across two different offices without help.",
    expect: "Two systems that do not agree, and a person at each explaining the other one.",
  },
  toomaailm: {
    live: true, needs: ["numbers", "replies"], cases: ["PARTITIVE", "ELATIVE", "TRANSLATIVE", "ESSIVE"],
    tryThis: "Handle one difficult conversation at work in Estonian from start to finish.",
    expect: "Somebody who is better at this than you, speaking at full speed with something at stake.",
  },
  statistika: {
    live: false, needs: ["numbers"], cases: ["ELATIVE", "PARTITIVE", "GENITIVE"],
    tryThis: "Describe one chart from a news story precisely: the trend, the peak and the proportion.",
  },
  argumenteerimine: {
    live: false, needs: [], cases: ["PARTITIVE", "ELATIVE"],
    tryThis: "Write a page arguing something you believe, and give the other side its best paragraph.",
  },

  // ── C1 ──────────────────────────────────────────────────────────────────
  nominalisatsioon: {
    live: false, needs: [], cases: ["GENITIVE", "PARTITIVE"],
    tryThis: "Take a paragraph of your own and compress three clauses into noun phrases.",
  },
  lauseloome: {
    live: false, needs: [], cases: [],
    tryThis: "Write a three-clause sentence, punctuate it, and have a native speaker read it aloud.",
  },
  akadeemiline: {
    live: false, needs: [], cases: ["PARTITIVE", "ELATIVE"],
    tryThis: "Write one academic paragraph with a claim, its support and a qualification.",
  },
  teadustoo: {
    live: false, needs: [], cases: ["ELATIVE", "PARTITIVE", "INESSIVE"],
    tryThis: "Read a research abstract in Estonian and describe its design and its limits.",
  },
  filosoofia: {
    live: true, needs: ["replies"], cases: ["ELATIVE", "PARTITIVE"],
    tryThis: "Hold a conversation about an abstract idea for ten minutes without one concrete example.",
    expect: "Being asked what you mean, and having to say it a second way.",
  },
  eetika: {
    live: true, needs: ["replies"], cases: ["PARTITIVE", "ELATIVE", "COMITATIVE"],
    tryThis: "Argue an ethical position and then argue the other side as well as you argued yours.",
    expect: "Somebody holding you to what you said three turns ago.",
  },
  retoorika: {
    live: true, needs: [], cases: ["PARTITIVE", "ELATIVE"],
    tryThis: "Give a five-minute talk in Estonian to people who did not have to come.",
    expect: "A question afterwards from the person who disagreed the whole way through.",
  },
  register: {
    live: true, needs: ["pronouns"], cases: [],
    tryThis: "Say the same thing to a friend, to a colleague and in a letter, and get the register right each time.",
    expect: "Being answered in the register you chose, which tells you whether it was the right one.",
  },
  idioomid: {
    live: true, needs: [], cases: ["PARTITIVE", "ELATIVE"],
    tryThis: "Use one idiom in a conversation and notice whether anybody notices.",
    expect: "One back that you have never heard.",
  },
  diskursus: {
    live: false, needs: [], cases: [],
    tryThis: "Write two pages and mark every signpost that keeps a reader on the thread.",
  },
  innovatsioon: {
    live: false, needs: [], cases: ["ELATIVE", "PARTITIVE", "TRANSLATIVE"],
    tryThis: "Explain a technological change and one social consequence of it, in writing.",
  },
  rahvusvaheline: {
    live: false, needs: [], cases: ["GENITIVE", "PARTITIVE", "ELATIVE"],
    tryThis: "Follow one international story for a week and describe the Estonian position on it.",
  },
  kirjandus: {
    live: false, needs: [], cases: ["PARTITIVE", "ELATIVE"],
    tryThis: "Read an Estonian novel and talk about how it is written, not just what happens in it.",
  },
  nuansid: {
    live: false, needs: [], cases: [],
    tryThis: "Take five pairs of near-synonyms and write one sentence where only one of the pair fits.",
  },
};

export interface Situation extends SituationFacts {
  /** The unit id, which is the key everything else is joined on. */
  id: string;
  /** The course's own claim, in its own words. */
  claim: string;
  title: string;
  subtitle: string;
  level: Level;
  /** The unit's words, in its order. Requests against the dictionary. */
  lemmas: readonly string[];
  /** The machinery units this one leans on, as ids. */
  machineryUnits: readonly string[];
}

function situationFrom(unit: SyllabusUnit): Situation {
  const facts = SITUATION_FACTS[unit.id];
  if (!facts) throw new Error(`no situation facts for unit ${unit.id}`);
  const machineryUnits = [...new Set(facts.needs.flatMap((m) => MACHINERY_UNITS[m]))]
    .filter((id) => id !== unit.id);
  return {
    ...facts,
    id: unit.id,
    claim: unit.canDo,
    title: unit.title,
    subtitle: unit.subtitle,
    level: unit.level,
    lemmas: unit.lemmas,
    machineryUnits,
  };
}

/** Every situation, in course order. */
export const SITUATIONS: readonly Situation[] = SYLLABUS.map(situationFrom);

const BY_ID = new Map(SITUATIONS.map((s) => [s.id, s]));

export function situationById(id: string): Situation | undefined {
  return BY_ID.get(id);
}
