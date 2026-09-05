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
import { sceneBeats, scriptedFor } from "@/lib/scenes/scripted";
import type { GateContext, GovernedWord } from "@/lib/scenes/gate";
import { buildLexicon, type DictEntry, type Lexicon } from "@/lib/scenes/lexicon";
import { topicForms, type Line } from "@/lib/scenes/retrieval";
import type { TurnContext } from "@/lib/scenes/turn";
import { timeWords, type RoleCard } from "@/lib/scenes/props";
import type { BeatSpec, SceneSpec } from "@/lib/scenes/types";
import { isPhrase } from "@/lib/dict/pos";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { planRun, RECENCY_WINDOW, type Recency, type SceneRun as SceneRunPlan } from "@/lib/scenes/run";
import { randomUUID } from "node:crypto";
import { BUDGETS, type Difficulty } from "@/lib/scenes/curveballs";
import {
  advance, currentBeat, objectivesOf, outcomeOf, startScene, walkOut, type Objectives, type Response, type SceneState, type TurnRecord, advanceHurdle, hurdleBeat, raiseHurdle, type HurdleRecord,
} from "@/lib/scenes/state";
import { gradesFor, stalledWords, type SceneGrade } from "@/lib/scenes/grades";
import { addsEvidence, readTurn } from "@/lib/scenes/turn";

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
  /**
   * Lines drafted in advance for each beat, by beat id, already filtered by
   * `scriptable`. Empty for a beat nobody drafted or nobody could.
   */
  readonly scripted: ReadonlyMap<string, readonly string[]>;
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

  const hasFiniteVerb = finiteVerbs(rows);
  const marker = {
    lexicon,
    questionWords: formsOfUnit(rows, QUESTION_UNIT),
    negators: formsOfLemmas(rows, [NEGATOR]),
    registerForms: formsOfLemmas(rows, [REGISTER_PRONOUN[scene.register]]),
    hasFiniteVerb,
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
    scripted: new Map(sceneBeats(scene).map((beat) => [beat.id, scriptedFor(scene, beat)])),
    hasFiniteVerb,
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
    // A time said in words: `üksteist`, or `pool kaksteist` as one spelling.
    for (const spelled of timeWords(prop.value)) accepted.add(spelled);
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

/**
 * The recorded sentences behind one entry, read the way the app reads them.
 *
 * `Lexeme.examples` IS A JSON STRING COLUMN and this used to split it on
 * newlines, which is not a near miss: a word with no sentences came back as one
 * line reading `[]`, and a word with sentences came back as one line of raw
 * JSON. `naturalSentence` then threw every one of them away, so the attested
 * rung of the ladder had never once answered, on any beat of any scene. It
 * looked exactly like a dictionary too thin to fill a conversation, which is a
 * conclusion this project had already written down about itself.
 *
 * Through `parseExamples` and `usableExamples`, because those are what decide
 * what a sentence is everywhere else: a fragment, a paragraph and a duplicate
 * are not lines somebody says, and the scene and the dictionary entry
 * disagreeing about what is worth showing would be two answers to one question.
 * AI-sourced sentences are dropped, which `wordOfDay` does for the same reason:
 * this is the rung whose whole claim is that a lexicographer wrote it.
 */
function splitExamples(examples: string | null): string[] {
  return usableExamples(parseExamples(examples))
    .filter((example) => example.source !== "AI")
    .map((example) => example.et);
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
 * The recorded lines that could fill each beat, and it is the phrases alone.
 *
 * A USAGE IS ABOUT A WORD, NOT ABOUT A BEAT. The first version of this put
 * every recorded sentence under a beat's topic words into its pool, on the
 * argument that a sentence a lexicographer wrote outranks anything a model
 * writes. It does, as Estonian. As a *line* it was absurd, and it was measured
 * rather than reasoned about: offline over the four scenes, the beat asking
 * where you are now was filled by `Olla või mitte olla?`, the one asking what
 * you want by `Mis kell on?`, and the receptionist offered an appointment with
 * `Aeg ei peatu.` and confirmed it with `Aastas on 365 päeva.` A usage
 * illustrates a word doing its job in some sentence, and a beat wants a
 * sentence doing a job in this conversation, and those meet only by luck. A
 * learner reported the result as every situation feeling strange, and every
 * one of those lines had been printed under a chip calling it a recorded
 * sentence, which was true and beside the point.
 *
 * So the attested rung fills the beats whose line *is* a phrase the course
 * teaches. Ekilex records a usage against a word, and it holds none for
 * `Tere!` or `Head aega!` because those already are the sentence (`isPhrase`);
 * the lemma itself is the line, which is the dictionary speaking. Every other
 * beat is the scripted bank's and the composer's, both of which were told what
 * the beat is for (ADR-025 amendment 2, `docs/21-situations.md` §32).
 */
function poolsFor(scene: SceneSpec, rows: readonly Row[]): Map<string, Line[]> {
  const byLemma = new Map(rows.map((row) => [row.lemma, row]));
  const out = new Map<string, Line[]>();
  for (const beat of scene.beats) {
    const lines: Line[] = [];
    for (const lemma of beat.topic) {
      const row = byLemma.get(lemma);
      if (!row) continue;
      if (isPhrase(row.pos)) {
        lines.push({ text: row.lemma, lemma: row.lemma, cefr: row.cefr });
        continue;
      }
      // A usage a person picked out for this beat, and only where the entry still holds it.
      for (const text of row.usages) {
        if (beat.lines?.includes(text)) lines.push({ text, lemma: row.lemma, cefr: row.cefr });
      }
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
    const card = parsed.card as { props?: { value?: unknown }[] } | undefined;
    const props = Array.isArray(card?.props)
      ? card.props.map((p) => p?.value).filter(isText)
      : [];
    const curveballs = Array.isArray(parsed.curveballs)
      ? parsed.curveballs.flatMap((c: unknown) =>
          isText(c) ? [c] : isText((c as { id?: unknown })?.id) ? [(c as { id: string }).id] : [])
      : [];
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
  /**
   * The Estonian line the learner was answering, as the screen showed it.
   *
   * What the echo rule compares against, and what the other side says again
   * when the turn was not understood. The client's word, since the server
   * holds no state between turns; a client that lies about it changes only
   * whether its own parroting is noticed, which advances nothing either way.
   */
  readonly heard?: string;
}

/** What the transcript holds about the draw, so a run can be marked long after it. */
export interface StoredDraw {
  readonly persona: string;
  readonly card: RoleCard;
  /** Which curveballs, and at which beat. A row written before the beat was kept holds none in play. */
  readonly curveballs: readonly { id: string; at: number }[];
}

export interface FinishedRun {
  readonly runId: string;
  readonly objectives: Objectives;
  /** What went wrong on the way, and whether it was dealt with. */
  readonly hurdles: readonly HurdleRecord[];
  readonly outcome: { id: string; says: string } | null;
  readonly turns: readonly TurnRecord[];
  readonly grades: readonly SceneGrade[];
  /** Words the run needed and the learner did not have, for the debrief. */
  /**
   * Words the run needed and the learner did not have, for the debrief.
   *
   * With the entry where the dictionary has one, because the debrief offers to
   * keep them and `AddWordButton` adds by id. A word with no entry is still
   * listed: "the conversation needed this and you did not have it" is true
   * whether or not the dictionary can teach it, and saying nothing would hide
   * exactly the gaps worth reporting.
   */
  readonly gaps: readonly { lemma: string; lexemeId: string | null }[];
}

/**
 * What crosses to the browser when a run opens, and it is deliberately small.
 *
 * The planned run holds the persona's leans, the seed, and the curveballs,
 * which are the things that are supposed to *happen* to somebody rather than
 * be read off a card. Sending the whole plan down was the first version of
 * this and it hands anybody with a network tab the whole afternoon: which
 * clerk they got, what is about to go wrong and in what order.
 *
 * Sonad already answered this question the other way round and said why: there
 * the word crosses because marking without a round trip is most of how it
 * plays, and the trade is written down. Here nothing is bought by sending it,
 * because every turn is marked on the server anyway.
 *
 * So this is the briefing a person walking in would have: who you are, what
 * you were given, and who is behind the desk. **English only**, both because
 * the role card is English (a scene may not write Estonian, ADR-005) and
 * because a prop's lemma is the word the learner is there to produce.
 */
export interface Briefing {
  readonly you: string;
  readonly props: readonly {
    slot: string;
    card: string;
    /**
     * What you were dealt, **in English**, where the card says "the word below".
     *
     * A `word` or `weekday` prop draws a lemma and the card's own line points
     * at it, and for a while nothing printed it: every scene shipped a card
     * reading "What is wrong: read it off the word below" with nothing below
     * it, so the learner could not know whether they had a fever or a sore
     * throat and the beat could not be met except by guessing. Two of the
     * doctor scene's three props were unanswerable and the third only worked
     * because a time prints itself.
     *
     * The gloss rather than the lemma, and that is the exercise rather than a
     * concession to ADR-005: the card tells you what is wrong and you say it
     * in Estonian. Printing `valu` would leave nothing to produce, which is
     * the fault `audit:questions` exists for one floor down. Empty where the
     * card carries its own value, which a time and a floor number do.
     */
    given: readonly string[];
  }[];
  readonly persona: string;
}

/**
 * The English of the words a card was dealt.
 *
 * One query for the run rather than one per prop, and `oneEntryPerLemma`'s
 * question does not arise: what is wanted is the gloss, and where a lemma holds
 * two entries their glosses are two true meanings of a word the scene named on
 * purpose. Ordered, so which one leads is the app's answer rather than the
 * plan's.
 */
async function glossesFor(run: SceneRunPlan): Promise<Map<string, string>> {
  const lemmas = [...new Set(run.card.props.flatMap((prop) => prop.lemmas))];
  if (lemmas.length === 0) return new Map();
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: { lemma: true, translation: true },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  const out = new Map<string, string>();
  for (const row of rows) if (!out.has(row.lemma)) out.set(row.lemma, row.translation);
  return out;
}

function briefingOf(run: SceneRunPlan, glosses: ReadonlyMap<string, string>): Briefing {
  return {
    you: run.card.you,
    /*
      The other side's facts are drawn and stored and never printed: the day
      a landlord will offer is on the draw so a reload offers the same day,
      and off the card because a card that says what the other person is
      about to propose is a script rather than a role.
    */
    props: run.card.props.filter((prop) => !prop.theirs).map((prop) => ({
      slot: prop.slot,
      card: prop.card,
      /*
        A lemma the dictionary cannot gloss is left out rather than printed as
        itself: a scene names its words as a request the harvest either honors
        or reports, so this is a gap to notice and not a place to fall back to
        Estonian on a card that says it is English.
      */
      given: prop.lemmas.map((lemma) => glosses.get(lemma)).filter((v): v is string => !!v),
    })),
    persona: run.persona.who,
  };
}

/**
 * Opens a run: draws it, writes it down, and hands it to the learner.
 *
 * THE DRAW HAPPENS ONCE, ON THE SERVER, AND IS STORED. That is a correction to
 * the obvious design rather than a flourish. A run is a pure function of its
 * seed *and its recency*, and recency moves: by the time the scene is finished
 * there is one more run behind it, so re-planning from the seed at marking time
 * would deal a different card from the one the learner was holding, and every
 * `datum` requirement would be marked against a time and a weekday they were
 * never given. So the card is written at the start and read back at the end.
 *
 * The row exists from the start with `endedAt` null, which is what §15's
 * nullable column is for. Append-only in the sense that matters: a run's turns
 * and its outcome are written once, when it ends, and nothing rewrites them
 * afterwards.
 */
export async function beginRun(input: {
  ownerId: string;
  sceneId: string;
  level: string;
  difficulty: Difficulty;
}): Promise<{ runId: string; seed: string; run: SceneRunPlan; briefing: Briefing } | null> {
  const scene = sceneById(input.sceneId);
  if (!scene) return null;

  const seed = randomUUID();
  const recent = await recencyFor(input.ownerId, scene.id);
  const run = planRun(scene, seed, input.level, input.difficulty, recent);

  /*
    The card is stored with the English of every drawn word beside it, off the
    dictionary's own gloss, so a stage direction that names the other side's
    day can say "Tuesday" inside an English sentence rather than the lemma
    (`stageFor`). Read once here rather than on every turn, because the draw
    is what a reload and the debrief read back.
  */
  const glosses = await glossesFor(run);
  const card: RoleCard = {
    ...run.card,
    props: run.card.props.map((prop) => {
      const english = prop.lemmas[0] ? glosses.get(prop.lemmas[0]) : undefined;
      return english ? { ...prop, english } : prop;
    }),
  };
  const draw: StoredDraw = {
    persona: run.persona.id,
    card,
    curveballs: run.curveballs.map((c) => ({ id: c.id, at: c.at })),
  };

  const created = await prisma.sceneRun.create({
    data: {
      ownerId: input.ownerId,
      sceneId: scene.id,
      seed,
      level: input.level,
      difficulty: BUDGETS[input.difficulty],
      transcript: JSON.stringify(draw),
    },
    select: { id: true },
  });

  return { runId: created.id, seed, run, briefing: briefingOf(run, glosses) };
}

/**
 * Re-marks a finished run on the server and completes its row.
 *
 * **The client never sends a mark**, only which run it was and what was typed,
 * and the server reads every turn again with `readTurn` (ADR-022). It costs one
 * function call because the marker is pure, and it is the same discipline
 * `submitExam` follows: a result anybody can type is not a measurement.
 *
 * The card comes off the stored draw rather than out of a fresh plan, for the
 * reason `beginRun` gives: the learner is marked against the card they were
 * holding.
 *
 * The run is completed whether it went well or badly, because `SceneRun` is the
 * record of what happened rather than of what was achieved, and a learner who
 * walked out has still had the conversation. What is conditional is the review
 * log: `gradesFor` writes only where the retrieval was unambiguous.
 */
export async function finishRun(input: {
  ownerId: string;
  runId: string;
  turns: readonly SentTurn[];
  walkedOut: boolean;
  /** Words the help button supplied, with the entry where it found one. */
  asked: readonly { lemma: string; lexemeId: string | null }[];
}): Promise<FinishedRun | null> {
  const row = await prisma.sceneRun.findFirst({
    where: { id: input.runId, ownerId: input.ownerId },
    select: { id: true, sceneId: true, transcript: true, endedAt: true },
  });
  // A run that has already ended is not re-markable: the turns and the outcome
  // are written once, which is what append-only means for this table.
  if (!row || row.endedAt) return null;

  const context = await sceneContext(row.sceneId);
  if (!context) return null;

  const { scene } = context;
  const draw = readDraw(row.transcript);

  /*
    Replayed rather than trusted, through the same `replay` the route runs on
    every turn. Two markers would be two answers to "were you understood", and
    the one nobody watches is the one that drifts.
  */
  let { state } = replay(context, draw, input.turns);
  if (input.walkedOut) state = walkOut(state);

  const objectives = objectivesOf(scene, state);
  const outcome = outcomeOf(scene, state);
  const grades = gradesFor(scene, state);

  await prisma.sceneRun.update({
    where: { id: row.id },
    data: {
      transcript: JSON.stringify({ ...(draw ?? {}), turns: state.turns }),
      outcome: JSON.stringify({ ...objectives, hurdles: state.hurdles, outcome: outcome?.id ?? null }),
      endedAt: new Date(),
    },
  });

  const stalled = stalledWords(scene, state);
  /*
    The asked words come off the wire, so they are kept only where the scene
    actually has them: `sceneHelp` hands out a lemma from the beat's own topic,
    and anything else is a client writing whatever it likes into a table. It
    costs nothing to check, since the lexicon is already in hand, and the
    alternative is a debrief that lists words the conversation never needed.
  */
  const declared = input.asked.filter((one) => context.lexicon.byLemma.has(one.lemma));
  const gaps = [
    ...declared.slice(0, MAX_GAPS).map((one) => ({
      kind: "ASKED", lemma: one.lemma, lexemeId: one.lexemeId,
    })),
    ...stalled.map((lemma) => ({ kind: "STALLED", lemma, lexemeId: null })),
  ];
  if (gaps.length > 0) {
    await prisma.sceneGap.createMany({
      data: gaps.map((gap) => ({ ...gap, ownerId: input.ownerId, runId: row.id })),
    });
  }

  const wanted = [...new Set([...declared.map((a) => a.lemma), ...stalled])];
  const known = wanted.length === 0 ? [] : await prisma.lexeme.findMany({
    where: { lemma: { in: wanted } },
    select: { id: true, lemma: true },
    /*
      Ordered, because two entries can share a lemma by design (`hall` is a
      noun and an adjective) and the debrief offers exactly one to keep. An
      unordered read hands that choice to the query plan, which is the fault
      `rankCandidates` has a comment about one layer up.
    */
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  const byLemma = new Map<string, string>();
  for (const entry of known) if (!byLemma.has(entry.lemma)) byLemma.set(entry.lemma, entry.id);

  return {
    runId: row.id,
    objectives,
    hurdles: state.hurdles,
    outcome: outcome ? { id: outcome.id, says: outcome.says } : null,
    turns: state.turns,
    grades,
    gaps: wanted.map((lemma) => ({ lemma, lexemeId: byLemma.get(lemma) ?? null })),
  };
}

/**
 * Which beat a run is on right now, off its own row.
 *
 * The help button needs the beat and nothing else, and the beat is a fact about
 * a transcript rather than about a request, so it is read the same way every
 * other reading is: the row, the stored draw, and `replay`. A client saying
 * which beat it is on would be a client choosing which words it is offered.
 */
export async function beatNow(input: {
  ownerId: string;
  runId: string;
  turns: readonly SentTurn[];
}): Promise<BeatSpec | null> {
  const row = await prisma.sceneRun.findFirst({
    where: { id: input.runId, ownerId: input.ownerId, endedAt: null },
    select: { sceneId: true, transcript: true },
  });
  if (!row) return null;

  const context = await sceneContext(row.sceneId);
  if (!context) return null;

  const { state } = replay(context, readDraw(row.transcript), input.turns);
  return currentBeat(context.scene, state) ?? null;
}

/**
 * Reads a whole transcript back through the marker.
 *
 * THE ONE REPLAY, used mid-run and at the end. A conversation is a dozen turns,
 * so replaying the lot on every turn costs nothing measurable and buys the
 * property that matters: the reading a learner sees while they are talking and
 * the reading that is written down when they stop are produced by the same
 * function over the same input. Two of them would be two answers to "were you
 * understood", and the one nobody watches is the one that drifts.
 *
 * It also means the route holds no state. The client sends what it has typed so
 * far, which it may of course lie about; a lie changes what that learner sees
 * mid-run and nothing that is recorded, because this is what runs again at the
 * end. That is ADR-022's split, and it is why the client never sends a mark.
 */
export function replay(
  context: SceneContext,
  draw: StoredDraw | null,
  turns: readonly SentTurn[],
): { state: SceneState; response: Response } {
  const data = draw
    ? dataFor(draw.card, context.lexicon)
    : new Map<string, ReadonlySet<string>>();

  const drawn = draw?.curveballs ?? [];
  const closeAt = context.scene.beats.findIndex((b) => b.move === "close");
  const closeBeat = context.scene.beats[closeAt];

  let state = raiseHurdle(context.scene, startScene(context.scene), drawn);
  let response: Response = "answer";
  let previous = "";
  for (const sent of turns.slice(0, MAX_TURNS)) {
    const beat = currentBeat(context.scene, state);
    if (!beat) break;
    const said = String(sent.said ?? "").slice(0, MAX_TURN_CHARS);
    const heardNow = String(sent.heard ?? previous).slice(0, MAX_TURN_CHARS);
    const marker = { ...context.marker, data, previous: heardNow };

    /*
      A CURVEBALL STANDS IN FRONT OF THE BEAT. While one is up, the turn is
      read against what the curveball asks for and the beat waits; the turn
      that clears it is then read against the beat as well, because "Mul ei
      ole, aga siin on avaldus" has done both.
    */
    const standing = state.hurdle ? hurdleBeat(state.hurdle) : null;
    if (standing) {
      const evidence = readTurn(said, standing, marker);
      const beatToo = readTurn(said, beat, marker);
      /*
        A learner who ignores what went wrong and answers the question anyway
        has done what most people do at a counter. The beat is met, and the
        curveball is written down as let go rather than dealt with: "they sped
        up and you carried on" is true and is worth reading afterwards.
      */
      const ignored = evidence.reading !== "complete" && beatToo.reading === "complete";
      ({ state, response } = ignored
        ? letGo(state)
        : advanceHurdle(context.scene, state, evidence, said, heardNow));
      previous = heardNow;
      if (response !== "answer") continue;
      if (beatToo.reading !== "complete") continue;
      /*
        The turn cleared the curveball and answered the beat behind it, which
        is only true where it met the beat with a word the curveball did not
        already use. Otherwise it did one thing, and the beat is asked.
      */
      if (!ignored && !addsEvidence(beatToo, new Set(evidence.satisfiedBy))) continue;
      ({ state, response } = advance(context.scene, state, beatToo, said, Boolean(sent.helped), heardNow));
      state = raiseHurdle(context.scene, state, drawn);
      continue;
    }

    /*
      A FAREWELL ENDS THE CONVERSATION, WHEREVER IT COMES. Somebody who says
      goodbye in the middle of a scene has left it, and reading `Head aega!`
      as a one-word answer to "where does it hurt" got them "Jah?" and a wait.
      What they did not get done is what the debrief is for.
    */
    if (closeBeat && beat.move !== "close") {
      const bye = readTurn(said, closeBeat, marker);
      const here = readTurn(said, beat, marker);
      if (bye.reading === "complete" && here.reading !== "complete") {
        state = { ...state, beat: closeAt, patience: closeBeat.patience, hurdle: null };
        ({ state, response } = advance(context.scene, state, bye, said, false, heardNow));
        previous = heardNow;
        continue;
      }
    }
    /*
      THE ECHO RULE COMPARES AGAINST THE OTHER SIDE'S LINE. For a while it was
      handed the learner's own previous turn, so a learner repeating themselves
      was read as parroting and a learner handing the question straight back
      was not, which is the rule backwards. What they heard travels with the
      turn, because the server keeps nothing between turns.
    */
    const heard = heardNow;
    const evidence = readTurn(said, beat, marker);
    ({ state, response } = advance(
      context.scene, state, evidence, said, Boolean(sent.helped), heard,
    ));
    /*
      ONE TURN CAN ANSWER MORE THAN ONE BEAT. "Tere, ma lähen poodi" greets and
      says where you are going, and a friend who heard it does not then ask
      where you are going. So a turn that landed is read against the next beat
      too, and again while it keeps landing, each beat recorded as met by the
      same turn. The scene stays the same shape; only a person who said two
      things at once is not made to say the second one twice.

      AND SAYING TWO THINGS MEANS TWO WORDS, WHICH IS WHAT `addsEvidence`
      WEIGHS. A requirement can be met by something that is not a word, so
      without that test a turn carrying a question mark walked past every
      question-shaped beat after the one it answered: `okei, otse, ja kuhu
      siis?` met the directions beat on `otse`, met "ask whether it is near"
      on its own punctuation, and the other side said `Head aega!` to
      somebody who had just asked where to go next. The words this turn has
      already spent travel down the cascade, so one word cannot buy two
      beats either.
    */
    const spent = new Set(evidence.satisfiedBy);
    while (response === "answer" || response === "moveOn") {
      state = raiseHurdle(context.scene, state, drawn);
      if (state.hurdle || response === "moveOn") break;
      const next = currentBeat(context.scene, state);
      if (!next) break;
      const more = readTurn(said, next, marker);
      if (more.reading !== "complete") break;
      if (!addsEvidence(more, spent)) break;
      for (const word of more.satisfiedBy) spent.add(word);
      ({ state, response } = advance(context.scene, state, more, said, false, heard));
    }
    previous = heard;
  }
  return { state, response };
}

/** The hurdle stood down because the learner answered the beat past it. */
function letGo(state: SceneState): { state: SceneState; response: Response } {
  const hurdle = state.hurdle!;
  return {
    state: {
      ...state,
      hurdle: null,
      hurdles: [...state.hurdles, { id: hurdle.id, beat: hurdle.beat, met: false }],
    },
    response: "answer",
  };
}

/** The draw a run was dealt, or null where the row predates the shape. */
export function readDraw(transcript: string): StoredDraw | null {
  try {
    const parsed = JSON.parse(transcript) as Partial<StoredDraw>;
    if (!parsed.card || !Array.isArray(parsed.card.props)) return null;
    /*
      A run written before the beat was stored holds ids alone, and those are
      read as nothing in play rather than as a curveball at beat zero: the
      draw was made, it was never played, and inventing a position for it now
      would change a conversation that is already half over.
    */
    const curveballs = Array.isArray(parsed.curveballs)
      ? parsed.curveballs.flatMap((c: unknown) => {
          const one = (c ?? {}) as { id?: unknown; at?: unknown };
          return typeof one.id === "string" && typeof one.at === "number" ? [{ id: one.id, at: one.at }] : [];
        })
      : [];
    return {
      persona: typeof parsed.persona === "string" ? parsed.persona : "",
      card: parsed.card,
      curveballs,
    };
  } catch {
    return null;
  }
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

/** What a learner has made of each scene so far, for the tile that offers it. */
export interface SceneHistory {
  readonly plays: number;
  /** The `says` of the last run's outcome, or null where it ended in nothing. */
  readonly last: string | null;
  readonly lastAt: Date | null;
}

/**
 * Derived from the runs rather than counted (ADR-014): one read of the
 * finished runs, newest first, folded into a count and a last outcome per
 * scene. Ordered and cut, ending on `id`, because `endedAt` is not unique.
 */
export async function sceneHistoryFor(ownerId: string): Promise<ReadonlyMap<string, SceneHistory>> {
  const rows = await prisma.sceneRun.findMany({
    where: { ownerId, endedAt: { not: null } },
    select: { sceneId: true, outcome: true, endedAt: true },
    orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    take: 300,
  });
  const out = new Map<string, SceneHistory>();
  for (const row of rows) {
    const scene = sceneById(row.sceneId);
    const had = out.get(row.sceneId);
    if (had) { out.set(row.sceneId, { ...had, plays: had.plays + 1 }); continue; }
    let last: string | null = null;
    try {
      const parsed = JSON.parse(row.outcome ?? "{}") as { outcome?: unknown };
      if (typeof parsed.outcome === "string") {
        last = scene?.outcomes.find((o) => o.id === parsed.outcome)?.says ?? null;
      }
    } catch {
      last = null;
    }
    out.set(row.sceneId, { plays: 1, last, lastAt: row.endedAt });
  }
  return out;
}
