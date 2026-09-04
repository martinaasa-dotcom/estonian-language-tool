/**
 * The facts on the role card, drawn per run.
 *
 * A prop is either a word the dictionary holds or a value made of digits. The
 * weekdays are the seven lemmas the `aeg` unit teaches, named here so the
 * catalogue test can check they really are taught by a unit every scene
 * declares; their English is the gloss the syllabus already carries, read
 * back rather than typed twice. Everything else is digits, which are not
 * Estonian and are the one thing this module may make up: a time, a floor, a
 * fictional document code.
 *
 * `accepted` is what counts as the learner having said the value, and it is
 * deliberately generous about the shape of a number. "14", "14:00", "14.00"
 * and "kell 14" are all somebody telling a receptionist two o'clock, and the
 * scene is about whether they said it, not about how a clock is punctuated.
 * The weekday accepts any of its forms, so `teisipäeval` (on Tuesday, in the
 * adessive) counts, which is what a person actually says.
 *
 * Pure.
 */
import type { PropKind, PropSlot, SceneSpec } from "./types";

export interface PropValue {
  readonly slot: string;
  readonly kind: PropKind;
  /** What the role card shows. English for a weekday, digits otherwise. */
  readonly display: string;
  /** The dictionary word behind it, for a weekday. */
  readonly lemma: string | null;
  /** Spellings that count as saying it. Lowercased. Forms are added by the caller. */
  readonly accepted: readonly string[];
}

/** Monday to Sunday, as the `aeg` unit names them. Requests, never facts. */
export const WEEKDAY_LEMMAS = [
  "esmaspäev", "teisipäev", "kolmapäev", "neljapäev", "reede", "laupäev", "pühapäev",
] as const;

/** One to nine, as the `arvud` unit names them, for a floor or a room. */
export const NUMBER_LEMMAS = [
  "üks", "kaks", "kolm", "neli", "viis", "kuus", "seitse", "kaheksa", "üheksa",
] as const;

export interface PropDrawInput {
  readonly scene: SceneSpec;
  readonly random: () => number;
  /** English for a weekday lemma, from the syllabus. */
  readonly glossOf: (lemma: string) => string;
  /** Values a recent run used, per slot, which this draw avoids. */
  readonly recent?: ReadonlyMap<string, readonly string[]>;
}

function choose<T>(items: readonly T[], random: () => number, avoid: (t: T) => boolean): T {
  const fresh = items.filter((t) => !avoid(t));
  const pool = fresh.length > 0 ? fresh : items;
  return pool[Math.floor(random() * pool.length)]!;
}

function clockValue(random: () => number, avoid: readonly string[]): PropValue {
  // Working hours, on the hour or the half hour, which is when a desk offers.
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const options: string[] = [];
  for (const h of hours) for (const m of ["00", "30"]) options.push(`${h}:${m}`);
  const display = choose(options, random, (v) => avoid.includes(v));
  const [h, m] = display.split(":") as [string, string];
  const accepted = [display, `${h}.${m}`];
  if (m === "00") accepted.push(h, `kell ${h}`);
  return { slot: "", kind: "clock", display, lemma: null, accepted };
}

function numberValue(random: () => number, avoid: readonly string[]): PropValue {
  const n = choose([1, 2, 3, 4, 5, 6, 7, 8, 9], random, (v) => avoid.includes(String(v)));
  return { slot: "", kind: "number", display: String(n), lemma: NUMBER_LEMMAS[n - 1]!, accepted: [String(n)] };
}

function codeValue(random: () => number, avoid: readonly string[]): PropValue {
  // Six digits, never a real shape: an Estonian personal code is eleven.
  let digits = "";
  do {
    digits = "";
    for (let i = 0; i < 6; i++) digits += String(Math.floor(random() * 10));
  } while (avoid.includes(digits));
  const spaced = digits.replace(/(\d{3})(\d{3})/, "$1 $2");
  return { slot: "", kind: "code", display: spaced, lemma: null, accepted: [digits, spaced] };
}

function weekdayValue(random: () => number, avoid: readonly string[], glossOf: (l: string) => string): PropValue {
  const lemma = choose(WEEKDAY_LEMMAS, random, (l) => avoid.includes(l));
  return { slot: "", kind: "weekday", display: glossOf(lemma), lemma, accepted: [lemma] };
}

/** Every prop of the scene, drawn. Two clocks in one scene are always different. */
export function drawProps(input: PropDrawInput): PropValue[] {
  const { scene, random, glossOf, recent } = input;
  const out: PropValue[] = [];
  const used = new Map<PropKind, string[]>();
  for (const slot of scene.props) {
    const avoid = [...(recent?.get(slot.id) ?? []), ...(used.get(slot.kind) ?? [])];
    const value = drawOne(slot, random, avoid, glossOf);
    out.push({ ...value, slot: slot.id });
    used.set(slot.kind, [...(used.get(slot.kind) ?? []), value.kind === "weekday" ? value.lemma! : value.display]);
  }
  return out;
}

function drawOne(slot: PropSlot, random: () => number, avoid: readonly string[], glossOf: (l: string) => string): PropValue {
  switch (slot.kind) {
    case "weekday": return weekdayValue(random, avoid, glossOf);
    case "clock": return clockValue(random, avoid);
    case "number": return numberValue(random, avoid);
    case "code": return codeValue(random, avoid);
  }
}

/** `{since}` in a card fact becomes the drawn value. */
export function fillFacts(facts: readonly string[], props: readonly PropValue[]): string[] {
  const bySlot = new Map(props.map((p) => [p.slot, p.display]));
  return facts.map((fact) => fact.replace(/\{(\w+)\}/g, (m, id: string) => bySlot.get(id) ?? m));
}
