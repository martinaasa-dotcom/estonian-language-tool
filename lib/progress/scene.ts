/**
 * Everything a scene needs from the database, assembled once per run.
 *
 * `lib/scenes/` is pure by assertion, so every set, map and pool the marker,
 * the gate and the ladder read comes in as data and this is where it is built.
 * The split is the same one `lib/progress/` has everywhere else: the rules live
 * where they can be unit tested, and the queries live where a database is
 * allowed.
 *
 * ONE QUERY FOR THE WORDS, because a scene's closed list is the union of its
 * units' lemmas and everything else falls out of the same rows: the forms, the
 * case table the marker compares against, the governed verbs the gate reads,
 * and the finite verbs retrieval uses to tell a clause from a label under a
 * headword. The recorded sentences come with them, since a usage is a column on
 * the entry rather than a table of its own.
 *
 * Nothing here writes. `finishRun` in this module is the one that does, and it
 * re-marks the turns server-side before it writes anything at all (ADR-022).
 */
import { prisma } from "@/lib/db";
import { unitById } from "@/lib/collections/syllabus";
import { parseGovernment } from "@/lib/estonian/government";
import { derivedVerbForms } from "@/lib/estonian/conjugate";
import type { CaseKey } from "@/lib/estonian/types";
import { FALLBACK_PHRASE, sceneById } from "@/lib/scenes/catalogue";
import type { GateContext, GovernedWord } from "@/lib/scenes/gate";
import { buildLexicon, type DictEntry, type Lexicon } from "@/lib/scenes/lexicon";
import { topicForms, type Line } from "@/lib/scenes/retrieval";
import type { TurnContext } from "@/lib/scenes/turn";
import type { RoleCard } from "@/lib/scenes/props";
import type { SceneSpec } from "@/lib/scenes/types";
import { planRun, RECENCY_WINDOW, type Recency } from "@/lib/scenes/run";
import { BUDGETS, type Difficulty } from "@/lib/scenes/curveballs";
import {
  advance, currentBeat, objectivesOf, outcomeOf, startScene, walkOut,
  type Objectives, type TurnRecord,
} from "@/lib/scenes/state";
import { gradesFor, stalledWords, type SceneGrade } from "@/lib/scenes/grades";
import { readTurn } from "@/lib/scenes/turn";

/**
 * The units that supply the machinery every scene's marker needs.
 *
 * Named here rather than in `lib/scenes/`, because these are lemma requests
 * against the dictionary exactly like a beat's topic and they belong beside
 * the query that resolves them. `kusisonad`, `vastused` and `asesonad` are
 * three of the units the seventeenth pass added for the words between the
 * words, and they are precisely the machinery a conversation marker needs:
 * "did they ask a question" is answerable because the question words are
 * dictionary entries with forms, and "did they use the right register" is
 * answerable because the pronouns are.
 */
const QUESTION_UNIT = "kusisonad";
/**
 * The negator, and the pronoun each register expects.
 *
 * Named as lemmas rather than as units, because `vastused` teaches thirteen
 * words and only one of them is the negator, and `asesonad` teaches sixteen
 * pronouns of which exactly one is the register in question. A unit would make
 * "did they say no" true of `jah`.
 */
const NEGATOR = "ei";
const REGISTER_PRONOUN = { teie: "teie", sina: "sina" } as const;

export interface SceneContext {
  readonly scene: SceneSpec;
  readonly lexicon: Lexicon;
  readonly gate: GateContext;
  /** Everything the marker needs except the card's data and the last line. */
  readonly marker: Omit<TurnContext, "data" | "previous">;
  /** Recorded sentences that could fill each beat, by beat id. */
  readonly pool: ReadonlyMap<string, readonly Line[]>;
  /** Every form of each beat's own topic words, by beat id. */
  readonly topic: ReadonlyMap<string, ReadonlySet<string>>;
  readonly hasFiniteVerb: (word: string) => boolean;
  /** What they say when nothing could be built. A course phrase, resolved. */
  readonly fallback: string;
}

/** One entry as this module needs it: `DictEntry`, its id, and its government. */
type Row = DictEntry & { readonly id: string; readonly government: string | null };

/**
 * Builds the context for one scene.
 *
 * Ordered and cut nowhere: the scene's units name a few hundred lemmas and the
 * whole of that is the closed list, so a `take` here would silently narrow what
 * the model may say and what the marker will accept. That is the one place in
 * this app where reading everything is the correct answer rather than the lazy
 * one.
 */
export async function sceneContext(sceneId: string): Promise<SceneContext | null> {
  const scene = sceneById(sceneId);
  if (!scene) return null;

  const lemmas = new Set<string>();
  for (const unit of scene.units) for (const lemma of unitById(unit)?.lemmas ?? []) lemmas.add(lemma);
  for (const beat of scene.beats) for (const word of beat.topic) lemmas.add(word);
  for (const prop of scene.props) {
    if (prop.kind === "word" || prop.kind === "weekday") for (const w of prop.oneOf) lemmas.add(w);
  }
  lemmas.add(FALLBACK_PHRASE);

  const rows = await readEntries([...lemmas]);
  const lexicon = buildLexicon(rows);

  const marker = {
    lexicon,
    questionWords: formsOfUnit(rows, QUESTION_UNIT),
    negators: formsOfLemmas(rows, [NEGATOR]),
    registerForms: formsOfLemmas(rows, [REGISTER_PRONOUN[scene.register]]),
  };

  const wrongRegister = formsOfLemmas(
    rows, [REGISTER_PRONOUN[scene.register === "teie" ? "sina" : "teie"]],
  );

  return {
    scene,
    lexicon,
    gate: { lexicon, wrongRegister, governed: governedIn(rows), caseOf: caseIndex(lexicon) },
    marker,
    pool: poolsFor(scene, rows),
    topic: new Map(scene.beats.map((beat) => [beat.id, topicForms(beat, lexicon)])),
    hasFiniteVerb: finiteVerbs(rows),
    fallback: rows.find((row) => row.lemma === FALLBACK_PHRASE)?.lemma ?? FALLBACK_PHRASE,
  };
}

/** Every prop's spellings, for the marker's `datum` requirement. */
export function dataFor(card: RoleCard, lexicon: Lexicon): Map<string, ReadonlySet<string>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (const prop of card.props) {
    const accepted = new Set<string>(prop.literal.map((v) => v.toLowerCase()));
    for (const lemma of prop.lemmas) {
      for (const form of lexicon.byLemma.get(lemma) ?? []) accepted.add(form);
    }
    out.set(prop.slot, accepted);
  }
  return out;
}

async function readEntries(lemmas: readonly string[]): Promise<Row[]> {
  const found = await prisma.lexeme.findMany({
    where: { lemma: { in: [...lemmas] } },
    select: {
      id: true, lemma: true, pos: true, cefr: true, examples: true, government: true,
      forms: { select: { formType: true, value: true } },
    },
    // Ordered because the pools below are cut, and because two entries can
    // share a lemma: which one a scene reads must not be the planner's choice.
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });

  return found.map((row) => {
    const parts: Record<string, string> = {};
    const extraForms: { code: string; value: string }[] = [];
    for (const form of row.forms) {
      if (form.formType.startsWith("EKILEX:")) {
        extraForms.push({ code: form.formType.slice("EKILEX:".length), value: form.value });
      } else if (!parts[form.formType]) {
        parts[form.formType] = form.value;
      }
    }
    return {
      id: row.id,
      government: row.government,
      lemma: row.lemma,
      pos: row.pos,
      cefr: row.cefr,
      parts,
      extraForms,
      usages: splitExamples(row.examples),
    };
  });
}

/** `Lexeme.examples` is a newline-separated column, as the seed writes it. */
function splitExamples(examples: string | null): string[] {
  return (examples ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function formsOfLemmas(rows: readonly Row[], lemmas: readonly string[]): ReadonlySet<string> {
  const wanted = new Set(lemmas);
  const out = new Set<string>();
  for (const row of rows) {
    if (!wanted.has(row.lemma)) continue;
    for (const value of Object.values(row.parts)) out.add(value.toLowerCase());
    for (const form of row.extraForms ?? []) out.add(form.value.toLowerCase());
    out.add(row.lemma.toLowerCase());
  }
  return out;
}

function formsOfUnit(rows: readonly Row[], unit: string): ReadonlySet<string> {
  return formsOfLemmas(rows, unitById(unit)?.lemmas ?? []);
}

/**
 * The governed words the gate can see.
 *
 * `parseGovernment` reads the whole string rather than the primary alone,
 * because a word governs every case its entry names and marking a line wrong
 * for one of the others is the fault `buildOptions` exists to prevent.
 */
function governedIn(rows: readonly Row[]): GovernedWord[] {
  const out: GovernedWord[] = [];
  for (const row of rows) {
    if (row.pos !== "VERB") continue;
    const government = parseGovernment(row.government ?? null);
    if (!government) continue;
    const forms = new Set<string>([row.lemma.toLowerCase()]);
    for (const value of Object.values(row.parts)) forms.add(value.toLowerCase());
    for (const form of row.extraForms ?? []) forms.add(form.value.toLowerCase());
    for (const derived of derivedVerbForms({ lemma: row.lemma, pres1sg: row.parts.PRES_1SG })) {
      forms.add(derived.value.toLowerCase());
    }
    out.push({
      lemma: row.lemma,
      forms,
      cases: new Set([government.caseKey, ...government.alsoGoverned]),
    });
  }
  return out;
}

/** `lemma|CASE` inverted into `form -> cases`, which is what the gate asks. */
function caseIndex(lexicon: Lexicon): Map<string, Set<CaseKey>> {
  const out = new Map<string, Set<CaseKey>>();
  for (const [key, forms] of lexicon.byCase) {
    const grammCase = key.slice(key.indexOf("|") + 1) as CaseKey;
    for (const form of forms) {
      const seen = out.get(form) ?? new Set<CaseKey>();
      seen.add(grammCase);
      out.set(form, seen);
    }
  }
  return out;
}

/**
 * Which words are a finite verb, so retrieval can tell a clause from a label.
 *
 * `Kodune aadress.` is a perfectly good illustration of a noun and is not a
 * thing a receptionist says. The stored principal parts plus `derivedVerbForms`
 * is every finite form this app knows, and `npm run audit:verbs` checked that
 * derivation against Ekilex over 797 verbs.
 */
function finiteVerbs(rows: readonly Row[]): (word: string) => boolean {
  const finite = new Set<string>();
  for (const row of rows) {
    if (row.pos !== "VERB") continue;
    for (const key of ["PRES_1SG", "PAST_1SG"]) {
      const value = row.parts[key];
      if (value) finite.add(value.toLowerCase());
    }
    for (const form of row.extraForms ?? []) finite.add(form.value.toLowerCase());
    for (const derived of derivedVerbForms({ lemma: row.lemma, pres1sg: row.parts.PRES_1SG })) {
      finite.add(derived.value.toLowerCase());
    }
  }
  return (word: string) => finite.has(word.toLowerCase());
}

/**
 * The recorded sentences that could fill each beat.
 *
 * A usage of one of the beat's own topic words, which is what makes a line
 * about this beat rather than merely readable. `sceneLine` then asks `fits`
 * whether each one is the right shape, is a clause somebody said, and is
 * readable inside the scene's list, in that order because each is cheaper than
 * the next.
 */
function poolsFor(scene: SceneSpec, rows: readonly Row[]): Map<string, Line[]> {
  const byLemma = new Map(rows.map((row) => [row.lemma, row]));
  const out = new Map<string, Line[]>();
  for (const beat of scene.beats) {
    const lines: Line[] = [];
    for (const lemma of beat.topic) {
      const row = byLemma.get(lemma);
      if (!row) continue;
      for (const text of row.usages) lines.push({ text, lemma: row.lemma, cefr: row.cefr });
    }
    out.set(beat.id, lines);
  }
  return out;
}

/**
 * What the last few runs of this scene used, so this one does not repeat it.
 *
 * DERIVED RATHER THAN COUNTED (ADR-014). `SceneRun` is append-only and the last
 * runs are one indexed read, so §5's three promises need no stored counter that
 * could drift, be awarded for a run that never happened, or survive the row it
 * described. The window is the largest of the three and each promise then reads
 * back only as far as it claims.
 *
 * Ordered and cut, and ending on `id`, because `startedAt` is not unique: two
 * runs of one scene inside the same millisecond is not a thing anybody does,
 * and an order that is loose at the end is loose.
 */
export async function recencyFor(ownerId: string, sceneId: string): Promise<Recency> {
  const window = Math.max(
    RECENCY_WINDOW.props, RECENCY_WINDOW.curveballs, RECENCY_WINDOW.personas,
  );
  const rows = await prisma.sceneRun.findMany({
    where: { ownerId, sceneId },
    select: { transcript: true },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: window,
  });

  const drawn = rows.map((row) => readDrawn(row.transcript));
  const back = <T>(n: number, pick: (d: Drawn) => readonly T[]) =>
    new Set(drawn.slice(0, n).flatMap(pick));

  return {
    props: back(RECENCY_WINDOW.props, (d) => d.props),
    curveballs: back(RECENCY_WINDOW.curveballs, (d) => d.curveballs),
    personas: back(RECENCY_WINDOW.personas, (d) => (d.persona ? [d.persona] : [])),
  };
}

/** What a stored transcript says about its own draw. Defensive, because it is JSON. */
interface Drawn {
  readonly persona: string | null;
  readonly props: readonly string[];
  readonly curveballs: readonly string[];
}

function readDrawn(transcript: string): Drawn {
  try {
    const parsed = JSON.parse(transcript) as Record<string, unknown>;
    const persona = typeof parsed.persona === "string" ? parsed.persona : null;
    const props = Array.isArray(parsed.props) ? parsed.props.filter(isText) : [];
    const curveballs = Array.isArray(parsed.curveballs) ? parsed.curveballs.filter(isText) : [];
    return { persona, props, curveballs };
  } catch {
    /*
      A transcript that will not parse is a run this deployment wrote in some
      older shape, and the honest reading of it is that it constrains nothing.
      Throwing here would make one bad row stop a learner starting a scene.
    */
    return { persona: null, props: [], curveballs: [] };
  }
}

const isText = (value: unknown): value is string => typeof value === "string";

/** One turn as the client sends it. Nothing here is a mark (ADR-022). */
export interface SentTurn {
  readonly beatId: string;
  readonly said: string;
  /** Whether the help button supplied a word for this beat before the turn. */
  readonly helped: boolean;
}

export interface FinishedRun {
  readonly runId: string;
  readonly objectives: Objectives;
  readonly outcome: { id: string; says: string } | null;
  readonly turns: readonly TurnRecord[];
  readonly grades: readonly SceneGrade[];
  /** Words the run needed and the learner did not have, for the debrief. */
  readonly gaps: readonly string[];
}

/**
 * Re-marks a finished run on the server and writes it down.
 *
 * **The client never sends a mark**, only the scene, the seed, the difficulty
 * and what was typed, and the server rebuilds the run from that seed and reads
 * every turn again with `readTurn` (ADR-022). It costs one function call
 * because the marker is pure, and it is the same discipline `submitExam`
 * follows: a result anybody can type is not a measurement.
 *
 * The run is written whether it went well or badly, because `SceneRun` is the
 * record of what happened rather than of what was achieved, and a learner who
 * walked out has still had the conversation. What is conditional is the review
 * log: `gradesFor` writes only where the retrieval was unambiguous.
 */
export async function finishRun(input: {
  ownerId: string;
  sceneId: string;
  seed: string;
  level: string;
  difficulty: Difficulty;
  turns: readonly SentTurn[];
  walkedOut: boolean;
  /** Words the help button supplied, with the entry where it found one. */
  asked: readonly { lemma: string; lexemeId: string | null }[];
}): Promise<FinishedRun | null> {
  const context = await sceneContext(input.sceneId);
  if (!context) return null;

  const { scene } = context;
  const run = planRun(scene, input.seed, input.level, input.difficulty);
  const data = dataFor(run.card, context.lexicon);

  /*
    Replayed rather than trusted. Every turn goes back through the marker in the
    order it was typed, so the objectives, the outcome and the grades are the
    server's own reading of what the learner wrote.
  */
  let state = startScene(scene);
  let previous = "";
  for (const sent of input.turns.slice(0, MAX_TURNS)) {
    const beat = currentBeat(scene, state);
    if (!beat) break;
    const said = String(sent.said ?? "").slice(0, MAX_TURN_CHARS);
    const evidence = readTurn(said, beat, { ...context.marker, data, previous });
    ({ state } = advance(scene, state, evidence, said, Boolean(sent.helped)));
    previous = said;
  }
  if (input.walkedOut) state = walkOut(state);

  const objectives = objectivesOf(scene, state);
  const outcome = outcomeOf(scene, state);
  const grades = gradesFor(scene, state);

  const created = await prisma.sceneRun.create({
    data: {
      ownerId: input.ownerId,
      sceneId: scene.id,
      seed: input.seed,
      level: input.level,
      difficulty: BUDGETS[input.difficulty],
      transcript: JSON.stringify({
        persona: run.persona.id,
        props: run.card.props.map((prop) => prop.value),
        curveballs: run.curveballs.map((c) => c.id),
        turns: state.turns,
      }),
      outcome: JSON.stringify({ ...objectives, outcome: outcome?.id ?? null }),
      endedAt: new Date(),
    },
    select: { id: true },
  });

  const stalled = stalledWords(scene, state);
  const gaps = [
    ...input.asked.slice(0, MAX_GAPS).map((one) => ({
      kind: "ASKED", lemma: one.lemma, lexemeId: one.lexemeId,
    })),
    ...stalled.map((lemma) => ({ kind: "STALLED", lemma, lexemeId: null })),
  ];
  if (gaps.length > 0) {
    await prisma.sceneGap.createMany({
      data: gaps.map((gap) => ({ ...gap, ownerId: input.ownerId, runId: created.id })),
    });
  }

  return {
    runId: created.id,
    objectives,
    outcome: outcome ? { id: outcome.id, says: outcome.says } : null,
    turns: state.turns,
    grades,
    gaps: [...new Set([...input.asked.map((a) => a.lemma), ...stalled])],
  };
}

/**
 * What a run may send.
 *
 * A conversation is a dozen turns, so anything past this is not a learner. The
 * character cap is the one the writing exercise already uses, because a scene
 * turn is a sentence and a sentence that long is a paste.
 */
export const MAX_TURNS = 60;
export const MAX_TURN_CHARS = 300;
const MAX_GAPS = 40;
