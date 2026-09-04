/**
 * What a scene is played from, read out of the dictionary.
 *
 * `lib/scenes/` is pure and knows nothing about Prisma; this is the one
 * module that turns a scene's declared units into the closed word list, the
 * recorded sentences that can be its lines, the sets a turn is read against,
 * and the data the gate needs. It is read once per scene per minute rather
 * than once per turn, for the reason `lib/dict/facts.ts` gives about itself:
 * a fact about the shared dictionary is not a fact about the person waiting.
 *
 * Two shapes come out of it. `SceneMaterial` is what the server holds, to
 * gate a composed line and to re-read a finished run's turns before writing
 * a grade (ADR-022's discipline: the client sends turns, never marks). The
 * client half, `clientMaterial`, is the same sets serialised, so the state
 * machine runs in the browser, an attested-only scene works with the network
 * off, and no turn costs a round trip unless a line has to be composed.
 */
import { prisma } from "@/lib/db";
import { singleFlight } from "@/lib/cache/singleFlight";
import { unitById } from "@/lib/collections/syllabus";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { buildCaseTable, stemsFrom } from "@/lib/estonian/derive";
import type { CaseKey } from "@/lib/estonian/types";
import { sceneById } from "@/lib/scenes/catalogue";
import { curveballById } from "@/lib/scenes/curveballs";
import type { Plan, PlannedBeat } from "@/lib/scenes/draw";
import { buildGateData, wrongRegisterForms, type GateData, type GateEntry } from "@/lib/scenes/gate";
import { buildLexicon, formsOf, words, type DictEntry, type Lexicon } from "@/lib/scenes/lexicon";
import { NUMBER_LEMMAS, type PropValue } from "@/lib/scenes/props";
import { fits, topicForms, type Line } from "@/lib/scenes/retrieval";
import type { TurnContext } from "@/lib/scenes/turn";
import type { BeatSpec, Requirement, SceneSpec } from "@/lib/scenes/types";

const TTL_MS = 60_000;
const GATE_TTL_MS = 10 * 60_000;
/** Recorded sentences offered per beat. Enough to vary, few enough to ship. */
const LINES_PER_BEAT = 8;

interface Held<T> { value: T; until: number }
const held = new Map<string, Held<unknown>>();

async function remember<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<T> {
  const entry = held.get(key);
  if (entry && Date.now() < entry.until) return entry.value as T;
  return singleFlight(`scene-material:${key}`, async () => {
    const value = await work();
    held.set(key, { value, until: Date.now() + ttlMs });
    return value;
  });
}

export interface SceneEntry extends DictEntry {
  readonly id: string;
  readonly government: string | null;
  readonly translation: string;
}

/** Every lemma a scene's declared units teach. */
export function sceneLemmas(scene: SceneSpec): string[] {
  const out = new Set<string>();
  for (const id of scene.units) for (const lemma of unitById(id)?.lemmas ?? []) out.add(lemma);
  return [...out];
}

type Row = {
  id: string; lemma: string; pos: string; cefr: string | null; provenance: string;
  translation: string; government: string | null; examples: string;
  forms: { formType: string; value: string }[];
};

function toEntry(row: Row): SceneEntry {
  const parts: Record<string, string> = {};
  const extra: { code: string; value: string }[] = [];
  for (const f of row.forms) {
    if (f.formType.startsWith("EKILEX:")) extra.push({ code: f.formType.slice(7), value: f.value });
    else if (!parts[f.formType]) parts[f.formType] = f.value;
    else if (parts[f.formType] !== f.value) extra.push({ code: f.formType, value: f.value });
  }
  return {
    id: row.id, lemma: row.lemma, pos: row.pos, cefr: row.cefr, parts, extraForms: extra,
    usages: row.pos === "PHRASE" ? [row.lemma] : usableExamples(parseExamples(row.examples)).map((e) => e.et),
    government: row.government, translation: row.translation,
  };
}

async function entriesFor(lemmas: readonly string[]): Promise<SceneEntry[]> {
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: [...lemmas] } },
    select: {
      id: true, lemma: true, pos: true, cefr: true, provenance: true, translation: true,
      government: true, examples: true,
      forms: { select: { formType: true, value: true }, orderBy: [{ orderIndex: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  // A lemma can hold two entries; `oneEntryPerLemma` is `bySubstance`, the
  // rule the search box leads with, so a scene and the dictionary agree.
  return oneEntryPerLemma(rows, lemmas).map(toEntry);
}

/** The whole dictionary, as the gate's government check needs it. Cached ten minutes. */
export function gateData(): Promise<GateData> {
  return remember("gate", GATE_TTL_MS, async () => {
    const rows = await prisma.lexeme.findMany({
      where: { pos: { in: ["VERB", "NOUN", "ADJECTIVE", "PRONOUN"] } },
      select: {
        lemma: true, pos: true, cefr: true, government: true,
        forms: { where: { isPrincipal: true }, select: { formType: true, value: true } },
      },
      orderBy: [{ lemma: "asc" }, { id: "asc" }],
    });
    const entries: GateEntry[] = rows.map((r) => {
      const parts: Record<string, string> = {};
      for (const f of r.forms) if (!parts[f.formType]) parts[f.formType] = f.value;
      return { lemma: r.lemma, pos: r.pos, cefr: r.cefr, parts, usages: [], government: r.government };
    });
    return buildGateData(entries);
  });
}

export interface SceneMaterial {
  readonly scene: SceneSpec;
  readonly entries: readonly SceneEntry[];
  readonly lexicon: Lexicon;
  readonly lemmas: readonly string[];
  /** Lemma to its entry id, for grades and gaps. */
  readonly idOf: ReadonlyMap<string, string>;
  /** Recorded lines that fit each base beat and each curveball beat. */
  readonly lines: ReadonlyMap<string, readonly Line[]>;
  readonly questionWords: ReadonlySet<string>;
  readonly negation: ReadonlySet<string>;
  readonly register: ReadonlySet<string>;
  readonly wrongRegister: ReadonlySet<string>;
  readonly caseForms: ReadonlyMap<string, readonly string[]>;
  /** English for a lemma, from the syllabus, for the role card. */
  readonly glossOf: (lemma: string) => string;
}

function beatsWithCurveballs(scene: SceneSpec): { id: string; beat: BeatSpec }[] {
  const out: { id: string; beat: BeatSpec }[] = scene.beats.map((b) => ({ id: b.id, beat: b }));
  for (const id of scene.curveballs) {
    const c = curveballById(id);
    if (!c?.beat) continue;
    out.push({
      id: `curveball-${id}`,
      beat: { id: `curveball-${id}`, goal: c.beat.goal, move: c.beat.move, topic: c.beat.topic, needs: c.beat.needs, required: false, patience: 2, shape: c.beat.shape },
    });
  }
  return out;
}

function requirementsOf(scene: SceneSpec): Requirement[] {
  return beatsWithCurveballs(scene).flatMap(({ beat }) => [...beat.needs]);
}

export function sceneMaterial(sceneId: string): Promise<SceneMaterial | null> {
  const scene = sceneById(sceneId);
  if (!scene) return Promise.resolve(null);
  return remember(`scene:${sceneId}`, TTL_MS, async () => {
    const lemmas = sceneLemmas(scene);
    const entries = await entriesFor(lemmas);
    const lexicon = buildLexicon(entries);
    const idOf = new Map(entries.map((e) => [e.lemma, e.id]));

    const verbForms = new Set<string>();
    for (const e of entries) if (e.pos === "VERB") for (const f of formsOf(e)) verbForms.add(f);
    const hasFiniteVerb = (w: string) => verbForms.has(w);

    const corpus: { line: Line; tokens: string[] }[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      for (const text of e.usages) {
        if (seen.has(text)) continue;
        seen.add(text);
        corpus.push({ line: { text, lemma: e.lemma, cefr: e.cefr }, tokens: words(text) });
      }
    }
    const lines = new Map<string, Line[]>();
    for (const { id, beat } of beatsWithCurveballs(scene)) {
      const topic = topicForms(beat, lexicon);
      const fitting = corpus
        .filter(({ line, tokens }) => fits({ line, tokens, beat, topic, lexicon, hasFiniteVerb }).ok)
        .map(({ line }) => line)
        .sort((a, b) => a.text.localeCompare(b.text, "et"))
        .slice(0, LINES_PER_BEAT);
      lines.set(id, fitting);
    }

    const formsOfLemmas = (names: readonly string[]) => {
      const out = new Set<string>();
      for (const l of names) for (const f of lexicon.byLemma.get(l) ?? []) out.add(f);
      return out;
    };
    const questionWords = formsOfLemmas(unitById("kusisonad")?.lemmas ?? []);
    const negation = formsOfLemmas(["ei", "mitte"]);
    for (const f of lexicon.byLemma.get("olema") ?? []) if (f.startsWith("pole")) negation.add(f);
    const register = formsOfLemmas([scene.register]);
    const wrongRegister = wrongRegisterForms(scene.register, entries.filter((e) => e.pos === "PRONOUN"));

    const caseForms = new Map<string, string[]>();
    for (const need of requirementsOf(scene)) {
      if (need.kind !== "case") continue;
      const entry = entries.find((e) => e.lemma === need.lemma);
      if (!entry) continue;
      const rows = [
        ...Object.entries(entry.parts).map(([formType, value]) => ({ formType, value })),
        ...(entry.extraForms ?? []).map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
      ];
      const row = buildCaseTable(stemsFrom(rows)).find((r) => r.spec.key === (need.grammCase as CaseKey));
      const accepted = row ? [row.singular, ...row.accepted].filter((v): v is string => Boolean(v)) : [];
      caseForms.set(`${need.lemma}|${need.grammCase}`, accepted);
    }

    const glosses = new Map<string, string>();
    for (const id of scene.units) for (const v of unitById(id)?.vocabulary ?? []) if (!glosses.has(v.lemma)) glosses.set(v.lemma, v.gloss);

    return {
      scene, entries, lexicon, lemmas, idOf, lines, questionWords, negation, register, wrongRegister, caseForms,
      glossOf: (lemma: string) => glosses.get(lemma) ?? lemma,
    };
  });
}

/** A prop's accepted spellings, widened by every form the dictionary holds for its word. */
export function widenProps(props: readonly PropValue[], lexicon: Lexicon): PropValue[] {
  return props.map((p) => {
    const extra: string[] = [];
    if (p.lemma) extra.push(...(lexicon.byLemma.get(p.lemma) ?? []));
    if (p.kind === "number") {
      const lemma = NUMBER_LEMMAS[Number(p.display) - 1];
      if (lemma) extra.push(...(lexicon.byLemma.get(lemma) ?? []));
    }
    return { ...p, accepted: [...new Set([...p.accepted, ...extra])] };
  });
}

export function turnContext(material: SceneMaterial, plan: Plan): TurnContext {
  return {
    lexicon: material.lexicon,
    questionWords: material.questionWords,
    negation: material.negation,
    register: material.register,
    props: widenProps(plan.props, material.lexicon),
    caseForms: material.caseForms,
  };
}

/** The same sets, as JSON the browser can rebuild a `TurnContext` from. */
export interface ClientMaterial {
  readonly forms: string[];
  readonly byLemma: Record<string, string[]>;
  readonly questionWords: string[];
  readonly negation: string[];
  readonly register: string[];
  readonly props: PropValue[];
  readonly caseForms: Record<string, string[]>;
  readonly lines: Record<string, Line[]>;
  /** English glosses for the lemmas the help button may name. */
  readonly glosses: Record<string, string>;
  /** Lemma to its entry id, for the add-to-deck button in the debrief. */
  readonly ids: Record<string, string>;
}

export function clientMaterial(material: SceneMaterial, plan: Plan): ClientMaterial {
  const named = new Set<string>();
  for (const beat of plan.beats) {
    for (const need of beat.needs) {
      if (need.kind === "lemma") for (const l of need.oneOf) named.add(l);
      if (need.kind === "case") named.add(need.lemma);
    }
    for (const l of beat.topic) named.add(l);
  }
  for (const p of plan.props) if (p.lemma) named.add(p.lemma);
  for (const l of NUMBER_LEMMAS) named.add(l);
  const byLemma: Record<string, string[]> = {};
  for (const l of named) byLemma[l] = [...(material.lexicon.byLemma.get(l) ?? [])];
  const lines: Record<string, Line[]> = {};
  for (const beat of plan.beats) lines[beat.id] = [...(material.lines.get(beat.id) ?? [])];
  const glosses: Record<string, string> = {};
  const ids: Record<string, string> = {};
  for (const e of material.entries) { glosses[e.lemma] = e.translation; ids[e.lemma] = e.id; }
  return {
    forms: [...material.lexicon.forms],
    byLemma,
    questionWords: [...material.questionWords],
    negation: [...material.negation],
    register: [...material.register],
    props: widenProps(plan.props, material.lexicon),
    caseForms: Object.fromEntries([...material.caseForms].map(([k, v]) => [k, [...v]])),
    lines,
    glosses,
    ids,
  };
}

/** Rebuilds a `TurnContext` in the browser from what the page shipped. */
export function contextFromClient(m: ClientMaterial): TurnContext {
  return {
    lexicon: { forms: new Set(m.forms), byLemma: new Map(Object.entries(m.byLemma).map(([k, v]) => [k, new Set(v)])) },
    questionWords: new Set(m.questionWords),
    negation: new Set(m.negation),
    register: new Set(m.register),
    props: m.props,
    caseForms: new Map(Object.entries(m.caseForms)),
  };
}

/** What recent runs of this scene drew, so the next draw avoids it (design §5). */
export async function recentDraws(ownerId: string, sceneId: string): Promise<{
  props: Map<string, string[]>; curveballs: string[];
}> {
  const runs = await prisma.sceneRun.findMany({
    where: { ownerId, sceneId },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: 3,
    select: { transcript: true },
  });
  const props = new Map<string, string[]>();
  const curveballs: string[] = [];
  for (const run of runs) {
    try {
      const { plan } = JSON.parse(run.transcript) as { plan?: Plan };
      for (const p of plan?.props ?? []) props.set(p.slot, [...(props.get(p.slot) ?? []), p.lemma ?? p.display]);
      curveballs.push(...(plan?.curveballs ?? []));
    } catch {
      // A transcript this reader cannot parse is one it does not avoid.
    }
  }
  return { props, curveballs };
}

export type { PlannedBeat };
