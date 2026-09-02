/**
 * The role card, which is not a decoration.
 *
 * **The learner never plays themselves** (`docs/19-situations.md` §3). They are
 * handed a card: you are a patient, your throat has hurt since Tuesday, you can
 * come any afternoon except Wednesday. Two reasons, and the second is the one
 * that matters legally.
 *
 * The first is that marking has to know what the learner is trying to say. A
 * scene that invites somebody to describe their own symptoms cannot tell a
 * complete turn from an incomplete one, because it does not know what the
 * complete one was. `{ kind: "datum" }` is decidable only because the card
 * decided the answer before the conversation started.
 *
 * The second is that a doctor scene where somebody types about their own health
 * is a database holding health data about an identified person, which is
 * Article 9 special category data, in a product whose privacy notice is one of
 * the reasons people choose it. The role card removes the question: nothing in
 * a transcript is true about the person who wrote it. **No scene asks for a
 * real document number**, and a scene that needs one supplies a fictional one,
 * because an identity code typed into a practice app is the one thing this
 * module could collect that nobody could ever take back.
 *
 * WHAT THIS FILE MAY WRITE. English, and a lemma. That is the standing the
 * scene catalogue already has: a lemma is a *request* against the dictionary,
 * so a misspelled one fails to arrive rather than becoming a wrong Estonian
 * word, and `catalogue.test.ts` checks every one against the units its scene
 * declares. What it may never write is a form or a sentence, which is why a
 * drawn prop carries lemmas for the caller to resolve rather than the Estonian
 * a learner would type.
 *
 * Pure: no React, no Next, no Prisma, no clock. The date arithmetic is over
 * plain numbers and never over `new Date()`, because a card drawn from a seed
 * has to be the same card on a reload.
 */
import type { CaseKey } from "@/lib/estonian/types";

/**
 * One fact the card carries, before it is drawn.
 *
 * `word` is the kind that ties a card to the dictionary: the value is one of
 * the scene's own lemmas, so the Estonian the learner needs exists and the beat
 * that asks for it can be marked. The other four generate a value nobody has to
 * look up, and their accepted spellings are digits, which is how people write a
 * time or a number down anyway.
 */
export type PropSpec =
  /** A word off the scene's own units. The card prints its English gloss. */
  | {
      readonly kind: "word";
      readonly slot: string;
      readonly oneOf: readonly string[];
      /** How the card says it, with the gloss standing in for the word. */
      readonly says: string;
      /** The case a beat will ask this word in, if one does. */
      readonly grammCase?: CaseKey;
    }
  /** A time of day, on the hour or the half hour, inside a window. */
  | { readonly kind: "time"; readonly slot: string; readonly from: number; readonly to: number }
  /** A weekday, as one of the course's own weekday lemmas. */
  | { readonly kind: "weekday"; readonly slot: string; readonly oneOf: readonly string[]; readonly says: string }
  /** A plain number: a floor, a room, an amount. */
  | { readonly kind: "number"; readonly slot: string; readonly min: number; readonly max: number; readonly says: string }
  /** A fictional reference, which is the only kind of code this module ever holds. */
  | { readonly kind: "code"; readonly slot: string; readonly says: string };

/** One fact, drawn. */
export interface DrawnProp {
  readonly slot: string;
  /** The line the role card prints. English. */
  readonly card: string;
  /**
   * Spellings that count and need no dictionary: digits, and a code.
   *
   * A time is accepted as digits because that is how anybody writes one down,
   * in Estonian as in English, and because the alternative is this module
   * deciding that `kell kaks` is how you say 14:00, which is Estonian it may
   * not write.
   */
  readonly literal: readonly string[];
  /**
   * Lemmas whose forms also count. Resolved against the dictionary by the
   * caller, which is what keeps this file free of Estonian forms.
   */
  readonly lemmas: readonly string[];
  /** What was drawn, for the recency rule in §5. */
  readonly value: string;
}

/** The card as a whole: what you are doing here, and the facts you were given. */
export interface RoleCard {
  /** English, one line. Who you are today. */
  readonly you: string;
  readonly props: readonly DrawnProp[];
}

/**
 * Draws one prop.
 *
 * `avoid` carries the values this scene used in its last three runs, which §5
 * promises will not repeat, and the promise is kept by derivation rather than
 * by a counter: `SceneRun` is append-only and the last runs are one indexed
 * read (ADR-014). Where every candidate is in `avoid` the draw takes one
 * anyway rather than failing, because a thin pool is a fact about the scene
 * and a card that cannot be drawn is worse than one that repeats.
 */
export function drawProp(
  spec: PropSpec,
  random: () => number,
  avoid: ReadonlySet<string> = new Set(),
): DrawnProp {
  switch (spec.kind) {
    case "word": {
      const lemma = pick(spec.oneOf, random, avoid);
      return { slot: spec.slot, card: spec.says, literal: [], lemmas: [lemma], value: lemma };
    }
    case "weekday": {
      const lemma = pick(spec.oneOf, random, avoid);
      return { slot: spec.slot, card: spec.says, literal: [], lemmas: [lemma], value: lemma };
    }
    case "time": {
      const slots = halfHours(spec.from, spec.to);
      const value = pick(slots, random, avoid);
      return {
        slot: spec.slot,
        card: `The time you were given: ${value}`,
        // `14:00`, `14.00` and `14` are all how somebody writes it down.
        literal: [value, value.replace(":", "."), value.slice(0, 2), stripLeadingZero(value)],
        lemmas: [],
        value,
      };
    }
    case "number": {
      const span = Array.from({ length: spec.max - spec.min + 1 }, (_, i) => String(spec.min + i));
      const value = pick(span, random, avoid);
      return { slot: spec.slot, card: `${spec.says} ${value}`, literal: [value], lemmas: [], value };
    }
    case "code": {
      /*
        Fictional, and visibly so. Letters and digits in a shape no Estonian
        register uses, because the failure to avoid is a learner reading it as
        a real reference and typing their own instead.
      */
      const value = `KK-${digits(random, 4)}`;
      return { slot: spec.slot, card: `${spec.says} ${value}`, literal: [value, value.slice(3)], lemmas: [], value };
    }
  }
}

/** The whole card for one run. */
export function drawCard(
  you: string,
  specs: readonly PropSpec[],
  random: () => number,
  avoid: ReadonlySet<string> = new Set(),
): RoleCard {
  return { you, props: specs.map((spec) => drawProp(spec, random, avoid)) };
}

/** The slot a beat's `datum` requirement names, as the marker wants it. */
export function propBySlot(card: RoleCard, slot: string): DrawnProp | undefined {
  return card.props.find((prop) => prop.slot === slot);
}

/**
 * Prefers a candidate nobody has seen lately, and takes one regardless.
 *
 * Never throws and never returns nothing: a scene whose pool is thinner than
 * its recency window is a fact worth reporting (§5 says a run says so rather
 * than quietly cycling) and is not a reason for a card to come out empty.
 */
function pick(from: readonly string[], random: () => number, avoid: ReadonlySet<string>): string {
  const fresh = from.filter((value) => !avoid.has(value));
  const pool = fresh.length > 0 ? fresh : from;
  return pool[Math.floor(random() * pool.length)] ?? pool[0] ?? "";
}

/** Every half hour in a window, as `HH:MM`. */
function halfHours(from: number, to: number): string[] {
  const out: string[] = [];
  for (let hour = from; hour <= to; hour += 1) {
    out.push(`${pad(hour)}:00`);
    if (hour < to) out.push(`${pad(hour)}:30`);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const stripLeadingZero = (time: string) => time.replace(/^0/, "");

function digits(random: () => number, count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) out += Math.floor(random() * 10);
  return out;
}
